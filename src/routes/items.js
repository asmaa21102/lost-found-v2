const express = require("express");
const limiter = require("../limit");
const db = require("../db");
const ai = require("../ai");
const audit = require("../audit");
const notify = require("../notify");
const present = require("../present");
const pipeline = require("../pipeline");
const photoIndex = require("../photo-index");
const matching = require("../matching");
const uploads = require("../uploads");
const config = require("../config");
const i18n = require("../i18n");
const { requireAuth, isAdmin } = require("../auth");
const { check, fail, intParam } = require("../http");
const { CATEGORIES, COLORS, CATEGORY_SLUGS, COLOR_SLUGS, ascii } = require("../taxonomy");

const router = express.Router();

const PUBLIC_STATUSES = ["active", "returned", "resolved"];

const reportLimiter = limiter({ minutes: 60, limit: 12, key: "u", message: "You've posted many reports in a short time. Please wait a bit before posting more." });

// ── Meta and public stats ───────────────────────────────────────────────

router.get("/meta", (req, res) => {
  res.json({
    categories: CATEGORIES.map(({ slug, label, icon }) => ({ slug, label: i18n.categoryLabel(slug, label), icon })),
    colors: COLORS.map(({ slug, label, hex }) => ({ slug, label: i18n.colorLabel(slug, label), hex })),
    limits: { photos: config.limits.photosPerReport, photoMb: config.limits.photoBytes / 1024 / 1024 },
    ai: { status: ai.state.status, photos: photoIndex.size() },
    demo: process.env.DEMO_MODE !== "0", // shows the demo accounts on the sign-in page
  });
});

// Attribution for the Wikimedia Commons photos used by the demo data.
router.get("/credits", (req, res) => {
  const file = require("path").join(config.root, "demo", "photos", "CREDITS.json");
  let credits = {};
  try {
    credits = JSON.parse(require("fs").readFileSync(file, "utf8"));
  } catch {
    /* no demo photos */
  }
  res.json({ photos: Object.values(credits) });
});

router.get("/stats", async (req, res) => {
  const s = await db.one(`SELECT
      SUM(status IN ('active','returned','resolved','closed')) AS total,
      SUM(status = 'active') AS active,
      SUM(status IN ('returned','resolved')) AS returned,
      SUM(status = 'active' AND type = 'lost') AS active_lost,
      SUM(status = 'active' AND type = 'found') AS active_found
    FROM items`);
  const m = await db.one("SELECT COUNT(*) AS n FROM matches WHERE status <> 'dismissed'");
  res.json({
    total: Number(s.total || 0),
    active: Number(s.active || 0),
    returned: Number(s.returned || 0),
    active_lost: Number(s.active_lost || 0),
    active_found: Number(s.active_found || 0),
    matches: m.n,
  });
});

// ── Browse and search ──────────────────────────────────────────────────

const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

function filters(q) {
  const where = [];
  const params = [];
  const statuses = q.status === "all" ? PUBLIC_STATUSES : q.status === "returned" ? ["returned", "resolved"] : ["active"];
  where.push("i.status IN (?)");
  params.push(statuses);
  if (q.type === "lost" || q.type === "found") {
    where.push("i.type = ?");
    params.push(q.type);
  }
  const cats = list(q.category).filter((c) => CATEGORY_SLUGS.has(c));
  if (cats.length) {
    where.push("i.category IN (?)");
    params.push(cats);
  }
  const colors = list(q.color).filter((c) => COLOR_SLUGS.has(c));
  if (colors.length) {
    where.push("i.color IN (?)");
    params.push(colors);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || "")) {
    where.push("i.event_date >= ?");
    params.push(q.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) {
    where.push("i.event_date <= ?");
    params.push(q.to);
  }
  if (q.location) {
    where.push("i.location_name LIKE ?");
    params.push(`%${String(q.location).slice(0, 80)}%`);
  }
  if (q.photos === "1") where.push("EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = i.id)");
  return { where, params };
}

