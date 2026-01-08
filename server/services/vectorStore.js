const { QdrantClient } = require('@qdrant/js-client-rest');

const collectionName = process.env.RAG_VECTOR_COLLECTION || 'islamic_chunks';

let client = null;

function getQdrantClient() {
  const url = process.env.QDRANT_URL;
  if (!url) return null;
  if (client) return client;
  const checkCompatibility = (process.env.QDRANT_CHECK_COMPATIBILITY || 'true').toLowerCase() === 'true';
  client = new QdrantClient({ url, checkCompatibility });
  return client;
}

async function ensureCollection(vectorSize) {
  const qdrant = getQdrantClient();
  if (!qdrant) return { ok: false, reason: 'QDRANT_URL not set' };

  try {
    const info = await qdrant.getCollection(collectionName);
    const existingSize =
      info?.config?.params?.vectors?.size ||
      info?.result?.config?.params?.vectors?.size;

    if (typeof existingSize === 'number' && existingSize !== vectorSize) {
      const recreate = (process.env.QDRANT_RECREATE_COLLECTION_ON_MISMATCH || 'false').toLowerCase() === 'true';
      const pointsCount = info?.points_count ?? info?.result?.points_count;

      if (recreate) {
        await qdrant.deleteCollection(collectionName);
        await qdrant.createCollection(collectionName, {
          vectors: { size: vectorSize, distance: 'Cosine' },
        });
        return { ok: true, created: true, recreated: true, oldSize: existingSize, newSize: vectorSize };
      }

      throw new Error(
        `Qdrant collection "${collectionName}" vector size mismatch: collection=${existingSize} embed=${vectorSize}` +
          (typeof pointsCount === 'number' ? ` points=${pointsCount}` : '') +
          `. Set QDRANT_RECREATE_COLLECTION_ON_MISMATCH=true to recreate, or adjust GEMINI_EMBED_OUTPUT_DIM.`
      );
    }

    return { ok: true, created: false, vectorSize: existingSize ?? vectorSize };
  } catch {
    // Create if missing
    await qdrant.createCollection(collectionName, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
    return { ok: true, created: true };
  }
}

async function upsertPoints(points) {
  const qdrant = getQdrantClient();
  if (!qdrant) throw new Error('QDRANT_URL not set');
  if (!Array.isArray(points) || points.length === 0) return;

  try {
    await qdrant.upsert(collectionName, {
      wait: true,
      points,
    });
  } catch (e) {
    // Surface more context than just "Bad Request"
    const msg = e?.message || 'Qdrant upsert failed';
    const details = e?.data ? JSON.stringify(e.data).slice(0, 800) : '';
    const err = new Error(`${msg}${details ? ` | ${details}` : ''}`);
    throw err;
  }
}

async function search(vector, limit = 6, filter) {
  const qdrant = getQdrantClient();
  if (!qdrant) return [];
  if (!Array.isArray(vector) || vector.length === 0) return [];

  const res = await qdrant.search(collectionName, {
    vector,
    limit,
    with_payload: true,
    with_vector: false,
    filter,
  });

  return Array.isArray(res) ? res : (res?.result || []);
}

module.exports = {
  getQdrantClient,
  ensureCollection,
  upsertPoints,
  search,
  collectionName,
};

