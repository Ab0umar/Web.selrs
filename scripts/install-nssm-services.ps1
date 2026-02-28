param(
  [string]$NssmPath = "C:\Users\selrs\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe",
  [string]$ApiPython = "C:\Python314\python.exe",
  [string]$ApiDir = "E:\SELRS\api-server-python",
  [string]$ApiScript = "SFC.py",
  [string]$WebPnpm = "C:\Users\selrs\AppData\Roaming\npm\pnpm.cmd",
  [string]$WebDir = "E:\SELRS.cc\MySQL",
  [string]$TunnelExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe",
  [string]$TunnelConfig = "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml",
  [string]$TunnelName = "selrs-fresh",
  [string]$LogDir = "E:\SELRS.cc\logs"
)

$ErrorActionPreference = "Stop"

function Ensure-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in an elevated PowerShell (Run as Administrator)."
  }
}

function Ensure-Path([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label not found: $Path"
  }
}

function Ensure-Service([string]$Name, [string]$App, [string]$Args, [string]$Dir, [string]$LogDir, [string]$NssmPath) {
  $exists = (sc.exe query $Name 2>$null | Select-String "SERVICE_NAME") -ne $null
  if (-not $exists) {
    & $NssmPath install $Name $App $Args | Out-Host
  }

  & $NssmPath set $Name Application $App | Out-Host
  & $NssmPath set $Name AppParameters $Args | Out-Host
  & $NssmPath set $Name AppDirectory $Dir | Out-Host
  & $NssmPath set $Name AppStdout (Join-Path $LogDir "$Name.out.log") | Out-Host
  & $NssmPath set $Name AppStderr (Join-Path $LogDir "$Name.err.log") | Out-Host
  & $NssmPath set $Name AppRotateFiles 1 | Out-Host
  & $NssmPath set $Name AppRotateOnline 1 | Out-Host
  & $NssmPath set $Name AppRotateBytes 10485760 | Out-Host
  sc.exe config $Name start= auto | Out-Host
}

Ensure-Admin
Ensure-Path $NssmPath "NSSM"
Ensure-Path $ApiPython "Python"
Ensure-Path (Join-Path $ApiDir $ApiScript) "API script"
Ensure-Path $WebPnpm "pnpm"
Ensure-Path $WebDir "Web directory"
Ensure-Path $TunnelExe "cloudflared"
Ensure-Path $TunnelConfig "cloudflared config"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Ensure-Service -Name "SELRS-API" -App $ApiPython -Args $ApiScript -Dir $ApiDir -LogDir $LogDir -NssmPath $NssmPath
Ensure-Service -Name "SELRS-WEB" -App $WebPnpm -Args "start" -Dir $WebDir -LogDir $LogDir -NssmPath $NssmPath
Ensure-Service -Name "SELRS-TUNNEL" -App $TunnelExe -Args "--config `"$TunnelConfig`" tunnel run $TunnelName" -Dir "C:\Windows\System32" -LogDir $LogDir -NssmPath $NssmPath

sc.exe stop "pm2.exe" | Out-Host
sc.exe config "pm2.exe" start= demand | Out-Host

sc.exe start "SELRS-API" | Out-Host
sc.exe start "SELRS-WEB" | Out-Host
sc.exe start "SELRS-TUNNEL" | Out-Host

sc.exe query "SELRS-API" | Out-Host
sc.exe query "SELRS-WEB" | Out-Host
sc.exe query "SELRS-TUNNEL" | Out-Host

Write-Host ""
Write-Host "Done. Services installed and started."
Write-Host "Logs: $LogDir"
