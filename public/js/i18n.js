// Interface language: Arabic (right-to-left), English or Turkish.
// Chosen from ?lang=, then the saved choice, then the browser language.
import en from "./lang/en.js";
import ar from "./lang/ar.js";
import tr from "./lang/tr.js";

const DICTS = { en, ar, tr };
export const LANGS = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

function detect() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (DICTS[fromUrl]) {
    try { localStorage.setItem("lf-lang", fromUrl); } catch { /* private mode */ }
    return fromUrl;
  }
  try {
    const saved = localStorage.getItem("lf-lang");
    if (DICTS[saved]) return saved;
  } catch { /* private mode */ }
  const nav = (navigator.language || "en").slice(0, 2);
  return DICTS[nav] ? nav : "en";
}

export const lang = detect();
export const dir = lang === "ar" ? "rtl" : "ltr";
export const locale = { en: "en-GB", ar: "ar-u-nu-latn", tr: "tr-TR" }[lang];

document.documentElement.lang = lang;
document.documentElement.dir = dir;

export function t(key, vars) {
  let s = DICTS[lang][key] ?? DICTS.en[key];
  if (s === undefined) {
    console.warn("missing translation:", key);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  return s;
}

// "1 report" / "5 reports" — every dictionary has `key.one` and `key.other`.
export const tn = (key, n, vars = {}) => t(n === 1 ? key + ".one" : key + ".other", { n, ...vars });

export function setLang(code) {
  try { localStorage.setItem("lf-lang", code); } catch { /* private mode */ }
  const u = new URL(location.href);
  u.searchParams.delete("lang");
  location.replace(u.toString());
}

// Static text in index.html: <span data-i18n="key">
export function translateStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
}
