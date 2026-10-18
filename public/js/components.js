// Reusable UI pieces: item cards, badges, skeletons, empty states, toasts, dialogs.
import { html, raw, icon, esc, icons, render, $$, timeAgo, formatDate } from "./lib.js";
import { category, color, store } from "./store.js";
import { api } from "./api.js";
import { navigate } from "./router.js";
import { t } from "./i18n.js";

export const typeBadge = (type, soft = false) =>
  type === "lost"
    ? html`<span class="badge ${soft ? "badge-soft-lost" : "badge-lost"}">${icon("search")}${t("type.lost")}</span>`
    : html`<span class="badge ${soft ? "badge-soft-found" : "badge-found"}">${icon("hand-heart")}${t("type.found")}</span>`;

const ITEM_STATUS = {
  pending_review: ["badge-amber", "clock"],
  active: ["badge-violet", "radio"],
  resolved: ["badge-ok", "badge-check"],
  returned: ["badge-ok", "badge-check"],
  closed: ["", "archive"],
  removed: ["badge-danger", "ban"],
};
export function statusBadge(status, { glass = false } = {}) {
  const [cls, ico] = ITEM_STATUS[status] || ["", "circle"];
  return html`<span class="badge ${glass ? "badge-glass" : cls}">${icon(ico)}${t("status." + status)}</span>`;
}

const CLAIM_STATUS = {
  pending: ["badge-amber", "clock"],
  under_review: ["badge-violet", "search-check"],
  approved: ["badge-ok", "circle-check"],
  rejected: ["badge-danger", "circle-x"],
  returned: ["badge-ok", "party-popper"],
  cancelled: ["", "circle-slash"],
};
export const claimStatusLabel = (status) => t("claim." + status);
export function claimBadge(status) {
  const [cls, ico] = CLAIM_STATUS[status] || ["", "circle"];
  return html`<span class="badge ${cls}">${icon(ico)}${claimStatusLabel(status)}</span>`;
}

export function colorDot(slug) {
  const c = color(slug);
  if (!c) return "";
  const cls = c.hex === "conic" ? "conic" : c.hex === "clear" ? "clear" : "";
  return html`<span class="swatch ${cls}" style="${cls ? "" : `background:${esc(c.hex)}`}"></span>`;
}

export function photoOrIcon(item) {
  const p = item.photos?.[0];
  if (p) return html`<img src="${p.thumb}" alt="${item.title}" loading="lazy" decoding="async">`;
  return html`<div class="no-photo">${icon(category(item.category).icon)}</div>`;
}

export function itemCard(item, { showSave = true, extra = "" } = {}) {
  const cat = category(item.category);
  const score = item.closeness
    ? html`<span class="score-pill" title="${t("card.similarity_hint")}">${icon("sparkles")}${t("close." + item.closeness)}</span>`
    : item.ai_boost
      ? html`<span class="score-pill" title="${t("card.ai_hint")}">${icon("sparkles")}AI</span>`
      : "";
  return html`<a class="item-card" href="/items/${item.id}" data-link>
    <div class="thumb">
      ${photoOrIcon(item)}
      <div class="badges">${typeBadge(item.type)}${item.status !== "active" ? statusBadge(item.status, { glass: true }) : ""}</div>
      ${score}
    </div>
    ${showSave && store.user && !item.is_mine ? html`<button class="save-btn ${item.saved ? "on" : ""}" data-save="${item.id}" aria-label="${item.saved ? t("save.remove") : t("save.add")}" title="${item.saved ? t("save.saved") : t("save.save")}">${icon("bookmark")}</button>` : ""}
    <div class="body">
      <h3>${item.title}</h3>
      <div class="meta">
        <span>${icon(cat.icon)}${cat.label}</span>
        ${item.color ? html`<span>${colorDot(item.color)}${color(item.color)?.label || item.color}</span>` : ""}
      </div>
      <div class="meta"><span>${icon("map-pin")}${shortPlace(item.location_name)}</span></div>
      <div class="foot">
        <span class="tiny muted">${icon("calendar")} ${formatDate(item.event_date)}</span>
        ${extra}
      </div>
    </div>
  </a>`;
}

