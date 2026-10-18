// Small helpers shared by every page.
import { t, locale } from "./i18n.js";

// Safe HTML templates: every ${value} is escaped unless wrapped in raw(). Arrays are joined.
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ""));
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
function part(v) {
  if (v == null || v === false) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}

export function icons(root = document) {
  if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" }, root });
}

export function render(el, content) {
  el.innerHTML = String(content);
  icons(el);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const icon = (name, cls = "") => raw(`<i data-lucide="${esc(name)}"${cls ? ` class="${esc(cls)}"` : ""}></i>`);

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
export function timeAgo(date) {
  const d = new Date(date);
  const s = (d - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return t("time.now");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return formatDate(d);
}
export const formatDate = (d) => (d ? new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const formatDateTime = (d) => new Date(d).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const today = () => new Date().toISOString().slice(0, 10);

export function initials(name = "") {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function animateCount(el, to, ms = 1100) {
  const start = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !to) {
    el.textContent = to.toLocaleString(locale);
    return;
  }
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString(locale);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Fade elements in as they scroll into view.
let observer;
export function reveal(root = document) {
  observer ||= new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), observer.unobserve(e.target))),
    { threshold: 0.12 }
  );
  $$(".reveal", root).forEach((el) => observer.observe(el));
}

// Waits for the deferred classic scripts (Leaflet, Lucide).
export function whenLoaded(name) {
  return new Promise((resolve) => {
    if (window[name]) return resolve(window[name]);
    window.addEventListener("load", () => resolve(window[name]), { once: true });
  });
}
