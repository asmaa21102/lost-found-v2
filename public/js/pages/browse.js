// Browse & search: keyword search with filters and sorting, plus AI photo search.
import { api, qs } from "../api.js";
import { html, icon, render, $, $$, debounce, raw } from "../lib.js";
import { itemCard, skeletonCards, emptyState, errorState, pagination, bindSaveButtons, colorDot, toast } from "../components.js";
import { store, category } from "../store.js";
import { setQuery } from "../router.js";
import { t, tn } from "../i18n.js";

const list = (v) => (v ? String(v).split(",").filter(Boolean) : []);

export default function browse({ el, query }) {
  const state = {
    q: query.q || "",
    type: query.type || "",
    status: query.status || "active",
    category: list(query.category),
    color: list(query.color),
    from: query.from || "",
    to: query.to || "",
    location: query.location || "",
    photos: query.photos || "",
    sort: query.sort || "",
    page: Number(query.page) || 1,
  };
  let photoMode = query.mode === "photo";
  let photoFile = null;
  let photoUrl = null;
  let reqId = 0;

  render(
    el,
    html`<div class="page container">
      <div class="page-head">
        <span class="eyebrow">${icon("layout-grid")}${t("browse.eyebrow")}</span>
        <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem)">${t("browse.h1")}</h1>
        <p>${t("browse.lead")}</p>
      </div>
      <div class="toolbar">
        <form class="search-bar" id="search-form" role="search">
          ${icon("search")}
          <input class="input" name="q" id="q" value="${state.q}" placeholder="${t("browse.search_ph")}" aria-label="${t("common.search")}" autocomplete="off">
          <button type="button" class="btn btn-sm ${photoMode ? "btn-primary" : "btn-ghost"}" id="photo-toggle" title="${t("home.photo_title")}">${icon("camera")}${t("home.photo")}</button>
        </form>
        <select class="select" id="sort" style="width:auto;min-width:170px" aria-label="${t("browse.sort")}">
          <option value="">${t("browse.sort_best")}</option>
          <option value="newest">${t("browse.sort_newest")}</option>
          <option value="oldest">${t("browse.sort_oldest")}</option>
          <option value="relevance">${t("browse.sort_relevance")}</option>
          <option value="date">${t("browse.sort_date")}</option>
        </select>
        <button class="btn" id="filters-toggle" aria-expanded="false">${icon("sliders-horizontal")}${t("browse.filters")}</button>
      </div>
      <div id="photo-box"></div>
      <div class="browse">
        <aside class="card filters filters-panel" id="filters" aria-label="${t("browse.filters")}"></aside>
        <section aria-live="polite">
          <div class="active-filters" id="chips"></div>
          <div class="results-head"><div id="count" class="muted small"></div></div>
          <div id="results">${skeletonCards(9)}</div>
          <div id="pages"></div>
        </section>
      </div>
    </div>`
  );

  $("#sort").value = state.sort;
  const results = $("#results");
  bindSaveButtons(results);

  // ── Filters panel ───────────────────────────
  function renderFilters() {
    const { categories, colors } = store.meta;
    render(
      $("#filters"),
      html`
      <h4>${t("browse.f_type")}</h4>
      <div class="segmented" style="width:100%">${[["", t("common.all")], ["lost", t("type.lost")], ["found", t("type.found")]].map(([v, l]) => html`<button type="button" class="${state.type === v ? "on" : ""}" data-type="${v}" style="flex:1;justify-content:center">${l}</button>`)}</div>
      <h4>${t("browse.f_status")}</h4>
      <div class="filter-chips">${[["active", t("status.active")], ["returned", t("status.returned")], ["all", t("common.all")]].map(([v, l]) => html`<button type="button" class="chip ${state.status === v ? "on" : ""}" data-status="${v}">${l}</button>`)}</div>
      <h4>${t("browse.f_category")}</h4>
      <div class="filter-chips">${categories.map((c) => html`<button type="button" class="chip ${state.category.includes(c.slug) ? "on" : ""}" data-cat="${c.slug}">${icon(c.icon)}${c.label}</button>`)}</div>
      <h4>${t("browse.f_color")}</h4>
      <div class="filter-chips">${colors.map((c) => html`<button type="button" class="chip ${state.color.includes(c.slug) ? "on" : ""}" data-color="${c.slug}" title="${c.label}">${colorDot(c.slug)}${c.label}</button>`)}</div>
      <h4>${t("browse.f_date")}</h4>
      <div class="form-grid" style="gap:8px"><div class="field"><label class="tiny muted" for="from">${t("browse.from")}</label><input class="input" type="date" id="from" value="${state.from}"></div><div class="field"><label class="tiny muted" for="to">${t("browse.to")}</label><input class="input" type="date" id="to" value="${state.to}"></div></div>
      <h4>${t("browse.f_location")}</h4>
      <div class="input-icon">${icon("map-pin")}<input class="input" id="location" value="${state.location}" placeholder="${t("browse.location_ph")}"></div>
      <h4>${t("browse.f_photos")}</h4>
      <label class="check"><input type="checkbox" id="photos" ${state.photos === "1" ? raw("checked") : ""}> ${t("browse.only_photos")}</label>
      <button type="button" class="btn btn-ghost btn-block" id="clear" style="margin-top:18px">${icon("rotate-ccw")}${t("browse.clear")}</button>`
    );
  }
  renderFilters();

  const f = $("#filters");
  f.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.type !== undefined) state.type = b.dataset.type;
    else if (b.dataset.status) state.status = b.dataset.status;
    else if (b.dataset.cat) toggle(state.category, b.dataset.cat);
    else if (b.dataset.color) toggle(state.color, b.dataset.color);
    else if (b.id === "clear") Object.assign(state, { type: "", status: "active", category: [], color: [], from: "", to: "", location: "", photos: "" });
    else return;
    state.page = 1;
    renderFilters();
    refresh();
  });
  f.addEventListener("change", (e) => {
    if (e.target.id === "from" || e.target.id === "to") state[e.target.id] = e.target.value;
    if (e.target.id === "photos") state.photos = e.target.checked ? "1" : "";
    state.page = 1;
    refresh();
  });
  f.addEventListener("input", debounce((e) => {
    if (e.target.id !== "location") return;
    state.location = e.target.value.trim();
    state.page = 1;
    refresh();
  }, 400));

  $("#filters-toggle").addEventListener("click", (e) => {
    const open = $("#filters").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    state.page = 1;
    refresh();
  });
  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.q = $("#q").value.trim();
    state.page = 1;
    refresh();
  });
  $("#q").addEventListener("input", debounce(() => {
    state.q = $("#q").value.trim();
    state.page = 1;
    refresh();
  }, 450));

  // ── Active filter chips ──────────────────────
  function renderChips() {
    const chips = [];
    const add = (label, clear) => chips.push({ label, clear });
    if (state.type) add(t("type." + state.type), () => (state.type = ""));
    if (state.status !== "active") add(state.status === "returned" ? t("status.returned") : t("browse.all_statuses"), () => (state.status = "active"));
    state.category.forEach((c) => add(category(c).label, () => toggle(state.category, c)));
    state.color.forEach((c) => add(store.meta.colors.find((x) => x.slug === c)?.label || c, () => toggle(state.color, c)));
    if (state.from || state.to) add(`${state.from || "…"} → ${state.to || "…"}`, () => (state.from = state.to = ""));
    if (state.location) add(t("browse.near", { place: state.location }), () => (state.location = ""));
    if (state.photos) add(t("browse.with_photos"), () => (state.photos = ""));
    render($("#chips"), html`${chips.map((c, i) => html`<button class="chip on" data-chip="${i}">${c.label}${icon("x")}</button>`)}`);
    $$("[data-chip]").forEach((b) =>
      b.addEventListener("click", () => {
        chips[Number(b.dataset.chip)].clear();
        state.page = 1;
        renderFilters();
        refresh();
      })
    );
  }

  const params = () => ({ q: state.q, type: state.type, status: state.status === "active" ? "" : state.status, category: state.category, color: state.color, from: state.from, to: state.to, location: state.location, photos: state.photos, sort: state.sort, page: state.page > 1 ? state.page : "" });

  async function refresh() {
    setQuery({ ...params(), mode: photoMode ? "photo" : "" });
    renderChips();
    if (photoMode && photoFile) return runPhotoSearch();
    if (photoMode && !photoFile) {
      render(results, emptyState({ icon: "camera", title: t("browse.photo_empty_h"), text: t("browse.photo_empty_p") }));
      render($("#pages"), "");
      $("#count").textContent = "";
      return;
    }
    const id = ++reqId;
    render(results, skeletonCards(9));
    try {
      const p = params();
      const data = await api.get("/items" + qs({ ...p, status: state.status, per_page: 12 }));
      if (id !== reqId) return;
      render($("#count"), html`<strong style="color:var(--ink)">${tn("browse.count", data.total)}</strong>${state.q ? " " + t("browse.for", { q: state.q }) : ""}${data.ai && state.q ? html` · ${icon("sparkles")} ${t("browse.ai_boosted")}` : ""}`);
      if (!data.items.length) {
        render(results, emptyState({
          icon: "search-x",
          title: t("browse.none_h"),
          text: state.q ? t("browse.none_q") : t("browse.none_f"),
          actions: html`<button class="btn" id="e-clear">${icon("rotate-ccw")}${t("browse.clear_short")}</button><a class="btn btn-primary" href="/report/lost" data-link>${icon("plus")}${t("browse.report_yours")}</a>`,
        }));
        $("#e-clear")?.addEventListener("click", () => {
          Object.assign(state, { q: "", type: "", status: "active", category: [], color: [], from: "", to: "", location: "", photos: "", page: 1 });
          $("#q").value = "";
          renderFilters();
          refresh();
        });
        render($("#pages"), "");
        return;
      }
      render(results, html`<div class="items-grid stagger">${data.items.map((i) => itemCard(i))}</div>`);
      render($("#pages"), pagination(data, (pg) => {
        state.page = pg;
        refresh();
        el.scrollIntoView({ behavior: "smooth" });
      }));
    } catch (err) {
      if (id === reqId) render(results, errorState(err, refresh));
    }
  }

  // ── Photo search ─────────────────────────────
  function renderPhotoBox() {
    const box = $("#photo-box");
    if (!photoMode) return render(box, "");
    render(
      box,
      html`<div class="photo-search-box">
        <div class="row between" style="margin-bottom:12px">
          <div><strong>${icon("sparkles")} ${t("browse.ai_photo")}</strong><div class="tiny muted">${t("browse.ai_photo_sub")}</div></div>
          <button class="btn btn-ghost btn-sm" id="photo-close">${icon("x")}${t("common.close")}</button>
        </div>
        ${photoUrl
          ? html`<div class="photo-query"><img src="${photoUrl}" alt="${t("browse.your_photo")}"><div class="grow"><div id="ai-guess" class="small muted">${t("browse.analysing")}</div></div><label class="btn btn-sm">${icon("refresh-cw")}${t("browse.change_photo")}<input type="file" accept="image/jpeg,image/png,image/webp" id="photo-input" hidden></label></div>`
          : html`<label class="dropzone" id="dz"><input type="file" accept="image/jpeg,image/png,image/webp" id="photo-input"><div class="dz-icon">${icon("image-up")}</div><strong>${t("browse.drop")}</strong><div class="tiny muted">${t("browse.drop_sub")}</div></label>`}
      </div>`
    );
    $("#photo-close").onclick = () => {
      photoMode = false;
      photoFile = null;
      photoUrl = null;
      $("#photo-toggle").className = "btn btn-sm btn-ghost";
      renderPhotoBox();
      refresh();
    };
    const input = $("#photo-input");
    input.onchange = () => input.files[0] && usePhoto(input.files[0]);
    const dz = $("#dz");
    if (dz) {
      ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => (e.preventDefault(), dz.classList.add("drag"))));
      ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("drag")));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) usePhoto(file);
      });
    }
  }

  function usePhoto(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast(t("photo.bad_type"), "error");
    if (file.size > store.meta.limits.photoMb * 1024 * 1024) return toast(t("photo.too_big", { mb: store.meta.limits.photoMb }), "error");
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoFile = file;
    photoUrl = URL.createObjectURL(file);
    renderPhotoBox();
    refresh();
  }

  async function runPhotoSearch() {
    const id = ++reqId;
    render(results, html`<div class="items-grid">${Array.from({ length: 6 }, () => raw('<div class="sk-card scan"><div class="skeleton sk-img"></div><div class="sk-body"><div class="skeleton sk-line w80"></div><div class="skeleton sk-line w40"></div></div></div>'))}</div>`);
    $("#count").textContent = t("browse.comparing");
    render($("#pages"), "");
    const fd = new FormData();
    fd.append("photo", photoFile);
    try {
      const p = params();
      const data = await api.post("/search/image" + qs({ type: p.type, status: state.status, category: p.category, color: p.color, from: p.from, to: p.to, location: p.location }), fd);
      if (id !== reqId) return;
      const guess = $("#ai-guess");
      if (guess) {
        const cats = data.suggestions.categories.filter((c) => c.confidence > 0.12).slice(0, 2);
        render(guess, html`<div class="small">${t("browse.ai_thinks")}</div><div class="row" style="margin-top:6px">${cats.map((c) => html`<button class="chip" data-apply-cat="${c.value}">${icon(category(c.value).icon)}${category(c.value).label} · ${Math.round(c.confidence * 100)}%</button>`)}</div><div class="tiny muted" style="margin-top:6px">${t("browse.tap_filter")}</div>`);
        $$("[data-apply-cat]", guess).forEach((b) => b.addEventListener("click", () => {
          if (!state.category.includes(b.dataset.applyCat)) state.category.push(b.dataset.applyCat);
          renderFilters();
          refresh();
        }));
      }
      render($("#count"), html`<strong style="color:var(--ink)">${tn("browse.similar_count", data.items.length)}</strong> · ${icon("sparkles")} ${t("browse.ranked_ai")}`);
      render(results, data.items.length
        ? html`<div class="items-grid stagger">${data.items.map((i) => itemCard(i))}</div><p class="tiny muted center" style="margin-top:18px">${t("browse.similar_note")}</p>`
        : emptyState({ icon: "image-off", title: t("browse.no_similar_h"), text: t("browse.no_similar_p"), actions: html`<a class="btn btn-primary" href="/report/lost" data-link>${icon("plus")}${t("cta.report_lost")}</a>` }));
    } catch (err) {
      if (id !== reqId) return;
      render(results, err.status === 503 ? emptyState({ icon: "loader-circle", title: t("browse.ai_warming"), text: err.message, actions: html`<button class="btn btn-primary" id="retry-ai">${icon("refresh-cw")}${t("common.try_again")}</button>` }) : errorState(err, runPhotoSearch));
      $("#retry-ai")?.addEventListener("click", runPhotoSearch);
    }
  }

  $("#photo-toggle").addEventListener("click", () => {
    photoMode = !photoMode;
    $("#photo-toggle").className = `btn btn-sm ${photoMode ? "btn-primary" : "btn-ghost"}`;
    if (!photoMode) photoFile = photoUrl = null;
    renderPhotoBox();
    refresh();
  });

  renderPhotoBox();
  refresh();
  return () => photoUrl && URL.revokeObjectURL(photoUrl);
}

function toggle(arr, v) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(v);
}
