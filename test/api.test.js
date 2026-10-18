// Main user journeys through the HTTP API: accounts, reports, privacy, search,
// photo search, matching, notifications, claims to "returned", moderation and permissions.
const test = require("node:test");
const assert = require("node:assert/strict");
const { start, client, signUp, makeAdmin, report, photo, db, ai } = require("./helpers");

let app;
test.before(async () => {
  app = await start();
  await ai.init(); // photo features need the model; cached in .models after the first run
});
test.after(async () => app.stop());

test("accounts: register, validation, login, logout", async () => {
  const c = client(app.base);
  const bad = await c.post("/auth/register", { full_name: "A", username: "x", email: "nope", password: "short" });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.fields.email && bad.data.fields.password && bad.data.fields.username);

  const u = await signUp(app.base, { username: "alice_t", email: "alice_t@example.com" });
  assert.equal((await u.get("/session")).data.user.username, "alice_t");
  const dup = await client(app.base).post("/auth/register", { full_name: "Alice", username: "alice_t", email: "other@example.com", password: "Passw0rd!", accept_privacy: "1" });
  assert.equal(dup.status, 409);

  const c2 = client(app.base);
  assert.equal((await c2.post("/auth/login", { login: "alice_t", password: "wrong" })).status, 401);
  assert.equal((await c2.post("/auth/login", { login: "alice_t@example.com", password: "Passw0rd!" })).status, 200);
  await c2.post("/auth/logout");
  assert.equal((await c2.get("/session")).data.user, null);
});

test("security: CSRF header required, honeypot, unauthenticated writes refused", async () => {
  const u = await signUp(app.base);
  const r = await u.raw("POST", "/items", report({ type: "lost", title: "Test", category: "keys", description: "Some keys on a ring" }), { "X-Requested-With": "" });
  assert.equal(r.status, 403);
  assert.equal((await client(app.base).post("/items", report({ type: "lost", title: "Keys", category: "keys", description: "Some keys on a ring" }))).status, 401);
  const hp = await client(app.base).post("/auth/register", { full_name: "Bot", username: "bot_one", email: "bot@example.com", password: "Passw0rd!", accept_privacy: "1", website: "http://spam" });
  assert.equal(hp.status, 422);
});

test("reports: validation, file checks, duplicates", async () => {
  const u = await signUp(app.base);
  const missing = await u.post("/items", report({ type: "lost", title: "", category: "", description: "short" }));
  assert.equal(missing.status, 422);
  assert.ok(missing.data.fields.title && missing.data.fields.category && missing.data.fields.description);

  const fd = report({ type: "lost", title: "Fake photo", category: "other", description: "Not really an image file" });
  fd.append("photos", new Blob(["<?php echo 1; ?>"], { type: "image/jpeg" }), "evil.jpg");
  const fake = await u.post("/items", fd);
  assert.equal(fake.status, 422);
  assert.match(fake.data.error, /not a valid image/);

  const fd2 = report({ type: "lost", title: "Text file", category: "other", description: "Uploading a text file" });
  fd2.append("photos", new Blob(["hello"], { type: "text/plain" }), "a.txt");
  assert.equal((await u.post("/items", fd2)).status, 422);

  const ok = await u.post("/items", report({ type: "lost", title: "Blue umbrella", category: "umbrella", color: "blue", description: "Blue folding umbrella" }));
  assert.equal(ok.status, 201);
  const again = await u.post("/items", report({ type: "lost", title: "Blue umbrella", category: "umbrella", description: "Blue folding umbrella again" }));
  assert.equal(again.status, 409);
});

test("privacy: public views hide contact info, private details and exact location", async () => {
  const owner = await signUp(app.base, { full_name: "Zeynep Kara" });
  const created = await owner.post("/items", report({ type: "found", title: "Silver ring", category: "jewelry", color: "silver", description: "Silver ring found near sinks", private_details: "Inscription inside: Z&K", latitude: "41.21031", longitude: "32.62655" }));
  const id = created.data.item.id;

  const anon = await client(app.base).get(`/items/${id}`);
  const item = anon.data.item;
  assert.equal(item.private_details, undefined);
  assert.equal(item.exact_location, undefined);
  assert.equal(item.owner.name, "Zeynep K.");
  assert.ok(!JSON.stringify(anon.data).includes("@example.com"));
  assert.notEqual(item.location.lat, 41.21031);
  assert.ok(Math.abs(item.location.lat - 41.21031) < 0.004);

  const mine = await owner.get(`/items/${id}`);
  assert.equal(mine.data.item.private_details, "Inscription inside: Z&K");
  assert.equal(mine.data.item.exact_location.lat, 41.21031);
});

