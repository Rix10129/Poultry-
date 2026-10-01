@echo off
cd /d "%~dp0"
echo Installing CITY LINKS Recovery System requirements...
python -m pip install -r requirements.txt
echo.
echo Done. Now double-click CityLinks.bat
pause
