# Cloudflare Tunnel Runbook (SELRS)

## Known-good setup
- Tunnel service: `cloudflared` (Windows service)
- Local web origin: `http://localhost:4000`
- Local API origin: `http://localhost:3000`
- Public hostnames in Cloudflare Zero Trust:
  - `op.selrs.cc` -> `HTTP` -> `localhost:4000`
  - `api.selrs.cc` -> `HTTP` -> `localhost:3000`

Important:
- Use `HTTP` for localhost origins in Tunnel hostnames.
- If set to `HTTPS` by mistake, Cloudflare will return `502 Bad Gateway`.

## Quick health checks
Run in PowerShell (Admin):

```powershell
sc.exe query cloudflared
sc.exe qc cloudflared
netstat -ano | findstr :4000
netstat -ano | findstr :3000
curl.exe -I http://127.0.0.1:4000/
curl.exe -I http://127.0.0.1:3000/
curl.exe -I https://op.selrs.cc
curl.exe -I https://api.selrs.cc
```

Expected:
- `cloudflared` state = `RUNNING`
- ports `3000` and `4000` are listening
- local curl returns response
- public domains return non-502

## Restart tunnel service
```powershell
sc.exe stop cloudflared
sc.exe start cloudflared
sc.exe query cloudflared
```

## Reinstall service with new token
Use when token/tunnel binding is broken.

```powershell
sc.exe stop cloudflared
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" service uninstall
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" service install <NEW_TUNNEL_TOKEN>
sc.exe start cloudflared
sc.exe qc cloudflared
```

## Common failure patterns

### 1) `Error 1033` or `Tunnel not found`
Cause:
- Wrong tunnel identity/token

Fix:
- Reinstall service with fresh token from the correct tunnel.
- Confirm `op` and `api` hostnames are attached to that same tunnel.

### 2) `502 Bad Gateway` with local app healthy
Cause:
- Hostname origin set to wrong type/port (most common: HTTPS instead of HTTP)

Fix:
- In Zero Trust, set:
  - `op.selrs.cc` -> `HTTP` -> `localhost:4000`
  - `api.selrs.cc` -> `HTTP` -> `localhost:3000`

### 3) Control stream / edge connection failures
Cause:
- Network/firewall instability

Fix:
- Restart service
- Ensure outbound `cloudflared.exe` is allowed
- Keep service command simple (token mode)

## Service command guidance
If needed, force HTTP/2 + IPv4 in service command:

```powershell
$t='<TOKEN>'
$bp = '"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --protocol http2 --edge-ip-version 4 run --token ' + $t
& sc.exe config cloudflared binPath= $bp
& sc.exe stop cloudflared
& sc.exe start cloudflared
& sc.exe qc cloudflared
```

## Final validation checklist
- [ ] `cloudflared` service is running
- [ ] `localhost:4000` responds
- [ ] `localhost:3000` responds
- [ ] Zero Trust hostnames are `HTTP` (not `HTTPS`)
- [ ] `op.selrs.cc` opens without Cloudflare error
- [ ] `api.selrs.cc` opens without Cloudflare error
