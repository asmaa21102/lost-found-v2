// Checks that every translation key used by the front end exists in all three dictionaries.
//   node scripts/check-i18n.mjs
import fs from "fs";
import path from "path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "public");
const dicts = {};
for (const l of ["en", "ar", "tr"]) {
  const file = path.join(root, "js/lang", l + ".js");
  // the files are browser ES modules; load them as data: URLs so no package.json "type" is needed
  if (fs.existsSync(file)) dicts[l] = (await import("data:text/javascript;base64," + fs.readFileSync(file).toString("base64"))).default;
}

const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") && !d.endsWith("lang") && files.push(path.join(d, e.name))));
walk(path.join(root, "js"));
const used = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\("([a-z_.0-9]+)"/g)) if (!m[1].endsWith(".") && !m[1].endsWith("_")) used.add(m[1]);
  for (const m of s.matchAll(/\btn\("([a-z_.0-9]+)"/g)) used.add(m[1] + ".one"), used.add(m[1] + ".other");
  for (const m of s.matchAll(/title: "([a-z_]+\.[a-z_]+)"/g)) used.add(m[1]);
}
for (const m of fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/data-i18n(?:-aria)?="([a-z_.]+)"/g)) used.add(m[1]);
// keys built at runtime
const dyn = {
  "status.": ["pending_review", "active", "resolved", "returned", "closed", "removed"],
  "claim.": ["pending", "under_review", "approved", "rejected", "returned", "cancelled"],
  "close.": ["very", "similar", "somewhat"], "type.": ["lost", "found"],
  "flag.r.": ["spam", "fake", "scam", "offensive", "privacy", "other"],
  "map.period_": ["any", "7", "30", "90"],
  "cl.a_": ["under_review", "approved", "rejected", "returned", "cancelled", "resolve_dispute", "dispute"],
  "cl.c_": ["approve_h", "approve_p", "reject_h", "reject_p", "returned_h", "returned_p", "cancel_h", "cancel_p", "resolve_h", "resolve_p"],
  "item.c_": ["close_h", "close_p", "close_btn", "reopen_h", "reopen_p", "reopen_btn", "done_h", "done_p", "done_btn"],
  "dash.": ["lost_p", "found_p", "lost_empty_h", "lost_empty_p", "found_empty_h", "found_empty_p"],
  "adm.": ["reject_h", "remove_h"], "adm.m_": ["suggested", "confirmed", "dismissed", "disputed"], "adm.resp_": ["pending", "yes", "no"],
  "adm.f_": ["open", "resolved", "dismissed"], "adm.t_": ["item", "user", "claim", "match"], "adm.u_": ["suspend", "reactivate", "grant", "revoke"],
  "set.n_": ["match", "match_p", "claim", "claim_p", "status", "status_p", "message", "message_p", "email", "email_p"],
};
for (const [p, list] of Object.entries(dyn)) list.forEach((k) => used.add(p + k));

let bad = 0;
for (const [l, d] of Object.entries(dicts)) {
  const missing = [...used].filter((k) => d[k] === undefined).sort();
  const extra = Object.keys(d).filter((k) => !used.has(k));
  if (missing.length) { bad++; console.log(`${l}: ${missing.length} missing →`, missing.join(" ")); }
  if (extra.length) console.log(`${l}: ${extra.length} unused →`, extra.join(" "));
  // placeholders must match English
  if (l !== "en") for (const k of Object.keys(d)) {
    const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    // ".one" forms may spell out the number ("بلاغ واحد") instead of using {n}
    const same = ph(d[k]) === ph(dicts.en[k]) || (k.endsWith(".one") && ph(d[k]) === ph(dicts.en[k]).replace(/(^|,)n(,|$)/, "$1$2").replace(/^,|,$/g, ""));
    if (dicts.en[k] !== undefined && !same) { bad++; console.log(`${l}: placeholder mismatch in ${k}`); }
  }
}
console.log(`${used.size} keys used; dictionaries: ${Object.keys(dicts).join(", ")}`);
process.exit(bad ? 1 : 0);
