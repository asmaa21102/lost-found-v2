// What happens after a report is created or edited: compute photo vectors (AI), then
// re-run matching. If the AI model is still loading, matching runs on text first and
// again once the photos have vectors.
const fs = require("fs");
const path = require("path");
const db = require("./db");
const ai = require("./ai");
const config = require("./config");
const photoIndex = require("./photo-index");
const matching = require("./matching");
const { photoUrls } = require("./uploads");

async function embedMissing(itemId = null) {
  const rows = await db.query(
    `SELECT id, item_id, filename FROM item_photos WHERE embedding IS NULL ${itemId ? "AND item_id = ?" : ""} ORDER BY id`,
    itemId ? [itemId] : []
  );
  let done = 0;
  for (const r of rows) {
    const file = path.join(config.uploadsDir, path.basename(photoUrls(r.filename).url));
    let buf;
    try {
      buf = await fs.promises.readFile(file);
    } catch {
      continue; // file missing (e.g. old uploads that were not copied)
    }
    const vec = await ai.embedImage(buf);
    await db.query("UPDATE item_photos SET embedding = ? WHERE id = ?", [ai.toBuffer(vec), r.id]);
    photoIndex.set(r.id, r.item_id, vec);
    done++;
  }
  return done;
}

// Returns the matches found right away (so the success screen can show them).
async function afterSave(itemId) {
  if (ai.isReady()) {
    await embedMissing(itemId).catch((err) => console.error("embed failed:", err.message));
    return matching.runForItem(itemId);
  }
  const first = await matching.runForItem(itemId);
  if (config.ai.enabled) {
    ai.init()
      .then(() => embedMissing(itemId))
      .then((n) => n && matching.runForItem(itemId))
      .catch((err) => console.error("background embed failed:", err.message));
  }
  return first;
}

// At startup: load the model, give every photo a vector, refresh matches that changed.
async function warmUp() {
  await photoIndex.load();
  if (!config.ai.enabled) return;
  await ai.init();
  const pending = await db.query("SELECT DISTINCT item_id FROM item_photos WHERE embedding IS NULL");
  if (!pending.length) return;
  await embedMissing();
  for (const { item_id } of pending) await matching.runForItem(item_id, { notifyUsers: false });
  console.log(`AI: embedded photos of ${pending.length} reports`);
}

module.exports = { afterSave, warmUp, embedMissing };
