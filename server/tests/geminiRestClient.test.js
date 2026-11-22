const { geminiGenerateText, geminiEmbedText } = require('../services/geminiRestClient');

const TEST_KEY = 'TEST_KEY_a+b/c';

describe('geminiRestClient API key handling', () => {
  let originalFetch;
  let originalKey;
  let calls;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = TEST_KEY;
    process.env.GEMINI_MAX_RETRIES = '0';
    calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      const body = url.includes(':embedContent')
        ? { embedding: { values: [0.1, 0.2] } }
        : { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
      return { ok: true, status: 200, json: async () => body, text: async () => '' };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalKey;
    delete process.env.GEMINI_MAX_RETRIES;
    jest.restoreAllMocks();
  });

  test('generateContent sends the key in the x-goog-api-key header, not the URL', async () => {
    await geminiGenerateText({ model: 'gemini-test', prompt: 'hi' });

    const { url, opts } = calls[0];
    expect(url).toMatch(/:generateContent/);
    expect(url).not.toContain('key=');
    expect(url).not.toContain(TEST_KEY);
    expect(opts.headers['x-goog-api-key']).toBe(TEST_KEY);
  });

  test('embedContent sends the key in the x-goog-api-key header, not the URL', async () => {
    await geminiEmbedText({ model: 'embed-test', text: 'hi' });

    const { url, opts } = calls[0];
    expect(url).toMatch(/:embedContent/);
    expect(url).not.toContain('key=');
    expect(url).not.toContain(TEST_KEY);
    expect(opts.headers['x-goog-api-key']).toBe(TEST_KEY);
  });

  test('a failed embed call does not expose the key in the error or console output', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({
        error: { code: 400, message: 'Invalid request', status: 'INVALID_ARGUMENT' },
      }),
      json: async () => ({}),
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let caught;
    try {
      await geminiEmbedText({ model: 'embed-test', text: 'hi' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught.message).not.toContain(TEST_KEY);
    expect(JSON.stringify(caught)).not.toContain(TEST_KEY);
    for (const spy of [logSpy, errorSpy, warnSpy]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(TEST_KEY);
    }
  });
});


describe('local Gemini timeout', () => {
  test('sets isTimeout without inventing an upstream HTTP status', async () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;
    const originalTimeout = process.env.GEMINI_TIMEOUT_MS;
    const originalRetries = process.env.GEMINI_MAX_RETRIES;
    try {
      process.env.GEMINI_API_KEY = TEST_KEY;
      process.env.GEMINI_TIMEOUT_MS = '10';
      process.env.GEMINI_MAX_RETRIES = '0';
      global.fetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
      await expect(geminiGenerateText({ model: 'gemini-test', prompt: 'hi' }))
        .rejects.toMatchObject({ isTimeout: true, message: 'Gemini request timed out after 10ms' });
    } finally {
      global.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
      if (originalTimeout === undefined) delete process.env.GEMINI_TIMEOUT_MS;
      else process.env.GEMINI_TIMEOUT_MS = originalTimeout;
      if (originalRetries === undefined) delete process.env.GEMINI_MAX_RETRIES;
      else process.env.GEMINI_MAX_RETRIES = originalRetries;
    }
  });
});
