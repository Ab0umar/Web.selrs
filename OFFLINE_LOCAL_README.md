# Offline Local Launch (Internal Server)

This project can run fully offline as an internal/local server with a local MySQL database.

## 1) MySQL

1. Ensure MySQL Server is installed and running on the same machine.
2. Create the database and an app user (run as `root`):

```sql
CREATE DATABASE IF NOT EXISTS selrs26 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'appuser'@'localhost' IDENTIFIED BY 'selrs258288';
GRANT ALL PRIVILEGES ON selrs26.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
```

## 2) Environment

Set `.env` (repo root):

```
DATABASE_URL=mysql://appuser:selrs258288@localhost:3306/selrs26
JWT_SECRET=CHANGE_ME_TO_A_RANDOM_SECRET
```

If you want to access the server from other machines on the LAN:

```
HOST=0.0.0.0
PORT=5000
```

## 3) Migrations

```powershell
$env:DATABASE_URL='mysql://appuser:selrs258288@localhost:3306/selrs26'
pnpm db:push
```

## 4) Seed Admin User

```powershell
pnpm create-user admin 123456 admin examinations
```

## 5) Run Offline Production Server

```powershell
.\scripts\run-offline-local.ps1
```

Or manually:

```powershell
pnpm build
pnpm start
```

## 6) Windows Firewall (LAN access)

Allow inbound TCP on the port you chose (example 5000).

