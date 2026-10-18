// Administrator dashboard API. Every decision is written to the audit log.
const express = require("express");
const db = require("../db");
const audit = require("../audit");
const notify = require("../notify");
const present = require("../present");
const matching = require("../matching");
const pipeline = require("../pipeline");
const { requireAdmin } = require("../auth");
const { fail, intParam } = require("../http");
const { STATUS_TEXT } = require("./claims");

const router = express.Router();
router.use("/admin", requireAdmin);

router.get("/admin/overview", async (req, res) => {
  const n = async (sql, p = []) => Number((await db.one(sql, p)).n || 0);
  const byDay = await db.query(
    `SELECT DATE(created_at) AS day, SUM(type = 'lost') AS lost, SUM(type = 'found') AS found
       FROM items WHERE created_at > NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at) ORDER BY day`
  );
  const byCategory = await db.query("SELECT category, COUNT(*) AS n FROM items WHERE status <> 'removed' GROUP BY category ORDER BY n DESC");
  const activity = await db.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.username
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 12`
  );
  res.json({
    totals: {
      users: await n("SELECT COUNT(*) AS n FROM users"),
      new_users_7d: await n("SELECT COUNT(*) AS n FROM users WHERE created_at > NOW() - INTERVAL 7 DAY"),
      reports: await n("SELECT COUNT(*) AS n FROM items"),
      active: await n("SELECT COUNT(*) AS n FROM items WHERE status = 'active'"),
      returned: await n("SELECT COUNT(*) AS n FROM items WHERE status IN ('returned','resolved')"),
      pending_review: await n("SELECT COUNT(*) AS n FROM items WHERE status = 'pending_review'"),
      open_flags: await n("SELECT COUNT(*) AS n FROM flags WHERE status = 'open'"),
      claims_open: await n("SELECT COUNT(*) AS n FROM claims WHERE status IN ('pending','under_review','approved')"),
      claims_need_admin: await n("SELECT COUNT(*) AS n FROM claims WHERE status IN ('pending','under_review') AND (disputed = 1 OR (requires_admin = 1 AND owner_approved = 1))"),
      matches: await n("SELECT COUNT(*) AS n FROM matches WHERE status <> 'dismissed'"),
      matches_disputed: await n("SELECT COUNT(*) AS n FROM matches WHERE status = 'disputed'"),
    },
    by_day: byDay.map((d) => ({ day: d.day, lost: Number(d.lost), found: Number(d.found) })),
    by_category: byCategory,
    activity,
  });
});

// ── Reports ────────────────────────────────────────────────────────────

router.get("/admin/reports", async (req, res) => {
  const where = [];
  const params = [];
  const statuses = ["pending_review", "active", "resolved", "returned", "closed", "removed"];
  if (statuses.includes(req.query.status)) {
    where.push("i.status = ?");
    params.push(req.query.status);
  }
  if (req.query.flagged === "1") where.push("EXISTS (SELECT 1 FROM flags f WHERE f.target_type = 'item' AND f.target_id = i.id AND f.status = 'open')");
  if (req.query.q) {
    where.push("(i.title LIKE ? OR i.description LIKE ? OR u.username LIKE ?)");
    params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  const rows = await db.query(
    `${present.ITEM_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY (i.status = 'pending_review') DESC, i.created_at DESC LIMIT 200`,
    params
  );
  const flags = rows.length
    ? await db.query("SELECT target_id, COUNT(*) AS n FROM flags WHERE target_type = 'item' AND status = 'open' AND target_id IN (?) GROUP BY target_id", [rows.map((r) => r.id)])
    : [];
  const fl = new Map(flags.map((f) => [f.target_id, f.n]));
  res.json({ items: await present.items(rows, req.user, (r) => ({ open_flags: fl.get(r.id) || 0, owner_username: r.owner_username, views: r.views })) });
});

router.post("/admin/reports/:id/decision", async (req, res) => {
  const id = intParam(req.params.id);
  const item = await db.one("SELECT * FROM items WHERE id = ?", [id]);
  if (!item) fail(404, "Report not found");
  const decision = String(req.body.decision || "");
  const note = String(req.body.note || "").trim().slice(0, 255) || null;
  const to = { approve: "active", reject: "removed", remove: "removed", restore: "active" }[decision];
  if (!to) fail(422, "Unknown decision");
  if (to === "removed" && !note) fail(422, "Add a reason so the reporter knows why", { note: "Required" });
  await db.query("UPDATE items SET status = ?, moderation_note = ? WHERE id = ?", [to, to === "active" ? null : note, id]);
  if (to === "active") await db.query("UPDATE flags SET status = 'resolved', resolved_by = ? WHERE target_type = 'item' AND target_id = ? AND status = 'open'", [req.user.id, id]);
  await audit.log(req, `admin.report.${decision}`, "item", id, { from: item.status, to, note });
  if (item.user_id) await notify.send(item.user_id, "status", to === "active" ? "report_published" : "report_removed", { title: item.title, note }, `/items/${id}`);
  if (to === "active") await pipeline.afterSave(id);
  else await matching.runForItem(id);
  res.json({ ok: true, status: to });
});

// ── Users ──────────────────────────────────────────────────────────────

router.get("/admin/users", async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const rows = await db.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.role, u.status, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id) AS reports,
            (SELECT COUNT(*) FROM claims c WHERE c.claimant_id = u.id) AS claims,
            (SELECT COUNT(*) FROM claims c WHERE c.claimant_id = u.id AND c.status = 'rejected') AS rejected_claims,
            (SELECT COUNT(*) FROM flags f WHERE f.target_type = 'user' AND f.target_id = u.id AND f.status = 'open') AS open_flags
       FROM users u ${q ? "WHERE u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?" : ""}
      ORDER BY open_flags DESC, u.created_at DESC LIMIT 300`,
    q ? [q, q, q] : []
  );
  res.json({ users: rows });
});

