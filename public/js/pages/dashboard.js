// Personal dashboard.
import { api } from "../api.js";
import { html, icon, render, $, $$, raw, timeAgo, initials, formatDate } from "../lib.js";
import { itemCard, skeletonCards, skeletonRows, emptyState, errorState, toast, confirmDialog, bindSaveButtons, typeBadge, statusBadge, claimBadge, claimStatusLabel, reasonList, scoreRing, strengthBadge, showErrors, withButton } from "../components.js";
import { store, setUnread, setSession, category } from "../store.js";
import { claimDialog, flagDialog } from "../dialogs.js";
import { navigate } from "../router.js";
import { t, tn } from "../i18n.js";

const TABS = [
  ["", "layout-dashboard", "dash.overview"],
  ["lost", "search", "dash.lost"],
  ["found", "hand-heart", "dash.found"],
  ["saved", "bookmark", "dash.saved"],
  ["matches", "git-compare-arrows", "dash.matches"],
  ["claims", "handshake", "dash.claims"],
  ["notifications", "bell", "nav.notifications"],
  ["settings", "settings", "dash.settings"],
];

export default function dashboard({ el, params }) {
  const tab = TABS.some((x) => x[0] === (params.tab || "")) ? params.tab || "" : "";
  const u = store.user;
  render(
    el,
    html`<div class="page container" style="padding-top:30px">
      <div class="row between" style="margin-bottom:24px">
        <div class="row"><span class="avatar lg">${initials(u.full_name || u.username)}</span><div><h2 style="margin:0">${t("dash.hi", { name: (u.full_name || u.username).split(" ")[0] })}</h2><div class="small muted">@${u.username} · ${t("dash.since", { date: formatDate(u.created_at) })}</div></div></div>
        <div class="row"><a class="btn btn-lost" href="/report/lost" data-link>${icon("search")}${t("dash.lost_something")}</a><a class="btn btn-found" href="/report/found" data-link>${icon("hand-heart")}${t("dash.found_something")}</a></div>
      </div>
      <div class="dash">
        <nav class="card side-nav" id="side-nav" aria-label="${t("title.dashboard")}">
          ${TABS.map(([k, i, l], n) => html`${n === 6 ? raw('<div class="sep"></div>') : ""}<a href="/dashboard${k ? "/" + k : ""}" data-link class="${tab === k ? "active" : ""}">${icon(i)}${t(l)}<span class="count hidden" data-count="${k}"></span></a>`)}
        </nav>
        <section id="tab"></section>
      </div>
    </div>`
  );

  api.get("/me/summary").then((s) => {
    const set = (k, n, hot = false) => {
      const c = el.querySelector(`[data-count="${k}"]`);
      if (!c || !n) return;
      c.textContent = n;
      c.classList.remove("hidden");
      c.classList.toggle("hot", hot);
    };
    set("lost", s.lost);
    set("found", s.found);
    set("saved", s.saved);
    set("matches", s.matches_new, true);
    set("claims", s.claims_incoming + s.claims_outgoing, s.claims_incoming > 0);
    set("notifications", s.unread, true);
    if (tab === "") overview($("#tab"), s);
  }).catch(() => {});

  const box = $("#tab");
  if (tab === "") render(box, skeletonRows(3));
  else if (tab === "lost" || tab === "found") myItems(box, tab);
  else if (tab === "saved") saved(box);
  else if (tab === "matches") matches(box);
  else if (tab === "claims") claims(box);
  else if (tab === "notifications") notifications(box);
  else if (tab === "settings") settings(box);
}

const head = (title, text, extra = "") => html`<div class="row between" style="margin-bottom:16px"><div><h2 style="margin:0">${title}</h2>${text ? html`<p class="small muted" style="margin:4px 0 0">${text}</p>` : ""}</div>${extra}</div>`;

