================================================
  Poultry Vet Distribution System
  Local / Offline Installation Guide
================================================

REQUIREMENTS
------------
1. Docker Desktop (free) — download from:
   https://www.docker.com/products/docker-desktop

   After installing, open Docker Desktop and wait for
   the whale icon in the taskbar to stop animating.

FIRST-TIME SETUP
----------------
1. Install Docker Desktop (see above)
2. Double-click  start.bat
3. Wait 1-2 minutes on the first run (it downloads files)
4. Your browser will open automatically at http://localhost:3000
5. Create your account at http://localhost:3000/register

DAILY USE
---------
Start the app:   double-click  start.bat
Stop the app:    double-click  stop.bat

The app runs only while Docker Desktop is open.
Your data is NEVER deleted when you stop the app.

BACKUPS (IMPORTANT!)
--------------------
Run backup.bat at least once a week.

Backups are saved in the  backups\  folder next to this file.
Copy that folder to a USB drive or external hard disk regularly.

To RESTORE a backup:
1. Make sure the system is running (start.bat)
2. Open a Command Prompt in this folder
3. Run:  docker compose exec -T db psql -U poultry -d poultry_vet < backups\YOUR_BACKUP_FILE.sql

TROUBLESHOOTING
---------------
Q: "Docker Desktop is not running" error
A: Open Docker Desktop from the Start Menu and wait for it to finish starting.

Q: Page shows error or won't load
A: Wait 2 more minutes — the first start takes time to build.
   Then try refreshing http://localhost:3000

Q: I forgot my password
A: Go to http://localhost:3000/forgot-password

Q: The app runs slow
A: Make sure your PC has at least 4 GB of RAM free.
   Close other heavy programs while using the app.

SUPPORT
-------
Contact your system administrator for help.

================================================
