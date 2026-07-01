@echo off
title Poultry Vet System - Stopping...
echo.
echo  ================================================
echo    Poultry Vet Distribution System
echo  ================================================
echo.
echo  Stopping services...
echo  (Your data is saved and will be here when you restart)
echo.

cd /d "%~dp0"
docker compose down

if errorlevel 1 (
    echo.
    echo  ERROR: Failed to stop. Is Docker Desktop running?
    pause
    exit /b 1
)

echo.
echo  ================================================
echo    Stopped. Your data is safe.
echo    Run start.bat to start again.
echo  ================================================
echo.
pause
