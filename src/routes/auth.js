const express = require("express");
const bcrypt = require("bcrypt");
const limiter = require("../limit");
const db = require("../db");
const audit = require("../audit");
const notify = require("../notify");
const { check, fail } = require("../http");

const router = express.Router();

const loginLimiter = limiter({ minutes: 15, limit: 10, message: "Too many sign-in attempts. Try again in 15 minutes." });
const registerLimiter = limiter({ minutes: 60, limit: 8, message: "Too many accounts created from this network. Try again later." });

// Accounts from the first (PHP) version use password_hash(), whose "$2y$" prefix is the
// same bcrypt algorithm as "$2b$".
const verify = (password, hash) => bcrypt.compare(password, hash.replace(/^\$2y\$/, "$2b$"));

function publicSession(user, unread = 0) {
  if (!user) return { user: null };
  return {
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      notify_prefs: notify.prefsOf(user),
      created_at: user.created_at,
    },
    unread,
  };
}

router.get("/session", async (req, res) => {
  if (!req.user) return res.json(publicSession(null));
  const { n } = await db.one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", [req.user.id]);
  res.json(publicSession(req.user, n));
});

function startSession(req, userId) {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((e) => (e ? reject(e) : resolve()));
    })
  );
}

router.post("/auth/register", registerLimiter, async (req, res) => {
  if (req.body.website) fail(422, "Registration failed"); // honeypot field, hidden from people
  const data = check(req.body)
    .text("full_name", { required: true, min: 2, max: 120, label: "Full name" })
    .text("username", { required: true, min: 3, max: 30, label: "Username" })
    .email("email")
    .text("password", { required: true, min: 8, max: 72, label: "Password" })
    .done();
  if (!/^[a-zA-Z0-9_.]+$/.test(data.username)) fail(422, "Please fix the highlighted fields", { username: "Use letters, numbers, dots or underscores" });
  if (!/[a-zA-Z]/.test(req.body.password) || !/[0-9]/.test(req.body.password))
    fail(422, "Please fix the highlighted fields", { password: "Use at least one letter and one number" });
  if (!req.body.accept_privacy) fail(422, "Please fix the highlighted fields", { accept_privacy: "Please accept the privacy notice" });

  const taken = await db.one("SELECT username, email FROM users WHERE username = ? OR email = ?", [data.username, data.email]);
  if (taken) {
    const fields = {};
    if (taken.username.toLowerCase() === data.username.toLowerCase()) fields.username = "This username is taken";
    if (taken.email.toLowerCase() === data.email) fields.email = "An account with this email already exists";
    fail(409, "Account already exists", fields);
  }
  const hash = await bcrypt.hash(req.body.password, 12);
  const r = await db.query("INSERT INTO users (full_name, username, email, password, notify_prefs, lang) VALUES (?, ?, ?, ?, ?, ?)", [
    data.full_name, data.username, data.email, hash, JSON.stringify(notify.DEFAULT_PREFS), req.lang,
  ]);
  await startSession(req, r.insertId);
  await audit.log({ ip: req.ip, user: { id: r.insertId } }, "user.register", "user", r.insertId);
  await notify.send(r.insertId, "system", "welcome", {}, "/dashboard");
  const user = await db.one("SELECT * FROM users WHERE id = ?", [r.insertId]);
  res.status(201).json(publicSession(user, 1));
});

router.post("/auth/login", loginLimiter, async (req, res) => {
  const login = String(req.body.login || "").trim();
  const password = String(req.body.password || "");
  if (!login || !password) fail(422, "Enter your username or email and password");
  const user = await db.one("SELECT * FROM users WHERE username = ? OR email = ?", [login, login.toLowerCase()]);
  if (!user || !(await verify(password, user.password))) fail(401, "Wrong username or password");
  if (user.status !== "active") fail(403, "This account is suspended. Contact the administrator.");
  await startSession(req, user.id);
  await db.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  const { n } = await db.one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", [user.id]);
  res.json(publicSession(user, n));
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lf.sid");
    res.json({ ok: true });
  });
});

module.exports = { router, verify };
