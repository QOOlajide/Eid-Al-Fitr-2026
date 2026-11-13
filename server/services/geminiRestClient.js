function requireGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required');
  }
}

function modelToPath(model) {
  const m = String(model || '').trim();
  if (!m) throw new Error('Gemini model is required');
  // Accept both "models/xxx" and "xxx"
  return m.startsWith('models/') ? m : `models/${m}`;
}

function geminiTimeoutMs() {
  // Gemini 3.x thinking models often need >20s under load; keep under typical
  // Vercel Function limits unless overridden.
  const n = Number(process.env.GEMINI_TIMEOUT_MS || 45000);
  return Number.isFinite(n) && n > 0 ? n : 45000;
}

function geminiMaxRetries() {
  const n = Number(process.env.GEMINI_MAX_RETRIES || 3);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 5) : 3;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 503 || status === 504;
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = geminiTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(`Gemini request timed out after ${timeoutMs}ms`);
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function attachRetryHints(err, txt) {
  try {
    const json = JSON.parse(txt);
    const retryDelay = json?.error?.details?.find?.((d) => d?.['@type']?.includes('RetryInfo'))?.retryDelay;
    if (typeof retryDelay === 'string' && retryDelay.endsWith('s')) {
      const seconds = Number(retryDelay.slice(0, -1));
      if (Number.isFinite(seconds)) {
        err.retryAfterSeconds = seconds;
        err.retryAfterMs = Math.round(seconds * 1000);
      }
    }
  } catch {
    // ignore
  }
  return err;
}

/**
 * Retry transient Gemini failures with exponential backoff + jitter.
 * Docs: 429/503 are expected under load; SDKs retry by default — our raw fetch must too.
 * https://ai.google.dev/gemini-api/docs/troubleshooting
 */
async function withRetries(fn) {
  const maxRetries = geminiMaxRetries();
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = Number(e?.status);
      const canRetry = isTransientStatus(status);
      if (!canRetry || attempt === maxRetries) throw e;
      const base = e.retryAfterMs || Math.min(1000 * 2 ** attempt, 8000);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
  throw lastErr || new Error('Gemini request failed');
}

function thinkingLevel() {
  // Gemini 3.8 Flash defaults to MEDIUM thinking — fine for agents, too slow for RAG chat.
  // LOW keeps quality usable while cutting latency. MINIMAL is NOT valid on 3.8 Flash.
  // https://aistudio.google.com/docs/whats-new-gemini-3.8
  const level = String(process.env.GEMINI_THINKING_LEVEL || 'LOW').trim().toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH'].includes(level)) return level;
  return 'LOW';
}

async function geminiGenerateText({ model, prompt }) {
  requireGeminiKey();
  const modelPath = modelToPath(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: String(prompt || '') }],
      },
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingLevel: thinkingLevel(),
      },
    },
  };

  return withRetries(async () => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Gemini generateContent failed (${res.status}) for ${modelPath}`);
      err.status = res.status;
      err.statusText = res.statusText;
      err.body = txt;
      attachRetryHints(err, txt);
      throw err;
    }

    const json = await res.json();
    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        .filter(Boolean)
        .join('') || '';

    const usage = json?.usageMetadata || null;

    return { text, usage };
  });
}

async function geminiEmbedText({ model, text, outputDimensionality }) {
  requireGeminiKey();
  const modelPath = modelToPath(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

  // REST embedContent expects a "content" object (SDKs may accept "contents" and translate).
  // Using the canonical REST shape avoids 400s.
  const body = {
    content: {
      parts: [{ text: String(text || '') }],
    },
  };
  if (typeof outputDimensionality === 'number' && Number.isFinite(outputDimensionality)) {
    body.outputDimensionality = outputDimensionality;
  }

  return withRetries(async () => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Gemini embedContent failed (${res.status}) for ${modelPath}`);
      err.status = res.status;
      err.statusText = res.statusText;
      err.body = txt;
      attachRetryHints(err, txt);
      throw err;
    }

    const json = await res.json();
    // shapes vary by SDK; normalize a bit
    const values =
      json?.embedding?.values ||
      json?.embedding?.value ||
      json?.embedding ||
      json?.embeddings?.[0]?.values ||
      json?.embeddings?.[0]?.value;

    if (!Array.isArray(values)) {
      throw new Error('Unexpected embedding response shape from Gemini embedContent');
    }

    return values;
  });
}

module.exports = {
  geminiGenerateText,
  geminiEmbedText,
};
