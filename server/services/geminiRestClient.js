const { remainingBudget, BUDGET } = require('./deadline');

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
  // Default per-request timeout; can be overridden through configuration.
  const n = Number(process.env.GEMINI_TIMEOUT_MS || 8000);
  return Number.isFinite(n) && n > 0 ? n : 8000;
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

async function fetchWithTimeout(url, options = {}, timeoutMs = geminiTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const stopTimeout = () => clearTimeout(timer);

  function normalizeError(e) {
    if (controller.signal.aborted && e?.name === 'AbortError') {
      const err = new Error(`Gemini request timed out after ${timeoutMs}ms`);
      err.isTimeout = true;
      return err;
    }
    return e;
  }

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return { response, stopTimeout, normalizeError, controller };
  } catch (e) {
    stopTimeout();
    throw normalizeError(e);
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

async function geminiGenerateText({ model, prompt, deadlineContext, reserveMs = 0, maxMs = Infinity, onChunk, signal }) {
  if (onChunk) return geminiStreamText({ model, prompt, deadlineContext, reserveMs, maxMs, onChunk, signal });
  requireGeminiKey();
  const modelPath = modelToPath(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`;

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

  const { response: res, stopTimeout, normalizeError } = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  }, deadlineContext ? remainingBudget(deadlineContext, 'gemini.generate', reserveMs, maxMs) : undefined);

  try {
    if (!res.ok) {
      const txt = await res.text().catch((e) => {
        if (normalizeError(e)?.isTimeout) throw e;
        return '';
      });
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
  } catch (e) {
    throw normalizeError(e);
  } finally {
    stopTimeout();
  }
}


async function geminiStreamText({ model, prompt, deadlineContext, reserveMs, maxMs, onChunk, signal }) {
  requireGeminiKey();
  const timeoutMs = deadlineContext
    ? remainingBudget(deadlineContext, 'gemini.stream', reserveMs, maxMs)
    : geminiTimeoutMs();
  const controller = new AbortController();
  let timer, timedOut = false, text = '', usage = null, finished = false;
  const abort = () => controller.abort();
  const arm = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; abort(); }, ms);
  };
  if (signal?.aborted) throw new Error('Client disconnected');
  signal?.addEventListener('abort', abort, { once: true });
  arm(timeoutMs);
  let reader;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelToPath(model)}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }] }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const e = new Error('Gemini stream failed (' + res.status + ')');
      e.status = res.status;
      throw e;
    }
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const consume = (frame) => {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) return;
      const event = JSON.parse(data);
      if (event.error) throw new Error('Gemini stream returned an error');
      usage = event.usageMetadata || usage;
      const candidate = event.candidates?.[0];
      if (candidate?.finishReason) {
        if (candidate.finishReason !== 'STOP') throw new Error('Incomplete Gemini answer: ' + candidate.finishReason);
        finished = true;
      }
      for (const part of candidate?.content?.parts || []) {
        if (part.thought || typeof part.text !== 'string' || !part.text) continue;
        if (!text) arm(30000); // separate absolute completion budget after first text
        text += part.text;
        onChunk(part.text);
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!finished || !text) throw new Error('Gemini stream ended without a complete answer');
    return { text, usage };
  } catch (error) {
    if (timedOut) {
      const e = new Error('Gemini stream timed out');
      e.isTimeout = true;
      throw e;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}

async function geminiEmbedText({ model, text, outputDimensionality, deadlineContext }) {
  requireGeminiKey();
  const modelPath = modelToPath(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent`;

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

  const attempt = async () => {
    const { response: res, stopTimeout, normalizeError } = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    }, deadlineContext ? remainingBudget(deadlineContext, 'gemini.embed', BUDGET.retrieval + BUDGET.primary + BUDGET.fallback + BUDGET.response, BUDGET.embedding) : undefined);

    try {
      if (!res.ok) {
        const txt = await res.text().catch((e) => {
          if (normalizeError(e)?.isTimeout) throw e;
          return '';
        });
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
    } catch (e) {
      throw normalizeError(e);
    } finally {
      stopTimeout();
    }
  };
  return deadlineContext ? attempt() : withRetries(attempt);
}

module.exports = {
  geminiGenerateText,
  geminiEmbedText,
};
