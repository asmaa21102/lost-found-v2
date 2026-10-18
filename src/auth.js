const db = require("./db");
const { fail } = require("./http");

// Loads the signed-in user (if any) on every request. Suspended accounts are signed out.
async function loadUser(req, res, next) {
  req.user = null;
  const id = req.session?.userId;
  if (id) {
    const user = await db.one("SELECT id, username, full_name, email, role, status, notify_prefs, phone, lang, created_at FROM users WHERE id = ?", [id]);
    if (user && user.status === "active") {
      req.user = user;
      // Remember the language for emails sent later.
      if (req.lang && user.lang !== req.lang) await db.query("UPDATE users SET lang = ? WHERE id = ?", [req.lang, id]);
    }
    else req.session.userId = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) fail(401, "Please sign in to continue");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) fail(401, "Please sign in to continue");
  if (req.user.role !== "admin") fail(403, "Administrators only");
  next();
}

// CSRF protection for the JSON API: state-changing requests must carry a header that a
// cross-site form or image can't send, and must not come from another origin.
function sameOriginOnly(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Requested-With") !== "fetch") fail(403, "Request blocked");
  const site = req.get("Sec-Fetch-Site");
  if (site && !["same-origin", "none"].includes(site)) fail(403, "Request blocked");
  next();
}

const isAdmin = (user) => user?.role === "admin";

module.exports = { loadUser, requireAuth, requireAdmin, sameOriginOnly, isAdmin };
