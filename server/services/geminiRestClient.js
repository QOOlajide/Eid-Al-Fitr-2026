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
  const n = Number(process.env.GEMINI_TIMEOUT_MS || 20000);
  return Number.isFinite(n) && n > 0 ? n : 20000;
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
  };

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
    // Try to extract server-provided retry delay (e.g. "retryDelay": "45s")
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
}

module.exports = {
  geminiGenerateText,
  geminiEmbedText,
};