test("permissions: only the owner (or an admin) can edit or delete", async () => {
  const owner = await signUp(app.base);
  const other = await signUp(app.base);
  const { data } = await owner.post("/items", report({ type: "lost", title: "Green scarf", category: "clothing", color: "green", description: "Green wool scarf" }));
  const id = data.item.id;
  assert.equal((await other.patch(`/items/${id}`, report({ title: "Hacked", category: "other", description: "changed by someone else" }))).status, 403);
  assert.equal((await other.del(`/items/${id}`)).status, 403);
  assert.equal((await other.post(`/items/${id}/status`, { status: "closed" })).status, 403);
  const admin = await makeAdmin(app.base);
  assert.equal((await admin.patch(`/items/${id}`, report({ title: "Green wool scarf", category: "clothing", description: "Green wool scarf, edited by admin" }))).status, 200);
  assert.equal((await owner.del(`/items/${id}`)).status, 200);
  assert.equal((await owner.get(`/items/${id}`)).status, 404);
});

test("search: keywords, filters, sorting, pagination", async () => {
  const u = await signUp(app.base);
  await u.post("/items", report({ type: "found", title: "Red backpack", category: "bag", color: "red", description: "Red school backpack with stickers", location_name: "Bus terminal" }));
  await u.post("/items", report({ type: "lost", title: "Red notebook", category: "books", color: "red", description: "Spiral notebook", event_date: "2026-01-02" }));

  const s = await client(app.base).get("/items?q=backpack");
  assert.equal(s.data.items[0].title, "Red backpack");
  const f = await client(app.base).get("/items?color=red&type=lost");
  assert.ok(f.data.items.every((i) => i.color === "red" && i.type === "lost"));
  const loc = await client(app.base).get("/items?location=terminal");
  assert.ok(loc.data.items.some((i) => i.title === "Red backpack"));
  const dates = await client(app.base).get("/items?from=2026-01-01&to=2026-01-03");
  assert.ok(dates.data.items.every((i) => i.event_date >= "2026-01-01" && i.event_date <= "2026-01-03"));
  const oldest = await client(app.base).get("/items?sort=oldest&per_page=1");
  const newest = await client(app.base).get("/items?sort=newest&per_page=1");
  assert.notEqual(oldest.data.items[0].id, newest.data.items[0].id);
  assert.ok(oldest.data.pages >= 2);
  const none = await client(app.base).get("/items?q=zzzxxyyqq");
  assert.equal(none.data.total, 0);
});

test("AI: photo suggestions and photo search", async () => {
  const u = await signUp(app.base);
  const r = await u.post("/items", report({ type: "found", title: "Teddy bear", category: "toys", color: "brown", description: "Teddy bear found in the park" }, ["teddy-1.jpg"]));
  assert.equal(r.status, 201);

  const fd = new FormData();
  fd.append("photo", photo("teddy-2.jpg"), "q.jpg");
  const s = await client(app.base).post("/ai/analyze", fd);
  assert.equal(s.data.categories[0].value, "toys");

  const fd2 = new FormData();
  fd2.append("photo", photo("teddy-3.jpg"), "q.jpg");
  const found = await client(app.base).post("/search/image", fd2);
  assert.equal(found.status, 200);
  assert.equal(found.data.items[0].id, r.data.item.id, "a different teddy photo finds the teddy report first");
});