// Keyword relevance in SQL (FULLTEXT + LIKE); when the AI is ready, photos that fit an
// English query ("black leather wallet") add a semantic boost and can surface reports
// that don't use the same words.
async function relevanceRank(q, where, params) {
  const words = [...new Set(ascii(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 2))].slice(0, 8);
  const like = `%${q}%`;
  const boolean = words.filter((w) => w.length >= 3).map((w) => w + "*").join(" ");
  const kwSql = `
    SELECT i.id,
      (${boolean ? "COALESCE(MATCH(i.title, i.description, i.brand) AGAINST (? IN BOOLEAN MODE), 0) * 2 +" : ""}
       (i.title LIKE ?) * 4 + (COALESCE(i.brand, '') LIKE ?) * 2 + (COALESCE(i.location_name, '') LIKE ?) * 1 + (i.description LIKE ?) * 1
       ${words.map(() => "+ (i.title LIKE ?) * 1.5 + (i.description LIKE ?) * 0.5").join(" ")}) AS kw
    FROM items i
    WHERE ${where.join(" AND ")}`;
  const kwParams = [
    ...(boolean ? [boolean] : []),
    like, like, like, like,
    ...words.flatMap((w) => [`%${w}%`, `%${w}%`]),
    ...params,
  ];
  const rows = await db.query(kwSql, kwParams);
  for (const r of rows) r.kw = Number(r.kw) || 0; // DECIMAL arrives as a string
  const maxKw = Math.max(0, ...rows.map((r) => r.kw));

  let semantic = new Map();
  if (ai.isReady()) {
    try {
      const vec = await ai.embedText(`a photo of ${q}`);
      semantic = photoIndex.scoreItems(vec);
    } catch {
      /* keyword ranking still works */
    }
  }
  // CLIP text↔photo cosine: ~0.20 unrelated, ~0.30+ a good fit.
  const sem = (id) => Math.max(0, Math.min(1, ((semantic.get(id) ?? 0) - 0.22) / 0.1));

  return rows
    .map((r) => ({ id: r.id, kw: maxKw ? r.kw / maxKw : 0, sem: sem(r.id) }))
    .map((r) => ({ ...r, score: semantic.size ? 0.65 * r.kw + 0.35 * r.sem : r.kw }))
    .filter((r) => r.kw > 0 || r.sem >= 0.6)
    .sort((a, b) => b.score - a.score);
}

