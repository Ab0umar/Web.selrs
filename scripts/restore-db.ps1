param(
  [Parameter(Mandatory = $true)]
  [string]$InFile,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-DatabaseUrl {
  if ($env:DATABASE_URL) { return $env:DATABASE_URL }
  $envFile = Join-Path (Get-Location) ".env"
  if (!(Test-Path $envFile)) { return $null }
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*DATABASE_URL\s*=" } | Select-Object -First 1
  if (!$line) { return $null }
  return (($line -replace "^\s*DATABASE_URL\s*=", "").Trim())
}

function Find-MySql {
  $cmd = Get-Command mysql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MariaDB 11.0\bin\mysql.exe",
    "C:\xampp\mysql\bin\mysql.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

if (!(Test-Path $InFile)) { throw "Backup file not found: $InFile" }

$sqlText = Get-Content -Raw $InFile
if ([string]::IsNullOrWhiteSpace($sqlText)) {
  throw "Backup file is empty."
}
$hasSqlMarkers = $sqlText -match "(CREATE TABLE|INSERT INTO|ALTER TABLE|DROP TABLE)"
if (-not $hasSqlMarkers) {
  throw "File does not look like a valid MySQL dump."
}

$dbUrl = Get-DatabaseUrl
if (!$dbUrl) { throw "DATABASE_URL not found in env or .env" }
$uri = [System.Uri]$dbUrl
$userInfo = $uri.UserInfo.Split(":", 2)
$user = [System.Uri]::UnescapeDataString($userInfo[0])
$pass = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$dbHost = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
$dbName = $uri.AbsolutePath.TrimStart("/")
if ([string]::IsNullOrWhiteSpace($dbName)) { throw "Database name missing in DATABASE_URL" }

$mysql = Find-MySql
if (!$mysql) { throw "mysql client not found. Install MySQL client or add it to PATH." }

if ($DryRun) {
  $lineCount = ($sqlText -split "`r?`n").Length
  $createCount = ([regex]::Matches($sqlText, "CREATE TABLE", "IgnoreCase")).Count
  $insertCount = ([regex]::Matches($sqlText, "INSERT INTO", "IgnoreCase")).Count
  Write-Host "Dry-run OK."
  Write-Host "Target host: $dbHost`:$port"
  Write-Host "Target db: $dbName"
  Write-Host "File: $InFile"
  Write-Host "Lines: $lineCount | CREATE TABLE: $createCount | INSERT INTO: $insertCount"
  exit 0
}

$env:MYSQL_PWD = $pass
Get-Content -Raw $InFile | & $mysql --host=$dbHost --port=$port --user=$user --database=$dbName
if ($LASTEXITCODE -ne 0) { throw "mysql restore failed with code $LASTEXITCODE" }

Write-Host "Restore completed from: $InFile"
