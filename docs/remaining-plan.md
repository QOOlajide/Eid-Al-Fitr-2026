# Remaining Plan — Get Search Working in Production

Last updated: Nov 2026

## Done (good start)
- [x] RAG eval logging + analysis scripts
- [x] Query guardrails + hardened LLM prompt
- [x] Dual-mode Express entry: `module.exports = app` + `require.main === module` gate
- [x] Prod requires `CLIENT_URL` (no localhost CORS fallback)
- [x] Handler order: 404 then 500 (per Express docs)
- [x] Learning notes: `docs/journal.md`, `docs/troubleshooting-journal.md`
- [x] Backend Vercel project Root Directory = `server` (verify in dashboard)

## Not done yet

### 1. Commit & push local dual-mode Express work
Code may exist only on your machine until pushed. Confirm `main` on GitHub includes `server/index.js` export + CORS changes.

### 2. Point frontend at backend (Step 2)
**Why:** Axios already supports `REACT_APP_SERVER_URL` in `client/src/index.js`. Without it on the frontend Vercel project, `/api/...` still hits the frontend host (dead).

**Do:**
- [ ] Deploy/redeploy **server** Vercel project; copy its URL
- [ ] On **client** Vercel project: set `REACT_APP_SERVER_URL=https://<backend>.vercel.app`
- [ ] Redeploy client (CRA bakes env in at build time)
- [ ] Fix `fetch('/api/...')` in `Forum.js` / `ZakatPayment.js` — they ignore axios `baseURL`
- [ ] Confirm Socket.IO client URL (`REACT_APP_SERVER_URL`) — realtime may wait until later

**Docs:** [CRA env vars](https://create-react-app.dev/docs/adding-custom-environment-variables/) · [axios defaults](https://axios-http.com/docs/config_defaults)

### 3. Server env on Vercel (Step 3)
On the **server** project, set at least:
- [ ] `CLIENT_URL` = frontend Vercel URL (required in production)
- [ ] `GEMINI_API_KEY` (+ chat/fallback model vars if you use them)
- [ ] `QDRANT_URL` + Qdrant API key (Qdrant Cloud)
- [ ] `RAG_RETRIEVER=vector`, collection name, `RAG_TOP_K`, etc.
- [ ] Neon / Postgres URL for Sequelize (`DATABASE_URL` or whatever `config/database.js` expects)
- [ ] `JWT` / Stripe secrets if those routes matter in prod
- [ ] Prefer `RAG_AUTO_INDEX=false` on serverless (no boot scheduler)

### 4. Data: Qdrant Cloud + ingest
- [ ] Create Qdrant Cloud cluster
- [ ] Run ingest **once** against cloud (local script or one-off job) — not on every Function cold start
- [ ] Later: Vercel Cron → authenticated route that triggers ingest

**Docs:** [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) · [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

### 5. Smoke test production Search
- [ ] `GET https://<backend>/health`
- [ ] From frontend Q&A page: submit a real question
- [ ] If CORS error → check `CLIENT_URL`
- [ ] If 504/timeout → check Gemini/Qdrant env + Function duration
- [ ] If empty/weak answers → confirm cloud collection was ingested

### 6. Optional later (don’t block Search)
- [ ] Socket.IO on Vercel Fluid (or drop realtime for v1)
- [ ] Shared rate-limit store (Redis/Upstash) if abuse becomes real
- [ ] Durable RAG logs (not local `rag_logs/` on ephemeral disk)
- [ ] Strict multi-origin CORS allowlist if you have preview + prod frontends

## Suggested order (don’t multitask)
1. Push current code  
2. Server deploy + env (`CLIENT_URL`, Gemini, Qdrant, DB)  
3. Ingest into Qdrant Cloud  
4. Client `REACT_APP_SERVER_URL` + redeploy  
5. Fix remaining `fetch` callers  
6. Click Search end-to-end  

## Standup status template
- **Done:** dual-mode Express export; prod CORS requires `CLIENT_URL`; 404→500 order  
- **Doing:** wire frontend `REACT_APP_SERVER_URL` + server env / Qdrant Cloud  
- **Blocked:** (e.g. waiting on Qdrant Cloud account / Neon URL)
