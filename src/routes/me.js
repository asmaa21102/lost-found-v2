// The signed-in user's own data: dashboard, reports, saved items, matches,
// notifications, profile and settings.
const express = require("express");
const bcrypt = require("bcrypt");
const limiter = require("../limit");
const db = require("../db");
const audit = require("../audit");
const notify = require("../notify");
const present = require("../present");
const matching = require("../matching");
const photoIndex = require("../photo-index");
const uploads = require("../uploads");
const { requireAuth } = require("../auth");
const { check, fail, intParam } = require("../http");
const { verify } = require("./auth");
const i18n = require("../i18n");

const router = express.Router();
router.use(["/me", "/matches", "/notifications", "/flags"], requireAuth);

router.get("/me/summary", async (req, res) => {
  const id = req.user.id;
  const items = await db.query("SELECT type, status, COUNT(*) AS n FROM items WHERE user_id = ? GROUP BY type, status", [id]);
  const count = (type, statuses) => items.filter((r) => r.type === type && (!statuses || statuses.includes(r.status))).reduce((s, r) => s + r.n, 0);
  const one = async (sql, p) => (await db.one(sql, p)).n;
  res.json({
    lost: count("lost"),
    lost_active: count("lost", ["active"]),
    found: count("found"),
    found_active: count("found", ["active"]),
    returned: count("found", ["returned"]) + count("lost", ["resolved"]),
    saved: await one("SELECT COUNT(*) AS n FROM saved_items WHERE user_id = ?", [id]),
    matches_new: await one(
      `SELECT COUNT(*) AS n FROM matches m JOIN items l ON l.id = m.lost_item_id JOIN items f ON f.id = m.found_item_id
        WHERE m.status = 'suggested' AND ((l.user_id = ? AND m.lost_response = 'pending') OR (f.user_id = ? AND m.found_response = 'pending'))`,
      [id, id]
    ),
    claims_incoming: await one("SELECT COUNT(*) AS n FROM claims c JOIN items i ON i.id = c.item_id WHERE i.user_id = ? AND c.status IN ('pending','under_review')", [id]),
    claims_outgoing: await one("SELECT COUNT(*) AS n FROM claims WHERE claimant_id = ? AND status IN ('pending','under_review','approved')", [id]),
    unread: await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", [id]),
  });
});

router.get("/me/items", async (req, res) => {
  const where = ["i.user_id = ?"];
  const params = [req.user.id];
  if (["lost", "found"].includes(req.query.type)) {
    where.push("i.type = ?");
    params.push(req.query.type);
  }
  const rows = await db.query(`${present.ITEM_SELECT} WHERE ${where.join(" AND ")} ORDER BY i.created_at DESC`, params);
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db.query(
        `SELECT x.id, (SELECT COUNT(*) FROM matches m WHERE (m.lost_item_id = x.id OR m.found_item_id = x.id) AND m.status <> 'dismissed') AS matches,
                (SELECT COUNT(*) FROM claims c WHERE c.item_id = x.id AND c.status IN ('pending','under_review','approved')) AS claims
           FROM items x WHERE x.id IN (?)`,
        [ids]
      )
    : [];
  const byId = new Map(counts.map((c) => [c.id, c]));
  res.json({ items: await present.items(rows, req.user, (r) => ({ match_count: byId.get(r.id)?.matches || 0, claim_count: byId.get(r.id)?.claims || 0, views: r.views })) });
});

router.get("/me/saved", async (req, res) => {
  const rows = await db.query(
    `${present.ITEM_SELECT} JOIN saved_items s ON s.item_id = i.id
      WHERE s.user_id = ? AND i.status IN ('active','returned','resolved') ORDER BY s.created_at DESC`,
    [req.user.id]
  );
  res.json({ items: await present.items(rows, req.user, () => ({ saved: true })) });
});

router.patch("/me", async (req, res) => {
  const data = check(req.body)
    .text("full_name", { required: true, min: 2, max: 120, label: "Full name" })
    .email("email")
    .text("phone", { max: 40, label: "Phone" })
    .done();
  const taken = await db.one("SELECT id FROM users WHERE email = ? AND id <> ?", [data.email, req.user.id]);
  if (taken) fail(409, "This email is used by another account", { email: "This email is used by another account" });
  await db.query("UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?", [data.full_name, data.email, data.phone, req.user.id]);
  res.json({ ok: true });
});

