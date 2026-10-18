// Audit history for important actions (admin decisions, claim status changes, deletions).
const db = require("./db");

async function log(req, action, targetType = null, targetId = null, details = null) {
  await db.query("INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)", [
    req?.user?.id || null,
    action,
    targetType,
    targetId,
    details ? JSON.stringify(details) : null,
    req?.ip || null,
  ]);
}

module.exports = { log };
