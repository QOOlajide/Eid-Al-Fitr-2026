const { createDeadline, remainingBudget, BUDGET } = require('../services/deadline');
const { geminiGenerateText, geminiEmbedText } = require('../services/geminiRestClient');

describe('shared RAG deadline', () => {
  let originalFetch, originalKey;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(100000);
    jest.spyOn(console, 'info').mockImplementation(() => {});
    originalFetch = global.fetch;
    originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  test('same deadline across hops, decreasing budget', () => {
    const ctx = createDeadline();
    expect(remainingBudget(ctx, 'embed', 3000)).toBe(9000);
    jest.advanceTimersByTime(1000);
    expect(remainingBudget(ctx, 'qdrant', 3000)).toBe(8000);
    expect(ctx.deadline).toBe(112000);
    const logs = console.info.mock.calls.map(([line]) => JSON.parse(line));
    expect(logs.map(x => x.deadline)).toEqual([112000, 112000]);
    expect(logs.map(x => x.requestId)).toEqual([ctx.requestId, ctx.requestId]);
  });
  test('primary and fallback share budget after retrieval', async () => {
    const ctx = createDeadline();
    jest.advanceTimersByTime(1500);
    global.fetch = jest.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const primary = expect(geminiGenerateText({ model: 'primary', prompt: 'hi', deadlineContext: ctx, reserveMs: BUDGET.fallback + BUDGET.response, maxMs: BUDGET.primary })).rejects.toMatchObject({ isTimeout: true });
    await jest.advanceTimersByTimeAsync(6000);
    await primary;
    const fallback = expect(geminiGenerateText({ model: 'fallback', prompt: 'hi', deadlineContext: ctx, reserveMs: 200 })).rejects.toMatchObject({ isTimeout: true });
    await jest.advanceTimersByTimeAsync(4300);
    await fallback;
    expect(Date.now()).toBe(ctx.deadline - 200);
  });
  test('retrieval caps preserve both generation budgets', () => {
    const ctx = createDeadline();
    expect(remainingBudget(ctx, 'embed', 11000, BUDGET.embedding)).toBe(1000);
    jest.advanceTimersByTime(1000);
    expect(remainingBudget(ctx, 'qdrant', 10500, BUDGET.retrieval)).toBe(500);
    jest.advanceTimersByTime(500);
    expect(remainingBudget(ctx, 'primary', 4500, BUDGET.primary)).toBe(6000);
  });
  test('exhausted budget prevents network call', async () => {
    const ctx = createDeadline();
    jest.advanceTimersByTime(12000);
    global.fetch = jest.fn();
    await expect(geminiGenerateText({ model: 'primary', prompt: 'hi', deadlineContext: ctx })).rejects.toMatchObject({ isTimeout: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });
  test('deadline-bound embedding does not retry 503', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(geminiEmbedText({ model: 'embed', text: 'hi', deadlineContext: createDeadline() })).rejects.toMatchObject({ status: 503 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
