// Claim & return workflow.
//  ownership claim — "this found item is mine": the claimant answers privately with
//                    details only the owner would know; the finder compares them with
//                    the private details saved on the found report.
//  finder claim    — "I think I found your lost item": goes to the person who lost it.
// Statuses: pending → under_review → approved → returned, or rejected / cancelled.
// Valuable or sensitive items need an administrator's approval as well.
const express = require("express");
const limiter = require("../limit");
const db = require("../db");
const audit = require("../audit");
const notify = require("../notify");
const present = require("../present");
const matching = require("../matching");
const { requireAuth, isAdmin } = require("../auth");
const { check, fail, intParam } = require("../http");
const { loadItem, canView } = require("./items");
const i18n = require("../i18n");

const router = express.Router();

const FINAL = ["rejected", "returned", "cancelled"];
const SENSITIVE_CATEGORIES = ["documents"];
const STATUS_TEXT = (status) => i18n.CLAIM_STATUS[status]?.[i18n.idx(i18n.current())] || status;

const claimLimiter = limiter({ minutes: 60, limit: 10, key: "c", message: "Too many requests sent. Please wait before sending more." });
const messageLimiter = limiter({ minutes: 10, limit: 60, key: "m", message: "You're sending messages too quickly." });

async function addEvent(conn, claimId, actorId, from, to, note = null) {
  await conn.query("INSERT INTO claim_events (claim_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)", [claimId, actorId, from, to, note]);
}

// Marks all open ownership claims on an item as disputed when there is more than one.
async function refreshDisputes(itemId) {
  const open = await db.query("SELECT id FROM claims WHERE item_id = ? AND kind = 'ownership' AND status IN ('pending','under_review','approved')", [itemId]);
  if (open.length > 1) {
    const already = await db.one("SELECT COUNT(*) AS n FROM claims WHERE item_id = ? AND disputed = 1 AND status IN ('pending','under_review','approved')", [itemId]);
    await db.query("UPDATE claims SET disputed = 1 WHERE id IN (?)", [open.map((c) => c.id)]);
    if (already.n < open.length)
      await notify.sendAdmins("system", "admin_disputed", { n: open.length, title: (await db.one("SELECT title FROM items WHERE id = ?", [itemId]))?.title || "#" + itemId }, "/admin/claims");
  }
}

router.post("/items/:id/claims", requireAuth, claimLimiter, async (req, res) => {
  const itemId = intParam(req.params.id);
  const item = await loadItem(itemId);
  if (!canView(item, req.user) || item.status !== "active") fail(409, "This report isn't accepting requests right now");
  if (item.user_id === req.user.id) fail(409, "This is your own report");
  const kind = item.type === "found" ? "ownership" : "finder";
  const data = check(req.body)
    .text("message", { required: true, min: 10, max: 1000, label: "Message", multiline: true })
    .text("proof", { required: kind === "ownership", min: 10, max: 1000, label: kind === "ownership" ? "Ownership details" : "Where and how you found it", multiline: true })
    .number("match_id", { min: 1 })
    .done();

  const existing = await db.one("SELECT id FROM claims WHERE item_id = ? AND claimant_id = ? AND status IN ('pending','under_review','approved')", [itemId, req.user.id]);
  if (existing) fail(409, "You already have an open request for this item", { message: "You already have an open request for this item" });

  let matchId = null;
  if (data.match_id) {
    const col = item.type === "found" ? "found_item_id" : "lost_item_id";
    const mine = item.type === "found" ? "lost_item_id" : "found_item_id";
    const m = await db.one(`SELECT m.id FROM matches m JOIN items mi ON mi.id = m.${mine} WHERE m.id = ? AND m.${col} = ? AND mi.user_id = ?`, [data.match_id, itemId, req.user.id]);
    if (m) matchId = m.id;
  }
  const requiresAdmin = item.is_valuable || SENSITIVE_CATEGORIES.includes(item.category) ? 1 : 0;

  const claimId = await db.transaction(async (conn) => {
    const r = await conn.q("INSERT INTO claims (item_id, claimant_id, kind, match_id, message, proof, requires_admin) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      itemId, req.user.id, kind, matchId, data.message, data.proof, requiresAdmin,
    ]);
    await addEvent(conn, r.insertId, req.user.id, null, "pending", kind === "ownership" ? "Ownership request sent" : "Finder response sent");
    return r.insertId;
  });
  await audit.log(req, "claim.create", "claim", claimId, { item_id: itemId, kind });
  if (item.user_id)
    await notify.send(item.user_id, "claim", kind === "ownership" ? "claim_ownership" : "claim_finder", { title: item.title }, `/claims/${claimId}`);
  if (kind === "ownership") await refreshDisputes(itemId);
  res.status(201).json({ id: claimId, requires_admin: !!requiresAdmin });
});

