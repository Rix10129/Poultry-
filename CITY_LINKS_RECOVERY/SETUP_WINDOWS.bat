@echo off
cd /d "%~dp0"
echo Installing CITY LINKS Recovery System requirements...
python -m pip install -r requirements.txt
echo.
echo Creating the production workbook if it does not exist yet (an existing one is never changed)...
python citylinks.py setup
echo.
echo Done. Now double-click CityLinks.bat
pause
