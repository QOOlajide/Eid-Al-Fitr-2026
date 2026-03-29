#!/usr/bin/env node
/**
 * Smoke test for the RAG eval logging + analysis pipeline.
 * No external services required (no Gemini, no Qdrant, no DB).
 *
 * Usage:  node server/scripts/testRagEval.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { makeQueryId, logRetrievalEvent, logAnswerEvent, readLogEvents, LOG_DIR, RETRIEVAL_LOG, ANSWER_LOG } = require('../services/ragEval');

function assert(condition, msg) {
  if (!condition) { console.error('  FAIL:', msg); process.exit(1); }
  console.log('  PASS:', msg);
}

async function main() {
  console.log('\n=== RAG Eval Smoke Test (v2) ===\n');

  // Clean previous test logs so counts are predictable
  try { fs.unlinkSync(RETRIEVAL_LOG); } catch {}
  try { fs.unlinkSync(ANSWER_LOG); } catch {}

  // ── 1. Verify log dir gets created ──────────────────────────────────────
  console.log('1. Log directory');
  assert(typeof LOG_DIR === 'string' && LOG_DIR.length > 0, `LOG_DIR is set: ${LOG_DIR}`);

  // ── 2. Write synthetic retrieval events ─────────────────────────────────
  console.log('\n2. Logging synthetic retrieval events');

  const queries = [
    { q: 'What is Eid al-Fitr?', scores: [0.92, 0.87, 0.81], path: 'vector', contexts: ['Eid al-Fitr marks the end of Ramadan...', 'The celebration includes special prayers...', 'Muslims gather for Eid prayers...'] },
    { q: 'What are the pillars of Islam?', scores: [0.88, 0.85, 0.79, 0.72], path: 'vector', contexts: ['The five pillars are Shahada...', 'Salah is performed five times...', 'Zakat purifies wealth...', 'Sawm during Ramadan...'] },
    { q: 'How to pray Salah?', scores: [0.95, 0.90], path: 'vector', contexts: ['Begin with wudu...', 'Face the qiblah...'] },
    { q: 'What is Zakat?', scores: [], path: 'legacy', contexts: [] },
    { q: 'Ramadan fasting rules', scores: [0.83, 0.76, 0.71, 0.65, 0.60], path: 'vector', contexts: ['Fasting begins at Fajr...', 'Break fast at Maghrib...', 'Exemptions include...', 'Suhoor is recommended...', 'Tarawih prayers...'] },
  ];

  const queryIds = [];

  for (const { q, scores, path: rpath, contexts } of queries) {
    const qid = makeQueryId(q);
    queryIds.push(qid);

    logRetrievalEvent({
      queryId: qid,
      query: q,
      retrievedIds: scores.map((_, i) => `chunk-${i}`),
      scores,
      numRetrieved: scores.length,
      contexts,
      retrievalPath: rpath,
      retrievalTopK: 6,
      retrievalModel: rpath === 'vector' ? 'gemini-embedding-001' : null,
      embedLatencyMs: rpath === 'vector' ? Math.round(80 + Math.random() * 200) : null,
      qdrantLatencyMs: rpath === 'vector' ? Math.round(10 + Math.random() * 50) : null,
    });
  }

  // Log one error retrieval event
  logRetrievalEvent({
    queryId: makeQueryId('failing query'),
    query: 'failing query',
    retrievalPath: 'vector',
    retrievalTopK: 6,
    retrievalModel: 'gemini-embedding-001',
    status: 'error',
    errorMessage: 'ECONNREFUSED: Qdrant unreachable',
  });

  assert(queryIds.length === 5, `Generated ${queryIds.length} query IDs`);

  // ── 3. Write synthetic answer events ────────────────────────────────────
  console.log('\n3. Logging synthetic answer events');

  const answers = [
    'Eid al-Fitr is a joyous celebration marking the end of Ramadan...',
    'The five pillars of Islam are Shahada, Salah, Zakat, Sawm, and Hajj...',
    'To pray Salah, begin by performing wudu (ablution)...',
    'Zakat is one of the five pillars of Islam, an obligatory charity...',
    'Fasting during Ramadan is obligatory for every adult Muslim...',
  ];

  for (let i = 0; i < queries.length; i++) {
    logAnswerEvent({
      queryId: queryIds[i],
      query: queries[i].q,
      answer: answers[i],
      model: 'gemini-3-flash-preview',
      contextIds: queries[i].scores.map((_, j) => `chunk-${j}`),
      numSources: queries[i].scores.length,
      confidence: 0.5 + Math.random() * 0.4,
      fallbackUsed: queries[i].path === 'legacy',
      promptTokens: Math.round(200 + Math.random() * 800),
      completionTokens: Math.round(100 + Math.random() * 400),
      totalTokens: Math.round(400 + Math.random() * 1200),
      llmLatencyMs: Math.round(500 + Math.random() * 2000),
      totalLatencyMs: Math.round(800 + Math.random() * 3000),
      endpoint: 'search',
    });
  }

  // Log one error answer event
  logAnswerEvent({
    queryId: makeQueryId('another failing query'),
    query: 'another failing query',
    status: 'error',
    errorMessage: 'Gemini generateContent failed (429)',
    totalLatencyMs: 350,
    endpoint: 'search',
  });

  // ── 4. Verify JSONL files exist and are readable ────────────────────────
  console.log('\n4. Verifying log files');

  const retrievalEvents = readLogEvents('retrieval');
  assert(retrievalEvents.length === 6, `Retrieval log has ${retrievalEvents.length} events (expected 6)`);

  const answerEvents = readLogEvents('answer');
  assert(answerEvents.length === 6, `Answer log has ${answerEvents.length} events (expected 6)`);

  // Check new fields on a success retrieval event
  const okRetrieval = retrievalEvents.find((e) => e.status !== 'error');
  assert(okRetrieval.event === 'retrieval', 'Retrieval event has correct type');
  assert(Array.isArray(okRetrieval.scores), 'Retrieval event has scores array');
  assert(Array.isArray(okRetrieval.contexts), 'Retrieval event has contexts array');
  assert(okRetrieval.contexts.length > 0, 'Retrieval contexts are populated');
  assert(typeof okRetrieval.retrieval_top_k === 'number', 'Retrieval event has retrieval_top_k');
  assert(typeof okRetrieval.retrieval_model === 'string', 'Retrieval event has retrieval_model');
  assert(typeof okRetrieval.environment === 'string', 'Retrieval event has environment');
  assert(okRetrieval.status === 'success', 'Success retrieval has status=success');

  // Check error retrieval event
  const errRetrieval = retrievalEvents.find((e) => e.status === 'error');
  assert(errRetrieval !== undefined, 'Error retrieval event exists');
  assert(typeof errRetrieval.error_message === 'string', 'Error retrieval has error_message');

  // Check new fields on a success answer event
  const okAnswer = answerEvents.find((e) => e.status !== 'error');
  assert(okAnswer.event === 'answer', 'Answer event has correct type');
  assert(typeof okAnswer.answer_text === 'string' && okAnswer.answer_text.length > 0, 'Answer event has answer_text');
  assert(typeof okAnswer.prompt_tokens === 'number', 'Answer event has prompt_tokens');
  assert(typeof okAnswer.completion_tokens === 'number', 'Answer event has completion_tokens');
  assert(typeof okAnswer.total_tokens === 'number', 'Answer event has total_tokens');
  assert(typeof okAnswer.fallback_used === 'boolean', 'Answer event has fallback_used');
  assert(typeof okAnswer.environment === 'string', 'Answer event has environment');

  // Check error answer event
  const errAnswer = answerEvents.find((e) => e.status === 'error');
  assert(errAnswer !== undefined, 'Error answer event exists');
  assert(typeof errAnswer.error_message === 'string', 'Error answer has error_message');

  // ── 5. Run the analysis script ──────────────────────────────────────────
  console.log('\n5. Running analysis script\n');

  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, 'analyzeRagStats.js');
  const output = execSync(`node "${scriptPath}"`, { encoding: 'utf-8' });
  console.log(output);

  // ── 6. Test with a labels file ──────────────────────────────────────────
  console.log('6. Testing precision@k / recall@k with synthetic labels\n');

  const labelsPath = path.join(LOG_DIR, '_test_labels.json');
  const labels = [
    { query: 'What is Eid al-Fitr?', relevant_ids: ['chunk-0', 'chunk-1'] },
    { query: 'What are the pillars of Islam?', relevant_ids: ['chunk-0', 'chunk-2', 'chunk-5'] },
  ];
  fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2));

  const labeledOutput = execSync(`node "${scriptPath}" --labels "${labelsPath}"`, { encoding: 'utf-8' });
  console.log(labeledOutput);

  fs.unlinkSync(labelsPath);

  // ── 7. Test Ragas export ────────────────────────────────────────────────
  console.log('7. Testing Ragas-compatible export\n');

  const ragasPath = path.join(LOG_DIR, '_test_ragas.json');
  execSync(`node "${scriptPath}" --export-ragas "${ragasPath}"`, { encoding: 'utf-8' });

  const ragasData = JSON.parse(fs.readFileSync(ragasPath, 'utf-8'));
  assert(Array.isArray(ragasData), 'Ragas export is an array');
  assert(ragasData.length === 5, `Ragas export has ${ragasData.length} records (expected 5)`);
  assert(typeof ragasData[0].question === 'string', 'Ragas record has "question" field');
  assert(typeof ragasData[0].answer === 'string', 'Ragas record has "answer" field');
  assert(Array.isArray(ragasData[0].contexts), 'Ragas record has "contexts" array');
  assert(ragasData[0].ground_truth === null, 'Ragas record has "ground_truth" (null placeholder)');

  fs.unlinkSync(ragasPath);

  console.log('\n=== All smoke tests passed ===\n');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
