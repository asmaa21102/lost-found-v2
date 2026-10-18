const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// A session secret that survives restarts without having to be configured by hand.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(ROOT, ".session-secret");
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(file, "utf8").trim();
}

module.exports = {
  root: ROOT,
  port: Number(process.env.PORT || 8102),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 8102}`,
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "fodern_lostfound",
  },
  sessionSecret: sessionSecret(),
  uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT, "uploads"),
  ai: {
    enabled: process.env.AI_ENABLED !== "0",
    model: process.env.AI_MODEL || "Xenova/clip-vit-base-patch32",
    cacheDir: process.env.AI_CACHE_DIR || path.join(ROOT, ".models"),
  },
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || "Lost & Found <no-reply@localhost>",
      }
    : null,
  limits: {
    photosPerReport: 6,
    photoBytes: 8 * 1024 * 1024,
  },
};
