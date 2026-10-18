// Rate limits (spam and brute-force protection). Tests turn them off with DISABLE_RATE_LIMIT=1.
const rateLimit = require("express-rate-limit");
const { tr } = require("./i18n");

module.exports = function limiter({ minutes, limit, key = null, message }) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    ...(key ? { keyGenerator: (req) => key + (req.user?.id || req.ip) } : {}),
    skip: () => process.env.DISABLE_RATE_LIMIT === "1",
    handler: (req, res) => res.status(429).json({ error: tr(message, req.lang) }),
  });
};
