// Smart matching: compares a lost report with found reports (and the other way round)
// and keeps pairs that score high enough as *possible* matches with readable reasons.
// A score is a ranking aid, never a confirmation — ownership is settled by a claim.
const db = require("./db");
const ai = require("./ai");
const photoIndex = require("./photo-index");
const notify = require("./notify");
const i18n = require("./i18n");
const { colorRelation, categoryLabel, colorLabel, ascii } = require("./taxonomy");

const SUGGEST_AT = 45;
const STRONG_AT = 70;
const MAX_SCORE = 95;

const WEIGHTS = { category: 25, photo: 25, text: 15, color: 12, location: 10, brand: 8, date: 5 };

const STOP = new Set(
  "a an the and or of in on at to for with my i it is was this that near from by lost found have has left some its very small big new old black white grey gray blue red green brown my".split(" ")
);
const SYNONYMS = {
  mobile: "phone", smartphone: "phone", iphone: "phone", cellphone: "phone",
  rucksack: "backpack", knapsack: "backpack", bag: "backpack",
  airpods: "earbud", earbuds: "earbud", earphones: "earbud", earphone: "earbud", headset: "headphone",
  spectacles: "glass", eyeglasses: "glass", sunglasses: "glass", glasses: "glass",
  purse: "wallet", cardholder: "wallet", keyring: "key", keychain: "key", keys: "key",
  macbook: "laptop", flask: "bottle", thermos: "bottle",
  wristwatch: "watch", smartwatch: "watch", jumper: "sweater", hoodie: "sweater",
};

