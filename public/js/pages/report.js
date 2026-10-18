// Create or edit a lost / found report.
import { api } from "../api.js";
import { html, icon, render, $, $$, raw, today, debounce } from "../lib.js";
import { showErrors, withButton, toast, errorState, colorDot, loading } from "../components.js";
import { store, category } from "../store.js";
import { pickerMap, reverseGeocode, searchPlace } from "../map.js";
import { navigate } from "../router.js";
import { t, tn } from "../i18n.js";

export default function report({ el, params, query }) {
  const editing = !!params.id;
  let picker = null;
  const photos = []; // { file, url }
  let existing = []; // photos already saved (edit mode)
  const removeIds = new Set();
  let suggested = false;

  const start = async () => {
    let item = null;
    if (editing) {
      render(el, html`<div class="container page">${loading(t("report.loading"))}</div>`);
      try {
        ({ item } = await api.get(`/items/${params.id}`));
        if (!item.can_manage) throw Object.assign(new Error(t("report.not_yours")), { status: 403 });
        existing = item.photos || [];
      } catch (err) {
        return render(el, html`<div class="container page" style="padding-top:40px">${errorState(err)}</div>`);
      }
    } else if (query.like) {
      // "Report it as found" from a lost report: start from its category and colour.
      try {
        const { item: lost } = await api.get(`/items/${query.like}`);
        item = { type: "found", category: lost.category, color: lost.color, title: lost.title.replace(/^(lost|my)\s+/i, "") };
      } catch {
        /* ignore */
      }
    }
    const type = item?.type || (params.type === "found" ? "found" : "lost");
    draw(item, type);
  };

  function draw(item, type) {
    const { categories, colors, limits } = store.meta;
    const v = item || {};
    render(
      el,
      html`<div class="page narrow" style="padding-top:30px">
        <div class="page-head" style="padding-top:10px">
          <span class="eyebrow">${icon(editing ? "pencil" : "file-plus-2")}${editing ? t("title.edit_report") : t("title.new_report")}</span>
          <h1 style="font-size:clamp(1.8rem,3.4vw,2.5rem)">${editing ? t("report.h_edit") : t("report.h_new")}</h1>
          <p>${t("report.lead")}</p>
        </div>
        <form id="report-form" class="stack" style="--gap:22px" novalidate>
          <input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          ${editing ? "" : html`<section class="panel">
            <h3>${icon("list-checks")} ${t("report.what")}</h3>
            <div class="type-picker" data-field="type">
              <label class="type-option lost"><input type="radio" name="type" value="lost" ${type === "lost" ? raw("checked") : ""}><span class="ico">${icon("search")}</span><span><strong>${t("report.i_lost")}</strong><span class="small muted">${t("report.i_lost_sub")}</span></span></label>
              <label class="type-option found"><input type="radio" name="type" value="found" ${type === "found" ? raw("checked") : ""}><span class="ico">${icon("hand-heart")}</span><span><strong>${t("report.i_found")}</strong><span class="small muted">${t("report.i_found_sub")}</span></span></label>
            </div>
          </section>`}

          <section class="panel stack">
            <div class="row between"><h3 style="margin:0">${icon("images")} ${t("report.photos")} <span class="optional">${t("report.up_to", { n: limits.photos })}</span></h3><span class="badge badge-violet">${icon("sparkles")}${t("report.ai_assisted")}</span></div>
            <p class="small muted" style="margin:0" id="photo-hint">${type === "found" ? t("report.photo_hint_found") : t("report.photo_hint_lost")}</p>
            <div data-field="photos">
              <label class="dropzone" id="dz"><input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" multiple><div class="dz-icon">${icon("image-up")}</div><strong>${t("report.drop")}</strong><div class="tiny muted">${t("report.drop_sub", { mb: limits.photoMb })}</div></label>
              <div class="photo-previews" id="previews"></div>
            </div>
            <div id="ai-box"></div>
          </section>

          <section class="panel">
            <h3>${icon("file-text")} ${t("report.details")}</h3>
            <div class="form-grid">
              <div class="field full"><label for="title">${t("report.name")}</label><input class="input" id="title" name="title" maxlength="120" value="${v.title || ""}" placeholder="${t("report.name_ph")}" required></div>
              <div class="field"><label for="category">${t("report.category")}</label>
                <select class="select" id="category" name="category" required><option value="">${t("report.category_ph")}</option>${categories.map((c) => html`<option value="${c.slug}" ${v.category === c.slug ? raw("selected") : ""}>${c.label}</option>`)}</select></div>
              <div class="field"><label for="brand">${t("report.brand")} <span class="optional">${t("common.optional")}</span></label><input class="input" id="brand" name="brand" maxlength="100" value="${v.brand || ""}" placeholder="${t("report.brand_ph")}"></div>
              <div class="field full" data-field="color"><label>${t("report.colour")} <span class="optional">${t("common.optional")}</span></label>
                <div class="filter-chips">${colors.map((c) => html`<label class="chip"><input type="radio" name="color" value="${c.slug}" ${v.color === c.slug ? raw("checked") : ""}>${colorDot(c.slug)}${c.label}</label>`)}</div></div>
              <div class="field full"><label for="description">${t("report.description")}</label><textarea class="textarea" id="description" name="description" maxlength="2000" placeholder="${t("report.description_ph")}" required>${v.description || ""}</textarea><span class="hint"><span id="desc-count">0</span>/2000</span></div>
              <div class="field"><label for="event_date" id="date-label">${type === "found" ? t("report.date_found") : t("report.date_lost")}</label><input class="input" type="date" id="event_date" name="event_date" max="${today()}" value="${v.event_date || today()}" required></div>
            </div>
          </section>

          <section class="panel stack">
            <h3 style="margin:0">${icon("map-pin")} ${t("report.where")}</h3>
            <div class="field"><label for="location_name">${t("report.place")}</label><input class="input" id="location_name" name="location_name" maxlength="255" value="${v.location_name || ""}" placeholder="${t("report.place_ph")}" required><span class="hint">${t("report.place_hint")}</span></div>
            <div>
              <div class="map-search">
                <div class="input-icon grow">${icon("search")}<input class="input" id="place-q" placeholder="${t("report.search_place")}"></div>
                <button type="button" class="btn" id="locate" title="${t("report.my_location")}">${icon("locate-fixed")}<span>${t("report.my_location")}</span></button>
              </div>
              <div id="place-results" class="filter-chips" style="margin-bottom:10px"></div>
              <div class="picker-map" id="picker"></div>
              <p class="tiny muted" style="margin-top:8px">${icon("shield-check")} ${t("report.map_privacy")}</p>
            </div>
            <input type="hidden" name="latitude" id="lat" value="${v.exact_location?.lat ?? ""}"><input type="hidden" name="longitude" id="lng" value="${v.exact_location?.lng ?? ""}">
          </section>

          <section class="panel stack">
            <h3 style="margin:0">${icon("lock")} ${t("report.private_h")}</h3>
            <div class="field"><label for="private_details"><span id="private-label">${type === "found" ? t("report.private_found") : t("report.private_lost")}</span> <span class="optional">${t("report.private_only")}</span></label>
              <textarea class="textarea" id="private_details" name="private_details" maxlength="1000" placeholder="${type === "found" ? t("report.private_found_ph") : t("report.private_lost_ph")}">${v.private_details || ""}</textarea></div>
            <label class="check"><input type="checkbox" name="is_valuable" id="is_valuable" ${v.is_valuable ? raw("checked") : ""}><span><strong>${t("report.valuable")}</strong><br><span class="small muted">${t("report.valuable_sub")}</span></span></label>
          </section>

          <div class="row between">
            <a class="btn btn-ghost" href="${editing ? `/items/${params.id}` : "/"}" data-link>${t("common.cancel")}</a>
            <button class="btn btn-primary btn-lg" type="submit">${icon(editing ? "save" : "send")}${editing ? t("report.save") : t("report.publish")}</button>
          </div>
        </form>
      </div>`
    );

    const form = $("#report-form");
    const desc = $("#description");
    const count = () => ($("#desc-count").textContent = desc.value.length);
    desc.addEventListener("input", count);
    count();

    form.addEventListener("change", (e) => {
      if (e.target.name !== "type") return;
      const found = e.target.value === "found";
      $("#date-label").textContent = found ? t("report.date_found") : t("report.date_lost");
      $("#private-label").textContent = found ? t("report.private_found") : t("report.private_lost");
      $("#private_details").placeholder = found ? t("report.private_found_ph") : t("report.private_lost_ph");
      $("#photo-hint").textContent = found ? t("report.photo_hint_found") : t("report.photo_hint_lost");
    });

    // Photos
    const input = $("#photo-input");
    const dz = $("#dz");
    input.addEventListener("change", () => {
      addFiles([...input.files]);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => (e.preventDefault(), dz.classList.add("drag"))));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("drag")));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      addFiles([...e.dataTransfer.files]);
    });
    drawPreviews();

    // Map
    const latEl = $("#lat");
    const lngEl = $("#lng");
    const startAt = latEl.value ? { lat: Number(latEl.value), lng: Number(lngEl.value) } : null;
    pickerMap($("#picker"), {
      value: startAt,
      onPick: async ({ lat, lng }) => {
        latEl.value = lat;
        lngEl.value = lng;
        const name = await reverseGeocode(lat, lng);
        if (name && (!$("#location_name").value || $("#location_name").dataset.auto)) {
          $("#location_name").value = name;
          $("#location_name").dataset.auto = "1";
        }
      },
    }).then((p) => (picker = p));
    $("#location_name").addEventListener("input", (e) => delete e.target.dataset.auto);
    $("#locate").addEventListener("click", () => picker?.locate().catch((err) => toast(err.message, "error")));
    $("#place-q").addEventListener("input", debounce(async (e) => {
      const q = e.target.value.trim();
      const box = $("#place-results");
      if (q.length < 3) return render(box, "");
      try {
        const res = await searchPlace(q);
        render(box, html`${res.slice(0, 4).map((r, i) => html`<button type="button" class="chip" data-place="${i}">${icon("map-pin")}${r.display_name.split(",").slice(0, 2).join(",")}</button>`)}`);
        $$("[data-place]", box).forEach((b) => b.addEventListener("click", () => {
          const r = res[Number(b.dataset.place)];
          picker?.setView(Number(r.lat), Number(r.lon));
          render(box, "");
        }));
      } catch {
        /* geocoder unavailable */
      }
    }, 500));
    $("#place-q").addEventListener("keydown", (e) => e.key === "Enter" && e.preventDefault());

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit(form);
    });
  }

  function addFiles(files) {
    const { limits } = store.meta;
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        toast(t("photo.bad_type_named", { name: f.name }), "error");
        continue;
      }
      if (f.size > limits.photoMb * 1024 * 1024) {
        toast(t("photo.too_big_named", { name: f.name, mb: limits.photoMb }), "error");
        continue;
      }
      if (photos.length + existing.length - removeIds.size >= limits.photos) {
        toast(t("photo.max", { n: limits.photos }), "error");
        break;
      }
      photos.push({ file: f, url: URL.createObjectURL(f) });
    }
    drawPreviews();
    if (!suggested && photos.length) suggest(photos[0].file);
  }

  function drawPreviews() {
    const box = $("#previews");
    if (!box) return;
    const shown = existing.filter((p) => !removeIds.has(p.id));
    render(
      box,
      html`${shown.map((p, i) => html`<div class="ph"><img src="${p.thumb}" alt="">${i === 0 ? html`<span class="badge badge-glass main-tag tiny">${t("report.cover")}</span>` : ""}<button type="button" data-rm-existing="${p.id}" aria-label="${t("report.remove_photo")}">${icon("x")}</button></div>`)}
      ${photos.map((p, i) => html`<div class="ph"><img src="${p.url}" alt="">${!shown.length && i === 0 ? html`<span class="badge badge-glass main-tag tiny">${t("report.cover")}</span>` : ""}<button type="button" data-rm="${i}" aria-label="${t("report.remove_photo")}">${icon("x")}</button></div>`)}`
    );
    $$("[data-rm]", box).forEach((b) => b.addEventListener("click", () => {
      const [p] = photos.splice(Number(b.dataset.rm), 1);
      URL.revokeObjectURL(p.url);
      drawPreviews();
    }));
    $$("[data-rm-existing]", box).forEach((b) => b.addEventListener("click", () => {
      removeIds.add(Number(b.dataset.rmExisting));
      drawPreviews();
    }));
  }

  // Ask the AI what the photo shows and offer it as one-click suggestions.
  async function suggest(file) {
    suggested = true;
    const box = $("#ai-box");
    render(box, html`<div class="ai-suggest"><div class="row">${icon("sparkles")}<span class="small">${t("report.ai_looking")}</span><div class="spinner" style="width:18px;height:18px;border-width:2px"></div></div></div>`);
    const fd = new FormData();
    fd.append("photo", file);
    try {
      const s = await api.post("/ai/analyze", fd);
      const cats = s.categories.filter((c) => c.confidence >= 0.1).slice(0, 2);
      const cols = s.colors.filter((c) => c.confidence >= 0.15).slice(0, 2);
      if (!cats.length && !cols.length) return render(box, "");
      render(box, html`<div class="ai-suggest">
        <div class="small" style="margin-bottom:8px">${icon("sparkles")} <strong>${t("report.ai_h")}</strong> <span class="muted">${t("report.ai_sub")}</span></div>
        <div class="row">${cats.map((c) => html`<button type="button" class="chip" data-cat="${c.value}">${icon(category(c.value).icon)}${category(c.value).label} <span class="muted tiny">${Math.round(c.confidence * 100)}%</span></button>`)}
        ${cols.map((c) => html`<button type="button" class="chip" data-col="${c.value}">${colorDot(c.value)}${store.meta.colors.find((x) => x.slug === c.value)?.label} <span class="muted tiny">${Math.round(c.confidence * 100)}%</span></button>`)}</div>
      </div>`);
      $$("[data-cat]", box).forEach((b) => b.addEventListener("click", () => {
        $("#category").value = b.dataset.cat;
        b.classList.add("on");
      }));
      $$("[data-col]", box).forEach((b) => b.addEventListener("click", () => {
        const r = document.querySelector(`input[name="color"][value="${b.dataset.col}"]`);
        if (r) r.checked = true;
        b.classList.add("on");
      }));
    } catch (err) {
      render(box, err.status === 503 ? html`<p class="tiny muted">${icon("info")} ${t("report.ai_unavailable")}</p>` : "");
    }
  }

  function clientCheck(form) {
    const fields = {};
    const val = (n) => form.elements[n]?.value?.trim() || "";
    if (!editing && !form.querySelector('input[name="type"]:checked')) fields.type = t("report.e_type");
    if (val("title").length < 3) fields.title = t("report.e_title");
    if (!val("category")) fields.category = t("report.e_category");
    if (val("description").length < 10) fields.description = t("report.e_description");
    if (!val("event_date")) fields.event_date = t("report.e_date");
    if (val("location_name").length < 2) fields.location_name = t("report.e_location");
    return Object.keys(fields).length ? { fields } : null;
  }

  async function submit(form) {
    const bad = clientCheck(form);
    if (bad) {
      showErrors(form, bad);
      return toast(t("report.check_fields"), "error");
    }
    showErrors(form, null);
    const fd = new FormData(form);
    fd.delete("photos");
    if (!fd.get("color")) fd.set("color", "");
    fd.set("is_valuable", form.is_valuable.checked ? "1" : "");
    photos.forEach((p) => fd.append("photos", p.file, p.file.name));
    if (editing) fd.set("remove_photo_ids", [...removeIds].join(","));
    await withButton(form.querySelector('[type="submit"]'), async () => {
      try {
        if (editing) {
          await api.patch(`/items/${params.id}`, fd);
          toast(t("report.saved"), "ok");
          navigate(`/items/${params.id}`);
        } else {
          const r = await api.post("/items", fd);
          success(r);
        }
      } catch (err) {
        showErrors(form, err);
        toast(err.message, "error");
      }
    });
  }

  function success(r) {
    const it = r.item;
    window.scrollTo({ top: 0, behavior: "smooth" });
    render(
      el,
      html`<div class="page narrow" style="padding-top:50px">
        <div class="panel center stack" style="--gap:14px;padding:40px 26px">
          <div style="width:84px;height:84px;margin:0 auto;border-radius:26px;display:grid;place-items:center;background:var(--mint-soft);color:var(--mint);animation:pop .5s var(--ease)">${icon("circle-check")}</div>
          <h2>${r.held ? t("report.ok_held_h") : t("report.ok_h")}</h2>
          <p class="muted" style="max-width:520px;margin:0 auto">${r.held ? t("report.ok_held_p", { reason: r.held }) : it.type === "lost" ? t("report.ok_lost_p") : t("report.ok_found_p")}</p>
          ${!r.held && r.matches
            ? html`<div class="alert alert-info" style="text-align:start;max-width:520px;margin:6px auto">${icon("sparkles")}<div><strong>${tn("report.matches_found", r.matches)}</strong> ${t("report.matches_best", { score: r.top_score })}</div></div>`
            : ""}
          <div class="row" style="justify-content:center;margin-top:8px">
            ${!r.held && r.matches ? html`<a class="btn btn-primary" href="/dashboard/matches" data-link>${icon("git-compare-arrows")}${t("report.review_matches")}</a>` : ""}
            <a class="btn ${!r.held && r.matches ? "" : "btn-primary"}" href="/items/${it.id}" data-link>${icon("eye")}${t("report.view")}</a>
            <a class="btn btn-ghost" href="/report/${it.type}" data-link>${icon("plus")}${t("report.another")}</a>
          </div>
        </div>
      </div>`
    );
  }

  start();
  return () => {
    picker?.destroy();
    photos.forEach((p) => URL.revokeObjectURL(p.url));
  };
}
