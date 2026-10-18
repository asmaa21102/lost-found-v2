// Static pages: how it works, privacy & retention, user guide, admin guide, photo credits.
// The long texts live in lang/info-<language>.js (trusted static HTML).
import { api } from "../api.js";
import { html, icon, render, $, raw } from "../lib.js";
import { loading, emptyState } from "../components.js";
import { t, lang } from "../i18n.js";

const PAGES = {
  "/how-it-works": ["how", "route", "nav.how"],
  "/privacy": ["privacy", "lock-keyhole", "title.privacy"],
  "/guide": ["guide", "book-open", "title.guide"],
  "/guide/admin": ["admin", "shield-check", "title.guide_admin"],
};

const wrap = (eyebrow, ico, title, lead, body) => html`<div class="page narrow" style="padding-top:30px">
  <div class="page-head"><span class="eyebrow">${icon(ico)}${eyebrow}</span><h1 style="font-size:clamp(1.9rem,3.6vw,2.7rem)">${title}</h1><p>${lead}</p></div>
  <article class="panel prose">${body}</article>
</div>`;

export default async function info({ el }) {
  if (location.pathname === "/credits") return credits(el);
  const [key, ico, titleKey] = PAGES[location.pathname] || PAGES["/how-it-works"];
  render(el, html`<div class="container page">${loading()}</div>`);
  const content = (await import(`../lang/info-${lang}.js`)).default[key];
  render(el, wrap(t(titleKey), ico, content.title, content.lead, raw(content.body)));
}

async function credits(el) {
  render(el, wrap(t("title.credits"), "image", t("title.credits"), t("credits.lead"), html`<div id="credits">${loading()}</div>`));
  try {
    const { photos } = await api.get("/credits");
    render($("#credits"), photos.length
      ? html`<div class="table-wrap"><table class="table"><thead><tr><th>${t("credits.photo")}</th><th>${t("credits.author")}</th><th>${t("credits.license")}</th></tr></thead><tbody>${photos.map((p) => html`<tr><td><a href="${p.source}" target="_blank" rel="noopener" dir="ltr">${p.title.replace(/^File:/, "")}</a></td><td class="small" dir="ltr">${p.author}</td><td class="small" dir="ltr">${p.license}</td></tr>`)}</tbody></table></div>`
      : emptyState({ icon: "image", title: t("credits.none") }));
  } catch (err) {
    render($("#credits"), html`<p class="muted">${err.message}</p>`);
  }
}