// Very small English stemmer: glasses → glass, batteries → battery, keys → key.
function stem(w) {
  if (w.length <= 4) return w;
  if (w.endsWith("sses") || w.endsWith("shes") || w.endsWith("ches") || w.endsWith("xes")) return w.slice(0, -2);
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

function tokens(...texts) {
  const out = new Set();
  for (const t of texts) {
    for (const raw of ascii(t).split(/[^a-z0-9]+/)) {
      if (raw.length < 3 || STOP.has(raw)) continue;
      const w = SYNONYMS[raw] || stem(raw);
      out.add(SYNONYMS[w] || w);
    }
  }
  return out;
}

function textSimilarity(a, b) {
  const ta = tokens(a.title, a.description, a.brand);
  const tb = tokens(b.title, b.description, b.brand);
  if (!ta.size || !tb.size) return { value: 0, shared: [] };
  const shared = [...ta].filter((w) => tb.has(w));
  // Dice coefficient, softened so a few shared specific words already count.
  const dice = (2 * shared.length) / (ta.size + tb.size);
  return { value: Math.min(1, dice * 2.2), shared };
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const coords = (item) =>
  item.latitude != null && item.longitude != null ? { lat: Number(item.latitude), lng: Number(item.longitude) } : null;

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// Score one lost/found pair. `photoCos` is the best CLIP cosine between their photos, or null.
function scorePair(lost, found, photoCos = null) {
  const parts = [];
  let earned = 0;
  let possible = 0;
  // reason = [templateKey, params] from src/i18n.js, stored with its English text
  const add = (key, value, reason) => {
    possible += WEIGHTS[key];
    earned += WEIGHTS[key] * value;
    if (value > 0 && reason) {
      const [rk, params = {}] = reason;
      parts.push({ type: key, key: rk, params, text: i18n.reasonText(rk, params), points: Math.round(WEIGHTS[key] * value) });
    }
  };

  let objectEvidence = 0; // how much the photos, words or brand say about the object itself

  // Category
  const sameCategory = lost.category && lost.category === found.category && lost.category !== "other";
  const categoryClash = lost.category && found.category && lost.category !== found.category && lost.category !== "other" && found.category !== "other";
  add("category", sameCategory ? 1 : 0, sameCategory ? ["category", { cat: categoryLabel(lost.category), cat_slug: lost.category }] : null);

  // Photos
  if (photoCos != null) {
    const v = ai.visualSimilarity(photoCos);
    objectEvidence = Math.max(objectEvidence, v);
    add("photo", v, v >= 0.35 ? ["photo", { pct: Math.round(photoCos * 100) }] : null);
  }

  // Title + description
  const text = textSimilarity(lost, found);
  objectEvidence = Math.max(objectEvidence, text.value);
  if (text.value > 0 || (lost.description && found.description)) {
    add("text", text.value, text.shared.length ? ["text", { words: text.shared.slice(0, 5).join(", ") }] : null);
  }

  // Color
  const rel = colorRelation(lost.color, found.color);
  if (rel) {
    const v = rel === "same" ? 1 : rel === "similar" ? 0.5 : 0;
    add("color", v, rel === "same" ? ["color_same", { color: colorLabel(lost.color), color_slug: lost.color }] : rel === "similar" ? ["color_similar", { a: colorLabel(lost.color), a_slug: lost.color, b: colorLabel(found.color), b_slug: found.color }] : null);
  }

  // Brand (only when both reports name one)
  if (lost.brand && found.brand) {
    const same = ascii(lost.brand) === ascii(found.brand) || ascii(lost.brand).includes(ascii(found.brand)) || ascii(found.brand).includes(ascii(lost.brand));
    if (same) objectEvidence = 1;
    add("brand", same ? 1 : 0, same ? ["brand", { brand: found.brand }] : null);
  }

  // Location
  const a = coords(lost);
  const b = coords(found);
  if (a && b) {
    const km = haversineKm(a, b);
    const v = km <= 0.3 ? 1 : km <= 1 ? 0.8 : km <= 3 ? 0.5 : km <= 10 ? 0.2 : 0;
    add("location", v, v > 0 ? (km < 1 ? ["distance_m", { m: Math.max(50, Math.round((km * 1000) / 50) * 50) }] : ["distance_km", { km: km.toFixed(1) }]) : null);
  } else if (lost.location_name && found.location_name) {
    const shared = [...tokens(lost.location_name)].filter((w) => tokens(found.location_name).has(w));
    add("location", shared.length ? 0.6 : 0, shared.length ? ["area", { words: shared.slice(0, 3).join(", ") }] : null);
  }

  // Date: found on or after the day it was lost
  if (lost.event_date && found.event_date) {
    const d = daysBetween(lost.event_date, found.event_date);
    const v = d < -2 ? 0 : d <= 3 ? 1 : d <= 14 ? 0.6 : d <= 45 ? 0.25 : 0;
    add("date", v, v > 0 ? (Math.abs(d) <= 1 ? ["date_same"] : d < 0 ? ["date_close"] : ["date_after", { d }]) : null);
  }

  let score = possible ? (earned / possible) * 100 : 0;
  if (categoryClash) score *= 0.45; // a phone is not a wallet, whatever else matches
  if (objectEvidence < 0.2) score *= 0.7; // same category and place alone is not enough
  if (lost.event_date && found.event_date && daysBetween(lost.event_date, found.event_date) < -2) score *= 0.6;
  parts.sort((x, y) => y.points - x.points);
  // Never 100: a score ranks suggestions, it doesn't prove ownership.
  return { score: Math.min(MAX_SCORE, Math.round(score)), reasons: parts };
}

const strength = (score) => (score >= STRONG_AT ? "strong" : score >= SUGGEST_AT ? "possible" : "weak");

// Recompute matches for one report against all active reports of the opposite type.
async function runForItem(itemId, { notifyUsers = true } = {}) {
  const item = await db.one("SELECT * FROM items WHERE id = ?", [itemId]);
  if (!item) return [];
  if (item.status !== "active") {
    await db.query("DELETE FROM matches WHERE (lost_item_id = ? OR found_item_id = ?) AND status = 'suggested' AND lost_response = 'pending' AND found_response = 'pending'", [itemId, itemId]);
    return [];
  }
  const opposite = item.type === "lost" ? "found" : "lost";
  const candidates = await db.query(
    `SELECT * FROM items WHERE type = ? AND status = 'active' AND id <> ?
       AND (user_id IS NULL OR ? IS NULL OR user_id <> ?)
       AND created_at > NOW() - INTERVAL 180 DAY`,
    [opposite, item.id, item.user_id, item.user_id]
  );
  const myVecs = photoIndex.vectorsForItem(item.id);
  const results = [];

  for (const other of candidates) {
    const [lost, found] = item.type === "lost" ? [item, other] : [other, item];
    const otherVecs = photoIndex.vectorsForItem(other.id);
    const cos = myVecs.length && otherVecs.length ? photoIndex.bestPairCosine(myVecs, otherVecs) : null;
    const { score, reasons } = scorePair(lost, found, cos);
    const existing = await db.one("SELECT * FROM matches WHERE lost_item_id = ? AND found_item_id = ?", [lost.id, found.id]);

    if (score < SUGGEST_AT) {
      // Drop stale suggestions nobody has acted on yet.
      if (existing && existing.status === "suggested" && existing.lost_response === "pending" && existing.found_response === "pending")
        await db.query("DELETE FROM matches WHERE id = ?", [existing.id]);
      continue;
    }
    if (existing) {
      await db.query("UPDATE matches SET score = ?, reasons = ? WHERE id = ?", [score, JSON.stringify(reasons), existing.id]);
      results.push({ id: existing.id, lost, found, score, isNew: false });
    } else {
      const r = await db.query("INSERT INTO matches (lost_item_id, found_item_id, score, reasons) VALUES (?, ?, ?, ?)", [lost.id, found.id, score, JSON.stringify(reasons)]);
      results.push({ id: r.insertId, lost, found, score, isNew: true });
    }
  }

  if (notifyUsers) {
    for (const m of results.filter((r) => r.isNew)) {
      const strong = strength(m.score) === "strong" ? "_strong" : "";
      const params = { lost: m.lost.title, found: m.found.title, score: m.score };
      if (m.lost.user_id) await notify.send(m.lost.user_id, "match", "match_lost" + strong, params, "/dashboard/matches");
      if (m.found.user_id) await notify.send(m.found.user_id, "match", "match_found" + strong, params, "/dashboard/matches");
    }
  }
  return results;
}

module.exports = { scorePair, runForItem, strength, textSimilarity, tokens, haversineKm, SUGGEST_AT, STRONG_AT, WEIGHTS };
