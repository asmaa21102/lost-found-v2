// Data-retention rules (also described on the Privacy page). Runs at startup and daily.
const db = require("./db");
const uploads = require("./uploads");
const photoIndex = require("./photo-index");

const RULES = {
  readNotificationsDays: 90,
  closedReportsDays: 365, // returned / resolved / closed / removed reports are deleted after a year
  closedConversationDays: 180, // messages of finished requests
  staleActiveDays: 180, // active reports nobody updated are closed
  auditDays: 730,
  outboxDays: 30,
};

async function run() {
  await db.query("DELETE FROM notifications WHERE is_read = 1 AND created_at < NOW() - INTERVAL ? DAY", [RULES.readNotificationsDays]);
  await db.query(
    `DELETE m FROM messages m JOIN claims c ON c.id = m.claim_id
      WHERE c.status IN ('rejected','returned','cancelled') AND c.updated_at < NOW() - INTERVAL ? DAY`,
    [RULES.closedConversationDays]
  );
  await db.query(
    "UPDATE items SET status = 'closed', moderation_note = 'Closed automatically after 6 months without updates' WHERE status = 'active' AND COALESCE(updated_at, created_at) < NOW() - INTERVAL ? DAY",
    [RULES.staleActiveDays]
  );
  const old = await db.query(
    "SELECT id FROM items WHERE status IN ('returned','resolved','closed','removed') AND COALESCE(updated_at, created_at) < NOW() - INTERVAL ? DAY",
    [RULES.closedReportsDays]
  );
  for (const { id } of old) {
    const photos = await db.query("SELECT id, filename FROM item_photos WHERE item_id = ?", [id]);
    await db.query("DELETE FROM items WHERE id = ?", [id]);
    for (const p of photos) {
      photoIndex.remove(p.id);
      await uploads.deletePhoto(p.filename);
    }
  }
  await db.query("DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL ? DAY", [RULES.auditDays]);
  await db.query("DELETE FROM email_outbox WHERE created_at < NOW() - INTERVAL ? DAY", [RULES.outboxDays]);
  return { deletedReports: old.length };
}

function schedule() {
  const tick = () => run().catch((err) => console.error("retention:", err.message));
  setTimeout(tick, 30 * 1000).unref();
  setInterval(tick, 24 * 60 * 60 * 1000).unref();
}

module.exports = { run, schedule, RULES };
