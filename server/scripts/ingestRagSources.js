/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runIngest } = require('../services/ingestService');

function loadSources() {
  const fileFromEnv = process.env.RAG_SOURCES_FILE;
  const filePath = fileFromEnv
    ? path.isAbsolute(fileFromEnv)
      ? fileFromEnv
      : path.join(process.cwd(), fileFromEnv)
    : path.join(__dirname, '..', 'rag_sources.json');

  if (!fs.existsSync(filePath)) return { seed_urls: [], allowed_domains: [] };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const cfg = loadSources();
  const seedUrls = (process.env.RAG_SEED_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const stats = await runIngest({
    seedUrls: seedUrls.length > 0 ? seedUrls : (cfg.seed_urls || []),
    allowedDomains: cfg.allowed_domains || [],
    maxPages: Number(process.env.RAG_MAX_PAGES || 50),
    crawlDelayMs: Number(process.env.RAG_CRAWL_DELAY_MS || 500),
    minChunkChars: Number(process.env.RAG_MIN_CHUNK_CHARS || 200),
    followLinks: (process.env.RAG_FOLLOW_LINKS || 'true') === 'true',
  });

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

