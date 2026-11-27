const { randomUUID } = require('crypto');

function createDeadline() {
  return { deadline: Date.now() + 8000, requestId: randomUUID() };
}

function remainingBudget(context, service, reserveMs = 0) {
  const remainingMs = context.deadline - Date.now();
  const timeoutMs = remainingMs - reserveMs;
  console.info(JSON.stringify({ event: 'rag_deadline', requestId: context.requestId,
    service, deadline: context.deadline, remainingMs, timeoutMs }));
  if (timeoutMs <= 0) {
    const error = new Error('RAG deadline exceeded at ' + service);
    error.isTimeout = true;
    throw error;
  }
  return timeoutMs;
}

module.exports = { createDeadline, remainingBudget };
