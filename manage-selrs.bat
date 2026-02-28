@echo off
setlocal EnableExtensions

set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=restart"

if /I "%ACTION%"=="start" goto do_start
if /I "%ACTION%"=="restart" goto do_restart
if /I "%ACTION%"=="status" goto do_status

echo Usage: %~nx0 [start^|restart^|status]
exit /b 1

:do_start
echo [INFO] Starting scheduled tasks...
call :task_start "SELRS-Tunnel"
call :task_start "SELRS-PNPM"
call :task_start "PYTHON-Server"
echo [DONE] Start flow finished.
exit /b 0

:do_restart
echo [INFO] Restarting scheduled tasks...
call :task_restart "SELRS-Tunnel"
call :task_restart "SELRS-PNPM"
call :task_restart "PYTHON-Server"
echo [DONE] Restart flow finished.
exit /b 0

:do_status
echo [INFO] Current task status:
call :task_status "SELRS-Tunnel"
call :task_status "SELRS-PNPM"
call :task_status "PYTHON-Server"
exit /b 0

:task_exists
schtasks /Query /TN "%~1" >nul 2>&1
exit /b %errorlevel%

:task_start
set "TASK=%~1"
call :task_exists "%TASK%"
if errorlevel 1 (
  echo [WARN] Task "%TASK%" not found.
  exit /b 0
)
schtasks /Run /TN "%TASK%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Failed to start task "%TASK%".
) else (
  echo [OK] Task "%TASK%" started.
)
exit /b 0

:task_restart
set "TASK=%~1"
call :task_exists "%TASK%"
if errorlevel 1 (
  echo [WARN] Task "%TASK%" not found.
  exit /b 0
)
schtasks /End /TN "%TASK%" >nul 2>&1
timeout /t 1 >nul
schtasks /Run /TN "%TASK%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Failed to restart task "%TASK%".
) else (
  echo [OK] Task "%TASK%" restarted.
)
exit /b 0

:task_status
set "TASK=%~1"
call :task_exists "%TASK%"
if errorlevel 1 (
  echo [WARN] Task "%TASK%" not found.
  exit /b 0
)
for /f "tokens=2 delims=:" %%A in ('schtasks /Query /TN "%TASK%" /FO LIST ^| findstr /B /C:"Status:"') do set "TASK_STATE=%%A"
if not defined TASK_STATE set "TASK_STATE= Unknown"
echo [OK] Task "%TASK%":%TASK_STATE%
set "TASK_STATE="
exit /b 0