router.post("/admin/users/:id", async (req, res) => {
  const id = intParam(req.params.id);
  const user = await db.one("SELECT id, role, status, username FROM users WHERE id = ?", [id]);
  if (!user) fail(404, "User not found");
  if (id === req.user.id) fail(409, "You can't change your own account here");
  const changes = {};
  if (["active", "suspended"].includes(req.body.status)) changes.status = req.body.status;
  if (["user", "admin"].includes(req.body.role)) changes.role = req.body.role;
  if (!Object.keys(changes).length) fail(422, "Nothing to change");
  await db.query("UPDATE users SET ? WHERE id = ?", [changes, id]);
  if (changes.status === "suspended") {
    // Their sessions stop working on the next request (see loadUser); active reports are
    // hidden until an administrator looks at them.
    await db.query("UPDATE items SET status = 'pending_review', moderation_note = 'Account suspended' WHERE user_id = ? AND status = 'active'", [id]);
  }
  await audit.log(req, "admin.user.update", "user", id, { before: { role: user.role, status: user.status }, after: changes, note: req.body.note || null });
  res.json({ ok: true });
});

// ── Claims that need an administrator ──────────────────────────────────

router.get("/admin/claims", async (req, res) => {
  const filter = req.query.filter || "attention";
  const where = {
    attention: "c.status IN ('pending','under_review','approved','rejected') AND (c.disputed = 1 OR (c.requires_admin = 1 AND c.status IN ('pending','under_review')))",
    open: "c.status IN ('pending','under_review','approved')",
    all: "1 = 1",
  }[filter] || "1 = 1";
  const rows = await db.query(
    `SELECT c.*, i.title AS item_title, i.type AS item_type, i.is_valuable, i.category,
            cu.username AS claimant, ou.username AS owner
       FROM claims c JOIN items i ON i.id = c.item_id JOIN users cu ON cu.id = c.claimant_id LEFT JOIN users ou ON ou.id = i.user_id
      WHERE ${where} ORDER BY c.disputed DESC, c.updated_at DESC LIMIT 200`
  );
  res.json({
    claims: rows.map((c) => ({
      id: c.id, item_id: c.item_id, item_title: c.item_title, item_type: c.item_type, kind: c.kind,
      status: c.status, status_label: STATUS_TEXT(c.status), requires_admin: !!c.requires_admin,
      owner_approved: !!c.owner_approved, disputed: !!c.disputed, claimant: c.claimant, owner: c.owner,
      created_at: c.created_at, updated_at: c.updated_at,
    })),
  });
});

// ── Matches ────────────────────────────────────────────────────────────

