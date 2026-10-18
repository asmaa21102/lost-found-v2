// Turns database rows into what each viewer may see. Public listings never include
// email, phone, private verification details or the exact map position.
const crypto = require("crypto");
const db = require("./db");
const { photoUrls } = require("./uploads");
const { isAdmin } = require("./auth");
const i18n = require("./i18n");

const PUBLIC_RADIUS_M = 300;

function displayName(user) {
  if (!user) return i18n.tr("Anonymous");
  const full = (user.full_name || "").trim();
  if (full) {
    const [first, ...rest] = full.split(/\s+/);
    return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
  }
  return user.username;
}

// Rounds to ~100 m and shifts by a stable pseudo-random offset (up to ~250 m) so the
// public pin shows the area, not the spot. The same item always gets the same offset.
function approximate(lat, lng, seed) {
  if (lat == null || lng == null) return null;
  const h = crypto.createHash("sha256").update("loc:" + seed).digest();
  const off = (b) => ((b / 255) * 2 - 1) * 0.0022;
  return {
    lat: Number((Math.round(Number(lat) * 1000) / 1000 + off(h[0])).toFixed(5)),
    lng: Number((Math.round(Number(lng) * 1000) / 1000 + off(h[1])).toFixed(5)),
    radius_m: PUBLIC_RADIUS_M,
  };
}

async function photosFor(itemIds) {
  const map = new Map(itemIds.map((id) => [id, []]));
  if (!itemIds.length) return map;
  const rows = await db.query("SELECT id, item_id, filename, width, height FROM item_photos WHERE item_id IN (?) ORDER BY sort_order, id", [itemIds]);
  for (const r of rows) map.get(r.item_id)?.push({ id: r.id, ...photoUrls(r.filename), width: r.width, height: r.height });
  return map;
}

const canManage = (item, viewer) => !!viewer && (item.user_id === viewer.id || isAdmin(viewer));

// `row` may carry owner_username / owner_full_name from a join.
function item(row, photos = [], viewer = null, extra = {}) {
  const manage = canManage(row, viewer);
  const out = {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    color: row.color,
    brand: row.brand,
    description: row.description,
    event_date: row.event_date,
    location_name: row.location_name,
    location: approximate(row.latitude, row.longitude, row.id),
    status: row.status,
    is_valuable: !!row.is_valuable,
    photos,
    owner: { name: displayName({ username: row.owner_username, full_name: row.owner_full_name }) },
    is_mine: !!viewer && row.user_id === viewer.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...extra,
  };
  if (manage) {
    out.private_details = row.private_details;
    out.exact_location = row.latitude != null ? { lat: Number(row.latitude), lng: Number(row.longitude) } : null;
    out.moderation_note = i18n.tr(row.moderation_note);
    out.can_manage = true;
  }
  return out;
}

async function items(rows, viewer, extraFor = () => ({})) {
  const photos = await photosFor(rows.map((r) => r.id));
  return rows.map((r) => item(r, photos.get(r.id) || [], viewer, extraFor(r)));
}

const ITEM_SELECT = `SELECT i.*, u.username AS owner_username, u.full_name AS owner_full_name
  FROM items i LEFT JOIN users u ON u.id = i.user_id`;

module.exports = { displayName, approximate, photosFor, item, items, canManage, ITEM_SELECT, PUBLIC_RADIUS_M };
