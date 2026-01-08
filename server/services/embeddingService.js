const { geminiEmbedText } = require('./geminiRestClient');

async function embedText(text) {
  const input = String(text || '').trim();
  if (!input) return [];

  const embedModel = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const outputDimensionalityRaw = process.env.GEMINI_EMBED_OUTPUT_DIM;
  const outputDimensionality = outputDimensionalityRaw ? Number(outputDimensionalityRaw) : undefined;

  return await geminiEmbedText({
    model: embedModel,
    text: input,
    outputDimensionality: Number.isFinite(outputDimensionality) ? outputDimensionality : undefined,
  });
}

module.exports = { embedText };

