const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const { embedText } = require('./embeddingService');
const { ensureCollection, upsertPoints } = require('./vectorStore');

function sha1(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex');
}

function sha1ToUuid(hex40) {
  // Qdrant point IDs must be an unsigned int or UUID.
  // Convert a SHA1 hex string into a deterministic UUID-like string.
  const hex = String(hex40 || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  const hex32 = (hex.length >= 32 ? hex.slice(0, 32) : hex.padEnd(32, '0'));
  const bytes = Buffer.from(hex32, 'hex');
  // Set UUID version to 5 (name-based) and variant to RFC4122 for validity.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const b = bytes.toString('hex');
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20, 32)}`;
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) =>
      url.searchParams.delete(k)
    );
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function chunkText(text, chunkChars = 1200, overlap = 200) {
  const s = String(text || '');
  if (!s.trim()) return [];
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    const end = Math.min(i + chunkChars, s.length);
    const chunk = s.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= s.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxContentLength: 2_000_000,
    headers: {
      'User-Agent': 'Eid-RAG-Bot/0.1',
      Accept: 'text/html,application/xhtml+xml',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(res.data || '');
}

function extractTextAndLinks(html, baseUrl, isAllowedUrl) {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim();
  $('script, style, nav, footer, header, noscript').remove();

  const text = $('body').text().replace(/\s+/g, ' ').trim();

  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      const norm = normalizeUrl(abs);
      if (norm && isAllowedUrl(norm)) links.push(norm);
    } catch {
      // ignore
    }
  });

  return { title, text, links: Array.from(new Set(links)) };
}

function loadJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function defaultStatePath() {
  // Persist across restarts (works with docker bind mount too)
  return path.join(__dirname, '..', '.data', 'ingest_state.json');
}

function makeAllowedUrlChecker(allowedDomains) {
  const allowed = new Set((allowedDomains || []).map(normalizeHost));
  return (urlStr) => {
    try {
      const u = new URL(urlStr);
      if (!['http:', 'https:'].includes(u.protocol)) return false;
      return allowed.has(normalizeHost(u.hostname));
    } catch {
      return false;
    }
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Crawl + chunk + embed + upsert into Qdrant.
 * Uses a local state file to avoid re-embedding pages whose extracted text hasn't changed.
 */
async function runIngest({
  seedUrls,
  allowedDomains,
  maxPages = 50,
  crawlDelayMs = 500,
  minChunkChars = 200,
  statePath = defaultStatePath(),
  followLinks = true,
} = {}) {
  const isAllowedUrl = makeAllowedUrlChecker(allowedDomains);

  const seeds = (seedUrls || [])
    .map((u) => String(u).trim())
    .filter(Boolean)
    .map(normalizeUrl)
    .filter(Boolean)
    .filter(isAllowedUrl);

  if (seeds.length === 0) {
    throw new Error('No valid seed URLs. Check rag_sources.json or RAG_SEED_URLS.');
  }

  const state = loadJsonIfExists(statePath) || { pages: {} };

  const queue = [...seeds];
  const seen = new Set(queue);

  let embeddedDim = null;
  let pagesFetched = 0;
  let pagesSkippedUnchanged = 0;
  let pointsUpserted = 0;

  while (queue.length > 0 && pagesFetched < maxPages) {
    const url = queue.shift();
    if (!url) break;

    let html = '';
    try {
      html = await fetchHtml(url);
    } catch {
      await sleep(crawlDelayMs);
      continue;
    }

    pagesFetched += 1;

    const { title, text, links } = extractTextAndLinks(html, url, isAllowedUrl);
    if (followLinks) {
      for (const l of links) {
        if (!seen.has(l) && seen.size < maxPages * 5) {
          seen.add(l);
          queue.push(l);
        }
      }
    }

    if (!text || text.length < 500) {
      await sleep(crawlDelayMs);
      continue;
    }

    const pageHash = sha1(text);
    if (state.pages[url]?.hash === pageHash) {
      pagesSkippedUnchanged += 1;
      await sleep(crawlDelayMs);
      continue;
    }

    const domain = normalizeHost(new URL(url).hostname);
    const chunks = chunkText(text);

    for (let idx = 0; idx < chunks.length; idx += 1) {
      const chunk = chunks[idx];
      if (chunk.length < minChunkChars) continue;

      const embedding = await embedText(chunk);
      if (!embeddedDim) {
        embeddedDim = embedding.length;
        await ensureCollection(embeddedDim);
      }

      const id = sha1ToUuid(sha1(`${url}#chunk=${idx}`));
      await upsertPoints([
        {
          id,
          vector: embedding,
          payload: {
            url,
            title: title || url,
            domain,
            chunk_index: idx,
            text: chunk,
          },
        },
      ]);

      pointsUpserted += 1;
    }

    state.pages[url] = { hash: pageHash, title: title || url, domain, updatedAt: new Date().toISOString() };
    saveJson(statePath, state);

    await sleep(crawlDelayMs);
  }

  return {
    seeds,
    pagesFetched,
    pagesSkippedUnchanged,
    pointsUpserted,
    embeddedDim,
    statePath,
  };
}

module.exports = {
  runIngest,
  makeAllowedUrlChecker,
  defaultStatePath,
};

