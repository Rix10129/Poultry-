# Running Poultry Vet System on a Windows Office PC

This guide explains two ways to use the software on an office Windows PC.

---

## Option A — Use as a Desktop App (Recommended, No Installation)

The software runs in the cloud (Vercel) and can be **installed on the desktop like a real app** using the browser's built-in PWA (Progressive Web App) feature. No IT knowledge required.

### Steps:

1. Open **Google Chrome** on the office PC
2. Go to your Vercel URL (e.g. `https://your-app.vercel.app`)
3. Log in with your account
4. In the Chrome address bar, click the **install icon** (looks like a computer with a download arrow) on the right side
5. Click **"Install"**
6. The app will appear on the desktop and taskbar — it opens like a normal Windows application
7. Create a shortcut on the desktop for easy access

> **Why this is better than the old .exe software:**
> - Data is in the cloud — if the PC breaks, data is safe
> - If an employee leaves, disable their account from Settings → Users — they instantly lose access
> - The owner can log in from anywhere (phone, home, other PC)
> - No installation or IT support needed for updates

---

## Option B — Fully Local Installation (No Internet Required)

Use this if you do NOT want any data going to the internet. All data stays on the office PC.

### Requirements:
- Windows 10 or 11
- Admin rights on the PC

### Step 1 — Install Node.js

1. Go to https://nodejs.org and download **Node.js LTS** (the "Recommended" version)
2. Run the installer, click Next through all steps
3. Restart the PC after installation

### Step 2 — Install PostgreSQL (local database)

1. Go to https://www.postgresql.org/download/windows/
2. Download and install PostgreSQL (version 15 or 16)
3. During setup, set a password for the `postgres` user — **write this down**
4. Keep the default port 5432

### Step 3 — Set Up the Software

1. Download the software code as a ZIP from GitHub and extract it to `C:\PoultryVet\`
2. Open the extracted folder
3. Create a file named `.env.local` in the folder with these contents:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/poultryvet
NEXTAUTH_SECRET=some-random-secret-string-here-change-this
NEXTAUTH_URL=http://localhost:3000
```

Replace `YOUR_PASSWORD` with the PostgreSQL password you set.

4. Double-click `setup.bat` to install and set up the software (see below)

### Step 4 — Create startup.bat

Create a file called `startup.bat` in `C:\PoultryVet\` with these contents:

```batch
@echo off
title Poultry Vet System
echo Starting Poultry Vet System...
cd /d C:\PoultryVet
start "" "http://localhost:3000"
npm start
```

Create a shortcut to `startup.bat` on the desktop. Double-clicking it will start the software and open it in the browser automatically.

### Step 5 — First-Time Setup

Run these commands once in Command Prompt (inside `C:\PoultryVet\`):

```
npm install
npx prisma db push
npm run build
```

After that, just use `startup.bat` every time.

---

## Data Security Notes

| Concern | Cloud (Option A) | Local (Option B) |
|---------|-----------------|-----------------|
| Employee leaves | Disable their account → instant lockout | Change PC password |
| PC breaks/stolen | Data safe in cloud | Data lost (back up regularly!) |
| Power outage | No impact | Software stops |
| Internet needed | Yes | No |
| Access from home | Yes (owner only) | No |

**Recommendation for most businesses: Use Option A (Cloud PWA).** Your data is controlled by your login credentials, not the PC. The owner has full control and can revoke employee access instantly.

---

## How to Disable an Employee's Access

When an employee leaves:

1. Log in as Owner
2. Go to **Settings → Users**
3. Find the employee's name
4. Click **Deactivate** — they can no longer log in

Their data and history remains in the system for records, but they cannot access it.