async function loadClaim(id, user) {
  const claim = await db.one(
    `SELECT c.*, i.user_id AS owner_id, i.title AS item_title, i.type AS item_type
       FROM claims c JOIN items i ON i.id = c.item_id WHERE c.id = ?`,
    [id]
  );
  if (!claim) fail(404, "Request not found");
  const role = claim.claimant_id === user.id ? "claimant" : claim.owner_id === user.id ? "owner" : isAdmin(user) ? "admin" : null;
  if (!role) fail(404, "Request not found");
  return { claim, role };
}

// What the viewer may do next, used by the UI to show the right buttons.
function actionsFor(claim, role, user) {
  const a = [];
  if (FINAL.includes(claim.status)) {
    if (role === "claimant" && claim.status === "rejected" && !claim.disputed) a.push("dispute");
    if (isAdmin(user) && claim.status === "rejected") a.push("under_review");
    return a;
  }
  const admin = isAdmin(user);
  if (role === "owner" || admin) {
    if (claim.status === "pending") a.push("under_review");
    if (["pending", "under_review"].includes(claim.status)) {
      if (!claim.requires_admin || admin || !claim.owner_approved) a.push("approved");
      a.push("rejected");
    }
    if (claim.status === "approved") a.push("returned");
  }
  if (role === "claimant") {
    if (claim.status === "approved") a.push("returned");
    a.push("cancelled");
  }
  if (admin && claim.disputed) a.push("resolve_dispute");
  return [...new Set(a)];
}

function shape(claim, role, user) {
  return {
    id: claim.id,
    item_id: claim.item_id,
    kind: claim.kind,
    status: claim.status,
    status_label: STATUS_TEXT(claim.status),
    message: claim.message,
    proof: claim.proof,
    requires_admin: !!claim.requires_admin,
    owner_approved: !!claim.owner_approved,
    disputed: !!claim.disputed,
    match_id: claim.match_id,
    role,
    actions: actionsFor(claim, role, user),
    created_at: claim.created_at,
    updated_at: claim.updated_at,
  };
}

router.get("/claims", requireAuth, async (req, res) => {
  const box = ["incoming", "outgoing"].includes(req.query.box) ? req.query.box : "all";
  const where = box === "incoming" ? "i.user_id = ?" : box === "outgoing" ? "c.claimant_id = ?" : "(i.user_id = ? OR c.claimant_id = ?)";
  const params = box === "all" ? [req.user.id, req.user.id] : [req.user.id];
  const rows = await db.query(
    `SELECT c.*, i.user_id AS owner_id, i.title AS item_title, i.type AS item_type,
            cu.username AS claimant_username, cu.full_name AS claimant_full_name,
            ou.username AS owner_username, ou.full_name AS owner_full_name,
            (SELECT MAX(created_at) FROM messages WHERE claim_id = c.id) AS last_message_at,
            (SELECT p.filename FROM item_photos p WHERE p.item_id = i.id ORDER BY p.sort_order, p.id LIMIT 1) AS photo
       FROM claims c JOIN items i ON i.id = c.item_id
       JOIN users cu ON cu.id = c.claimant_id LEFT JOIN users ou ON ou.id = i.user_id
      WHERE ${where} ORDER BY COALESCE(c.updated_at, c.created_at) DESC LIMIT 200`,
    params
  );
  const { photoUrls } = require("../uploads");
  res.json({
    claims: rows.map((c) => {
      const role = c.claimant_id === req.user.id ? "claimant" : "owner";
      const s = shape(c, role, req.user);
      delete s.proof;
      return {
        ...s,
        item: { id: c.item_id, title: c.item_title, type: c.item_type, thumb: c.photo ? photoUrls(c.photo).thumb : null },
        other: role === "claimant"
          ? present.displayName({ username: c.owner_username, full_name: c.owner_full_name })
          : present.displayName({ username: c.claimant_username, full_name: c.claimant_full_name }),
        last_message_at: c.last_message_at,
      };
    }),
  });
});

