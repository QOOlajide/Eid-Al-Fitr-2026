/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ragService = require('../services/ragService');

async function main() {
  const query = process.argv.slice(2).join(' ').trim() || 'What is the meaning of Eid al-Fitr?';

  // For quick testing, default to legacy retrieval unless explicitly set.
  // This avoids requiring Qdrant + embeddings setup just to sanity-check end-to-end behavior.
  process.env.RAG_RETRIEVER = process.env.RAG_RETRIEVER || 'legacy';

  if (!process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY. Set it in server/.env (or as an env var) then re-run.');
    process.exit(1);
  }

  const res = await ragService.searchIslamicKnowledge(query, null);

  console.log('Query:', res.query);
  console.log('Confidence:', res.confidence);
  console.log('Response time (ms):', res.responseTime);
  console.log('Sources:', (res.sources || []).length);
  console.log('---');
  console.log(res.answer);
  console.log('---');
  console.log(
    (res.sources || []).map((s) => ({
      title: s.title,
      url: s.url,
      domain: s.domain,
      relevance: s.relevance,
    }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