// ── Overview ──────────────────────────────────────────
async function overview(box, s) {
  const kpi = (href, n, label, ico) => html`<a class="kpi" href="${href}" data-link><span class="l">${icon(ico)}${label}</span><span class="n">${n}</span></a>`;
  render(
    box,
    html`${head(t("dash.overview"), t("dash.overview_p"))}
    <div class="kpis stagger">
      ${kpi("/dashboard/lost", s.lost_active, t("dash.k_lost"), "search")}
      ${kpi("/dashboard/found", s.found_active, t("dash.k_found"), "hand-heart")}
      ${kpi("/dashboard/matches", s.matches_new, t("dash.k_matches"), "sparkles")}
      ${kpi("/dashboard/claims", s.claims_incoming, t("dash.k_claims"), "inbox")}
    </div>
    ${s.matches_new ? html`<a class="alert alert-info" href="/dashboard/matches" data-link style="margin-top:18px">${icon("sparkles")}<div><strong>${tn("dash.matches_alert", s.matches_new)}</strong> ${t("dash.matches_alert_p")}</div></a>` : ""}
    ${s.claims_incoming ? html`<a class="alert alert-warn" href="/dashboard/claims" data-link style="margin-top:12px">${icon("handshake")}<div><strong>${tn("dash.claims_alert", s.claims_incoming)}</strong> ${t("dash.claims_alert_p")}</div></a>` : ""}
    <div class="row between" style="margin:30px 0 14px"><h3 style="margin:0">${t("dash.activity")}</h3><a class="small" href="/dashboard/notifications" data-link>${t("dash.all_notifications")}</a></div>
    <div id="ov-notifs">${skeletonRows(3)}</div>
    <div class="row between" style="margin:30px 0 14px"><h3 style="margin:0">${t("dash.latest")}</h3><a class="small" href="/dashboard/lost" data-link>${t("common.see_all")}</a></div>
    <div id="ov-items">${skeletonCards(3)}</div>`
  );
  api.get("/notifications?limit=4").then(({ notifications }) => render($("#ov-notifs"), notifications.length ? notifList(notifications) : emptyState({ icon: "bell", title: t("dash.no_activity_h"), text: t("dash.no_activity_p") }))).catch(() => {});
  api.get("/me/items").then(({ items }) => {
    const b = $("#ov-items");
    if (!b) return;
    render(b, items.length ? html`<div class="items-grid stagger">${items.slice(0, 3).map((i) => itemCard(i, { showSave: false, extra: ownerExtra(i) }))}</div>` : emptyState({ icon: "file-plus-2", title: t("dash.no_reports_h"), text: t("dash.no_reports_p"), actions: html`<a class="btn btn-primary" href="/report/lost" data-link>${t("nav.report")}</a>` }));
  }).catch(() => {});
}

const ownerExtra = (i) => html`<span class="row" style="gap:6px">${i.match_count ? html`<span class="badge badge-violet" title="${t("dash.possible_matches")}">${icon("sparkles")}${i.match_count}</span>` : ""}${i.claim_count ? html`<span class="badge badge-amber" title="${t("dash.open_requests")}">${icon("handshake")}${i.claim_count}</span>` : ""}${i.status !== "active" ? statusBadge(i.status) : ""}</span>`;

// ── My items ──────────────────────────────────────────
async function myItems(box, type) {
  render(box, html`${head(t("dash." + type), t(`dash.${type}_p`), html`<a class="btn btn-primary btn-sm" href="/report/${type}" data-link>${icon("plus")}${t("dash.new_report")}</a>`)}<div id="list">${skeletonCards(6)}</div>`);
  try {
    const { items } = await api.get(`/me/items?type=${type}`);
    render($("#list"), items.length
      ? html`<div class="items-grid stagger">${items.map((i) => itemCard(i, { showSave: false, extra: ownerExtra(i) }))}</div>`
      : emptyState({ icon: type === "lost" ? "search" : "hand-heart", title: t(`dash.${type}_empty_h`), text: t(`dash.${type}_empty_p`), actions: html`<a class="btn btn-primary" href="/report/${type}" data-link>${icon("plus")}${t("cta.report_" + type)}</a>` }));
  } catch (err) {
    render($("#list"), errorState(err, () => myItems(box, type)));
  }
}

async function saved(box) {
  render(box, html`${head(t("dash.saved"), t("dash.saved_p"))}<div id="list">${skeletonCards(6)}</div>`);
  bindSaveButtons(box);
  try {
    const { items } = await api.get("/me/saved");
    render($("#list"), items.length ? html`<div class="items-grid stagger">${items.map((i) => itemCard(i))}</div>` : emptyState({ icon: "bookmark", title: t("dash.saved_empty_h"), text: t("dash.saved_empty_p"), actions: html`<a class="btn" href="/browse" data-link>${t("nav.browse_reports")}</a>` }));
  } catch (err) {
    render($("#list"), errorState(err, () => saved(box)));
  }
}

