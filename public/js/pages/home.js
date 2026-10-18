import { api } from "../api.js";
import { html, icon, render, $, animateCount, reveal, raw } from "../lib.js";
import { itemCard, skeletonCards, bindSaveButtons, emptyState } from "../components.js";
import { navigate } from "../router.js";
import { t } from "../i18n.js";

export default function home({ el }) {
  render(
    el,
    html`<div class="page">
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <span class="eyebrow">${icon("sparkles")}${t("home.eyebrow")}</span>
          <h1>${t("home.h1a")}<br><span class="gradient-text">${t("home.h1b")}</span></h1>
          <p class="lead">${t("home.lead")}</p>
          <div class="hero-cta">
            <a class="btn btn-primary btn-lg" href="/report/lost" data-link>${icon("search")}${t("cta.report_lost")}</a>
            <a class="btn btn-mint btn-lg" href="/report/found" data-link>${icon("hand-heart")}${t("cta.report_found")}</a>
          </div>
          <form class="hero-search" id="hero-search" role="search">
            ${icon("search")}
            <input class="input" name="q" placeholder="${t("home.search_ph")}" aria-label="${t("home.search_label")}" autocomplete="off">
            <a class="btn btn-ghost btn-sm" href="/browse?mode=photo" data-link title="${t("home.photo_title")}">${icon("camera")}<span>${t("home.photo")}</span></a>
            <button class="btn btn-primary btn-sm" type="submit">${t("common.search")}</button>
          </form>
          <p class="tiny muted" style="margin-top:12px">${icon("shield-check")} ${t("home.private_note")}</p>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="orb"></div><div class="ring"></div><div class="ring r2"></div>
          <div class="float-card c1" id="fc1"><div class="fc-ico">${icon("wallet")}</div><div><span class="badge badge-lost">${t("type.lost")}</span><strong>${t("home.demo_lost")}</strong><span class="tiny muted">${t("home.demo_lost_place")}</span></div></div>
          <div class="match-badge"><span class="score-pill">${icon("sparkles")}<span id="match-label">${t("match.possible")}</span></span></div>
          <div class="float-card c2" id="fc2"><div class="fc-ico">${icon("wallet")}</div><div><span class="badge badge-found">${t("type.found")}</span><strong>${t("home.demo_found")}</strong><span class="tiny muted">${t("home.demo_found_place")}</span></div></div>
          <div class="float-card c3"><div class="fc-ico" style="color:var(--mint)">${icon("badge-check")}</div><div><strong>${t("home.returned")}</strong><span class="tiny muted">${t("home.returned_sub")}</span></div></div>
        </div>
      </div>
    </section>

    <section class="container" aria-label="${t("home.stats_label")}">
      <div class="stats stagger" id="stats">
        ${stat("files", t("home.stat_total"), "total", "var(--violet-2)", "var(--violet-soft)")}
        ${stat("radio", t("home.stat_active"), "active", "var(--amber)", "var(--amber-soft)")}
        ${stat("badge-check", t("home.stat_returned"), "returned", "var(--mint)", "var(--mint-soft)")}
        ${stat("git-compare-arrows", t("home.stat_matches"), "matches", "var(--rose)", "var(--rose-soft)")}
      </div>
    </section>

    <section class="section container">
      <div class="section-head reveal">
        <div><span class="eyebrow">${icon("clock")}${t("home.recent_eyebrow")}</span><h2>${t("home.recent_h")}</h2><p>${t("home.recent_p")}</p></div>
        <div class="segmented" role="tablist" id="recent-tabs">
          <button class="on" data-type="">${t("common.all")}</button><button data-type="lost">${t("type.lost")}</button><button data-type="found">${t("type.found")}</button>
        </div>
      </div>
      <div id="recent">${skeletonCards(8)}</div>
      <div class="center" style="margin-top:26px"><a class="btn" href="/browse" data-link>${t("home.browse_all")} ${icon("arrow-right")}</a></div>
    </section>

    <section class="section container" id="how">
      <div class="section-head reveal"><div><span class="eyebrow">${icon("route")}${t("home.how_eyebrow")}</span><h2>${t("nav.how")}</h2><p>${t("home.how_p")}</p></div></div>
      <div class="steps">
        ${step("file-plus-2", t("home.s1_h"), t("home.s1_p"))}
        ${step("scan-search", t("home.s2_h"), t("home.s2_p"))}
        ${step("shield-check", t("home.s3_h"), t("home.s3_p"))}
        ${step("handshake", t("home.s4_h"), t("home.s4_p"))}
      </div>
    </section>

    <section class="section container">
      <div class="feature-band">
        <div class="feature reveal"><div class="ico">${icon("camera")}</div><h3>${t("home.f1_h")}</h3><p>${t("home.f1_p")}</p></div>
        <div class="feature reveal"><div class="ico">${icon("git-compare-arrows")}</div><h3>${t("home.f2_h")}</h3><p>${t("home.f2_p")}</p></div>
        <div class="feature reveal"><div class="ico">${icon("lock-keyhole")}</div><h3>${t("home.f3_h")}</h3><p>${t("home.f3_p")}</p></div>
      </div>
    </section>

    <section class="container" style="margin-top:20px">
      <div class="cta-band reveal">
        <h2>${t("home.cta_h")}</h2>
        <p class="muted" style="max-width:560px;margin:0 auto 22px">${t("home.cta_p")}</p>
        <div class="row" style="justify-content:center"><a class="btn btn-mint btn-lg" href="/report/found" data-link>${icon("hand-heart")}${t("cta.report_found")}</a><a class="btn btn-lg" href="/map" data-link>${icon("map")}${t("home.explore_map")}</a></div>
      </div>
    </section>
  </div>`
  );

  $("#hero-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get("q").trim();
    navigate("/browse" + (q ? `?q=${encodeURIComponent(q)}&sort=relevance` : ""));
  });

  api.get("/stats").then((s) => {
    for (const k of ["total", "active", "returned", "matches"]) {
      const n = el.querySelector(`[data-stat="${k}"]`);
      if (n) animateCount(n, s[k] || 0);
    }
  }).catch(() => {});

  const recent = $("#recent");
  bindSaveButtons(recent);
  const loadRecent = async (type = "") => {
    render(recent, skeletonCards(8));
    try {
      const { items } = await api.get(`/items?per_page=8&sort=newest${type ? "&type=" + type : ""}`);
      render(recent, items.length ? html`<div class="items-grid stagger">${items.map((i) => itemCard(i))}</div>` : emptyState({ icon: "inbox", title: t("home.empty_h"), text: t("home.empty_p"), actions: html`<a class="btn btn-primary" href="/report/found" data-link>${t("nav.report")}</a>` }));
      heroCards(items);
    } catch (err) {
      render(recent, emptyState({ icon: "cloud-off", title: t("home.load_failed"), text: err.message }));
    }
  };
  $("#recent-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("#recent-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    loadRecent(b.dataset.type);
  });
  loadRecent();
  reveal(el);
}

