const fs = require('fs');
const path = require('path');

const { runIngest } = require('./ingestService');
const vectorStore = require('./vectorStore');

function loadSourcesConfig() {
  const fileFromEnv = process.env.RAG_SOURCES_FILE;
  const filePath = fileFromEnv
    ? path.isAbsolute(fileFromEnv)
      ? fileFromEnv
      : path.join(process.cwd(), fileFromEnv)
    : path.join(__dirname, '..', 'rag_sources.json');

  if (!fs.existsSync(filePath)) {
    return { filePath, allowed_domains: [], seed_urls: [] };
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { filePath, ...json };
}

function envSeedUrls() {
  const raw = process.env.RAG_SEED_URLS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function shouldEnable() {
  return (process.env.RAG_AUTO_INDEX || 'true') === 'true';
}

function parseIntervalMs() {
  const minutesRaw = process.env.RAG_INGEST_INTERVAL_MINUTES;
  const minutes = minutesRaw ? Number(minutesRaw) : 24 * 60; // daily default
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60 * 1000);
}

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true';
}

function getIngestOptionsFromEnv() {
  return {
    maxPages: Number(process.env.RAG_MAX_PAGES || 50),
    crawlDelayMs: Number(process.env.RAG_CRAWL_DELAY_MS || 500),
    minChunkChars: Number(process.env.RAG_MIN_CHUNK_CHARS || 200),
    followLinks: parseBool(process.env.RAG_FOLLOW_LINKS, true),
  };
}

function startIngestionScheduler(logger = console) {
  if (!shouldEnable()) {
    logger.log('[rag-index] disabled (RAG_AUTO_INDEX=false)');
    return { started: false };
  }

  if (!process.env.GEMINI_API_KEY) {
    logger.log('[rag-index] skipped (GEMINI_API_KEY missing)');
    return { started: false };
  }

  const qdrant = vectorStore.getQdrantClient();
  if (!qdrant) {
    logger.log('[rag-index] skipped (QDRANT_URL missing)');
    return { started: false };
  }

  const intervalMs = parseIntervalMs();
  const runOnStartup = parseBool(process.env.RAG_INGEST_ON_STARTUP, true);

  let running = false;

  async function runOnce(reason) {
    if (running) return;
    running = true;
    try {
      const cfg = loadSourcesConfig();
      const seeds = envSeedUrls();
      const seed_urls = seeds.length > 0 ? seeds : (cfg.seed_urls || []);
      const allowed_domains = cfg.allowed_domains || [];

      logger.log(`[rag-index] run start (${reason}) seeds=${seed_urls.length} cfg=${cfg.filePath}`);
      const stats = await runIngest({
        seedUrls: seed_urls,
        allowedDomains: allowed_domains,
        ...getIngestOptionsFromEnv(),
      });
      logger.log('[rag-index] run done', stats);
    } catch (e) {
      const extra = {
        status: e?.status,
        statusText: e?.statusText,
        retryAfterSeconds: e?.retryAfterSeconds,
      };
      // Include a short body preview when available (Gemini errors)
      const bodyPreview = typeof e?.body === 'string' ? e.body.slice(0, 400) : undefined;
      logger.log('[rag-index] run failed', e?.message || e, extra, bodyPreview ? `body: ${bodyPreview}` : '');
    } finally {
      running = false;
    }
  }

  if (runOnStartup) {
    setTimeout(() => runOnce('startup'), 2000);
  }

  if (intervalMs) {
    setInterval(() => runOnce('interval'), intervalMs);
  }

  return { started: true, intervalMs, runOnStartup };
}

module.exports = {
  startIngestionScheduler,
};