router.patch("/me/notifications", async (req, res) => {
  const prefs = {};
  for (const key of Object.keys(notify.DEFAULT_PREFS)) prefs[key] = !!req.body[key];
  await db.query("UPDATE users SET notify_prefs = ? WHERE id = ?", [JSON.stringify(prefs), req.user.id]);
  res.json({ notify_prefs: prefs });
});

const sensitiveLimiter = limiter({ minutes: 15, limit: 8, key: "p", message: "Too many attempts. Try again later." });

router.post("/me/password", sensitiveLimiter, async (req, res) => {
  const user = await db.one("SELECT password FROM users WHERE id = ?", [req.user.id]);
  if (!(await verify(String(req.body.current || ""), user.password))) fail(422, "Current password is wrong", { current: "Current password is wrong" });
  const next = String(req.body.password || "");
  if (next.length < 8 || !/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) fail(422, "Please fix the highlighted fields", { password: "At least 8 characters with a letter and a number" });
  await db.query("UPDATE users SET password = ? WHERE id = ?", [await bcrypt.hash(next, 12), req.user.id]);
  await audit.log(req, "user.password_changed", "user", req.user.id);
  res.json({ ok: true });
});

// Deletes the account and the reports, photos and messages that belong to it.
router.delete("/me", sensitiveLimiter, async (req, res) => {
  const user = await db.one("SELECT password, role FROM users WHERE id = ?", [req.user.id]);
  if (!(await verify(String(req.body.password || ""), user.password))) fail(422, "Password is wrong", { password: "Password is wrong" });
  if (user.role === "admin") {
    const { n } = await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'");
    if (n <= 1) fail(409, "You are the only administrator. Make someone else an administrator first.");
  }
  const photos = await db.query("SELECT p.id, p.filename FROM item_photos p JOIN items i ON i.id = p.item_id WHERE i.user_id = ?", [req.user.id]);
  await db.query("DELETE FROM items WHERE user_id = ?", [req.user.id]);
  await db.query("DELETE FROM users WHERE id = ?", [req.user.id]);
  for (const p of photos) {
    photoIndex.remove(p.id);
    await uploads.deletePhoto(p.filename);
  }
  await audit.log({ ip: req.ip }, "user.deleted_self", "user", req.user.id);
  req.session.destroy(() => res.json({ deleted: true }));
});

// ── Matches ────────────────────────────────────────────────────────────

router.get("/matches", async (req, res) => {
  const id = req.user.id;
  const rows = await db.query(
    `SELECT m.*, l.user_id AS lost_user, f.user_id AS found_user
       FROM matches m JOIN items l ON l.id = m.lost_item_id JOIN items f ON f.id = m.found_item_id
      WHERE (l.user_id = ? OR f.user_id = ?) AND m.status <> 'dismissed'
        AND l.status NOT IN ('removed') AND f.status NOT IN ('removed')
      ORDER BY (m.status = 'suggested') DESC, m.score DESC, m.created_at DESC LIMIT 100`,
    [id, id]
  );
  const itemIds = [...new Set(rows.flatMap((m) => [m.lost_item_id, m.found_item_id]))];
  const itemRows = itemIds.length ? await db.query(`${present.ITEM_SELECT} WHERE i.id IN (?)`, [itemIds]) : [];
  const items = new Map((await present.items(itemRows, req.user)).map((i) => [i.id, i]));
  const claims = rows.length
    ? await db.query("SELECT id, match_id, status FROM claims WHERE match_id IN (?) AND status <> 'cancelled'", [rows.map((m) => m.id)])
    : [];
  res.json({
    matches: rows.map((m) => {
      const side = m.lost_user === id ? "lost" : "found";
      return {
        id: m.id,
        score: m.score,
        strength: matching.strength(m.score),
        reasons: i18n.reasons(m.reasons),
        status: m.status,
        side,
        my_response: side === "lost" ? m.lost_response : m.found_response,
        other_response: side === "lost" ? m.found_response : m.lost_response,
        mine: items.get(side === "lost" ? m.lost_item_id : m.found_item_id),
        other: items.get(side === "lost" ? m.found_item_id : m.lost_item_id),
        claim: claims.find((c) => c.match_id === m.id) || null,
        created_at: m.created_at,
      };
    }).filter((m) => m.mine && m.other),
  });
});

