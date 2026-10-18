// Test setup: separate database and uploads folder, rate limits off, app on a random port.
const os = require("os");
const fs = require("fs");
const path = require("path");

process.env.DB_NAME = process.env.TEST_DB_NAME || "fodern_lostfound_test";
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lf-uploads-"));
process.env.DISABLE_RATE_LIMIT = "1";
process.env.PORT = "0";

const bcrypt = require("bcrypt");
const db = require("../src/db");
const { migrate } = require("../src/migrations");
const { createApp } = require("../src/app");
const ai = require("../src/ai");
const photoIndex = require("../src/photo-index");

async function reset() {
  await migrate({ log: () => {} });
  for (const t of ["messages", "claim_events", "claims", "matches", "saved_items", "notifications", "flags", "audit_log", "email_outbox", "item_photos", "items", "users"])
    await db.query(`DELETE FROM ${t}`);
  await db.query("REPLACE INTO settings (name, value) VALUES ('moderation_mode', 'post')");
  await photoIndex.load();
}

async function start() {
  await reset();
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async stop() {
      server.closeAllConnections();
      server.close();
      await app.locals.sessionStore.close();
      await db.pool.end();
    },
  };
}

// A tiny client that keeps the session cookie, like a browser tab.
function client(base) {
  let cookie = "";
  async function call(method, url, body, headers = {}) {
    const opts = { method, headers: { "X-Requested-With": "fetch", ...headers } };
    if (cookie) opts.headers.Cookie = cookie;
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + "/api" + url, opts);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    return { status: res.status, data };
  }
  return {
    get: (u) => call("GET", u),
    post: (u, b = {}, h) => call("POST", u, b, h),
    patch: (u, b = {}) => call("PATCH", u, b),
    del: (u, b) => call("DELETE", u, b),
    raw: call,
  };
}

let n = 0;
async function signUp(base, extra = {}) {
  const c = client(base);
  n++;
  const r = await c.post("/auth/register", {
    full_name: extra.full_name || `Test User ${n}`,
    username: extra.username || `user${n}_${Date.now() % 100000}`,
    email: extra.email || `user${n}_${Date.now()}@example.com`,
    password: "Passw0rd!",
    accept_privacy: "1",
  });
  if (r.status !== 201) throw new Error("register failed: " + JSON.stringify(r.data));
  c.user = r.data.user;
  return c;
}

async function makeAdmin(base) {
  const username = `admin${Date.now() % 100000}${++n}`;
  await db.query("INSERT INTO users (username, full_name, email, password, role) VALUES (?, 'Test Admin', ?, ?, 'admin')", [username, `${username}@example.com`, await bcrypt.hash("Adm1nPass!", 4)]);
  const c = client(base);
  const r = await c.post("/auth/login", { login: username, password: "Adm1nPass!" });
  c.user = r.data.user;
  return c;
}

const PHOTOS = path.join(__dirname, "..", "demo", "photos");
function photo(name) {
  const buf = fs.readFileSync(path.join(PHOTOS, name));
  return new Blob([buf], { type: "image/jpeg" });
}

function report(fields, photos = []) {
  const fd = new FormData();
  const defaults = { event_date: new Date().toISOString().slice(0, 10), location_name: "Central Library", latitude: "41.2103", longitude: "32.6265" };
  for (const [k, v] of Object.entries({ ...defaults, ...fields })) if (v !== undefined && v !== null) fd.append(k, String(v));
  photos.forEach((p, i) => fd.append("photos", photo(p), `photo${i}.jpg`));
  return fd;
}

module.exports = { start, client, signUp, makeAdmin, report, photo, db, ai };
