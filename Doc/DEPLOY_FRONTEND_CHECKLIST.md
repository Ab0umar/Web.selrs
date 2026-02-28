# Frontend Deploy Checklist (No Missing Chunks)

1. Build:
```powershell
pnpm build
```

2. Source folder to deploy:
`dist/public`

3. Mirror-copy full bundle to web root:
```powershell
robocopy "<repo>\\dist\\public" "<web_root>" /MIR
```

4. Verify hashed bundles exist on server:
```powershell
Get-ChildItem "<web_root>\\assets" | Select-Object -First 20
```

5. Restart app/web service.

6. Purge CDN cache (if any), then hard refresh browser (`Ctrl+Shift+R`).

7. Validate active build:
- `GET /healthz` should show non-`unknown` `version` and `buildTime`.