async function loadMatchFor(id, user) {
  const m = await db.one(
    `SELECT m.*, l.user_id AS lost_user, f.user_id AS found_user, l.title AS lost_title, f.title AS found_title
       FROM matches m JOIN items l ON l.id = m.lost_item_id JOIN items f ON f.id = m.found_item_id WHERE m.id = ?`,
    [id]
  );
  if (!m || (m.lost_user !== user.id && m.found_user !== user.id)) fail(404, "Match not found");
  return m;
}

router.post("/matches/:id/respond", async (req, res) => {
  const m = await loadMatchFor(intParam(req.params.id), req.user);
  const response = req.body.response === "yes" ? "yes" : req.body.response === "no" ? "no" : fail(422, "Choose yes or no");
  const side = m.lost_user === req.user.id ? "lost" : "found";
  await db.query(`UPDATE matches SET ${side}_response = ? WHERE id = ?`, [response, m.id]);
  // "That's not my item" from the person who lost it closes the suggestion.
  if (side === "lost" && response === "no") await db.query("UPDATE matches SET status = 'dismissed' WHERE id = ?", [m.id]);
  if (response === "yes") {
    const other = side === "lost" ? m.found_user : m.lost_user;
    if (other) await notify.send(other, "match", side === "lost" ? "match_owner_yes" : "match_finder_yes", { title: side === "lost" ? m.found_title : m.lost_title }, "/dashboard/matches");
  }
  res.json({ ok: true, response });
});

// ── Notifications ──────────────────────────────────────────────────────

router.get("/notifications", async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const where = req.query.unread === "1" ? "AND is_read = 0" : "";
  const rows = await db.query(`SELECT * FROM notifications WHERE user_id = ? ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, [req.user.id, limit]);
  const { n } = await db.one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", [req.user.id]);
  res.json({ notifications: rows.map((r) => notify.render(r)), unread: n });
});

router.post("/notifications/read", async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length) await db.query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (?)", [req.user.id, ids]);
  else await db.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
  res.json({ ok: true });
});

router.delete("/notifications/:id", async (req, res) => {
  await db.query("DELETE FROM notifications WHERE user_id = ? AND id = ?", [req.user.id, intParam(req.params.id)]);
  res.json({ ok: true });
});

// ── Reporting suspicious listings, users or requests ───────────────────

const flagLimiter = limiter({ minutes: 60, limit: 15, key: "f", message: "Too many reports sent. Please wait." });
const AUTO_HIDE_AFTER = 3;

router.post("/flags", flagLimiter, async (req, res) => {
  const data = check(req.body)
    .oneOf("target_type", ["item", "user", "claim", "match"], { required: true, label: "Target" })
    .number("target_id", { min: 1 })
    .oneOf("reason", ["spam", "fake", "offensive", "scam", "privacy", "other"], { required: true, label: "Reason" })
    .text("details", { max: 1000, label: "Details", multiline: true })
    .done();
  if (!data.target_id) fail(422, "Missing target");
  const dup = await db.one("SELECT id FROM flags WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'", [req.user.id, data.target_type, data.target_id]);
  if (dup) return res.json({ ok: true, duplicate: true });
  await db.query("INSERT INTO flags (reporter_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?)", [req.user.id, data.target_type, data.target_id, data.reason, data.details]);

  if (data.target_type === "item") {
    const { n } = await db.one("SELECT COUNT(DISTINCT reporter_id) AS n FROM flags WHERE target_type = 'item' AND target_id = ? AND status = 'open'", [data.target_id]);
    if (n >= AUTO_HIDE_AFTER) {
      const r = await db.query("UPDATE items SET status = 'pending_review', moderation_note = 'Hidden after several reports from users' WHERE id = ? AND status = 'active'", [data.target_id]);
      if (r.affectedRows) await audit.log(null, "item.auto_hidden", "item", data.target_id, { flags: n });
    }
  }
  if (data.target_type === "match") await db.query("UPDATE matches SET status = 'disputed' WHERE id = ? AND status = 'suggested'", [data.target_id]);
  await notify.sendAdmins("system", "admin_flag", { target_code: data.target_type, reason_code: data.reason, details: data.details?.slice(0, 140) || "" }, "/admin/flags");
  res.status(201).json({ ok: true });
});

module.exports = { router };
