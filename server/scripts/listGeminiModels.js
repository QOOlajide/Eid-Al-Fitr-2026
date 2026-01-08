/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('Missing GEMINI_API_KEY in server/.env');
    process.exit(1);
  }

  // Use the public Generative Language API listModels endpoint to avoid SDK method drift.
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const body = await res.text();
    console.error('Failed to list models:', res.status, res.statusText);
    console.error(body);
    process.exit(1);
  }

  const json = await res.json();
  const models = (json.models || []).map((m) => ({
    name: m.name, // e.g. "models/gemini-1.5-flash"
    displayName: m.displayName,
    supportedGenerationMethods: m.supportedGenerationMethods,
  }));

  // Print a compact list first
  console.log('Available models (name -> supportedGenerationMethods):');
  for (const m of models) {
    console.log(`- ${m.name} -> ${(m.supportedGenerationMethods || []).join(', ')}`);
  }

  console.log('\nTip: set GEMINI_CHAT_MODEL to the suffix without "models/". Example: gemini-1.5-flash');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

