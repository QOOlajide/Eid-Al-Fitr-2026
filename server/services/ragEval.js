/**
 * ragEval.js — Lightweight RAG evaluation logging for the Eid Qdrant pipeline.
 *
 * ─── CURRENT PIPELINE (as of Mar 2026) ───────────────────────────────────────
 *
 *   server/routes/rag.js
 *     POST /api/rag/search → ragService.searchIslamicKnowledge(query, userId)
 *     POST /api/rag/ask    → ragService.answerFromUrls(query, urls, userId)
 *     POST /api/rag/related → ragService.getRelatedQuestions(topic)
 *
 *   server/services/ragService.js  (orchestration)
 *     searchIslamicKnowledge → retrieve(query) → generateAnswer(query, sources)
 *     answerFromUrls         → fetch/chunk/rank → generateAnswer(query, top)
 *     retrieve               → embedText(query) → vectorStore.search() (Qdrant)
 *                              falls back to searchWebsites() (legacy mock)
 *
 *   server/services/vectorStore.js
 *     getQdrantClient(), search(vector, limit, filter), upsertPoints(), ensureCollection()
 *     Collection name: process.env.RAG_VECTOR_COLLECTION || 'islamic_chunks'
 *
 *   server/services/embeddingService.js
 *     embedText(text) → geminiEmbedText() (Gemini REST)
 *
 *   server/services/geminiRestClient.js
 *     geminiGenerateText({ model, prompt })  — LLM answer generation (returns { text, usage })
 *     geminiEmbedText({ model, text })       — embedding
 *
 * ─── LOGGING HOOK POINTS ─────────────────────────────────────────────────────
 *
 *   1. ragService.retrieve()            → logRetrievalEvent()  (success + fallback)
 *   2. ragService.searchIslamicKnowledge → logAnswerEvent()     (success path)
 *      catch block                      → logAnswerEvent()     (error path)
 *   3. ragService.answerFromUrls         → logAnswerEvent()     (success + error)
 *
 * ─── METRICS TRACKED ─────────────────────────────────────────────────────────
 *
 *   RETRIEVAL:
 *     • retrieved_ids / scores   — raw Qdrant results (aggregates computed offline)
 *     • contexts                 — truncated text of retrieved chunks (for Ragas compat)
 *     • retrieval_path           — "vector" | "legacy" | "url_keyword_rank"
 *     • retrieval_top_k          — configured k value
 *     • retrieval_model          — embedding model used
 *     • status / error_message   — success or failure reason
 *     • embed_latency_ms         — embedText() call
 *     • qdrant_latency_ms        — vectorStore.search() call
 *     • precision@k / recall@k   — computed offline if ground-truth labels provided
 *
 *   ANSWER:
 *     • answer_text              — truncated LLM answer (for Ragas faithfulness eval)
 *     • answer_length_chars      — rough proxy for verbosity / emptiness
 *     • confidence               — from ragService.calculateConfidence()
 *     • num_sources              — sources fed into the prompt
 *     • prompt_tokens / completion_tokens / total_tokens — from Gemini usageMetadata
 *     • status / error_message   — success or failure
 *     • fallback_used            — true when vector retrieval fell to legacy
 *     • llm_latency_ms           — geminiGenerateText() call
 *     • total_latency_ms         — full end-to-end for a query
 *
 *   TODO: Add user_feedback field once thumbs-up/down UI exists
 *   TODO: Add ground_truth field when supervised eval dataset is created
 *   TODO: Swap JSONL sink for Postgres / ClickHouse / Prometheus push
 *   TODO: Point RAG_EVAL_LABELS_FILE at a JSON with { query_id, relevant_ids }
 *         to enable precision@k / recall@k in analyzeRagStats.js
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_DIR = path.resolve(process.env.RAG_LOG_DIR || path.join(__dirname, '..', '..', 'rag_logs'));
const RETRIEVAL_LOG = path.join(LOG_DIR, 'retrieval_events.jsonl');
const ANSWER_LOG = path.join(LOG_DIR, 'answer_events.jsonl');
const ENV = process.env.NODE_ENV || 'development';
const MAX_CONTEXT_CHARS = 500;

let dirEnsured = false;

function ensureLogDir() {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirEnsured = true;
  } catch {
    // best-effort; don't crash the app
  }
}

/**
 * Generate a short unique query id (hex).
 * @param {string} query
 * @returns {string}
 */
function makeQueryId(query) {
  const ts = Date.now().toString(36);
  const hash = crypto.createHash('sha256').update(query).digest('hex').slice(0, 8);
  return `${ts}-${hash}`;
}

/**
 * Append a single JSON object as one line to a file.
 * @param {string} filePath
 * @param {object} record
 */
function appendJsonl(filePath, record) {
  ensureLogDir();
  try {
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    console.error('[ragEval] write error:', err.message);
  }
}

