# Setup (Windows-friendly)

## Prereqs
- Node **20+** recommended (project expects Node >= 20). CRA (`react-scripts`) is most stable on Node 18/20 LTS.
- Docker Desktop (for Qdrant; optional for Postgres/Redis)

## One-time install
From repo root:

```powershell
npm run install-all
```

## Run (recommended local dev)

### Start Qdrant
```powershell
docker compose up -d qdrant
```

### Start backend + frontend together
From repo root:

```powershell
npm run dev
```

Notes:
- If you see `EADDRINUSE`, something is already using the port. Free ports 3000/5001 before re-running.
- If PowerShell `curl` warns, use `curl.exe` instead:
  - `curl.exe http://localhost:5001/health`

## Common “clean slate” fixes

### Fix broken frontend dependencies
From `client/`:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm cache clean --force
npm install
npm start
```

### Kill what’s using a port
Example port 5001:

```powershell
$pid = (Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