export const shortPlace = (s) => {
  if (!s) return t("card.no_location");
  const first = s.split(",")[0].trim();
  return first.length > 42 ? first.slice(0, 40) + "…" : first;
};

export const skeletonCards = (n = 8) =>
  html`<div class="items-grid">${Array.from({ length: n }, () => raw(`<div class="sk-card"><div class="skeleton sk-img"></div><div class="sk-body"><div class="skeleton sk-line w80"></div><div class="skeleton sk-line w60"></div><div class="skeleton sk-line w40"></div></div></div>`))}</div>`;

export const skeletonRows = (n = 4) =>
  html`<div class="card list">${Array.from({ length: n }, () => raw(`<div class="list-row"><div class="skeleton" style="width:56px;height:56px;border-radius:12px"></div><div class="main" style="display:grid;gap:8px"><div class="skeleton sk-line w60"></div><div class="skeleton sk-line w40"></div></div></div>`))}</div>`;

export const loading = (text = t("common.loading")) => html`<div class="loading-center"><div class="spinner"></div><span class="small">${text}</span></div>`;

export function emptyState({ icon: ico = "inbox", title, text = "", actions = "" }) {
  return html`<div class="empty"><div class="ico">${icon(ico)}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ""}${actions ? html`<div class="row" style="justify-content:center">${actions}</div>` : ""}</div>`;
}

export function errorState(err, retry) {
  const id = "retry-" + Math.random().toString(36).slice(2);
  setTimeout(() => document.getElementById(id)?.addEventListener("click", retry), 0);
  return emptyState({
    icon: "cloud-off",
    title: err?.status === 404 ? t("err.not_found") : t("err.title"),
    text: err?.message || t("err.retry"),
    actions: retry ? html`<button class="btn btn-primary" id="${id}">${icon("refresh-cw")}${t("common.try_again")}</button>` : html`<a class="btn" href="/" data-link>${t("common.go_home")}</a>`,
  });
}

// ── Toasts ─────────────────────────────────────────────
export function toast(message, type = "info", { title = null, ms = 4200 } = {}) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const ico = type === "ok" ? "circle-check" : type === "error" ? "circle-alert" : "info";
  render(el, html`<span class="t-ico">${icon(ico)}</span><div>${title ? html`<strong>${title}</strong><br>` : ""}<span class="small">${message}</span></div>`);
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 320);
  }, ms);
}