/**
 * Truncate a string for logging (avoids multi-MB log lines).
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function truncate(s, max = MAX_CONTEXT_CHARS) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max) + '…';
}

/**
 * Log a retrieval event (called right after Qdrant / legacy search).
 *
 * @param {object} opts
 * @param {string}   opts.queryId           — unique id for this query
 * @param {string}   opts.query             — raw user query
 * @param {string[]} opts.retrievedIds      — point ids / URLs of retrieved chunks
 * @param {number[]} opts.scores            — similarity scores (same order)
 * @param {number}   opts.numRetrieved      — length of results
 * @param {string[]} [opts.contexts]        — truncated text of each retrieved chunk
 * @param {string}   opts.retrievalPath     — "vector" | "legacy" | "url_keyword_rank"
 * @param {number}   [opts.retrievalTopK]   — configured top_k value
 * @param {string}   [opts.retrievalModel]  — embedding model name
 * @param {string}   [opts.status]          — "success" | "error"
 * @param {string}   [opts.errorMessage]    — error description if status is "error"
 * @param {number}   [opts.embedLatencyMs]  — time to embed the query
 * @param {number}   [opts.qdrantLatencyMs] — time for the Qdrant search call
 * @param {string}   [opts.timestamp]       — ISO 8601
 * @param {object}   [opts.extraMeta]       — any additional context
 */
function logRetrievalEvent({
  queryId,
  query,
  retrievedIds = [],
  scores = [],
  numRetrieved = 0,
  contexts = [],
  retrievalPath = 'unknown',
  retrievalTopK = null,
  retrievalModel = null,
  status = 'success',
  errorMessage = null,
  embedLatencyMs = null,
  qdrantLatencyMs = null,
  timestamp = new Date().toISOString(),
  extraMeta = {},
}) {
  const record = {
    event: 'retrieval',
    query_id: queryId,
    timestamp,
    environment: ENV,
    status,
    query,
    retrieved_ids: retrievedIds,
    scores,
    num_retrieved: numRetrieved,
    contexts: contexts.map((c) => truncate(c)),
    retrieval_path: retrievalPath,
    retrieval_top_k: retrievalTopK,
    retrieval_model: retrievalModel,
    embed_latency_ms: embedLatencyMs,
    qdrant_latency_ms: qdrantLatencyMs,
    ...(errorMessage && { error_message: errorMessage }),
    ...extraMeta,
  };
  appendJsonl(RETRIEVAL_LOG, record);
  return record;
}

/**
 * Log an answer event (called after LLM generates the final answer).
 *
 * @param {object}   opts
 * @param {string}   opts.queryId            — must match the retrieval event
 * @param {string}   opts.query              — raw user query
 * @param {string}   opts.answer             — LLM-generated answer text
 * @param {string}   opts.model              — which Gemini model was used
 * @param {string[]} opts.contextIds         — ids/URLs of sources sent to the prompt
 * @param {number}   opts.numSources         — number of sources used
 * @param {number}   [opts.confidence]       — ragService confidence score
 * @param {number}   [opts.answerLengthChars]
 * @param {string}   [opts.status]           — "success" | "error"
 * @param {string}   [opts.errorMessage]     — error description if status is "error"
 * @param {boolean}  [opts.fallbackUsed]     — true if vector retrieval fell back to legacy
 * @param {number}   [opts.promptTokens]     — from Gemini usageMetadata
 * @param {number}   [opts.completionTokens] — from Gemini usageMetadata
 * @param {number}   [opts.totalTokens]      — from Gemini usageMetadata
 * @param {number}   [opts.llmLatencyMs]     — time for the LLM call
 * @param {number}   [opts.totalLatencyMs]   — end-to-end for the whole request
 * @param {string}   [opts.timestamp]        — ISO 8601
 * @param {string}   opts.endpoint           — "search" | "ask"
 * @param {object}   [opts.extraMeta]
 */
function logAnswerEvent({
  queryId,
  query,
  answer = '',
  model = 'unknown',
  contextIds = [],
  numSources = 0,
  confidence = null,
  answerLengthChars = 0,
  status = 'success',
  errorMessage = null,
  fallbackUsed = false,
  promptTokens = null,
  completionTokens = null,
  totalTokens = null,
  llmLatencyMs = null,
  totalLatencyMs = null,
  timestamp = new Date().toISOString(),
  endpoint = 'search',
  extraMeta = {},
}) {
  const record = {
    event: 'answer',
    query_id: queryId,
    timestamp,
    environment: ENV,
    status,
    query,
    answer_text: truncate(answer, 1000),
    answer_length_chars: answerLengthChars || (answer || '').length,
    model,
    context_ids: contextIds,
    num_sources: numSources,
    confidence,
    fallback_used: fallbackUsed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    llm_latency_ms: llmLatencyMs,
    total_latency_ms: totalLatencyMs,
    endpoint,
    ...(errorMessage && { error_message: errorMessage }),
    ...extraMeta,
  };
  appendJsonl(ANSWER_LOG, record);
  return record;
}

/**
 * Read all lines from a JSONL log file.
 * @param {'retrieval'|'answer'} type
 * @returns {object[]}
 */
function readLogEvents(type) {
  const filePath = type === 'retrieval' ? RETRIEVAL_LOG : ANSWER_LOG;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  makeQueryId,
  logRetrievalEvent,
  logAnswerEvent,
  readLogEvents,
  LOG_DIR,
  RETRIEVAL_LOG,
  ANSWER_LOG,
};
