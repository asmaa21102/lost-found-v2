// Explore reports by area. Pins sit at approximate positions only.
import { api, qs } from "../api.js";
import { html, icon, render, $, $$, today } from "../lib.js";
import { toast } from "../components.js";
import { store, category } from "../store.js";
import { createMap, pin, popupHtml } from "../map.js";
import { setQuery } from "../router.js";
import { t, tn } from "../i18n.js";

const PERIODS = ["", "7", "30", "90"];

export default function mapPage({ el, query }) {
  const state = { type: query.type || "", category: query.category || "", days: query.days || "" };
  let ctx = null;
  let cluster = null;
  let markers = new Map();

  render(
    el,
    html`<div class="map-page page">
      <aside class="map-side">
        <span class="eyebrow">${icon("map")}${t("nav.map")}</span>
        <h2 style="margin-top:6px">${t("map.h")}</h2>
        <p class="small muted">${t("map.lead")}</p>
        <div class="stack" style="--gap:12px">
          <div class="segmented" style="width:100%">${[["", t("common.all")], ["lost", t("type.lost")], ["found", t("type.found")]].map(([v, l]) => html`<button type="button" data-type="${v}" class="${state.type === v ? "on" : ""}" style="flex:1;justify-content:center">${l}</button>`)}</div>
          <select class="select" id="m-cat" aria-label="${t("report.category")}"><option value="">${t("map.all_categories")}</option>${store.meta.categories.map((c) => html`<option value="${c.slug}">${c.label}</option>`)}</select>
          <select class="select" id="m-days" aria-label="${t("report.date")}">${PERIODS.map((v) => html`<option value="${v}">${t("map.period_" + (v || "any"))}</option>`)}</select>
          <div class="legend"><span><i style="background:var(--rose)"></i>${t("type.lost")}</span><span><i style="background:var(--mint-2)"></i>${t("type.found")}</span></div>
        </div>
        <div class="small muted" id="m-count" style="margin-top:14px"></div>
        <div class="map-list" id="m-list"></div>
      </aside>
      <div id="bigmap" aria-label="${t("map.label")}"></div>
    </div>`
  );
  $("#m-cat").value = state.category;
  $("#m-days").value = state.days;

  el.querySelector(".segmented").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.type = b.dataset.type;
    $$(".segmented button", el).forEach((x) => x.classList.toggle("on", x === b));
    load();
  });
  $("#m-cat").addEventListener("change", (e) => ((state.category = e.target.value), load()));
  $("#m-days").addEventListener("change", (e) => ((state.days = e.target.value), load()));

  async function load() {
    setQuery(state);
    if (!ctx) return;
    const from = state.days ? new Date(Date.now() - Number(state.days) * 86400000).toISOString().slice(0, 10) : "";
    try {
      const { items } = await api.get("/items/map" + qs({ type: state.type, category: state.category, from, to: from ? today() : "" }));
      const { L, map } = ctx;
      cluster.clearLayers();
      markers = new Map();
      for (const it of items) {
        const m = L.marker([it.location.lat, it.location.lng], { icon: pin(L, it.type), title: it.title });
        m.bindPopup(popupHtml(it, category(it.category).label), { maxWidth: 260, minWidth: 240 });
        cluster.addLayer(m);
        markers.set(it.id, m);
      }
      if (items.length) map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: 15 });
      $("#m-count").textContent = tn("map.count", items.length);
      render($("#m-list"), html`${items.slice(0, 40).map((it) => html`<button data-id="${it.id}">${it.thumb ? html`<img src="${it.thumb}" alt="">` : html`<span class="no-photo">${icon(category(it.category).icon)}</span>`}<span style="min-width:0"><span class="badge ${it.type === "lost" ? "badge-soft-lost" : "badge-soft-found"}" style="height:20px">${t("type." + it.type)}</span><strong class="small" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.title}</strong><span class="tiny muted">${(it.location_name || "").split(",")[0]}</span></span></button>`)}`);
      $$("#m-list [data-id]").forEach((b) =>
        b.addEventListener("click", () => {
          const m = markers.get(Number(b.dataset.id));
          cluster.zoomToShowLayer(m, () => m.openPopup());
        })
      );
    } catch (err) {
      toast(err.message, "error");
    }
  }

  createMap($("#bigmap"), { zoom: 13 }).then((c) => {
    ctx = c;
    cluster = c.L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    c.map.addLayer(cluster);
    load();
  });

  return () => ctx?.destroy();
}
