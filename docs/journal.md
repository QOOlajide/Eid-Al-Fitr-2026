# Engineering Journal — Express on Vercel + CORS (Nov 2026)

## Problem we were solving
Frontend on Vercel looked fine; Search did nothing because Express was not deployed.
One monorepo = two apps (`client/` + `server/`). Backend project Root Directory must be `server`.

## Step 1 — Dual-mode Express entry (`server/index.js`)

**Idea:** Same file works for Vercel/tests *and* local `node index.js`.

- Always build and `module.exports = app`
- Only call `startServer()` when `require.main === module` (this file was started with `node index.js`)
- On Vercel: import exported `app` → no `listen()`, no boot-time ingestion scheduler

**Docs:**
- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- Node entry vs import: `require.main === module` means “was this file the process entrypoint?”

## Middleware order (what matters)

1. Global middleware (cors, json parser, rate limit, …) **before** routes  
2. Routes  
3. 404 catch-all  
4. 4-arg error handler **last**

**Docs:** [Express error handling](https://expressjs.com/en/guide/error-handling.html) — error middleware last.

## CORS / CLIENT_URL

Browsers block cross-origin API calls unless the backend allows the frontend origin.

- Local: if `CLIENT_URL` missing → `http://localhost:3000`
- Production: if `CLIENT_URL` missing → **throw** (fail loud)

**Docs:**
- [cors `origin`](https://github.com/expressjs/cors#configuration-options)
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [Vercel `NODE_ENV`](https://vercel.com/docs/environment-variables/system-environment-variables)

## Standup one-liners
- “Split monorepo deploy: server Root Directory on Vercel; export Express app for Functions.”
- “Gated `listen`/scheduler behind `require.main === module` so serverless import doesn’t open a port.”
- “Prod requires `CLIENT_URL` for CORS; localhost fallback only outside production.”
- “Reordered handlers to 404 then 500 per Express docs.”

## Flagged next
- Step 2: point frontend API calls at deployed backend URL
- Step 3: Neon + Qdrant Cloud + Gemini env on server project

## References (read later)
- [Building a Memory-Enabled RAG System with Qdrant and PostgreSQL](https://medium.com/@naeem.ahmed.bdn/building-a-memory-enabled-rag-system-with-qdrant-and-postgresql-ebed2224618f) — relevant to our split: Qdrant for vectors, Postgres/Neon for app/memory-style state.
