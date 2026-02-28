$ErrorActionPreference = "Stop"

# Offline/local server defaults for LAN usage
$env:NODE_ENV = "production"
$env:HOST = $env:HOST ?? "0.0.0.0"
$env:PORT = $env:PORT ?? "4000"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not set. Set it in .env or as an environment variable."
}
if (-not $env:JWT_SECRET) {
  throw "JWT_SECRET is not set. Set it in .env or as an environment variable."
}

pnpm build
pnpm start

