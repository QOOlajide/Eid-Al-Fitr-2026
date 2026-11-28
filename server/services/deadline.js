const { randomUUID } = require('crypto');

const BUDGET = Object.freeze({ embedding: 1000, retrieval: 500, primary: 6000, fallback: 4300, response: 200 });
const TOTAL_MS = Object.values(BUDGET).reduce((sum, ms) => sum + ms, 0);

function createDeadline() {
  return { deadline: Date.now() + TOTAL_MS, requestId: randomUUID() };
}

function remainingBudget(context, service, reserveMs = 0, maxMs = Infinity) {
  const remainingMs = context.deadline - Date.now();
  const timeoutMs = Math.min(remainingMs - reserveMs, maxMs);
  console.info(JSON.stringify({ event: 'rag_deadline', requestId: context.requestId,
    service, deadline: context.deadline, remainingMs, timeoutMs }));
  if (timeoutMs <= 0) {
    const error = new Error('RAG deadline exceeded at ' + service);
    error.isTimeout = true;
    throw error;
  }
  return timeoutMs;
}

module.exports = { createDeadline, remainingBudget, BUDGET };