// ── Matches ───────────────────────────────────────────
async function matches(box) {
  render(box, html`${head(t("dash.matches"), t("dash.matches_p"))}<div id="list">${skeletonRows(3)}</div>`);
  try {
    const { matches: found } = await api.get("/matches");
    const list = $("#list");
    if (!found.length) return render(list, emptyState({ icon: "git-compare-arrows", title: t("dash.matches_empty_h"), text: t("dash.matches_empty_p") }));
    render(list, html`<div class="stack">${found.map(matchCard)}</div>`);
    list.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-respond], [data-claim], [data-report]");
      if (!b) return;
      const m = found.find((x) => x.id === Number(b.dataset.respond || b.dataset.claim || b.dataset.report));
      if (b.dataset.claim) return claimDialog(m.other, { matchId: m.id });
      if (b.dataset.report) return flagDialog("match", m.id, { label: t("flag.this_match") });
      const answer = b.dataset.answer;
      try {
        await api.post(`/matches/${m.id}/respond`, { response: answer });
        if (answer === "yes") {
          toast(m.side === "lost" ? t("dash.yes_lost") : t("dash.yes_found"), "ok");
          if (m.side === "lost") claimDialog(m.other, { matchId: m.id });
        } else toast(t("dash.no_toast"), "ok");
        matches(box);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  } catch (err) {
    render($("#list"), errorState(err, () => matches(box)));
  }
}

function side(item, label) {
  return html`<a class="match-side" href="/items/${item.id}" data-link>${item.photos?.[0] ? html`<img src="${item.photos[0].thumb}" alt="">` : html`<div class="no-photo">${icon(category(item.category).icon)}</div>`}<div class="txt"><span class="tiny muted">${label}</span><strong>${item.title}</strong><span class="row" style="gap:6px">${typeBadge(item.type, true)}<span class="tiny muted">${formatDate(item.event_date)}</span></span></div></a>`;
}

function matchCard(m) {
  const answered = m.my_response !== "pending";
  let actions;
  if (m.claim) actions = html`<a class="btn btn-primary btn-sm" href="/claims/${m.claim.id}" data-link>${icon("handshake")}${t("dash.view_request", { status: claimStatusLabel(m.claim.status) })}</a>`;
  else if (m.status === "confirmed") actions = html`<span class="badge badge-ok">${icon("badge-check")}${t("dash.confirmed")}</span>`;
  else if (m.side === "lost")
    actions = answered && m.my_response === "yes"
      ? html`<button class="btn btn-primary btn-sm" data-claim="${m.id}">${icon("send")}${t("dash.send_ownership")}</button>`
      : html`<button class="btn btn-primary btn-sm" data-respond="${m.id}" data-answer="yes">${icon("check")}${t("dash.could_be_mine")}</button><button class="btn btn-sm" data-respond="${m.id}" data-answer="no">${icon("x")}${t("dash.not_mine")}</button>`;
  else
    actions = answered
      ? html`<span class="small muted">${m.my_response === "yes" ? t("dash.told_owner_yes") : t("dash.told_owner_no")} ${t("dash.waiting_owner")}</span>`
      : html`<button class="btn btn-primary btn-sm" data-respond="${m.id}" data-answer="yes">${icon("check")}${t("dash.same_item")}</button><button class="btn btn-sm" data-respond="${m.id}" data-answer="no">${icon("x")}${t("dash.not_right")}</button>`;
  return html`<article class="card match-card">
    <div class="row between">${strengthBadge(m.strength)}<span class="tiny muted">${timeAgo(m.created_at)}${m.other_response === "yes" ? html` · <span style="color:var(--mint)">${m.side === "lost" ? t("dash.finder_thinks") : t("dash.owner_thinks")}</span>` : ""}</span></div>
    <div class="match-pair">${side(m.mine, t("dash.your_report"))}${scoreRing(m.score)}${side(m.other, m.side === "lost" ? t("dash.found_by") : t("dash.reported_lost"))}</div>
    <div><div class="small" style="font-weight:700;margin-bottom:8px">${t("dash.why")}</div>${reasonList(m.reasons)}</div>
    <div class="row between"><div class="row">${actions}</div><button class="btn btn-ghost btn-sm" data-report="${m.id}" title="${t("dash.report_match")}">${icon("flag")}${t("dash.report")}</button></div>
  </article>`;
}

