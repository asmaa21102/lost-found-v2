# Lost & Found v2

A lost-and-found platform for universities, schools, offices and public places:
report items with photos and a map location, search by words or **by photo (AI)**,
get **explained possible matches**, and return items through a **private, verified
claim workflow** with an admin dashboard.

Version 2 of [lost-found-project](https://github.com/asmaa21102/lost-found-project).

**Try it:** a demo that runs entirely in your browser — https://asmaa21102.github.io/live/lost-found/
It keeps the MySQL database (existing accounts still sign in) and replaces the PHP
pages + open Express API with one Node server that has sessions and permissions.

## Run it

Requirements: Node 20+, MySQL 8.

```bash
npm install
export DB_USER=… DB_PASS=…          # DB_HOST, DB_PORT, DB_NAME (default fodern_lostfound) optional
npm run migrate                      # creates / upgrades the tables
node scripts/seed-demo.js --yes      # optional: demo data — REPLACES all data
npm start                            # http://localhost:8102
```


The first start downloads the CLIP model (~150 MB) into `.models/`. The site works
while it loads; photo search becomes available once it's ready (`GET /api/ai/status`).

**Demo accounts** (demo data only): `demo` / `Demo12345`, `admin` / `Admin12345`,
and `ayse`, `mehmet`, `sara`, `omar`, `elif`, `can` with `Demo12345`.
The people, places and reports are fictional; the photos come from Wikimedia
Commons (see `demo/photos/CREDITS.json` and `/credits`).

## Languages

The interface is in **Arabic (right-to-left), English and Turkish**. The language comes
from `?lang=ar|en|tr`, then the saved choice, then the browser; the globe button switches it.

- Interface text: `public/js/lang/{en,ar,tr}.js`; long pages: `public/js/lang/info-*.js`
- Server messages, notifications, match reasons and category names: `src/i18n.js`
  (the browser sends `X-Lang`; notifications are stored as template key + parameters,
  so each reader sees them in their language; emails use the recipient's last language)
- `node scripts/check-i18n.mjs` checks that every key exists in all three languages

## Tests

```bash
npm test     # 23 tests: matching examples + API journeys (uses database fodern_lostfound_test)
```

Covered: sign-up/sign-in, validation, CSRF and honeypot, file checks, duplicates,
privacy of public views, owner/admin permissions, search and filters, AI suggestions
and photo search, the full lost → match → claim → returned journey, valuable items
needing an admin, disputes, moderation, flags hiding a listing, suspended users,
dashboard and account deletion.

## How it works

| Part | Where |
| --- | --- |
| Server, security headers, sessions | `server.js`, `src/app.js`, `src/auth.js` |
| Database schema (migrations from v1) | `src/migrations.js` |
| AI (CLIP via transformers.js, local) | `src/ai.js`, `src/photo-index.js` |
| Smart matching | `src/matching.js` |
| What happens after a report is saved | `src/pipeline.js` |
| Public vs private fields | `src/present.js` |
| Photo upload checks (sharp, EXIF removed) | `src/uploads.js` |
| Notifications and email | `src/notify.js` |
| Data retention job | `src/retention.js` |
| API routes | `src/routes/*.js` |
| Front end (no build step, ES modules) | `public/` |

**Matching.** Each new or edited report is compared with active reports of the
opposite type. The score combines category (25), photo similarity (25), words with
synonyms (15), colour (12), distance (10), brand (8) and date (5), normalised to the
signals that are available. A category clash and "no evidence about the object itself"
lower the score; it is capped at 95 so it never reads as certain. Pairs ≥ 45 are
suggested with their reasons, and both people are notified.

**Photo search.** Every photo gets a 512-number CLIP vector. A search photo is
compared with all of them; results show "very similar / similar / somewhat similar"
because raw cosine values of different objects overlap with similar ones.

**Claims.** `pending → under_review → approved → returned`, or `rejected` /
`cancelled`. Ownership requests carry private proof that only the finder and admins
see. Valuable items and ID documents need an admin's approval; several claimants on
one item, or a disputed rejection, go to the admin queue. Every change is logged.

**Privacy.** Public pins are rounded and shifted (~300 m area); email, phone, exact
location, private details and messages are never public; reports containing links,
phone numbers or emails are held for review. See `/privacy` for the retention rules.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 8102 | |
| `BASE_URL` | `http://localhost:PORT` | Use `https://…` in production — cookies become `Secure` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | 127.0.0.1, 3306, root, —, fodern_lostfound | |
| `SESSION_SECRET` | generated into `.session-secret` | |
| `UPLOADS_DIR` | `./uploads` | |
| `AI_ENABLED` | 1 | `0` turns photo features off |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | Without them emails are kept in the admin outbox |
| `DEMO_MODE` | 1 | `0` hides the demo accounts on the sign-in page |

## Deploying

Any Linux host with Node 20+ and MySQL works (for example the HestiaCP container,
or a VPS). Run `npm ci && npm run migrate`, start `node server.js` with a process
manager (systemd or pm2), put it behind nginx with HTTPS, and set `BASE_URL`,
`SESSION_SECRET`, `DEMO_MODE=0` and the SMTP variables. The server listens on
127.0.0.1 and trusts a proxy on the same machine. Allow ~1 GB RAM for the AI model.

## Guides

- User guide: `/guide` in the app
- Administrator guide: `/guide/admin`
- How matching and verification work: `/how-it-works`