router.get("/items", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const perPage = Math.min(48, Math.max(1, Number(req.query.per_page) || 12));
  const page = Math.max(1, Number(req.query.page) || 1);
  const sort = ["newest", "oldest", "relevance", "date"].includes(req.query.sort) ? req.query.sort : q ? "relevance" : "newest";
  const { where, params } = filters(req.query);

  let ids;
  let total;
  let relevance = null;
  if (q) {
    const ranked = await relevanceRank(q, where, params);
    relevance = new Map(ranked.map((r) => [r.id, r]));
    total = ranked.length;
    if (sort === "relevance") ids = ranked.slice((page - 1) * perPage, page * perPage).map((r) => r.id);
    else {
      const order = sort === "oldest" ? "i.created_at ASC" : sort === "date" ? "i.event_date DESC, i.id DESC" : "i.created_at DESC";
      const all = ranked.length ? (await db.query(`SELECT id FROM items i WHERE id IN (?) ORDER BY ${order}`, [ranked.map((r) => r.id)])).map((r) => r.id) : [];
      ids = all.slice((page - 1) * perPage, page * perPage);
    }
  } else {
    const order = sort === "oldest" ? "i.created_at ASC, i.id ASC" : sort === "date" ? "i.event_date DESC, i.id DESC" : "i.created_at DESC, i.id DESC";
    total = (await db.one(`SELECT COUNT(*) AS n FROM items i WHERE ${where.join(" AND ")}`, params)).n;
    ids = (await db.query(`SELECT i.id FROM items i WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage])).map((r) => r.id);
  }

  const rows = ids.length ? await db.query(`${present.ITEM_SELECT} WHERE i.id IN (?)`, [ids]) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const saved = req.user && ids.length ? new Set((await db.query("SELECT item_id FROM saved_items WHERE user_id = ? AND item_id IN (?)", [req.user.id, ids])).map((r) => r.item_id)) : new Set();
  const items = await present.items(ordered, req.user, (r) => ({
    saved: saved.has(r.id),
    ...(relevance ? { relevance: Math.round(relevance.get(r.id).score * 100), ai_boost: relevance.get(r.id).sem >= 0.5 } : {}),
  }));
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / perPage)), per_page: perPage, sort, ai: ai.isReady() });
});

router.get("/items/map", async (req, res) => {
  const { where, params } = filters(req.query);
  where.push("i.latitude IS NOT NULL");
  const rows = await db.query(`${present.ITEM_SELECT} WHERE ${where.join(" AND ")} ORDER BY i.created_at DESC LIMIT 1000`, params);
  const photos = await present.photosFor(rows.map((r) => r.id));
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      category: r.category,
      color: r.color,
      status: r.status,
      event_date: r.event_date,
      location_name: r.location_name,
      location: present.approximate(r.latitude, r.longitude, r.id),
      thumb: photos.get(r.id)?.[0]?.thumb || null,
    })),
  });
});

// ── Photo search and suggestions (AI) ──────────────────────────────────

const aiLimiter = limiter({ minutes: 10, limit: 40, message: "Too many photo searches. Please wait a few minutes." });

function requireAi() {
  if (!config.ai.enabled) fail(503, "Photo search is turned off on this server");
  if (ai.state.status === "error") fail(503, "The AI model could not be loaded: " + ai.state.error);
  if (!ai.isReady()) fail(503, "The AI model is still starting up. Try again in a few seconds.");
}

// CLIP cosine between photos of different objects is usually below ~0.66 (measured on
// the demo photos); photos of the same kind of object mostly fall between 0.62 and 0.9.
const PHOTO_SEARCH_MIN = 0.62;
const closeness = (cos) => (cos >= 0.78 ? "very" : cos >= 0.68 ? "similar" : "somewhat");

router.get("/ai/status", (req, res) => res.json({ ...ai.state, photos: photoIndex.size() }));

router.post("/ai/analyze", aiLimiter, ...uploads.single("photo"), async (req, res) => {
  if (!req.file) fail(422, "Choose a photo first");
  requireAi();
  await uploads.inspect(req.file.buffer);
  const vec = await ai.embedImage(req.file.buffer);
  res.json(ai.suggestFromVector(vec));
});

router.post("/search/image", aiLimiter, ...uploads.single("photo"), async (req, res) => {
  if (!req.file) fail(422, "Choose a photo to search with");
  requireAi();
  await uploads.inspect(req.file.buffer);
  const vec = await ai.embedImage(req.file.buffer);
  const scores = photoIndex.scoreItems(vec);
  const { where, params } = filters(req.query);
  const candidates = scores.size ? await db.query(`SELECT i.id FROM items i WHERE ${where.join(" AND ")} AND i.id IN (?)`, [...params, [...scores.keys()]]) : [];
  const ranked = candidates
    .map((r) => ({ id: r.id, cos: scores.get(r.id) }))
    .filter((r) => r.cos >= PHOTO_SEARCH_MIN)
    .sort((a, b) => b.cos - a.cos)
    .slice(0, 24);
  const rows = ranked.length ? await db.query(`${present.ITEM_SELECT} WHERE i.id IN (?)`, [ranked.map((r) => r.id)]) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = await present.items(
    ranked.map((r) => byId.get(r.id)).filter(Boolean),
    req.user,
    (r) => {
      const cos = scores.get(r.id);
      return { similarity: Math.round(cos * 100), closeness: closeness(cos) };
    }
  );
  res.json({ items, suggestions: ai.suggestFromVector(vec) });
});

// ── One report ─────────────────────────────────────────────────────────

async function loadItem(id) {
  const row = await db.one(`${present.ITEM_SELECT} WHERE i.id = ?`, [id]);
  if (!row) fail(404, "This report doesn't exist or was removed");
  return row;
}

function canView(row, user) {
  if (PUBLIC_STATUSES.includes(row.status)) return true;
  return present.canManage(row, user);
}

async function similarTo(row, viewer) {
  const others = await db.query(
    `${present.ITEM_SELECT} WHERE i.status = 'active' AND i.id <> ? AND (i.category = ? OR i.color = ?) ORDER BY i.created_at DESC LIMIT 60`,
    [row.id, row.category, row.color]
  );
  const vecs = photoIndex.vectorsForItem(row.id);
  const scored = others
    .map((o) => {
      const [lost, found] = row.type === "lost" ? [row, o] : [o, row];
      const ov = photoIndex.vectorsForItem(o.id);
      const cos = vecs.length && ov.length ? photoIndex.bestPairCosine(vecs, ov) : null;
      return { o, score: matching.scorePair(lost, found, cos).score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  return present.items(scored.map((s) => s.o), viewer);
}

router.get("/items/:id", async (req, res) => {
  const id = intParam(req.params.id);
  const row = await loadItem(id);
  if (!canView(row, req.user)) fail(404, "This report doesn't exist or was removed");
  if (!req.user || req.user.id !== row.user_id) await db.query("UPDATE items SET views = views + 1 WHERE id = ?", [id]);

  const [photos] = [(await present.photosFor([id])).get(id)];
  const extra = {};
  if (req.user) {
    extra.saved = !!(await db.one("SELECT 1 FROM saved_items WHERE user_id = ? AND item_id = ?", [req.user.id, id]));
    extra.my_claim = await db.one("SELECT id, status FROM claims WHERE item_id = ? AND claimant_id = ? AND status NOT IN ('cancelled') ORDER BY id DESC LIMIT 1", [id, req.user.id]);
  }
  const item = present.item(row, photos, req.user, extra);
  if (item.can_manage) {
    item.views = row.views;
    item.claims = await db.query("SELECT status, COUNT(*) AS n FROM claims WHERE item_id = ? GROUP BY status", [id]);
    const col = row.type === "lost" ? "lost_item_id" : "found_item_id";
    const other = row.type === "lost" ? "found_item_id" : "lost_item_id";
    const ms = await db.query(`SELECT id, ${other} AS other_id, score, reasons, status FROM matches WHERE ${col} = ? AND status <> 'dismissed' ORDER BY score DESC LIMIT 6`, [id]);
    const others = ms.length ? await db.query(`${present.ITEM_SELECT} WHERE i.id IN (?)`, [ms.map((m) => m.other_id)]) : [];
    const shown = await present.items(others, req.user);
    item.matches = ms.map((m) => ({ id: m.id, score: m.score, status: m.status, reasons: i18n.reasons(m.reasons), strength: matching.strength(m.score), item: shown.find((s) => s.id === m.other_id) })).filter((m) => m.item);
  }
  res.json({ item, similar: await similarTo(row, req.user) });
});

// ── Create / edit / delete ─────────────────────────────────────────────

function readReport(body, { partial = false } = {}) {
  const c = check(body);
  if (!partial) c.oneOf("type", ["lost", "found"], { required: true, label: "Report type" });
  return c
    .text("title", { required: true, min: 3, max: 120, label: "Item name" })
    .oneOf("category", CATEGORY_SLUGS, { required: true, label: "Category" })
    .oneOf("color", COLOR_SLUGS, { label: "Color" })
    .text("brand", { max: 100, label: "Brand" })
    .text("description", { required: true, min: 10, max: 2000, label: "Description", multiline: true })
    .date("event_date", { required: true, label: "Date" })
    .text("location_name", { required: true, min: 2, max: 255, label: "Location" })
    .number("latitude", { min: -90, max: 90, label: "Latitude" })
    .number("longitude", { min: -180, max: 180, label: "Longitude" })
    .bool("is_valuable")
    .text("private_details", { max: 1000, label: "Private details", multiline: true })
    .done();
}

// Reports that look like spam or contain contact details wait for an administrator.
function needsReview(data) {
  const text = `${data.title} ${data.description} ${data.location_name}`;
  if (/https?:\/\/|www\.|\.com\b/i.test(text)) return "Contains a link";
  if (/(\+?\d[\d\s-]{8,}\d)/.test(text)) return "Contains a phone number (keep contact details private)";
  if (/@[a-z0-9-]+\.[a-z]{2,}/i.test(text)) return "Contains an email address";
  return null;
}

async function moderationMode() {
  return (await db.one("SELECT value FROM settings WHERE name = 'moderation_mode'"))?.value || "post";
}

router.post("/items", requireAuth, reportLimiter, ...uploads.many("photos"), async (req, res) => {
  if (req.body.website) fail(422, "Report could not be saved"); // honeypot
  const data = readReport(req.body);
  if ((data.latitude == null) !== (data.longitude == null)) fail(422, "Please fix the highlighted fields", { location_name: "Pick the place on the map again" });
  const files = req.files || [];

  const dup = await db.one(
    "SELECT id FROM items WHERE user_id = ? AND type = ? AND LOWER(title) = LOWER(?) AND status NOT IN ('removed','closed') AND created_at > NOW() - INTERVAL 1 DAY",
    [req.user.id, data.type, data.title]
  );
  if (dup) fail(409, "You already reported this item today. Edit the existing report instead.", { title: "Duplicate of a report you posted today" });

  for (const f of files) await uploads.inspect(f.buffer);
  const held = needsReview(data) || ((await moderationMode()) === "pre" && !isAdmin(req.user) ? "Waiting for approval" : null);

  const r = await db.query(
    `INSERT INTO items (user_id, type, title, category, color, brand, description, event_date, location_name, latitude, longitude, is_valuable, private_details, status, moderation_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, data.type, data.title, data.category, data.color, data.brand, data.description, data.event_date, data.location_name,
     data.latitude, data.longitude, data.is_valuable ? 1 : 0, data.private_details, held ? "pending_review" : "active", held]
  );
  const id = r.insertId;
  for (const [i, f] of files.entries()) {
    const p = await uploads.savePhoto(f.buffer);
    await db.query("INSERT INTO item_photos (item_id, filename, width, height, sort_order) VALUES (?, ?, ?, ?, ?)", [id, p.filename, p.width, p.height, i]);
  }
  await audit.log(req, "item.create", "item", id, { type: data.type, held });
  if (held) await notify.sendAdmins("system", "admin_held", { title: data.title, reason: held }, "/admin/reports");

  const matches = held ? [] : await pipeline.afterSave(id);
  const row = await loadItem(id);
  const item = present.item(row, (await present.photosFor([id])).get(id), req.user);
  res.status(201).json({ item, held: i18n.tr(held), matches: matches.length, top_score: matches.reduce((m, x) => Math.max(m, x.score), 0) });
});

router.patch("/items/:id", requireAuth, ...uploads.many("photos"), async (req, res) => {
  const id = intParam(req.params.id);
  const row = await loadItem(id);
  if (!present.canManage(row, req.user)) fail(403, "You can only edit your own reports");
  if (row.status === "removed" && !isAdmin(req.user)) fail(403, "This report was removed by an administrator");
  const data = readReport(req.body, { partial: true });

  const remove = list(req.body.remove_photo_ids).map(Number).filter(Number.isInteger);
  const current = await db.query("SELECT id, filename FROM item_photos WHERE item_id = ?", [id]);
  const keep = current.filter((p) => !remove.includes(p.id));
  const files = req.files || [];
  if (keep.length + files.length > config.limits.photosPerReport)
    fail(422, "Too many photos", { photos: `A report can have up to ${config.limits.photosPerReport} photos` });
  for (const f of files) await uploads.inspect(f.buffer);

  const held = needsReview(data);
  await db.query(
    `UPDATE items SET title = ?, category = ?, color = ?, brand = ?, description = ?, event_date = ?, location_name = ?,
       latitude = ?, longitude = ?, is_valuable = ?, private_details = ?
       ${held && row.status === "active" && !isAdmin(req.user) ? ", status = 'pending_review', moderation_note = ?" : ""}
     WHERE id = ?`,
    [data.title, data.category, data.color, data.brand, data.description, data.event_date, data.location_name,
     data.latitude, data.longitude, data.is_valuable ? 1 : 0, data.private_details,
     ...(held && row.status === "active" && !isAdmin(req.user) ? [held] : []), id]
  );
  for (const p of current.filter((p) => remove.includes(p.id))) {
    await db.query("DELETE FROM item_photos WHERE id = ?", [p.id]);
    photoIndex.remove(p.id);
    await uploads.deletePhoto(p.filename);
  }
  const maxOrder = (await db.one("SELECT COALESCE(MAX(sort_order), -1) AS m FROM item_photos WHERE item_id = ?", [id])).m;
  for (const [i, f] of files.entries()) {
    const p = await uploads.savePhoto(f.buffer);
    await db.query("INSERT INTO item_photos (item_id, filename, width, height, sort_order) VALUES (?, ?, ?, ?, ?)", [id, p.filename, p.width, p.height, maxOrder + 1 + i]);
  }
  await audit.log(req, "item.update", "item", id, req.user.id !== row.user_id ? { by_admin: true } : null);
  const matches = await pipeline.afterSave(id);
  const fresh = await loadItem(id);
  res.json({ item: present.item(fresh, (await present.photosFor([id])).get(id), req.user), matches: matches.length });
});

const OWNER_STATUSES = { lost: ["active", "resolved", "closed"], found: ["active", "returned", "closed"] };

router.post("/items/:id/status", requireAuth, async (req, res) => {
  const id = intParam(req.params.id);
  const row = await loadItem(id);
  if (!present.canManage(row, req.user)) fail(403, "You can only change your own reports");
  const status = String(req.body.status || "");
  if (!OWNER_STATUSES[row.type].includes(status)) fail(422, "That status isn't allowed for this report");
  if (["removed", "pending_review"].includes(row.status) && !isAdmin(req.user)) fail(403, "An administrator has to review this report first");
  await db.query("UPDATE items SET status = ? WHERE id = ?", [status, id]);
  await audit.log(req, "item.status", "item", id, { from: row.status, to: status });
  await matching.runForItem(id, { notifyUsers: status === "active" });
  res.json({ ok: true, status });
});

router.delete("/items/:id", requireAuth, async (req, res) => {
  const id = intParam(req.params.id);
  const row = await loadItem(id);
  if (!present.canManage(row, req.user)) fail(403, "You can only delete your own reports");
  const busy = await db.one("SELECT COUNT(*) AS n FROM claims WHERE item_id = ? AND status IN ('under_review','approved')", [id]);
  if (busy.n && !isAdmin(req.user)) fail(409, "A return request for this item is in progress. Close the report instead of deleting it.");
  const photos = await db.query("SELECT id, filename FROM item_photos WHERE item_id = ?", [id]);
  await db.query("DELETE FROM items WHERE id = ?", [id]);
  for (const p of photos) {
    photoIndex.remove(p.id);
    await uploads.deletePhoto(p.filename);
  }
  await audit.log(req, "item.delete", "item", id, { title: row.title, type: row.type });
  res.json({ deleted: true });
});

router.post("/items/:id/save", requireAuth, async (req, res) => {
  const id = intParam(req.params.id);
  const row = await loadItem(id);
  if (!canView(row, req.user)) fail(404, "Not found");
  const exists = await db.one("SELECT 1 FROM saved_items WHERE user_id = ? AND item_id = ?", [req.user.id, id]);
  if (exists) await db.query("DELETE FROM saved_items WHERE user_id = ? AND item_id = ?", [req.user.id, id]);
  else await db.query("INSERT INTO saved_items (user_id, item_id) VALUES (?, ?)", [req.user.id, id]);
  res.json({ saved: !exists });
});

module.exports = { router, loadItem, canView };