router.get("/claims/:id", requireAuth, async (req, res) => {
  const { claim, role } = await loadClaim(intParam(req.params.id), req.user);
  const item = await loadItem(claim.item_id);
  const photos = (await present.photosFor([item.id])).get(item.id);
  const events = await db.query(
    `SELECT e.id, e.from_status, e.to_status, e.note, e.created_at, u.username, u.full_name, u.role, e.actor_id
       FROM claim_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.claim_id = ? ORDER BY e.id`,
    [claim.id]
  );
  const messages = await db.query(
    `SELECT m.id, m.body, m.created_at, m.sender_id, u.username, u.full_name, u.role
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.claim_id = ? ORDER BY m.id`,
    [claim.id]
  );
  const claimant = await db.one("SELECT username, full_name FROM users WHERE id = ?", [claim.claimant_id]);
  const owner = item.user_id ? await db.one("SELECT username, full_name FROM users WHERE id = ?", [item.user_id]) : null;
  const who = (row) => {
    const id = row.sender_id ?? row.actor_id;
    if (id === req.user.id) return i18n.tr("You");
    if (id === claim.claimant_id) return present.displayName(claimant);
    if (id === claim.owner_id) return present.displayName(owner);
    return row.role === "admin" ? i18n.tr("Administrator") : present.displayName(row);
  };

  res.json({
    claim: shape(claim, role, req.user),
    item: present.item(item, photos, req.user),
    people: { claimant: present.displayName(claimant), owner: present.displayName(owner) },
    events: events.map((e) => ({ id: e.id, from: e.from_status, to: e.to_status, label: STATUS_TEXT(e.to_status), note: i18n.tr(e.note), by: e.actor_id ? who(e) : i18n.tr("System"), at: e.created_at })),
    messages: messages.map((m) => ({ id: m.id, body: m.body, at: m.created_at, mine: m.sender_id === req.user.id, by: who(m) })),
    can_message: !FINAL.includes(claim.status),
  });
});

async function finishReturn(claim, actorId) {
  const item = await loadItem(claim.item_id);
  await db.query("UPDATE items SET status = ? WHERE id = ?", [item.type === "found" ? "returned" : "resolved", item.id]);
  // Other open requests on the same item can't succeed any more.
  const others = await db.query("SELECT id, claimant_id, status FROM claims WHERE item_id = ? AND id <> ? AND status IN ('pending','under_review','approved')", [item.id, claim.id]);
  for (const o of others) {
    await db.query("UPDATE claims SET status = 'rejected', disputed = 0 WHERE id = ?", [o.id]);
    await addEvent(db.pool, o.id, actorId, o.status, "rejected", "The item was returned through another request");
    await notify.send(o.claimant_id, "status", "claim_closed_other", { title: item.title }, `/claims/${o.id}`);
  }
  await db.query("UPDATE claims SET disputed = 0 WHERE id = ?", [claim.id]);
  if (claim.match_id) {
    const m = await db.one("SELECT * FROM matches WHERE id = ?", [claim.match_id]);
    if (m) {
      await db.query("UPDATE matches SET status = 'confirmed' WHERE id = ?", [m.id]);
      await db.query("UPDATE items SET status = 'resolved' WHERE id = ? AND status = 'active'", [m.lost_item_id]);
      await db.query("UPDATE items SET status = 'returned' WHERE id = ? AND status = 'active'", [m.found_item_id]);
    }
  }
  await matching.runForItem(item.id, { notifyUsers: false });
}

