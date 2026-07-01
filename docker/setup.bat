@echo off
setlocal enabledelayedexpansion
title Poultry Vet System - One-Time Setup

echo.
echo  ================================================
echo    Poultry Vet System - Installation
echo  ================================================
echo.

:: ── Check for administrator rights ──────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Please right-click setup.bat and choose
    echo  "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: ── Check Docker is installed ────────────────────────────────────────────────
docker --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Docker Desktop is not installed.
    echo.
    echo  Please install it first from:
    echo  https://www.docker.com/products/docker-desktop
    echo.
    echo  After installing, run this setup.bat again.
    pause
    exit /b 1
)

:: ── Get the folder where this bat file lives ─────────────────────────────────
set "DOCKER_DIR=%~dp0"
:: Remove trailing backslash
if "%DOCKER_DIR:~-1%"=="\" set "DOCKER_DIR=%DOCKER_DIR:~0,-1%"
:: Parent folder = root of project
for %%i in ("%DOCKER_DIR%") do set "ROOT_DIR=%%~dpi"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo  Installing to: %DOCKER_DIR%
echo.

:: ── 1. Make Docker Desktop start automatically with Windows ──────────────────
echo  [1/5] Configuring Docker Desktop to start with Windows...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Docker Desktop" /t REG_SZ /d "\"C:\Program Files\Docker\Docker\Docker Desktop.exe\" -Autostart" /f >nul 2>&1
echo        Done.

:: ── 2. Create the silent autostart script in Windows Startup folder ──────────
echo  [2/5] Setting up auto-start for Poultry Vet...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

(
  echo ' Poultry Vet - Silent Auto-Start
  echo ' Waits for Docker Desktop, then starts the app with no visible window
  echo WScript.Sleep 75000
  echo Dim WshShell
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.Run "cmd /c cd /d ""%DOCKER_DIR%"" && docker compose up -d", 0, False
) > "%STARTUP_DIR%\PoultryVetStart.vbs"

echo        Done.

:: ── 3. Create "Open Poultry Vet" desktop shortcut ────────────────────────────
echo  [3/5] Creating desktop shortcuts...

:: URL shortcut to open the app in browser
(
  echo [InternetShortcut]
  echo URL=http://localhost:3000
  echo IconFile=%SystemRoot%\System32\SHELL32.dll
  echo IconIndex=13
) > "%USERPROFILE%\Desktop\Open Poultry Vet.url"

:: ── 4. Create "Backup Poultry Vet" desktop shortcut ──────────────────────────
:: Create a friendly backup script that shows a popup when done
(
  echo @echo off
  echo docker info ^>nul 2^>^&1
  echo if errorlevel 1 ^(
  echo   powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show^('Docker is not running. Please wait a moment and try again.', 'Poultry Vet Backup', 'OK', 'Warning'^)"
  echo   exit /b 1
  echo ^)
  echo cd /d "%DOCKER_DIR%"
  echo for /f "tokens=2 delims==" %%%%a in ^('wmic OS Get localdatetime /value'^) do set "DT=%%%%a"
  echo set "TS=!DT:~0,4!-!DT:~4,2!-!DT:~6,2!_!DT:~8,2!-!DT:~10,2!"
  echo set "FILE=%DOCKER_DIR%\backups\poultry_vet_!TS!.sql"
  echo if not exist "%DOCKER_DIR%\backups" mkdir "%DOCKER_DIR%\backups"
  echo docker compose exec -T db pg_dump -U poultry -d poultry_vet --no-owner --no-acl ^> "!FILE!" 2^>nul
  echo if errorlevel 1 ^(
  echo   powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show^('Backup failed. Make sure the software is running first.', 'Poultry Vet Backup', 'OK', 'Error'^)"
  echo ^) else ^(
  echo   powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show^('Backup saved successfully!`n`nFile: poultry_vet_!TS!.sql`n`nPlease copy the backups folder to your USB drive.', 'Poultry Vet Backup', 'OK', 'Information'^)"
  echo ^)
) > "%DOCKER_DIR%\backup-silent.bat"

:: VBS wrapper to run backup without showing terminal
(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.Run "cmd /c ""%DOCKER_DIR%\backup-silent.bat""", 0, True
) > "%DOCKER_DIR%\backup-popup.vbs"

:: Shortcut on Desktop
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%USERPROFILE%\Desktop\Backup Poultry Vet.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%DOCKER_DIR%\backup-popup.vbs\"'; $s.WorkingDirectory = '%DOCKER_DIR%'; $s.IconLocation = '%SystemRoot%\System32\SHELL32.dll,47'; $s.Description = 'Backup Poultry Vet data'; $s.Save()" >nul 2>&1

echo        Done.

:: ── 5. First-time build and start ────────────────────────────────────────────
echo  [4/5] Building and starting the system for the first time...
echo        (This may take 5-15 minutes - please wait)
echo.
cd /d "%DOCKER_DIR%"
docker compose up -d --build

if errorlevel 1 (
    echo.
    echo  ERROR: Could not start the system.
    echo  Make sure Docker Desktop is fully open, then run setup.bat again.
    pause
    exit /b 1
)

echo.
echo  [5/5] Waiting for the app to be ready...
set /a WAIT=0
:WAIT_LOOP
timeout /t 5 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health 2>nul | findstr /x "200" >nul
if not errorlevel 1 goto DONE
set /a WAIT+=5
if %WAIT% geq 180 goto TIMEOUT
goto WAIT_LOOP

:TIMEOUT
echo.
echo  The app is taking longer than usual to start.
echo  Try opening http://localhost:3000 in a few minutes.
goto FINISH

:DONE
echo.
echo  ================================================
echo    Installation Complete!
echo  ================================================
echo.
echo  Two icons are now on the Desktop:
echo.
echo    Open Poultry Vet  --  opens the software
echo    Backup Poultry Vet  --  saves a data backup
echo.
echo  From now on:
echo    - The software starts automatically with Windows
echo    - Just click "Open Poultry Vet" after the PC loads
echo    - No need to open anything manually
echo.

:FINISH
:: Open the app
start http://localhost:3000

echo  Press any key to close this window.
pause >nul
