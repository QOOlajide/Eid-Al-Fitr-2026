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
});
