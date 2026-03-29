#!/usr/bin/env node
/**
 * analyzeRagStats.js — Offline analysis of RAG retrieval & answer event logs.
 *
 * Usage:
 *   node server/scripts/analyzeRagStats.js
 *   node server/scripts/analyzeRagStats.js --labels path/to/labels.json
 *   node server/scripts/analyzeRagStats.js --export-ragas path/to/output.json
 *
 * Reads JSONL files from ./rag_logs/ (or RAG_LOG_DIR env) and prints:
 *   1. Retrieval stats   — num docs, score distribution, latency
 *   2. Answer stats      — length, confidence, tokens, LLM latency
 *   3. Error stats       — error rate, common error messages
 *   4. (Optional) Precision@k / Recall@k if --labels file is provided
 *   5. (Optional) Ragas-compatible JSON export if --export-ragas is given
 *
 * Labels file format (JSON):
 *   [
 *     { "query_id": "...", "relevant_ids": ["url-or-point-id", ...] },
 *     ...
 *   ]
 *   OR keyed by the original query text:
 *   [
 *     { "query": "What is Eid?", "relevant_ids": ["https://..."] },
 *     ...
 *   ]
 *
 * TODO: Point RAG_EVAL_LABELS_FILE env var or --labels flag at your ground-truth
 *       labels to enable precision@k and recall@k computation.
 * TODO: Swap stdout output for a Grafana-compatible JSON / Prometheus pushgateway.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.RAG_LOG_DIR || path.resolve(__dirname, '..', '..', 'rag_logs');
const RETRIEVAL_LOG = path.join(LOG_DIR, 'retrieval_events.jsonl');
const ANSWER_LOG = path.join(LOG_DIR, 'answer_events.jsonl');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJsonl(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function histogram(arr, buckets) {
  const counts = {};
  for (const b of buckets) counts[`<= ${b}`] = 0;
  counts[`> ${buckets[buckets.length - 1]}`] = 0;
  for (const v of arr) {
    let placed = false;
    for (const b of buckets) {
      if (v <= b) { counts[`<= ${b}`]++; placed = true; break; }
    }
    if (!placed) counts[`> ${buckets[buckets.length - 1]}`]++;
  }
  return counts;
}

function fmt(v, digits = 2) {
  if (v === null || v === undefined) return '—';
  return typeof v === 'number' ? v.toFixed(digits) : String(v);
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

// ─── Precision@k / Recall@k ──────────────────────────────────────────────────

function precisionAtK(retrievedIds, relevantSet) {
  if (retrievedIds.length === 0) return 0;
  const hits = retrievedIds.filter((id) => relevantSet.has(id)).length;
  return hits / retrievedIds.length;
}

function recallAtK(retrievedIds, relevantSet) {
  if (relevantSet.size === 0) return 0;
  const hits = retrievedIds.filter((id) => relevantSet.has(id)).length;
  return hits / relevantSet.size;
}

// ─── Ragas Export ─────────────────────────────────────────────────────────────

function buildRagasDataset(retrievalEvents, answerEvents) {
  const answerMap = new Map();
  for (const e of answerEvents) {
    if (e.status !== 'error') answerMap.set(e.query_id, e);
  }

  const dataset = [];
  for (const r of retrievalEvents) {
    if (r.status === 'error') continue;
    const a = answerMap.get(r.query_id);
    if (!a) continue;
    dataset.push({
      question: r.query,
      answer: a.answer_text || '',
      contexts: (r.contexts || []).filter(Boolean),
      ground_truth: null,
    });
  }
  return dataset;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const labelsIdx = args.indexOf('--labels');
  const labelsFile = labelsIdx !== -1 ? args[labelsIdx + 1] : process.env.RAG_EVAL_LABELS_FILE;
  const exportIdx = args.indexOf('--export-ragas');
  const exportFile = exportIdx !== -1 ? args[exportIdx + 1] : null;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RAG Pipeline — Offline Stats Report');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Log dir: ${LOG_DIR}`);
  console.log();

  const retrievalEvents = readJsonl(RETRIEVAL_LOG);
  const answerEvents = readJsonl(ANSWER_LOG);

  if (retrievalEvents.length === 0 && answerEvents.length === 0) {
    console.log('  No logged events found. Run some queries first.\n');
    return;
  }

  // ── Retrieval Stats ──────────────────────────────────────────────────────

  if (retrievalEvents.length > 0) {
    const okEvents = retrievalEvents.filter((e) => e.status !== 'error');
    const errEvents = retrievalEvents.filter((e) => e.status === 'error');

    console.log('─── RETRIEVAL STATS ────────────────────────────────────');
    console.log(`  Total retrieval events: ${retrievalEvents.length} (${errEvents.length} errors)`);

    if (okEvents.length > 0) {
      const numRetrieved = okEvents.map((e) => e.num_retrieved || 0);
      console.log(`  Docs retrieved — mean: ${fmt(mean(numRetrieved))}, median: ${fmt(median(numRetrieved))}, min: ${Math.min(...numRetrieved)}, max: ${Math.max(...numRetrieved)}`);

      const allScores = okEvents.flatMap((e) => (e.scores || []).filter((s) => typeof s === 'number'));
      if (allScores.length > 0) {
        console.log(`  Similarity scores (n=${allScores.length}) — mean: ${fmt(mean(allScores), 4)}, median: ${fmt(median(allScores), 4)}, min: ${fmt(Math.min(...allScores), 4)}, max: ${fmt(Math.max(...allScores), 4)}, p10: ${fmt(percentile(allScores, 10), 4)}, p90: ${fmt(percentile(allScores, 90), 4)}`);
        const scoreBuckets = histogram(allScores, [0.3, 0.5, 0.7, 0.8, 0.9, 1.0]);
        console.log('  Score distribution:');
        for (const [bucket, count] of Object.entries(scoreBuckets)) {
          const pct = ((count / allScores.length) * 100).toFixed(1);
          const bar = '█'.repeat(Math.round(count / allScores.length * 30));
          console.log(`    ${bucket.padEnd(8)} ${String(count).padStart(5)}  (${pct.padStart(5)}%)  ${bar}`);
        }
      }

      const pathCounts = {};
      for (const e of retrievalEvents) {
        const p = e.retrieval_path || 'unknown';
        pathCounts[p] = (pathCounts[p] || 0) + 1;
      }
      console.log('  Retrieval paths:');
      for (const [p, c] of Object.entries(pathCounts)) {
        console.log(`    ${p}: ${c} (${((c / retrievalEvents.length) * 100).toFixed(1)}%)`);
      }

      const embedLats = okEvents.map((e) => e.embed_latency_ms).filter((v) => typeof v === 'number');
      const qdrantLats = okEvents.map((e) => e.qdrant_latency_ms).filter((v) => typeof v === 'number');
      if (embedLats.length > 0) {
        console.log(`  Embed latency (ms)  — mean: ${fmt(mean(embedLats))}, median: ${fmt(median(embedLats))}, p95: ${fmt(percentile(embedLats, 95))}`);
      }
      if (qdrantLats.length > 0) {
        console.log(`  Qdrant latency (ms) — mean: ${fmt(mean(qdrantLats))}, median: ${fmt(median(qdrantLats))}, p95: ${fmt(percentile(qdrantLats, 95))}`);
      }
    }

    if (errEvents.length > 0) {
      const errMsgs = {};
      for (const e of errEvents) {
        const msg = e.error_message || 'unknown';
        errMsgs[msg] = (errMsgs[msg] || 0) + 1;
      }
      console.log('  Retrieval errors:');
      for (const [msg, c] of Object.entries(errMsgs)) {
        console.log(`    "${msg}": ${c}`);
      }
    }
    console.log();
  }

  // ── Answer Stats ─────────────────────────────────────────────────────────

  if (answerEvents.length > 0) {
    const okEvents = answerEvents.filter((e) => e.status !== 'error');
    const errEvents = answerEvents.filter((e) => e.status === 'error');

    console.log('─── ANSWER STATS ───────────────────────────────────────');
    console.log(`  Total answer events: ${answerEvents.length} (${errEvents.length} errors)`);

    if (okEvents.length > 0) {
      const lengths = okEvents.map((e) => e.answer_length_chars || 0);
      console.log(`  Answer length (chars) — mean: ${fmt(mean(lengths), 0)}, median: ${fmt(median(lengths), 0)}, min: ${Math.min(...lengths)}, max: ${Math.max(...lengths)}`);

      const confs = okEvents.map((e) => e.confidence).filter((v) => typeof v === 'number');
      if (confs.length > 0) {
        console.log(`  Confidence — mean: ${fmt(mean(confs), 3)}, median: ${fmt(median(confs), 3)}, min: ${fmt(Math.min(...confs), 3)}, max: ${fmt(Math.max(...confs), 3)}`);
      }

      const numSrc = okEvents.map((e) => e.num_sources || 0);
      console.log(`  Sources used — mean: ${fmt(mean(numSrc))}, median: ${fmt(median(numSrc))}`);

      const fbUsed = okEvents.filter((e) => e.fallback_used).length;
      console.log(`  Fallback used: ${fbUsed} / ${okEvents.length} (${((fbUsed / okEvents.length) * 100).toFixed(1)}%)`);

      const models = {};
      for (const e of okEvents) {
        const m = e.model || 'unknown';
        models[m] = (models[m] || 0) + 1;
      }
      console.log('  Models used:');
      for (const [m, c] of Object.entries(models)) {
        console.log(`    ${m}: ${c}`);
      }

      const endpoints = {};
      for (const e of okEvents) {
        const ep = e.endpoint || 'unknown';
        endpoints[ep] = (endpoints[ep] || 0) + 1;
      }
      console.log('  Endpoints:');
      for (const [ep, c] of Object.entries(endpoints)) {
        console.log(`    ${ep}: ${c}`);
      }

      // Token usage
      const promptTok = okEvents.map((e) => e.prompt_tokens).filter((v) => typeof v === 'number');
      const completionTok = okEvents.map((e) => e.completion_tokens).filter((v) => typeof v === 'number');
      const totalTok = okEvents.map((e) => e.total_tokens).filter((v) => typeof v === 'number');
      if (totalTok.length > 0) {
        console.log(`  Token usage (${totalTok.length} events with data):`);
        console.log(`    Prompt tokens     — mean: ${fmt(mean(promptTok), 0)}, total: ${sum(promptTok)}`);
        console.log(`    Completion tokens — mean: ${fmt(mean(completionTok), 0)}, total: ${sum(completionTok)}`);
        console.log(`    Total tokens      — mean: ${fmt(mean(totalTok), 0)}, total: ${sum(totalTok)}`);
      }

      const llmLats = okEvents.map((e) => e.llm_latency_ms).filter((v) => typeof v === 'number');
      const totalLats = okEvents.map((e) => e.total_latency_ms).filter((v) => typeof v === 'number');
      if (llmLats.length > 0) {
        console.log(`  LLM latency (ms)   — mean: ${fmt(mean(llmLats))}, median: ${fmt(median(llmLats))}, p95: ${fmt(percentile(llmLats, 95))}`);
      }
      if (totalLats.length > 0) {
        console.log(`  Total latency (ms) — mean: ${fmt(mean(totalLats))}, median: ${fmt(median(totalLats))}, p95: ${fmt(percentile(totalLats, 95))}`);
      }
    }

    if (errEvents.length > 0) {
      console.log(`  Error rate: ${((errEvents.length / answerEvents.length) * 100).toFixed(1)}%`);
      const errMsgs = {};
      for (const e of errEvents) {
        const msg = e.error_message || 'unknown';
        errMsgs[msg] = (errMsgs[msg] || 0) + 1;
      }
      console.log('  Answer errors:');
      for (const [msg, c] of Object.entries(errMsgs)) {
        console.log(`    "${msg}": ${c}`);
      }
    }
    console.log();
  }

  // ── Precision@k / Recall@k (if labels provided) ─────────────────────────

  if (labelsFile) {
    console.log('─── LABELED EVALUATION ─────────────────────────────────');
    let labels;
    try {
      labels = JSON.parse(fs.readFileSync(labelsFile, 'utf-8'));
      if (!Array.isArray(labels)) labels = [labels];
    } catch (err) {
      console.log(`  Could not read labels file: ${err.message}\n`);
      return;
    }

    const labelMap = new Map();
    for (const l of labels) {
      const key = l.query_id || l.query;
      if (key && Array.isArray(l.relevant_ids)) {
        labelMap.set(key, new Set(l.relevant_ids));
      }
    }

    if (labelMap.size === 0) {
      console.log('  Labels file loaded but no valid entries found.\n');
      return;
    }

    console.log(`  Loaded ${labelMap.size} labeled queries.`);

    let matched = 0;
    const precisions = [];
    const recalls = [];

    for (const event of retrievalEvents) {
      if (event.status === 'error') continue;
      const key = labelMap.has(event.query_id) ? event.query_id : event.query;
      const relevantSet = labelMap.get(key);
      if (!relevantSet) continue;

      matched++;
      const retrieved = event.retrieved_ids || [];
      precisions.push(precisionAtK(retrieved, relevantSet));
      recalls.push(recallAtK(retrieved, relevantSet));
    }

    if (matched === 0) {
      console.log('  No retrieval events matched any labeled query_id/query.\n');
    } else {
      console.log(`  Matched ${matched} retrieval events to labels.`);
      console.log(`  Precision@k — mean: ${fmt(mean(precisions), 4)}, median: ${fmt(median(precisions), 4)}`);
      console.log(`  Recall@k    — mean: ${fmt(mean(recalls), 4)}, median: ${fmt(median(recalls), 4)}`);
      console.log();
    }
  } else {
    console.log('─── LABELED EVALUATION ─────────────────────────────────');
    console.log('  No labels file provided. Pass --labels <path> or set');
    console.log('  RAG_EVAL_LABELS_FILE env var to enable precision@k /');
    console.log('  recall@k evaluation.\n');
  }

  // ── Ragas-compatible export ──────────────────────────────────────────────

  if (exportFile) {
    console.log('─── RAGAS EXPORT ───────────────────────────────────────');
    const dataset = buildRagasDataset(retrievalEvents, answerEvents);
    fs.writeFileSync(exportFile, JSON.stringify(dataset, null, 2));
    console.log(`  Exported ${dataset.length} records to ${exportFile}`);
    console.log('  Schema: { question, answer, contexts[], ground_truth }');
    console.log('  Load in Python with: dataset = json.load(open("..."))');
    console.log('  Then pass to Ragas evaluate() or convert to a Dataset.\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Report complete.');
  console.log('═══════════════════════════════════════════════════════════');
}

main();