// ── Claims ────────────────────────────────────────────
async function claims(box, which = "all") {
  render(
    box,
    html`${head(t("dash.claims"), t("dash.claims_p"))}
    <div class="tabs" id="claim-tabs">${[["all", t("common.all")], ["incoming", t("dash.to_review")], ["outgoing", t("dash.sent_by_me")]].map(([k, l]) => html`<button class="${which === k ? "on" : ""}" data-box="${k}">${l}</button>`)}</div>
    <div id="list">${skeletonRows(4)}</div>`
  );
  $("#claim-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-box]");
    if (b) claims(box, b.dataset.box);
  });
  try {
    const { claims: list } = await api.get(`/claims?box=${which}`);
    const describe = (c) =>
      c.role === "claimant"
        ? c.kind === "ownership" ? t("dash.c_you_asked") : t("dash.c_you_found")
        : c.kind === "ownership" ? t("dash.c_theirs", { name: c.other }) : t("dash.c_may_found", { name: c.other });
    render($("#list"), list.length
      ? html`<div class="card list">${list.map((c) => html`<a class="list-row" href="/claims/${c.id}" data-link>
          ${c.item.thumb ? html`<img class="thumb-sm" src="${c.item.thumb}" alt="">` : html`<span class="thumb-sm">${icon("package")}</span>`}
          <div class="main"><strong>${c.item.title}</strong><div class="tiny muted">${describe(c)} · ${timeAgo(c.updated_at || c.created_at)}</div></div>
          <div class="row" style="gap:6px">${c.disputed ? html`<span class="badge badge-danger">${icon("triangle-alert")}${t("dash.disputed")}</span>` : ""}${c.requires_admin ? html`<span class="badge badge-amber" title="${t("dash.needs_admin")}">${icon("shield")}</span>` : ""}${claimBadge(c.status)}${c.role === "owner" && c.status === "pending" ? html`<span class="badge badge-violet">${t("dash.needs_you")}</span>` : ""}</div>
        </a>`)}</div>`
      : emptyState({ icon: "handshake", title: which === "incoming" ? t("dash.claims_empty_in") : t("dash.claims_empty_h"), text: t("dash.claims_empty_p") }));
  } catch (err) {
    render($("#list"), errorState(err, () => claims(box, which)));
  }
}

// ── Notifications ─────────────────────────────────────
const N_ICON = { match: "git-compare-arrows", claim: "handshake", status: "refresh-cw", message: "message-circle", system: "bell" };
const notifList = (list) => html`<div class="card list">${list.map((n) => html`<a class="list-row ${n.is_read ? "" : "unread"}" href="${n.link || "#"}" data-link data-nid="${n.id}">
  <span class="notif-ico ${n.type}">${icon(N_ICON[n.type] || "bell")}</span>
  <div class="main"><strong>${n.title}</strong>${n.body ? html`<div class="small muted" style="white-space:normal">${n.body}</div>` : ""}<div class="tiny muted">${timeAgo(n.created_at)}</div></div>
  ${n.is_read ? "" : html`<span class="badge badge-violet">${t("dash.new")}</span>`}
</a>`)}</div>`;

async function notifications(box) {
  render(box, html`${head(t("nav.notifications"), t("dash.notif_p"), html`<button class="btn btn-sm" id="read-all">${icon("check-check")}${t("dash.mark_all_read")}</button>`)}<div id="list">${skeletonRows(5)}</div>`);
  const load = async () => {
    const { notifications: list, unread } = await api.get("/notifications?limit=100");
    setUnread(unread);
    render($("#list"), list.length ? notifList(list) : emptyState({ icon: "bell", title: t("dash.caught_up_h"), text: t("dash.caught_up_p") }));
  };
  $("#read-all").addEventListener("click", async () => {
    await api.post("/notifications/read", {});
    load();
  });
  box.addEventListener("click", (e) => {
    const a = e.target.closest("[data-nid]");
    if (a) api.post("/notifications/read", { ids: [Number(a.dataset.nid)] }).catch(() => {});
  });
  load().catch((err) => render($("#list"), errorState(err, load)));
}