test("journey: lost + found → match → notification → claim → approved → returned", async () => {
  const loser = await signUp(app.base, { full_name: "Lena Lost" });
  const finder = await signUp(app.base, { full_name: "Fatih Finder" });

  const lost = await loser.post("/items", report({ type: "lost", title: "Black over-ear headphones", category: "audio", color: "black", brand: "JLab", description: "Black over-ear headphones with cushioned ear cups, lost in the cafeteria", location_name: "Cafeteria" }, ["headphones-1.jpg"]));
  const found = await finder.post("/items", report({ type: "found", title: "Black headphones", category: "audio", color: "black", description: "Over-ear headphones left on a cafeteria table", location_name: "Cafeteria", private_details: "Left ear cushion is torn" }, ["headphones-2.jpg"]));
  assert.ok(found.data.matches >= 1, "match found right away");

  const lm = (await loser.get("/matches")).data.matches;
  const match = lm.find((m) => m.other.id === found.data.item.id);
  assert.ok(match && match.score >= 45 && match.reasons.length);
  const notes = (await loser.get("/notifications")).data.notifications;
  assert.ok(notes.some((n) => n.type === "match"));

  assert.equal((await loser.post(`/matches/${match.id}/respond`, { response: "yes" })).status, 200);
  assert.ok((await finder.get("/notifications")).data.notifications.some((n) => /owner thinks/.test(n.title)));

  // Ownership request needs proof.
  const noProof = await loser.post(`/items/${found.data.item.id}/claims`, { message: "These are my headphones" });
  assert.equal(noProof.status, 422);
  const claim = await loser.post(`/items/${found.data.item.id}/claims`, { message: "These are my headphones from the cafeteria", proof: "The left ear cushion is torn a bit", match_id: match.id });
  assert.equal(claim.status, 201);
  const cid = claim.data.id;
  assert.equal((await loser.post(`/items/${found.data.item.id}/claims`, { message: "Again my headphones here", proof: "torn left cushion" })).status, 409);

  // A third person can't see the claim; the claimant can't approve it.
  const stranger = await signUp(app.base);
  assert.equal((await stranger.get(`/claims/${cid}`)).status, 404);
  assert.equal((await loser.post(`/claims/${cid}/status`, { status: "approved" })).status, 403);

  // The finder sees the proof next to their private details.
  const view = await finder.get(`/claims/${cid}`);
  assert.equal(view.data.claim.proof, "The left ear cushion is torn a bit");
  assert.equal(view.data.item.private_details, "Left ear cushion is torn");
  assert.deepEqual(view.data.claim.actions.sort(), ["approved", "rejected", "under_review"]);

  assert.equal((await finder.post(`/claims/${cid}/status`, { status: "under_review" })).status, 200);
  assert.equal((await finder.post(`/claims/${cid}/messages`, { body: "Can we meet at the library desk at 10?" })).status, 201);
  assert.equal((await loser.post(`/claims/${cid}/messages`, { body: "Yes, see you there!" })).status, 201);
  assert.equal((await finder.post(`/claims/${cid}/status`, { status: "approved" })).status, 200);
  assert.equal((await loser.post(`/claims/${cid}/status`, { status: "returned" })).status, 200);

  const done = await finder.get(`/claims/${cid}`);
  assert.equal(done.data.claim.status, "returned");
  assert.deepEqual(done.data.events.map((e) => e.to), ["pending", "under_review", "approved", "returned"]);
  assert.equal(done.data.messages.length, 2);
  assert.equal(done.data.can_message, false);
  assert.equal((await client(app.base).get(`/items/${found.data.item.id}`)).data.item.status, "returned");
  assert.equal((await client(app.base).get(`/items/${lost.data.item.id}`)).data.item.status, "resolved");
  assert.ok((await loser.get("/notifications")).data.notifications.some((n) => /now returned|now approved/.test(n.title)));
  const audit = await db.query("SELECT action FROM audit_log WHERE target_type = 'claim' AND target_id = ?", [cid]);
  assert.ok(audit.length >= 4);
});

test("claims: rejection needs a reason, can be disputed; valuable items need an admin", async () => {
  const finder = await signUp(app.base);
  const claimant = await signUp(app.base);
  const admin = await makeAdmin(app.base);

  const watch = await finder.post("/items", report({ type: "found", title: "Gold watch", category: "watch", color: "gold", description: "Gold wristwatch found at the mall", is_valuable: "1", private_details: "Engraving on the back" }));
  const c = await claimant.post(`/items/${watch.data.item.id}/claims`, { message: "My gold watch from the mall", proof: "Engraved with my initials on the back" });
  assert.equal(c.data.requires_admin, true);
  const r = await finder.post(`/claims/${c.data.id}/status`, { status: "approved" });
  assert.equal(r.data.status, "under_review", "owner approval waits for an admin");
  assert.ok(!(await finder.get(`/claims/${c.data.id}`)).data.claim.actions.includes("approved"));
  assert.ok((await admin.get("/admin/claims")).data.claims.some((x) => x.id === c.data.id));
  assert.equal((await admin.post(`/claims/${c.data.id}/status`, { status: "approved" })).data.status, "approved");

  const bag = await finder.post("/items", report({ type: "found", title: "Brown handbag", category: "bag", color: "brown", description: "Brown leather handbag" }));
  const c2 = await claimant.post(`/items/${bag.data.item.id}/claims`, { message: "That's my handbag I think", proof: "It has a red lipstick inside" });
  assert.equal((await finder.post(`/claims/${c2.data.id}/status`, { status: "rejected" })).status, 422);
  assert.equal((await finder.post(`/claims/${c2.data.id}/status`, { status: "rejected", note: "There was no lipstick inside" })).status, 200);
  assert.equal((await claimant.post(`/claims/${c2.data.id}/dispute`, { reason: "I'm sure it's mine, please check again" })).status, 200);
  assert.ok((await admin.get("/admin/claims")).data.claims.some((x) => x.id === c2.data.id && x.disputed));
});