router.post("/claims/:id/status", requireAuth, async (req, res) => {
  const { claim, role } = await loadClaim(intParam(req.params.id), req.user);
  const to = String(req.body.status || "");
  const note = req.body.note ? String(req.body.note).trim().slice(0, 500) : null;
  const allowed = actionsFor(claim, role, req.user);

  if (to === "resolve_dispute") {
    if (!allowed.includes("resolve_dispute")) fail(403, "Not allowed");
    await db.query("UPDATE claims SET disputed = 0 WHERE id = ?", [claim.id]);
    await addEvent(db.pool, claim.id, req.user.id, claim.status, claim.status, note || "Dispute reviewed by an administrator");
    await audit.log(req, "claim.dispute_resolved", "claim", claim.id);
    return res.json({ ok: true });
  }
  if (!allowed.includes(to)) fail(403, "You can't change this request to that status");
  if (to === "rejected" && role !== "claimant" && !note) fail(422, "Please add a short reason", { note: "Please add a short reason for the other person" });

  let next = to;
  let eventNote = note;
  // Owner approves a valuable item: still needs an administrator.
  if (to === "approved" && claim.requires_admin && !isAdmin(req.user)) {
    next = "under_review";
    eventNote = (note ? note + " — " : "") + "Approved by the item's reporter, waiting for administrator verification";
    await db.query("UPDATE claims SET owner_approved = 1 WHERE id = ?", [claim.id]);
    await notify.sendAdmins("claim", "admin_valuable", { id: claim.id, title: claim.item_title }, `/claims/${claim.id}`);
  }
  await db.query("UPDATE claims SET status = ? WHERE id = ?", [next, claim.id]);
  await addEvent(db.pool, claim.id, req.user.id, claim.status, next, eventNote);
  await audit.log(req, "claim.status", "claim", claim.id, { from: claim.status, to: next, as: role });
  if (next === "returned") await finishReturn(claim, req.user.id);

  const recipients = new Set([claim.claimant_id, claim.owner_id].filter((id) => id && id !== req.user.id));
  for (const uid of recipients)
    await notify.send(uid, "status", "claim_status", { title: claim.item_title, status_code: next, note: eventNote || "" }, `/claims/${claim.id}`);
  res.json({ ok: true, status: next });
});

router.post("/claims/:id/dispute", requireAuth, async (req, res) => {
  const { claim, role } = await loadClaim(intParam(req.params.id), req.user);
  if (!actionsFor(claim, role, req.user).includes("dispute")) fail(403, "This request can't be disputed");
  const { reason } = check(req.body).text("reason", { required: true, min: 10, max: 500, label: "Reason", multiline: true }).done();
  await db.query("UPDATE claims SET disputed = 1 WHERE id = ?", [claim.id]);
  await addEvent(db.pool, claim.id, req.user.id, claim.status, claim.status, "Asked an administrator to review: " + reason);
  await audit.log(req, "claim.dispute", "claim", claim.id);
  await notify.sendAdmins("claim", "admin_dispute", { id: claim.id, title: claim.item_title }, `/claims/${claim.id}`);
  res.json({ ok: true });
});

router.post("/claims/:id/messages", requireAuth, messageLimiter, async (req, res) => {
  const { claim, role } = await loadClaim(intParam(req.params.id), req.user);
  if (FINAL.includes(claim.status)) fail(409, "This conversation is closed");
  const { body } = check(req.body).text("body", { required: true, max: 2000, label: "Message", multiline: true }).done();
  const r = await db.query("INSERT INTO messages (claim_id, sender_id, body) VALUES (?, ?, ?)", [claim.id, req.user.id, body]);
  await db.query("UPDATE claims SET updated_at = NOW() WHERE id = ?", [claim.id]);
  const to = role === "claimant" ? [claim.owner_id] : role === "owner" ? [claim.claimant_id] : [claim.owner_id, claim.claimant_id];
  for (const uid of to.filter(Boolean))
    await notify.send(uid, "message", "message_new", { title: claim.item_title, snippet: body.slice(0, 140) }, `/claims/${claim.id}`);
  res.status(201).json({ id: r.insertId });
});

module.exports = { router, STATUS_TEXT };
