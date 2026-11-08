# Troubleshooting Journal — RAG Pipeline Setup (March 2026)

Problems encountered while building and testing the RAG evaluation pipeline
with Qdrant + Google Gemini on Node.js / Windows / PowerShell.

---

## 1. PowerShell is not Bash

**Symptom:** Commands with `&&` fail with `The token '&&' is not a valid statement separator`.
Heredocs (`<<'EOF'`) fail with `The '<' operator is reserved for future use`.

**Why:** PowerShell uses different syntax than bash/zsh. Many online tutorials and
AI-generated commands default to bash.

**Fix:**
- Use `;` instead of `&&` to chain commands: `cd server; npm install; cd ..`
- For multi-line strings, write to a temp file instead of using heredocs
- `git commit -F message.txt` instead of `-m "$(cat <<'EOF' ... EOF)"`

**Rule of thumb:** If a shell command looks like it was written for Linux, double-check
the PowerShell equivalent before running it.

---

## 2. `Cannot find module 'dotenv'` (or any dependency)

**Symptom:** `Error: Cannot find module 'dotenv'` when running a Node.js script.

**Why:** `npm install` was never run in the `server/` directory after cloning,
or a new dependency was added to `package.json` without reinstalling.

**Fix:**
```powershell
cd server
npm install
cd ..
```

**Rule of thumb:** After cloning a repo, pulling changes, or seeing any
"Cannot find module" error — run `npm install` in the relevant package directory.

---

## 3. Gemini API 429 — Rate Limit During Ingestion

**Symptom:** `Gemini embedContent failed (429)` repeatedly during `ingestRagSources.js`.

**Why:** The Gemini free tier allows ~15 requests/minute for embedding. The ingestion
script was firing hundreds of embedding calls back-to-back with no delay, especially
when `RAG_FOLLOW_LINKS=true` and `RAG_MAX_PAGES=50` caused it to crawl dozens of pages
and generate hundreds of chunks.

**Fix (three-pronged):**
1. **Add a per-chunk delay** — set `RAG_EMBED_DELAY_MS=5000` in `.env` (5 seconds
   between each embed call, well within the 15 RPM limit)
2. **Limit crawl scope** — set `RAG_MAX_PAGES=5` and `RAG_FOLLOW_LINKS=false` to
   reduce the total number of chunks
3. **Code change** — added `await sleep(embedDelayMs)` inside the chunk loop in
   `ingestService.js`

**Rule of thumb:** Whenever you're calling an external API in a loop, always add a
configurable delay. Free tiers are strict. 4-5 seconds per call is safe for Gemini's
15 RPM limit.

---

## 4. Gemini API 429 — Model Quota Exhausted (`limit: 0`)

**Symptom:** `Gemini generateContent failed (429)` even after rotating the API key.
The error body shows `"limit": 0` for a specific model like `gemini-2.0-flash`.

**Why:** Gemini quotas are per-project, not per-key. Rotating the API key doesn't
reset the quota. Some models have separate daily quotas — burning through one model's
quota doesn't affect another's.

**Fix:**
- Switch to a different model that still has quota:
  ```
  GEMINI_CHAT_MODEL=gemini-2.0-flash-lite
  GEMINI_FALLBACK_MODELS=gemini-1.5-flash
  ```
- Wait for the daily quota to reset (usually midnight Pacific Time)
- If you need higher limits, enable billing on your Google Cloud project

**Rule of thumb:** Rotating an API key does NOT reset rate limits. The quota lives on
the project, not the key. Switch models or wait it out.

---

## 5. Docker Port Already Allocated

**Symptom:** `docker run` fails with `Bind for 0.0.0.0:6333 failed: port is already allocated`.

**Why:** A previous Qdrant container (or another process) is still running and holding
port 6333.

**Fix:**
```powershell
# Remove the old container first, then start fresh
docker rm -f qdrant; docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

**Debugging:**
```powershell
# Check what's using the port
netstat -ano | findstr 6333

# List running Docker containers
docker ps
```

**Rule of thumb:** Before starting a Docker container on a specific port, check if
something is already bound to that port. `docker rm -f <name>` is safe — it just
removes the old container.

---

## 6. Ingestion Runs but Upserts 0 Documents

**Symptom:** `ingestRagSources.js` reports `pagesFetched: 1, pointsUpserted: 0`.

**Why:** The script writes progress to `server/.data/ingest_state.json`. If a previous
run partially completed (or errored out midway), subsequent runs skip all
already-processed URLs — even if no vectors were actually stored.

**Fix:**
```powershell
# Delete the state file to force a fresh ingestion
Remove-Item server\.data\ingest_state.json
```

Then re-run ingestion.

**Rule of thumb:** If an ingestion or migration script has a "resume" feature backed
by a state file, and something went wrong on the first run, delete the state file
before retrying.

---

## 7. API Key Leaked in Chat / IDE

**Symptom:** Pasted an API key into the Cursor chat, or the AI assistant read it from
a `.env` file that was open in the editor.

**Why:** `.gitignore` only prevents git from tracking `.env` — it does NOT prevent the
IDE or AI assistant from reading it. Cursor's AI can see any file in your workspace.

**Fix:**
1. **Rotate the key immediately** at https://aistudio.google.com/apikey
2. **Create a `.cursorignore` file** in the project root:
   ```
   **/.env
   ```
   This tells Cursor's AI to never read files matching that pattern.
3. **Never paste secrets into chat** — once it's in the conversation context,
   you can't remove it.

**Rule of thumb:** `.gitignore` protects git. `.cursorignore` protects the AI.
You need both. And never paste keys into any chat interface.

---

## Quick Reference: Environment Variables That Saved Us

| Variable | Value | Why |
|----------|-------|-----|
| `RAG_EMBED_DELAY_MS` | `5000` | Prevents 429s during ingestion |
| `RAG_MAX_PAGES` | `5` | Limits crawl scope to avoid thousands of chunks |
| `RAG_FOLLOW_LINKS` | `false` | Don't spider out from seed URLs |
| `RAG_RETRIEVER` | `vector` | Use Qdrant instead of keyword fallback |
| `QDRANT_URL` | `http://localhost:6333` | Local Docker Qdrant instance |
| `GEMINI_CHAT_MODEL` | `gemini-2.0-flash-lite` | Use a model with remaining quota |
| `GEMINI_FALLBACK_MODELS` | `gemini-1.5-flash` | Backup when primary model is throttled |

---

## Lesson Learned

The biggest time sink was **Gemini rate limits**. If I were starting over:

1. Set `RAG_EMBED_DELAY_MS=5000` from day one
2. Start with `RAG_MAX_PAGES=3` and scale up only after confirming it works
3. Keep `RAG_FOLLOW_LINKS=false` until the core pipeline is validated
4. Have 2-3 fallback models configured so quota exhaustion doesn't block testing
5. Always check `docker ps` before starting containers
6. Always delete stale state files before re-running ingestion