test("two people claiming the same item marks both claims as disputed", async () => {
  const finder = await signUp(app.base);
  const a = await signUp(app.base);
  const b = await signUp(app.base);
  const item = await finder.post("/items", report({ type: "found", title: "Grey hoodie", category: "clothing", color: "grey", description: "Grey hoodie left in the gym" }));
  const c1 = await a.post(`/items/${item.data.item.id}/claims`, { message: "My grey hoodie", proof: "Has a coffee stain on the sleeve" });
  const c2 = await b.post(`/items/${item.data.item.id}/claims`, { message: "This hoodie is mine", proof: "Size M, bought last year" });
  assert.equal((await a.get(`/claims/${c1.data.id}`)).data.claim.disputed, true);
  assert.equal((await b.get(`/claims/${c2.data.id}`)).data.claim.disputed, true);
});

test("moderation: contact details held for review, admin approves; flags hide a listing", async () => {
  const u = await signUp(app.base);
  const admin = await makeAdmin(app.base);
  const held = await u.post("/items", report({ type: "found", title: "Found earphones", category: "audio", description: "Call me at 0555 123 45 67 to get them" }));
  assert.ok(held.data.held);
  assert.equal((await client(app.base).get(`/items/${held.data.item.id}`)).status, 404, "hidden from the public");
  assert.equal((await u.get(`/items/${held.data.item.id}`)).status, 200, "visible to its reporter");
  assert.equal((await u.post(`/admin/reports/${held.data.item.id}/decision`, { decision: "approve" })).status, 403);
  assert.equal((await admin.post(`/admin/reports/${held.data.item.id}/decision`, { decision: "approve" })).status, 200);
  assert.equal((await client(app.base).get(`/items/${held.data.item.id}`)).status, 200);

  const spam = await u.post("/items", report({ type: "found", title: "Strange listing", category: "other", description: "Something that looks like spam" }));
  for (let i = 0; i < 3; i++) {
    const reporter = await signUp(app.base);
    assert.equal((await reporter.post("/flags", { target_type: "item", target_id: spam.data.item.id, reason: "spam" })).status, 201);
  }
  assert.equal((await client(app.base).get(`/items/${spam.data.item.id}`)).status, 404, "hidden after 3 reports");
});

test("admin: suspended users can't sign in and their session stops working", async () => {
  const admin = await makeAdmin(app.base);
  const u = await signUp(app.base, { username: "to_suspend" });
  assert.equal((await client(app.base).get("/admin/overview")).status, 401);
  assert.equal((await u.get("/admin/overview")).status, 403);
  assert.equal((await admin.post(`/admin/users/${u.user.id}`, { status: "suspended", note: "spam" })).status, 200);
  assert.equal((await u.get("/me/summary")).status, 401);
  assert.equal((await client(app.base).post("/auth/login", { login: "to_suspend", password: "Passw0rd!" })).status, 403);
  const log = (await admin.get("/admin/audit")).data.entries;
  assert.ok(log.some((e) => e.action === "admin.user.update" && e.target_id === u.user.id));
});

test("dashboard: summary, saved items, notification preferences, account deletion", async () => {
  const u = await signUp(app.base);
  const other = await signUp(app.base);
  const { data } = await other.post("/items", report({ type: "found", title: "Yellow umbrella", category: "umbrella", color: "yellow", description: "Yellow umbrella at the station" }));
  assert.equal((await u.post(`/items/${data.item.id}/save`)).data.saved, true);
  assert.equal((await u.get("/me/saved")).data.items.length, 1);
  const s = await u.get("/me/summary");
  assert.equal(s.data.saved, 1);

  await u.patch("/me/notifications", { match: false, claim: true, status: true, message: true, email: false });
  assert.equal((await u.get("/session")).data.user.notify_prefs.match, false);

  assert.equal((await u.del("/me", { password: "wrong" })).status, 422);
  assert.equal((await u.del("/me", { password: "Passw0rd!" })).status, 200);
  assert.equal((await u.get("/session")).data.user, null);
});

test("languages: errors, categories and notifications follow X-Lang", async () => {
  const ar = await client(app.base).raw("POST", "/auth/login", { login: "nobody", password: "x" }, { "X-Lang": "ar" });
  assert.equal(ar.data.error, "اسم المستخدم أو كلمة المرور غير صحيحة");
  const trv = await client(app.base).raw("POST", "/auth/register", { full_name: "A" }, { "X-Lang": "tr" });
  assert.match(trv.data.fields.username, /zorunludur/);
  const meta = await client(app.base).raw("GET", "/meta", undefined, { "X-Lang": "ar" });
  assert.equal(meta.data.categories.find((c) => c.slug === "keys").label, "مفاتيح");

  const u = await signUp(app.base);
  const en = (await u.get("/notifications")).data.notifications[0];
  assert.equal(en.title, "Welcome to Lost & Found");
  const inTr = (await u.raw("GET", "/notifications", undefined, { "X-Lang": "tr" })).data.notifications[0];
  assert.equal(inTr.title, "Lost & Found'a hoş geldiniz");
});