router.get("/admin/matches", async (req, res) => {
  const status = ["suggested", "confirmed", "dismissed", "disputed"].includes(req.query.status) ? req.query.status : null;
  const rows = await db.query(
    `SELECT m.*, l.title AS lost_title, f.title AS found_title, lu.username AS lost_user, fu.username AS found_user
       FROM matches m JOIN items l ON l.id = m.lost_item_id JOIN items f ON f.id = m.found_item_id
       LEFT JOIN users lu ON lu.id = l.user_id LEFT JOIN users fu ON fu.id = f.user_id
      ${status ? "WHERE m.status = ?" : ""} ORDER BY (m.status = 'disputed') DESC, m.score DESC LIMIT 200`,
    status ? [status] : []
  );
  res.json({ matches: rows.map((m) => ({ ...m, strength: matching.strength(m.score) })) });
});

router.post("/admin/matches/:id", async (req, res) => {
  const id = intParam(req.params.id);
  const m = await db.one("SELECT * FROM matches WHERE id = ?", [id]);
  if (!m) fail(404, "Match not found");
  const status = ["suggested", "dismissed"].includes(req.body.status) ? req.body.status : fail(422, "Choose keep or dismiss");
  await db.query("UPDATE matches SET status = ?, admin_note = ? WHERE id = ?", [status, String(req.body.note || "").slice(0, 255) || null, id]);
  await db.query("UPDATE flags SET status = 'resolved', resolved_by = ? WHERE target_type = 'match' AND target_id = ? AND status = 'open'", [req.user.id, id]);
  await audit.log(req, "admin.match.review", "match", id, { from: m.status, to: status });
  res.json({ ok: true });
});

// ── Flags (reports from users) ─────────────────────────────────────────

router.get("/admin/flags", async (req, res) => {
  const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : "open";
  const rows = await db.query(
    `SELECT f.*, u.username AS reporter,
            CASE f.target_type
              WHEN 'item' THEN (SELECT title FROM items WHERE id = f.target_id)
              WHEN 'user' THEN (SELECT username FROM users WHERE id = f.target_id)
              WHEN 'claim' THEN (SELECT CONCAT('Request #', id) FROM claims WHERE id = f.target_id)
              WHEN 'match' THEN (SELECT CONCAT('Match #', id) FROM matches WHERE id = f.target_id)
            END AS target_label
       FROM flags f LEFT JOIN users u ON u.id = f.reporter_id WHERE f.status = ? ORDER BY f.created_at DESC LIMIT 200`,
    [status]
  );
  res.json({ flags: rows });
});

router.post("/admin/flags/:id", async (req, res) => {
  const id = intParam(req.params.id);
  const status = ["resolved", "dismissed"].includes(req.body.status) ? req.body.status : fail(422, "Choose resolved or dismissed");
  await db.query("UPDATE flags SET status = ?, resolved_by = ? WHERE id = ?", [status, req.user.id, id]);
  await audit.log(req, "admin.flag." + status, "flag", id);
  res.json({ ok: true });
});

// ── Audit log, outbox, settings ────────────────────────────────────────

router.get("/admin/audit", async (req, res) => {
  const rows = await db.query(
    `SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      ${req.query.action ? "WHERE a.action LIKE ?" : ""} ORDER BY a.id DESC LIMIT 300`,
    req.query.action ? [`${req.query.action}%`] : []
  );
  res.json({ entries: rows });
});

router.get("/admin/outbox", async (req, res) => {
  res.json({ emails: await db.query("SELECT * FROM email_outbox ORDER BY id DESC LIMIT 100") });
});

router.get("/admin/settings", async (req, res) => {
  const rows = await db.query("SELECT name, value FROM settings");
  res.json(Object.fromEntries(rows.map((r) => [r.name, r.value])));
});

router.post("/admin/settings", async (req, res) => {
  if (!["pre", "post"].includes(req.body.moderation_mode)) fail(422, "Unknown moderation mode");
  await db.query("REPLACE INTO settings (name, value) VALUES ('moderation_mode', ?)", [req.body.moderation_mode]);
  await audit.log(req, "admin.settings", "settings", null, { moderation_mode: req.body.moderation_mode });
  res.json({ ok: true });
});

module.exports = { router };
