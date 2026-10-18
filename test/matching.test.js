// Matching engine on varied examples (no database needed).
const test = require("node:test");
const assert = require("node:assert/strict");
const { scorePair, textSimilarity, SUGGEST_AT } = require("../src/matching");

const base = {
  title: "Black leather wallet",
  category: "wallet",
  color: "black",
  brand: null,
  description: "Black leather bifold wallet with student card",
  event_date: "2026-10-10",
  location_name: "Central Library",
  latitude: 41.2103,
  longitude: 32.6265,
};
const near = (o) => ({ ...o, latitude: o.latitude + 0.001, longitude: o.longitude + 0.001 });

test("the same item described by two people scores as a strong match", () => {
  const found = near({ ...base, title: "Dark leather wallet", description: "Found a black leather wallet with a student card", event_date: "2026-10-11" });
  const { score, reasons } = scorePair(base, found, 0.9);
  assert.ok(score >= 70, `score ${score}`);
  assert.ok(reasons.some((r) => r.type === "category"));
  assert.ok(reasons.some((r) => r.type === "photo"));
});

test("a different category is heavily penalised even when everything else matches", () => {
  const phone = near({ ...base, category: "phone", title: "Black phone", description: "Black leather phone case" });
  assert.ok(scorePair(base, phone, 0.85).score < SUGGEST_AT);
});

test("found long before it was lost is unlikely", () => {
  const early = near({ ...base, event_date: "2026-09-01" });
  const ok = near({ ...base, event_date: "2026-10-11" });
  assert.ok(scorePair(base, early, null).score < scorePair(base, ok, null).score);
});

test("distance lowers the score", () => {
  const close = near(base);
  const far = { ...base, latitude: base.latitude + 0.2, longitude: base.longitude + 0.2 };
  assert.ok(scorePair(base, close, null).score > scorePair(base, far, null).score);
});

test("similar colours count partly", () => {
  const navy = near({ ...base, color: "navy" });
  const red = near({ ...base, color: "red" });
  assert.ok(scorePair(base, navy, null).score > scorePair(base, red, null).score);
});

test("same category and place alone is not enough without evidence about the object", () => {
  const lost = { ...base, category: "electronics", title: "USB drive", description: "SanDisk USB stick with thesis files", brand: null };
  const found = near({ ...base, category: "electronics", title: "Calculator", description: "Grey scientific calculator in exam hall", color: "grey" });
  assert.ok(scorePair(lost, found, 0.5).score < SUGGEST_AT);
});

test("scores never reach 100", () => {
  assert.ok(scorePair(base, near(base), 0.99).score <= 95);
});

test("synonyms and plurals are understood", () => {
  const a = textSimilarity({ title: "White AirPods", description: "earphones in a case" }, { title: "Wireless earbuds", description: "white case" });
  assert.ok(a.shared.includes("earbud"));
  const g = textSimilarity({ title: "Reading glasses", description: "" }, { title: "Spectacles", description: "" });
  assert.ok(g.shared.includes("glass"));
});

test("every reason explains its points", () => {
  const { reasons } = scorePair(base, near(base), 0.88);
  for (const r of reasons) {
    assert.equal(typeof r.text, "string");
    assert.ok(r.points > 0);
  }
});
