# Bug Journal / Dev Log (Eid-Al-Fitr-2026)

This file is a running journal of bugs/issues encountered while developing/running the project, and how they were resolved. Add new entries as you hit new issues.

---

## 2026-01-07 — “Wrong directory / can’t find folders”

- **Symptom**
  - Commands like `cd ..\client` fail with “path does not exist”.
  - Copying env files fails, e.g. `Copy-Item client\env.example client\.env` tries to read `server\client\env.example`.
- **Root cause**
  - Ran commands from the wrong working directory (`pwd`/prompt showed being inside `server\` or a parent folder).
  - In PowerShell, relative paths resolve from the current directory, so `..\client` means “go up one folder, then client”, which may not be your repo root.
- **Fix**
  - Always `cd` to the repo root (`...\Eid-Al-Fitr-2026`) before referencing `client\` and `server\` siblings.
  - If already in `server\`, use `..\client` to reach the client folder; do not run `cd server` twice (that tries `server\server`).
- **Prevention**
  - Use `pwd` + `ls` before multi-step commands.

---

## 2026-01-07 — `.env` not being loaded / “Missing GEMINI_API_KEY”

- **Symptom**
  - Running scripts reported missing `GEMINI_API_KEY` even though it was present in `.env`.
- **Root cause**
  - `dotenv` loads `.env` relative to the current working directory by default; running from different folders caused it not to be found.
- **Fix (code change)**
  - Backend now loads env reliably from `server/.env`:
    - `server/index.js` loads `dotenv` from `__dirname/.env`.
    - `server/scripts/ragQuickTest.js` loads `dotenv` from `../.env`.
- **Prevention**
  - Keep secrets in `server/.env` and avoid relying on current working directory.

---

## 2026-01-07 — PowerShell `curl` security warning / “Operation cancelled due to security concerns”

- **Symptom**
  - `curl http://localhost:5001/health` triggered an interactive “Security Warning” prompt.
- **Root cause**
  - In PowerShell, `curl` is an alias for `Invoke-WebRequest`, which warns about parsing HTML/scripts.
- **Fix**
  - Use real curl: `curl.exe http://localhost:5001/health`
  - Or: `Invoke-WebRequest http://localhost:5001/health -UseBasicParsing`
- **Prevention**
  - Prefer `curl.exe` in PowerShell.

---

## 2026-01-07 — Port already in use (`EADDRINUSE`)

- **Symptom**
  - Server crashed with: `Error: listen EADDRINUSE: address already in use :::5000` (or `5001`).
- **Root cause**
  - Another process (previous Node server instance or Docker container) was already listening on the port.
- **Fix**
  - Identify process: `netstat -ano | findstr :5000`
  - Confirm: `tasklist /FI "PID eq <PID>"`
  - Kill if safe: `taskkill /PID <PID> /F`
  - Or change port in `server/.env` (`PORT=5001`) and point client at it.
- **Prevention**
  - Standardize on one dev port and kill old processes before restart.

---

## 2026-01-07 — Server crashed on startup due to Postgres (`SequelizeConnectionRefusedError`)

- **Symptom**
  - `npm run dev` crashed because Postgres was not running locally.
- **Root cause**
  - Backend tried to `sequelize.authenticate()` and exited if DB was unavailable.
- **Fix (code change)**
  - In development, DB is now **optional**; server continues without it unless explicitly enforced.
  - In production, DB remains required.
- **Prevention**
  - For “RAG-only” development, don’t block server startup on DB connectivity.
  - If you want DB locally, run `docker compose up -d postgres` (no need for `createdb`).

---

## 2026-01-07 — `createdb` command not found (Postgres CLI missing)

- **Symptom**
  - `createdb : The term 'createdb' is not recognized...`
- **Root cause**
  - Postgres CLI tools weren’t installed on Windows or not on PATH.
- **Fix**
  - Use Docker Postgres (`docker compose up -d postgres`) or install PostgreSQL and add its `bin` to PATH.

---

## 2026-01-07 — Client failed to start: `react-scripts` not recognized

- **Symptom**
  - `react-scripts` not recognized when running `npm start` in `client/`.
- **Root cause**
  - Client dependencies weren’t installed (`node_modules` missing).
- **Fix**
  - `cd client; npm install; npm start`

---

## 2026-01-07 — Client failed to start: missing `client/public/index.html`

- **Symptom**
  - CRA dev server error: “Could not find a required file. Name: index.html. Searched in: client/public”
- **Root cause**
  - `client/public/index.html` didn’t exist (there was an `index.html` at repo root, but CRA expects it in `client/public/`).
- **Fix (code change)**
  - Added `client/public/index.html` (and minimal `manifest.json` + `robots.txt`).

---

## 2026-01-07 — CRA proxy errors (`/favicon.ico` proxied to backend)

- **Symptom**
  - `Proxy error: Could not proxy request /favicon.ico from localhost:3000 to http://localhost:5000/ (ECONNREFUSED)`
- **Root cause**
  - CRA tried to fetch `/favicon.ico`; missing file caused it to proxy/route unexpectedly while backend wasn’t on expected port.
- **Fix (code change)**
  - Added a placeholder `client/public/favicon.ico`
  - Updated `client/package.json` proxy to match backend port (`5001` during local dev).

---

## 2026-01-07 — Gemini model 404 (“model not found for API version v1beta”)

- **Symptom**
  - `404 Not Found ... models/<model>:generateContent ... not supported for API version v1beta`
- **Root cause**
  - Model name mismatch / key not enabled for that model on that endpoint.
- **Fix**
  - Added a script to list available models for your key: `npm run gemini:models`
  - Configured model priority order via env:
    - `GEMINI_CHAT_MODEL=gemini-3-pro-preview`
    - `GEMINI_FALLBACK_MODELS=gemini-3-flash-preview,gemini-2.5-pro,...`

---

## 2026-01-07 — Gemini 429 quota / rate-limit errors

- **Symptom**
  - `429 Too Many Requests` / `RESOURCE_EXHAUSTED` / “quota exceeded”.
- **Root cause**
  - Your plan/key had insufficient quota for a specific model (especially high-tier models).
- **Fix (code change)**
  - RAG generation now falls back not only on 404, but also on 429 to cheaper models in your fallback list.
- **Prevention**
  - Keep a “cheap reliable” fallback like `gemini-2.5-flash` in `GEMINI_FALLBACK_MODELS`.

---

## 2026-01-07 — Qdrant client/server incompatibility

- **Symptom**
  - Client version mismatch warning (e.g., Node client 1.16.2 vs Qdrant server 1.9.5).
- **Root cause**
  - Qdrant Docker image was too old for the JS client.
- **Fix (code/config change)**
  - Updated Qdrant image to `qdrant/qdrant:v1.16.2` in compose files.

---

## 2026-01-07 — Auto-indexer “Bad Request” during ingestion

- **Symptom**
  - `[rag-index] run failed Bad Request`
- **Root cause (common)**
  - Qdrant collection vector size mismatch vs embedding dimensionality.
  - Or invalid payload shape.
- **Fix (code change)**
  - Improved error logging in the scheduler.
  - Added safer collection handling with optional auto-recreate:
    - `QDRANT_RECREATE_COLLECTION_ON_MISMATCH=true`
  - Added `GEMINI_EMBED_OUTPUT_DIM` knob to force embedding dimensionality to match the collection.

---

## 2026-01-07 — Frontend couldn’t call `/api/rag/search` due to auth

- **Symptom**
  - Islamic Q&A UI calls RAG search but server returned 401 (not logged in).
- **Root cause**
  - `/api/rag/search` required `authenticateToken`.
- **Fix (code change)**
  - Switched to optional auth so anyone can query; authenticated users still get history persistence.

---

## 2026-01-07 — “No terminal ingestion” UX requirement

- **Goal**
  - End users should never run ingestion manually or paste URLs.
- **Fix (architecture change)**
  - Added fixed knowledge base config file: `server/rag_sources.json`.
  - Added auto indexer (startup + interval) to crawl/chunk/embed into Qdrant.
  - At question time, server only does retrieval + answer.

---

## Add new issues below

Template:

- **Date**:
- **Symptom**:
- **Root cause**:
- **Fix**:
- **Prevention / Notes**:

