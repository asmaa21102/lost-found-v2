// One report: photos, details, approximate area, actions, matches (owner) and similar reports.
import { api } from "../api.js";
import { html, icon, render, $, $$, formatDate, timeAgo } from "../lib.js";
import { typeBadge, statusBadge, colorDot, itemCard, errorState, toast, confirmDialog, lightbox, bindSaveButtons, reasonList, strengthBadge, shortPlace, claimStatusLabel } from "../components.js";
import { store, category, color } from "../store.js";
import { areaMap } from "../map.js";
import { claimDialog, flagDialog } from "../dialogs.js";
import { navigate } from "../router.js";
import { t, tn } from "../i18n.js";

export default function itemPage({ el, params }) {
  let destroyMap = null;
  const skeleton = html`<div class="page container" style="padding-top:30px"><div class="item-layout"><div><div class="skeleton" style="aspect-ratio:4/3;border-radius:24px"></div></div><div class="stack"><div class="skeleton sk-line w40"></div><div class="skeleton" style="height:40px;width:80%"></div><div class="skeleton sk-line w80"></div><div class="skeleton sk-line w60"></div><div class="skeleton" style="height:160px;border-radius:16px"></div></div></div></div>`;
  render(el, skeleton);

  const load = async () => {
    try {
      const { item, similar } = await api.get(`/items/${params.id}`);
      document.title = `${item.title} · Lost & Found`;
      show(item, similar);
    } catch (err) {
      render(el, html`<div class="container page" style="padding-top:40px">${errorState(err, load)}</div>`);
    }
  };

  function show(item, similar) {
    const cat = category(item.category);
    const photos = item.photos || [];
    const signedIn = !!store.user;
    const open = item.status === "active";

    let actions;
    if (item.can_manage) {
      actions = html`
        <a class="btn btn-primary" href="/items/${item.id}/edit" data-link>${icon("pencil")}${t("item.edit")}</a>
        ${open ? html`<button class="btn btn-found" data-status="${item.type === "found" ? "returned" : "resolved"}">${icon("badge-check")}${item.type === "found" ? t("item.mark_returned") : t("item.got_back")}</button>` : ""}
        ${open ? html`<button class="btn" data-status="closed">${icon("archive")}${t("item.close")}</button>` : item.status !== "pending_review" && item.status !== "removed" ? html`<button class="btn" data-status="active">${icon("rotate-ccw")}${t("item.reopen")}</button>` : ""}
        <button class="btn btn-danger" id="delete">${icon("trash-2")}${t("common.delete")}</button>`;
    } else if (item.my_claim) {
      actions = html`<a class="btn btn-primary btn-lg btn-block" href="/claims/${item.my_claim.id}" data-link>${icon("handshake")}${t("item.view_request", { status: claimStatusLabel(item.my_claim.status) })}</a>`;
    } else if (open) {
      const label = item.type === "found" ? t("item.claim_found") : t("item.claim_lost");
      actions = signedIn
        ? html`<button class="btn btn-primary btn-lg btn-block" id="claim">${icon(item.type === "found" ? "hand" : "hand-heart")}${label}</button>
               ${item.type === "lost" ? html`<a class="btn btn-block" href="/report/found?like=${item.id}" data-link>${icon("plus")}${t("item.report_as_found")}</a>` : ""}`
        : html`<a class="btn btn-primary btn-lg btn-block" href="/login?next=/items/${item.id}" data-link>${icon("log-in")}${item.type === "found" ? t("item.login_request") : t("item.login_contact")}</a>`;
    } else {
      actions = html`<div class="alert alert-ok">${icon("badge-check")}<div>${item.status === "returned" || item.status === "resolved" ? t("item.reunited") : t("item.inactive")}</div></div>`;
    }

    render(
      el,
      html`<div class="page container" style="padding-top:26px">
        <nav class="small muted" style="margin-bottom:16px"><a href="/browse" data-link>${icon("arrow-left")} ${t("item.back")}</a></nav>
        ${item.status === "pending_review" ? html`<div class="alert alert-warn" style="margin-bottom:18px">${icon("clock")}<div><strong>${t("item.pending_h")}</strong> ${t("item.pending_p")}${item.moderation_note ? html` — ${item.moderation_note}` : ""}</div></div>` : ""}
        ${item.status === "removed" ? html`<div class="alert alert-danger" style="margin-bottom:18px">${icon("ban")}<div><strong>${t("item.removed_h")}</strong> ${item.moderation_note || ""}</div></div>` : ""}
        <div class="item-layout">
          <div class="stack">
            <div class="gallery">
              <div class="main-photo" id="main-photo">${photos.length ? html`<img src="${photos[0].url}" alt="${item.title}" id="main-img">` : html`<div class="no-photo" style="height:100%;display:grid;place-items:center;color:var(--ink-3)">${icon(cat.icon)}<span class="small">${t("item.no_photo")}</span></div>`}
                <div class="badges" style="position:absolute;top:14px;inset-inline-start:14px;display:flex;gap:6px">${typeBadge(item.type)}${statusBadge(item.status, { glass: true })}</div>
              </div>
              ${photos.length > 1 ? html`<div class="thumbs">${photos.map((p, i) => html`<button class="${i === 0 ? "on" : ""}" data-photo="${i}" aria-label="${t("item.photo_n", { n: i + 1 })}"><img src="${p.thumb}" alt=""></button>`)}</div>` : ""}
            </div>
            <div class="card card-pad">
              <h3>${icon("map-pin")} ${t("item.area")}</h3>
              ${item.location ? html`<div class="mini-map" id="area-map"></div>` : html`<p class="muted small">${t("item.no_map")}</p>`}
              <p class="small" style="margin:12px 0 10px"><strong>${item.location_name || "—"}</strong></p>
              <div class="privacy-note">${icon("shield-check")}<span>${t("item.area_note", { m: item.location?.radius_m || 300 })}${item.can_manage && item.exact_location ? " " + t("item.area_note_owner") : ""}</span></div>
            </div>
          </div>

          <div class="stack">
            <div>
              <div class="row" style="margin-bottom:10px">${typeBadge(item.type, true)}<span class="badge">${icon(cat.icon)}${cat.label}</span>${item.is_valuable ? html`<span class="badge badge-amber">${icon("gem")}${t("item.valuable")}</span>` : ""}</div>
              <h1 style="font-size:clamp(1.7rem,3vw,2.4rem)">${item.title}</h1>
              <p class="muted small">${t("item.reported_by", { when: timeAgo(item.created_at), who: item.is_mine ? t("item.you") : item.owner.name })}</p>
            </div>
            <p style="white-space:pre-wrap;color:var(--ink-2)">${item.description}</p>
            <div class="facts">
              <div class="fact"><div class="k">${icon("calendar")}${item.type === "lost" ? t("item.lost_on") : t("item.found_on")}</div><div class="v">${formatDate(item.event_date)}</div></div>
              <div class="fact"><div class="k">${icon("palette")}${t("item.colour")}</div><div class="v">${item.color ? html`${colorDot(item.color)}${color(item.color)?.label}` : "—"}</div></div>
              <div class="fact"><div class="k">${icon("badge")}${t("item.brand")}</div><div class="v">${item.brand || "—"}</div></div>
              <div class="fact"><div class="k">${icon("map-pin")}${t("item.place")}</div><div class="v">${shortPlace(item.location_name)}</div></div>
            </div>
            ${item.can_manage && item.private_details ? html`<div class="private-box"><div class="small" style="font-weight:700;margin-bottom:4px">${icon("lock")} ${t("item.private_h")}</div><div class="small" style="white-space:pre-wrap">${item.private_details}</div></div>` : ""}
            <div class="stack" style="--gap:10px">${actions}</div>
            <div class="row">
              ${signedIn && !item.is_mine ? html`<button class="btn btn-ghost btn-sm" id="save">${icon("bookmark")}<span>${item.saved ? t("save.saved") : t("save.save")}</span></button>` : ""}
              <button class="btn btn-ghost btn-sm" id="share">${icon("share-2")}${t("item.share")}</button>
              ${signedIn && !item.is_mine ? html`<button class="btn btn-ghost btn-sm" id="flag">${icon("flag")}${t("item.report_listing")}</button>` : ""}
            </div>
            ${item.can_manage ? ownerPanel(item) : html`<div class="alert">${icon("info")}<div class="small">${t("item.safety")} <a href="/privacy#safety" data-link>${t("item.safety_link")}</a></div></div>`}
          </div>
        </div>

        ${similar.length ? html`<section class="section" style="padding-bottom:0"><div class="section-head"><div><span class="eyebrow">${icon("layers")}${t("item.related")}</span><h2>${t("item.similar")}</h2></div></div><div class="items-grid stagger" id="similar">${similar.map((s) => itemCard(s))}</div></section>` : ""}
      </div>`
    );

    // Gallery
    $$("[data-photo]", el).forEach((b) =>
      b.addEventListener("click", () => {
        $$("[data-photo]", el).forEach((x) => x.classList.toggle("on", x === b));
        $("#main-img").src = photos[Number(b.dataset.photo)].url;
      })
    );
    $("#main-img")?.addEventListener("click", () => lightbox($("#main-img").src, item.title));

    if (item.location) areaMap($("#area-map"), item.location, item.type).then((d) => (destroyMap = d));

    $("#claim")?.addEventListener("click", () => claimDialog(item));
    $("#flag")?.addEventListener("click", () => flagDialog("item", item.id));
    $("#share").addEventListener("click", async () => {
      const url = location.origin + "/items/" + item.id;
      try {
        if (navigator.share) await navigator.share({ title: item.title, url });
        else {
          await navigator.clipboard.writeText(url);
          toast(t("item.link_copied"), "ok", { ms: 2000 });
        }
      } catch {
        /* cancelled */
      }
    });
    $("#save")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      try {
        const { saved } = await api.post(`/items/${item.id}/save`);
        btn.querySelector("span").textContent = saved ? t("save.saved") : t("save.save");
        toast(saved ? t("save.toast_saved") : t("save.toast_removed"), "ok", { ms: 2000 });
      } catch (err) {
        toast(err.message, "error");
      }
    });
    $$("[data-status]", el).forEach((b) =>
      b.addEventListener("click", async () => {
        const s = b.dataset.status;
        const k = s === "closed" ? "close" : s === "active" ? "reopen" : "done";
        const ok = await confirmDialog({ title: t(`item.c_${k}_h`), text: t(`item.c_${k}_p`), confirm: t(`item.c_${k}_btn`) });
        if (!ok) return;
        try {
          await api.post(`/items/${item.id}/status`, { status: s });
          toast(t("item.updated"), "ok");
          load();
        } catch (err) {
          toast(err.message, "error");
        }
      })
    );
    $("#delete")?.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: t("item.del_h"), text: t("item.del_p"), confirm: t("common.delete"), danger: true });
      if (!ok) return;
      try {
        await api.del(`/items/${item.id}`);
        toast(t("item.deleted"), "ok");
        navigate("/dashboard");
      } catch (err) {
        toast(err.message, "error");
      }
    });
    if ($("#similar")) bindSaveButtons($("#similar"));
  }

  function ownerPanel(item) {
    const claims = (item.claims || []).reduce((s, c) => s + (["pending", "under_review", "approved"].includes(c.status) ? c.n : 0), 0);
    return html`<div class="card card-pad stack" style="--gap:14px">
      <div class="row between"><h3 style="margin:0">${icon("git-compare-arrows")} ${t("item.possible_matches")}</h3><span class="tiny muted">${tn("item.views", item.views || 0)}</span></div>
      ${claims ? html`<a class="alert alert-info" href="/dashboard/claims" data-link>${icon("handshake")}<div><strong>${tn("item.open_requests", claims)}</strong> ${t("item.open_requests_p")}</div></a>` : ""}
      ${item.matches?.length
        ? item.matches.map((m) => html`<div class="match-side" style="align-items:flex-start">
            <a href="/items/${m.item.id}" data-link style="flex:none">${m.item.photos?.[0] ? html`<img src="${m.item.photos[0].thumb}" alt="">` : html`<div class="no-photo">${icon(category(m.item.category).icon)}</div>`}</a>
            <div class="txt grow"><div class="row between"><a href="/items/${m.item.id}" data-link><strong>${m.item.title}</strong></a><span class="score-pill" style="background:var(--surface-2)">${m.score}%</span></div>
              <div style="margin:6px 0">${strengthBadge(m.strength)}</div>
              ${reasonList(m.reasons.slice(0, 3))}</div></div>`)
        : html`<p class="muted small" style="margin:0">${item.type === "lost" ? t("item.no_matches_lost") : t("item.no_matches_found")}</p>`}
      ${item.matches?.length ? html`<a class="btn btn-sm" href="/dashboard/matches" data-link>${t("item.review_matches")} ${icon("arrow-right")}</a>` : ""}
    </div>`;
  }

  load();
  return () => destroyMap?.();
}
