# DB Backup and Restore

## Backup

Run:

```powershell
pnpm db:backup
```

Optional custom file:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1 -OutFile "E:\backups\selrs_manual.sql"
```

## Restore

Run:

```powershell
pnpm db:restore --InFile "E:\backups\selrs_manual.sql"
```

Dry-run validation before restore:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-db.ps1 -InFile "E:\backups\selrs_manual.sql" -DryRun
```

## Notes

- Scripts read `DATABASE_URL` from environment or `.env`.
- Backup keeps only latest 30 files named `selrs_db_*.sql`.
- Take a backup before any large import/migration.
