// In-app notifications, with optional email. Users choose per type in their settings.
// A notification is stored as a template key + parameters (src/i18n.js), so each reader
// sees it in their own language; the English text is kept as a fallback.
// Without SMTP settings, emails are kept in `email_outbox` so admins can see what would be sent.
const db = require("./db");
const config = require("./config");
const i18n = require("./i18n");

const DEFAULT_PREFS = { match: true, claim: true, status: true, message: true, email: false };

function prefsOf(user) {
  let p = user?.notify_prefs;
  if (typeof p === "string") {
    try { p = JSON.parse(p); } catch { p = null; }
  }
  return { ...DEFAULT_PREFS, ...(p || {}) };
}

let transport = null;
function mailer() {
  if (!config.smtp) return null;
  if (!transport) {
    const nodemailer = require("nodemailer");
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

const EMAIL_FOOTER = {
  en: "You can change notification settings in your dashboard.",
  ar: "يمكنك تغيير إعدادات الإشعارات من لوحتك.",
  tr: "Bildirim ayarlarını panelinizden değiştirebilirsiniz.",
};
const EMAIL_OPEN = { en: "Open", ar: "افتح", tr: "Aç" };

async function email(to, subject, body) {
  const r = await db.query("INSERT INTO email_outbox (to_email, subject, body) VALUES (?, ?, ?)", [to, subject, body]);
  const t = mailer();
  if (!t) return;
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text: body });
    await db.query("UPDATE email_outbox SET sent_at = NOW() WHERE id = ?", [r.insertId]);
  } catch (err) {
    await db.query("UPDATE email_outbox SET error = ? WHERE id = ?", [String(err.message).slice(0, 250), r.insertId]);
  }
}

// type: match | claim | status | message | system ("system" can't be switched off)
// key + params: a template in src/i18n.js
async function send(userId, type, key, params = {}, link = null) {
  const user = await db.one("SELECT id, email, notify_prefs, status, lang FROM users WHERE id = ?", [userId]);
  if (!user || user.status !== "active") return;
  const prefs = prefsOf(user);
  if (type !== "system" && prefs[type] === false) return;
  const en = i18n.notification(key, params, "en");
  await db.query("INSERT INTO notifications (user_id, type, tkey, params, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    userId, type, key, JSON.stringify(params), en.title.slice(0, 200), en.body?.slice(0, 500) || null, link,
  ]);
  if (prefs.email) {
    const lang = i18n.LANGS.includes(user.lang) ? user.lang : "en";
    const msg = i18n.notification(key, params, lang);
    const url = link ? config.baseUrl + link : config.baseUrl;
    email(user.email, msg.title, `${msg.body || ""}\n\n${EMAIL_OPEN[lang]}: ${url}\n\n${EMAIL_FOOTER[lang]}`).catch(() => {});
  }
}

async function sendAdmins(type, key, params, link) {
  const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const a of admins) await send(a.id, type, key, params, link);
}

// A stored notification in the reader's language.
function render(row, lang = i18n.current()) {
  let params = row.params;
  if (typeof params === "string") {
    try { params = JSON.parse(params); } catch { params = {}; }
  }
  const t = row.tkey ? i18n.notification(row.tkey, params || {}, lang) : null;
  return { id: row.id, type: row.type, link: row.link, is_read: !!row.is_read, created_at: row.created_at, title: t?.title || row.title, body: t ? t.body : row.body };
}

module.exports = { send, sendAdmins, render, prefsOf, DEFAULT_PREFS };
