const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const helmet = require("helmet");
const config = require("./config");
const db = require("./db");
const { loadUser, sameOriginOnly } = require("./auth");
const i18n = require("./i18n");

function createApp() {
  const app = express();
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https://tile.openstreetmap.org"],
          connectSrc: ["'self'", "https://nominatim.openstreetmap.org"],
          frameAncestors: ["'self'", "http://localhost:8000", "http://127.0.0.1:8000"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      // OpenStreetMap's tile policy requires a Referer.
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  const store = new MySQLStore({ createDatabaseTable: true, clearExpired: true, schema: { tableName: "sessions" } }, db.pool);
  app.use(
    session({
      name: "lf.sid",
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: "lax", secure: config.baseUrl.startsWith("https://"), maxAge: 14 * 24 * 60 * 60 * 1000 },
    })
  );

  // Uploaded photos (names are random, so they can be cached for a long time).
  app.use("/uploads", express.static(config.uploadsDir, { maxAge: "30d", immutable: true, fallthrough: false }));

  // Front-end libraries served from node_modules instead of a CDN.
  const vendor = (route, dir) => app.use(route, express.static(path.join(config.root, "node_modules", dir), { maxAge: "7d" }));
  vendor("/vendor/leaflet", "leaflet/dist");
  vendor("/vendor/markercluster", "leaflet.markercluster/dist");
  vendor("/vendor/lucide", "lucide/dist/umd");

  const api = express.Router();
  api.use(i18n.middleware);
  api.use(sameOriginOnly);
  api.use(loadUser);
  api.use(require("./routes/auth").router);
  api.use(require("./routes/items").router);
  api.use(require("./routes/claims").router);
  api.use(require("./routes/me").router);
  api.use(require("./routes/admin").router);
  api.use((req, res) => res.status(404).json({ error: "Not found" }));
  app.use("/api", api);

  // No long caching for the app's own files: the browser revalidates (ETag), so a change
// to the design shows up on the next load.
  app.use(express.static(path.join(config.root, "public"), { maxAge: 0, index: false }));
  // The front end is a single page app: every other GET path returns index.html.
  app.get(/^\/(?!api\/|uploads\/|vendor\/).*/, (req, res) => res.sendFile(path.join(config.root, "public", "index.html")));

  // Errors → JSON with a clear message; details stay in the server log.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: i18n.tr(status >= 500 ? "Something went wrong on our side. Please try again." : err.message, req.lang),
      ...(err.fields ? { fields: i18n.trFields(err.fields, req.lang) } : {}),
    });
  });

  app.locals.sessionStore = store;
  return app;
}

module.exports = { createApp };
