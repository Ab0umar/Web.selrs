param(
  [string]$OutFile = ""
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

function Find-MySqlDump {
  $cmd = Get-Command mysqldump -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
    "C:\Program Files\MariaDB 11.0\bin\mysqldump.exe",
    "C:\xampp\mysql\bin\mysqldump.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

$dbUrl = Get-DatabaseUrl
if (!$dbUrl) { throw "DATABASE_URL not found in env or .env" }
$uri = [System.Uri]$dbUrl
$userInfo = $uri.UserInfo.Split(":", 2)
$user = [System.Uri]::UnescapeDataString($userInfo[0])
$pass = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$dbHost = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
$db = $uri.AbsolutePath.TrimStart("/")

if (!$OutFile) {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $backupDir = Join-Path (Get-Location) "backups"
  if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
  $OutFile = Join-Path $backupDir "selrs_db_$ts.sql"
}

$mysqldump = Find-MySqlDump
if (!$mysqldump) { throw "mysqldump not found. Install MySQL client or add it to PATH." }

$env:MYSQL_PWD = $pass
& $mysqldump --host=$dbHost --port=$port --user=$user --single-transaction --quick --routines --events --no-tablespaces --databases $db --result-file="$OutFile"
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with code $LASTEXITCODE" }

Write-Host "Backup created: $OutFile"

# Keep a stable latest copy for tooling/pipelines.
$backupRoot = Split-Path -Parent $OutFile
$latestFile = Join-Path $backupRoot "latest.sql"
Copy-Item -Path $OutFile -Destination $latestFile -Force
Write-Host "Latest backup updated: $latestFile"

# Keep most recent 30 backups by default
Get-ChildItem $backupRoot -Filter "selrs_db_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force -ErrorAction SilentlyContinue
