@echo off
title Poultry Vet System - Starting...
echo.
echo  ================================================
echo    Poultry Vet Distribution System
echo  ================================================
echo.

:: Check Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Docker Desktop is not installed or not running.
    echo.
    echo  Please install Docker Desktop from:
    echo  https://www.docker.com/products/docker-desktop
    echo.
    pause
    exit /b 1
)

:: Check Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Docker Desktop is not running.
    echo  Please open Docker Desktop and wait for it to start,
    echo  then run this script again.
    echo.
    pause
    exit /b 1
)

echo  Starting services...
echo.
cd /d "%~dp0"
docker compose up -d --build

if errorlevel 1 (
    echo.
    echo  ERROR: Failed to start. Check the output above.
    pause
    exit /b 1
)

echo.
echo  Waiting for app to be ready (this may take 1-2 minutes on first run)...
echo.

:: Wait for health check
set /a WAIT=0
:WAIT_LOOP
timeout /t 3 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health 2>nul | findstr /x "200" >nul
if not errorlevel 1 goto READY
set /a WAIT+=3
if %WAIT% geq 120 (
    echo  App is taking longer than usual. Try opening http://localhost:3000 manually.
    goto OPEN
)
echo  Still starting... (%WAIT%s)
goto WAIT_LOOP

:READY
echo.
echo  ================================================
echo    Ready! Opening in your browser...
echo    http://localhost:3000
echo  ================================================
echo.

:OPEN
start http://localhost:3000
echo  Press any key to close this window. The app keeps running in the background.
pause >nul