// ── Settings ──────────────────────────────────────────
function settings(box) {
  const u = store.user;
  const p = u.notify_prefs || {};
  const sw = (name) => html`<label class="row between" style="padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer"><span><strong class="small">${t(`set.n_${name}`)}</strong><br><span class="tiny muted">${t(`set.n_${name}_p`)}</span></span><span class="switch"><input type="checkbox" name="${name}" ${p[name] ? raw("checked") : ""}><span></span></span></label>`;
  render(
    box,
    html`${head(t("dash.settings"), t("set.p"))}
    <div class="stack" style="--gap:20px">
      <form class="panel stack" id="profile-form" novalidate>
        <h3 style="margin:0">${icon("user")} ${t("set.profile")}</h3>
        <div class="form-grid">
          <div class="field"><label for="s-name">${t("auth.full_name")}</label><input class="input" id="s-name" name="full_name" value="${u.full_name || ""}"></div>
          <div class="field"><label for="s-email">${t("auth.email")}</label><input class="input" id="s-email" name="email" type="email" value="${u.email}"></div>
          <div class="field"><label for="s-phone">${t("set.phone")} <span class="optional">${t("set.phone_note")}</span></label><input class="input" id="s-phone" name="phone" value="${u.phone || ""}"></div>
          <div class="field"><label>${t("set.public_name")}</label><input class="input" value="${publicName(u)}" disabled></div>
        </div>
        <div><button class="btn btn-primary" type="submit">${icon("save")}${t("set.save_profile")}</button></div>
      </form>
      <form class="panel" id="prefs-form">
        <h3>${icon("bell")} ${t("nav.notifications")}</h3>
        ${sw("match")}${sw("claim")}${sw("status")}${sw("message")}${sw("email")}
        <div style="margin-top:16px"><button class="btn btn-primary" type="submit">${icon("save")}${t("set.save_prefs")}</button></div>
      </form>
      <form class="panel stack" id="pw-form" novalidate>
        <h3 style="margin:0">${icon("lock")} ${t("auth.password")}</h3>
        <div class="form-grid">
          <div class="field"><label for="pw-cur">${t("set.current_pw")}</label><input class="input" id="pw-cur" name="current" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="pw-new">${t("set.new_pw")}</label><input class="input" id="pw-new" name="password" type="password" autocomplete="new-password"></div>
        </div>
        <div><button class="btn" type="submit">${icon("key-round")}${t("set.change_pw")}</button></div>
      </form>
      <div class="panel stack" style="border-color:color-mix(in srgb,var(--danger) 35%,transparent)">
        <h3 style="margin:0;color:var(--danger)">${icon("trash-2")} ${t("set.delete_h")}</h3>
        <p class="small muted" style="margin:0">${t("set.delete_p")} <a href="/privacy" data-link>${t("set.retention")}</a></p>
        <div><button class="btn btn-danger" id="delete-account">${t("set.delete_btn")}</button></div>
      </div>
    </div>`
  );

  const pf = $("#profile-form");
  pf.addEventListener("submit", (e) => {
    e.preventDefault();
    withButton(pf.querySelector("[type=submit]"), async () => {
      try {
        await api.patch("/me", Object.fromEntries(new FormData(pf)));
        setSession(await api.get("/session"));
        toast(t("set.profile_saved"), "ok");
      } catch (err) {
        showErrors(pf, err);
        toast(err.message, "error");
      }
    });
  });
  const prf = $("#prefs-form");
  prf.addEventListener("submit", (e) => {
    e.preventDefault();
    const body = {};
    $$("input[type=checkbox]", prf).forEach((c) => (body[c.name] = c.checked));
    withButton(prf.querySelector("[type=submit]"), async () => {
      try {
        const r = await api.patch("/me/notifications", body);
        store.user.notify_prefs = r.notify_prefs;
        toast(t("set.prefs_saved"), "ok");
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
  const pw = $("#pw-form");
  pw.addEventListener("submit", (e) => {
    e.preventDefault();
    withButton(pw.querySelector("[type=submit]"), async () => {
      try {
        await api.post("/me/password", Object.fromEntries(new FormData(pw)));
        pw.reset();
        showErrors(pw, null);
        toast(t("set.pw_changed"), "ok");
      } catch (err) {
        showErrors(pw, err);
        toast(err.message, "error");
      }
    });
  });
  $("#delete-account").addEventListener("click", async () => {
    const password = await confirmDialog({ title: t("set.delete_confirm_h"), text: t("set.delete_confirm_p"), confirm: t("set.delete_forever"), danger: true, input: { label: t("set.confirm_pw"), type: "password", required: true } });
    if (!password) return;
    try {
      await api.del("/me", { password });
      setSession({ user: null });
      toast(t("set.deleted"), "ok");
      navigate("/");
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function publicName(u) {
  const p = (u.full_name || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return u.username;
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : p[0];
}