// A lost and a found report from the same category, so the "possible match" card makes sense.
function heroCards(items) {
  const lost = items.find((i) => i.type === "lost" && i.photos?.length && items.some((f) => f.type === "found" && f.category === i.category && f.photos?.length));
  if (!lost) return;
  const found = items.find((f) => f.type === "found" && f.category === lost.category && f.photos?.length);
  for (const [id, it] of [["#fc1", lost], ["#fc2", found]]) {
    const card = document.querySelector(id);
    if (!card || card.dataset.real) continue;
    card.dataset.real = "1";
    const img = document.createElement("img");
    img.src = it.photos[0].thumb;
    img.alt = "";
    card.querySelector(".fc-ico").replaceWith(img);
    card.querySelector("strong").textContent = it.title;
    card.querySelector(".tiny").textContent = (it.location_name || "").split(",")[0];
  }
}

const stat = (ico, label, key, c, accent) =>
  html`<div class="stat" style="--c:${raw(c)};--accent:${raw(accent)}"><div class="ico">${icon(ico)}</div><div class="num" data-stat="${key}">0</div><div class="muted small">${label}</div></div>`;

const step = (ico, title, text) => html`<div class="step reveal"><div class="ico">${icon(ico)}</div><h3>${title}</h3><p>${text}</p></div>`;
