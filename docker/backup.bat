@echo off
title Poultry Vet System - Backup
echo.
echo  ================================================
echo    Poultry Vet Distribution System - Backup
echo  ================================================
echo.

:: Check Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Docker Desktop is not running.
    echo  Please start Docker Desktop first, then run backup.bat again.
    pause
    exit /b 1
)

:: Create backups folder next to this script
set BACKUP_DIR=%~dp0backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: File name with date and time
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "DT=%%a"
set "TIMESTAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%-%DT:~10,2%"
set "BACKUP_FILE=%BACKUP_DIR%\poultry_vet_%TIMESTAMP%.sql"

echo  Creating backup: poultry_vet_%TIMESTAMP%.sql
echo.

cd /d "%~dp0"

:: Run pg_dump inside the db container
docker compose exec -T db pg_dump -U poultry -d poultry_vet --no-owner --no-acl > "%BACKUP_FILE%"

if errorlevel 1 (
    echo.
    echo  ERROR: Backup failed.
    echo  Make sure the system is running (start.bat) before taking a backup.
    if exist "%BACKUP_FILE%" del "%BACKUP_FILE%"
    pause
    exit /b 1
)

:: Check the file is not empty
for %%A in ("%BACKUP_FILE%") do set FILESIZE=%%~zA
if %FILESIZE% LSS 100 (
    echo  ERROR: Backup file is too small - something went wrong.
    del "%BACKUP_FILE%"
    pause
    exit /b 1
)

echo  ================================================
echo    Backup saved:
echo    %BACKUP_FILE%
echo.
echo    Size: %FILESIZE% bytes
echo  ================================================
echo.

:: Keep only last 30 backups
echo  Cleaning old backups (keeping last 30)...
set COUNT=0
for /f "skip=30 delims=" %%F in ('dir /b /o-d "%BACKUP_DIR%\poultry_vet_*.sql" 2^>nul') do (
    del "%BACKUP_DIR%\%%F"
    set /a COUNT+=1
)
if %COUNT% GTR 0 echo  Removed %COUNT% old backup(s).

echo.
echo  Done! Copy the backups folder to a USB drive or cloud storage for safety.
echo.
pause
