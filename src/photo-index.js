// In-memory index of photo vectors so photo search and matching don't re-read BLOBs.
// Fine for thousands of photos; a vector database would replace this at larger scale.
const db = require("./db");
const ai = require("./ai");

const byPhoto = new Map(); // photoId → { itemId, vec }

async function load() {
  byPhoto.clear();
  const rows = await db.query("SELECT id, item_id, embedding FROM item_photos WHERE embedding IS NOT NULL");
  for (const r of rows) {
    const vec = ai.fromBuffer(r.embedding);
    if (vec) byPhoto.set(r.id, { itemId: r.item_id, vec });
  }
  return byPhoto.size;
}

const set = (photoId, itemId, vec) => byPhoto.set(photoId, { itemId, vec });
const remove = (photoId) => byPhoto.delete(photoId);

function vectorsForItem(itemId) {
  const out = [];
  for (const v of byPhoto.values()) if (v.itemId === itemId) out.push(v.vec);
  return out;
}

// Best cosine between any photo of item A and any photo of item B.
function bestPairCosine(vecsA, vecsB) {
  let best = null;
  for (const a of vecsA) for (const b of vecsB) {
    const c = ai.dot(a, b);
    if (best === null || c > best) best = c;
  }
  return best;
}

// itemId → best cosine against the query vector, over all indexed photos.
function scoreItems(queryVec) {
  const best = new Map();
  for (const { itemId, vec } of byPhoto.values()) {
    const c = ai.dot(queryVec, vec);
    if (!best.has(itemId) || c > best.get(itemId)) best.set(itemId, c);
  }
  return best;
}

module.exports = { load, set, remove, vectorsForItem, bestPairCosine, scoreItems, size: () => byPhoto.size };