// ── Modal dialogs ──────────────────────────────────────
export function modal(content, { wide = false, onClose } = {}) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${content}</div>`;
  document.body.appendChild(back);
  icons(back);
  const prev = document.activeElement;
  const close = () => {
    back.remove();
    document.removeEventListener("keydown", onKey);
    prev?.focus?.();
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", (e) => {
    if (e.target === back || e.target.closest("[data-close]")) close();
  });
  setTimeout(() => back.querySelector("input, textarea, select, button:not([data-close])")?.focus(), 30);
  return { el: back.firstElementChild, close };
}

export function confirmDialog({ title, text, confirm = t("common.confirm"), danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(
      String(html`<div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="${t("common.close")}">${icon("x")}</button></div>
      ${text ? html`<p class="muted">${text}</p>` : ""}
      ${input ? html`<div class="field" style="margin-bottom:18px"><label for="dlg-input">${input.label}</label>${input.multiline ? html`<textarea class="textarea" id="dlg-input" placeholder="${input.placeholder || ""}" maxlength="500"></textarea>` : html`<input class="input" id="dlg-input" type="${input.type || "text"}" placeholder="${input.placeholder || ""}">`}<div class="error hidden" id="dlg-err"></div></div>` : ""}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>${t("common.cancel")}</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="dlg-ok">${confirm}</button></div>`),
      { onClose: () => !done && resolve(null) }
    );
    m.el.querySelector("#dlg-ok").addEventListener("click", () => {
      const val = input ? m.el.querySelector("#dlg-input").value.trim() : true;
      if (input?.required && !val) {
        const e = m.el.querySelector("#dlg-err");
        e.textContent = t("common.required");
        e.classList.remove("hidden");
        return;
      }
      done = true;
      m.close();
      resolve(val);
    });
  });
}

export function lightbox(src, alt = "") {
  modal(String(html`<img src="${src}" alt="${alt}"><button class="icon-btn" data-close aria-label="${t("common.close")}" style="position:absolute;top:12px;inset-inline-end:12px">${icon("x")}</button>`), { wide: true });
}

// ── Forms ──────────────────────────────────────────────
export function showErrors(form, err) {
  $$(".field.invalid", form).forEach((f) => f.classList.remove("invalid"));
  $$(".field .error[data-auto]", form).forEach((e) => e.remove());
  if (!err?.fields) return false;
  let first = null;
  for (const [name, msg] of Object.entries(err.fields)) {
    const input = form.querySelector(`[name="${name}"]`);
    const field = input?.closest(".field") || form.querySelector(`[data-field="${name}"]`);
    if (!field) continue;
    field.classList.add("invalid");
    const e = document.createElement("div");
    e.className = "error";
    e.dataset.auto = "1";
    render(e, html`${icon("circle-alert")}${msg}`);
    field.appendChild(e);
    first ||= field;
  }
  first?.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

export async function withButton(btn, fn) {
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// ── Save toggles inside a container ────────────────────
export function bindSaveButtons(root) {
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-save]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (!store.user) return navigate("/login?next=" + encodeURIComponent(location.pathname));
    try {
      const { saved } = await api.post(`/items/${b.dataset.save}/save`);
      b.classList.toggle("on", saved);
      b.setAttribute("aria-label", saved ? t("save.remove") : t("save.add"));
      toast(saved ? t("save.toast_saved") : t("save.toast_removed"), "ok", { ms: 2200 });
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

export function pagination({ page, pages }, onPage) {
  if (pages <= 1) return "";
  const nums = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
  const parts = [];
  nums.forEach((p, i) => {
    if (i && p - nums[i - 1] > 1) parts.push(raw(`<button disabled>…</button>`));
    parts.push(html`<button class="${p === page ? "on" : ""}" data-page="${p}" aria-label="${t("pages.page", { n: p })}" ${p === page ? raw('aria-current="page"') : ""}>${p}</button>`);
  });
  setTimeout(() => $$("[data-page]").forEach((b) => b.addEventListener("click", () => onPage(Number(b.dataset.page)))), 0);
  return html`<nav class="pagination" aria-label="${t("pages.label")}">
    <button data-page="${page - 1}" ${page <= 1 ? raw("disabled") : ""} aria-label="${t("pages.prev")}">${icon("chevron-left")}</button>
    ${parts}
    <button data-page="${page + 1}" ${page >= pages ? raw("disabled") : ""} aria-label="${t("pages.next")}">${icon("chevron-right")}</button>
  </nav>`;
}

// ── Matches ────────────────────────────────────────────
const REASON_ICON = { category: "tag", photo: "scan-eye", text: "text-search", color: "palette", brand: "badge", location: "map-pin", date: "calendar" };

export function reasonList(reasons = []) {
  if (!reasons.length) return html`<p class="muted small">${t("match.no_signals")}</p>`;
  return html`<ul class="reason-list">${reasons.map((r) => html`<li><span class="ico">${icon(REASON_ICON[r.type] || "check")}</span>${r.text}<span class="pts">+${r.points}</span></li>`)}</ul>`;
}

export function scoreRing(score, label = t("match.ring")) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return html`<div class="match-score" title="${t("match.ring_hint")}">
    ${raw(`<svg class="ring-svg" viewBox="0 0 74 74"><defs><linearGradient id="${id}"><stop offset="0" stop-color="#8d6e63"/><stop offset="1" stop-color="#ffb74d"/></linearGradient></defs><circle cx="37" cy="37" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="6"/><circle cx="37" cy="37" r="${r}" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset 1s"/></svg>`)}
    <div><b>${score}%</b><small>${label}</small></div>
  </div>`;
}

export const strengthBadge = (s) =>
  s === "strong" ? html`<span class="badge badge-ok">${icon("sparkles")}${t("match.strong")}</span>` : html`<span class="badge badge-violet">${icon("sparkle")}${t("match.possible")}</span>`;

export { timeAgo, formatDate };
