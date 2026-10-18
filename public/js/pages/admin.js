// Administrator dashboard.
import { api, qs } from "../api.js";
import { html, icon, render, $, $$, raw, timeAgo, formatDate, formatDateTime, debounce, animateCount } from "../lib.js";
import { typeBadge, statusBadge, claimBadge, emptyState, errorState, skeletonRows, toast, confirmDialog, strengthBadge } from "../components.js";
import { store, category } from "../store.js";
import { t } from "../i18n.js";

const TABS = [
  ["", "activity", "dash.overview"],
  ["reports", "files", "adm.reports"],
  ["claims", "handshake", "adm.claims"],
  ["matches", "git-compare-arrows", "adm.matches"],
  ["users", "users", "adm.users"],
  ["flags", "flag", "adm.flags"],
  ["audit", "history", "adm.audit"],
  ["settings", "settings", "dash.settings"],
];

export default function admin({ el, params }) {
  const tab = TABS.some((x) => x[0] === (params.tab || "")) ? params.tab || "" : "";
  render(
    el,
    html`<div class="page container" style="padding-top:30px">
      <div class="row between" style="margin-bottom:22px"><div><span class="eyebrow">${icon("shield-check")}${t("nav.administrator")}</span><h1 style="font-size:clamp(1.7rem,3vw,2.3rem);margin:6px 0 0">${t("title.admin")}</h1></div></div>
      <div class="dash">
        <nav class="card side-nav" aria-label="${t("title.admin")}">${TABS.map(([k, i, l]) => html`<a href="/admin${k ? "/" + k : ""}" data-link class="${tab === k ? "active" : ""}">${icon(i)}${t(l)}<span class="count hidden" data-count="${k}"></span></a>`)}</nav>
        <section id="tab">${skeletonRows(5)}</section>
      </div>
    </div>`
  );
  const box = $("#tab");
  const views = { "": overview, reports, claims, matches, users, flags, audit, settings };
  views[tab](box);
  api.get("/admin/overview").then(({ totals: x }) => {
    const set = (k, n) => {
      const c = el.querySelector(`[data-count="${k}"]`);
      if (c && n) (c.textContent = n), c.classList.remove("hidden"), c.classList.add("hot");
    };
    set("reports", x.pending_review);
    set("claims", x.claims_need_admin);
    set("matches", x.matches_disputed);
    set("flags", x.open_flags);
  }).catch(() => {});
}

const head = (title, text, extra = "") => html`<div class="row between" style="margin-bottom:16px"><div><h2 style="margin:0">${title}</h2>${text ? html`<p class="small muted" style="margin:4px 0 0">${text}</p>` : ""}</div>${extra}</div>`;
const tableOrEmpty = (rows, empty, table) => (rows.length ? html`<div class="card table-wrap">${table}</div>` : emptyState(empty));
const statusName = (s) => t("status." + s);

// ── Overview ──────────────────────────────────────────
async function overview(box) {
  try {
    const d = await api.get("/admin/overview");
    const x = d.totals;
    const kpi = (href, n, label, ico, warn) => html`<a class="kpi" href="${href}" data-link style="${warn && n ? "border-color:color-mix(in srgb,var(--amber) 50%,transparent)" : ""}"><span class="l">${icon(ico)}${label}</span><span class="n" data-n="${n}">0</span></a>`;
    const days = fillDays(d.by_day);
    const max = Math.max(1, ...days.map((y) => y.lost + y.found));
    const catMax = Math.max(1, ...d.by_category.map((c) => c.n));
    render(
      box,
      html`${head(t("dash.overview"), t("adm.overview_p"))}
      <div class="kpis stagger">
        ${kpi("/admin/reports?status=pending_review", x.pending_review, t("adm.k_review"), "clock", true)}
        ${kpi("/admin/claims", x.claims_need_admin, t("adm.k_claims"), "shield-alert", true)}
        ${kpi("/admin/flags", x.open_flags, t("adm.k_flags"), "flag", true)}
        ${kpi("/admin/matches?status=disputed", x.matches_disputed, t("adm.k_disputed"), "triangle-alert", true)}
      </div>
      <div class="kpis stagger" style="margin-top:14px">
        ${kpi("/admin/users", x.users, t("adm.users"), "users")}
        ${kpi("/admin/reports?status=active", x.active, t("home.stat_active"), "radio")}
        ${kpi("/admin/reports?status=returned", x.returned, t("adm.k_returned"), "badge-check")}
        ${kpi("/admin/matches", x.matches, t("dash.possible_matches"), "git-compare-arrows")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:18px;margin-top:20px">
        <div class="card card-pad">
          <div class="row between"><h3 style="margin:0">${t("adm.chart_days")}</h3><div class="legend"><span><i style="background:var(--lost)"></i>${t("type.lost")}</span><span><i style="background:var(--found)"></i>${t("type.found")}</span></div></div>
          <div class="bars" role="img" aria-label="${t("adm.chart_days")}">${days.map((y, i) => html`<div class="bar" title="${y.day}: ${y.lost} / ${y.found}"><i class="l" style="height:${(y.lost / max) * 100}%;animation-delay:${i * 15}ms"></i><i class="f" style="height:${(y.found / max) * 100}%;animation-delay:${i * 15}ms"></i></div>`)}</div>
          <div class="row between tiny muted" style="margin-top:6px"><span>${formatDate(days[0].day)}</span><span>${t("adm.today")}</span></div>
        </div>
        <div class="card card-pad">
          <h3>${t("adm.chart_cat")}</h3>
          ${d.by_category.slice(0, 8).map((c) => html`<div class="hbar"><span class="small">${category(c.category).label}</span><span class="track"><i style="width:${(c.n / catMax) * 100}%"></i></span><span class="small muted">${c.n}</span></div>`)}
        </div>
      </div>
      <div class="row between" style="margin:26px 0 12px"><h3 style="margin:0">${t("dash.activity")}</h3><a class="small" href="/admin/audit" data-link>${t("adm.full_audit")}</a></div>
      ${auditTable(d.activity)}`
    );
    $$("[data-n]", box).forEach((n) => animateCount(n, Number(n.dataset.n)));
  } catch (err) {
    render(box, errorState(err, () => overview(box)));
  }
}

function fillDays(rows) {
  const map = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ day: d, lost: map.get(d)?.lost || 0, found: map.get(d)?.found || 0 });
  }
  return out;
}

// ── Reports moderation ────────────────────────────────
async function reports(box) {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  const state = { status: q.status || "", flagged: q.flagged || "", q: "" };
  render(
    box,
    html`${head(t("adm.reports"), t("adm.reports_p"))}
    <div class="toolbar">
      <div class="search-bar">${icon("search")}<input class="input" id="r-q" placeholder="${t("adm.reports_search")}"></div>
      <select class="select" id="r-status" style="width:auto"><option value="">${t("browse.all_statuses")}</option>${["pending_review", "active", "returned", "resolved", "closed", "removed"].map((s) => html`<option value="${s}">${statusName(s)}</option>`)}</select>
      <label class="chip"><input type="checkbox" id="r-flagged">${icon("flag")}${t("adm.flagged_only")}</label>
    </div>
    <div id="r-list">${skeletonRows(5)}</div>`
  );
  $("#r-status").value = state.status;
  $("#r-flagged").checked = state.flagged === "1";
  const load = async () => {
    try {
      const { items } = await api.get("/admin/reports" + qs(state));
      render($("#r-list"), tableOrEmpty(items, { icon: "check-check", title: t("adm.nothing"), text: t("adm.no_reports") }, html`<table class="table">
        <thead><tr><th>${t("adm.th_report")}</th><th>${t("adm.th_type")}</th><th>${t("adm.th_status")}</th><th>${t("adm.th_by")}</th><th>${t("adm.th_flags")}</th><th>${t("adm.th_created")}</th><th></th></tr></thead>
        <tbody>${items.map((i) => html`<tr>
          <td><a href="/items/${i.id}" data-link class="row" style="gap:10px;color:var(--ink);flex-wrap:nowrap">${i.photos[0] ? html`<img src="${i.photos[0].thumb}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover">` : html`<span class="badge" style="width:40px;height:40px;justify-content:center;border-radius:8px">${icon(category(i.category).icon)}</span>`}<span><strong>${i.title}</strong>${i.moderation_note ? html`<div class="tiny" style="color:var(--amber)">${i.moderation_note}</div>` : ""}</span></a></td>
          <td>${typeBadge(i.type, true)}</td><td>${statusBadge(i.status)}${i.is_valuable ? html` <span class="badge badge-amber" title="${t("item.valuable")}">${icon("gem")}</span>` : ""}</td>
          <td class="small">@${i.owner_username || "—"}</td>
          <td>${i.open_flags ? html`<span class="badge badge-danger">${icon("flag")}${i.open_flags}</span>` : html`<span class="muted">—</span>`}</td>
          <td class="small muted">${timeAgo(i.created_at)}</td>
          <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
            ${i.status === "pending_review" ? html`<button class="btn btn-mint btn-sm" data-decide="approve" data-id="${i.id}">${icon("check")}${t("adm.approve")}</button><button class="btn btn-danger btn-sm" data-decide="reject" data-id="${i.id}">${t("adm.reject")}</button>` : ""}
            ${["active", "returned", "resolved", "closed"].includes(i.status) ? html`<button class="btn btn-danger btn-sm" data-decide="remove" data-id="${i.id}">${icon("ban")}${t("adm.remove")}</button>` : ""}
            ${i.status === "removed" ? html`<button class="btn btn-sm" data-decide="restore" data-id="${i.id}">${icon("rotate-ccw")}${t("adm.restore")}</button>` : ""}
          </div></td></tr>`)}</tbody></table>`));
    } catch (err) {
      render($("#r-list"), errorState(err, load));
    }
  };
  $("#r-status").addEventListener("change", (e) => ((state.status = e.target.value), load()));
  $("#r-flagged").addEventListener("change", (e) => ((state.flagged = e.target.checked ? "1" : ""), load()));
  $("#r-q").addEventListener("input", debounce((e) => ((state.q = e.target.value.trim()), load()), 350));
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-decide]");
    if (!b) return;
    const decision = b.dataset.decide;
    let note = "";
    if (decision === "reject" || decision === "remove") {
      note = await confirmDialog({ title: t(`adm.${decision}_h`), text: t("adm.decide_p"), confirm: t(`adm.${decision}`), danger: true, input: { label: t("adm.reason_sent"), multiline: true, required: true } });
      if (!note) return;
    }
    try {
      await api.post(`/admin/reports/${b.dataset.id}/decision`, { decision, note });
      toast(t("item.updated"), "ok");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  });
  load();
}

// ── Claims ────────────────────────────────────────────
async function claims(box, filter = "attention") {
  render(
    box,
    html`${head(t("adm.claims"), t("adm.claims_p"))}
    <div class="tabs">${[["attention", t("adm.attention")], ["open", t("adm.all_open")], ["all", t("common.all")]].map(([k, l]) => html`<button class="${filter === k ? "on" : ""}" data-filter="${k}">${l}</button>`)}</div>
    <div id="c-list">${skeletonRows(4)}</div>`
  );
  $$("[data-filter]", box).forEach((b) => b.addEventListener("click", () => claims(box, b.dataset.filter)));
  try {
    const { claims: list } = await api.get(`/admin/claims?filter=${filter}`);
    render($("#c-list"), tableOrEmpty(list, { icon: "check-check", title: t("adm.nothing_needs"), text: t("adm.nothing_needs_p") }, html`<table class="table">
      <thead><tr><th>#</th><th>${t("adm.th_item")}</th><th>${t("adm.th_claimant")}</th><th>${t("adm.th_reporter")}</th><th>${t("adm.th_status")}</th><th>${t("adm.th_why")}</th><th>${t("adm.th_updated")}</th></tr></thead>
      <tbody>${list.map((c) => html`<tr>
        <td><a href="/claims/${c.id}" data-link>#${c.id}</a></td>
        <td><a href="/claims/${c.id}" data-link style="color:var(--ink)"><strong>${c.item_title}</strong></a><div class="tiny muted">${c.kind === "ownership" ? t("claimdlg.kind_ownership") : t("claimdlg.kind_finder")}</div></td>
        <td class="small">@${c.claimant}</td><td class="small">@${c.owner || "—"}</td>
        <td>${claimBadge(c.status)}</td>
        <td>${c.disputed ? html`<span class="badge badge-danger">${icon("triangle-alert")}${t("dash.disputed")}</span> ` : ""}${c.requires_admin ? html`<span class="badge badge-amber">${icon("gem")}${c.owner_approved ? t("adm.owner_approved") : t("adm.valuable")}</span>` : ""}</td>
        <td class="small muted">${timeAgo(c.updated_at || c.created_at)}</td></tr>`)}</tbody></table>`));
  } catch (err) {
    render($("#c-list"), errorState(err, () => claims(box, filter)));
  }
}

// ── Matches ───────────────────────────────────────────
async function matches(box) {
  const q = new URLSearchParams(location.search).get("status") || "";
  render(
    box,
    html`${head(t("adm.matches"), t("adm.matches_p"))}
    <div class="tabs">${["", "disputed", "suggested", "confirmed", "dismissed"].map((k) => html`<a href="/admin/matches${k ? "?status=" + k : ""}" data-link class="${q === k ? "on" : ""}">${k ? t("adm.m_" + k) : t("common.all")}</a>`)}</div>
    <div id="m-list">${skeletonRows(4)}</div>`
  );
  const load = async () => {
    try {
      const { matches: list } = await api.get("/admin/matches" + qs({ status: q }));
      const resp = (v) => t("adm.resp_" + v);
      render($("#m-list"), tableOrEmpty(list, { icon: "git-compare-arrows", title: t("adm.no_matches"), text: t("adm.nothing_list") }, html`<table class="table">
        <thead><tr><th>${t("adm.th_score")}</th><th>${t("adm.th_lost")}</th><th>${t("adm.th_found")}</th><th>${t("adm.th_responses")}</th><th>${t("adm.th_status")}</th><th></th></tr></thead>
        <tbody>${list.map((m) => html`<tr>
          <td><strong>${m.score}%</strong><div>${strengthBadge(m.strength)}</div></td>
          <td><a href="/items/${m.lost_item_id}" data-link>${m.lost_title}</a><div class="tiny muted">@${m.lost_user || "—"}</div></td>
          <td><a href="/items/${m.found_item_id}" data-link>${m.found_title}</a><div class="tiny muted">@${m.found_user || "—"}</div></td>
          <td class="tiny">${t("adm.owner")}: ${resp(m.lost_response)} · ${t("adm.finder")}: ${resp(m.found_response)}</td>
          <td><span class="badge ${m.status === "disputed" ? "badge-danger" : m.status === "confirmed" ? "badge-ok" : m.status === "dismissed" ? "" : "badge-violet"}">${t("adm.m_" + m.status)}</span>${m.admin_note ? html`<div class="tiny muted">${m.admin_note}</div>` : ""}</td>
          <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">${m.status === "disputed" ? html`<button class="btn btn-sm" data-m="${m.id}" data-to="suggested">${t("adm.keep")}</button>` : ""}${["suggested", "disputed"].includes(m.status) ? html`<button class="btn btn-danger btn-sm" data-m="${m.id}" data-to="dismissed">${t("adm.dismiss")}</button>` : ""}</div></td>
        </tr>`)}</tbody></table>`));
    } catch (err) {
      render($("#m-list"), errorState(err, load));
    }
  };
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    const note = await confirmDialog({ title: b.dataset.to === "dismissed" ? t("adm.dismiss_h") : t("adm.keep_h"), text: t("adm.keep_p"), confirm: t("common.save"), input: { label: t("adm.note_optional"), multiline: true } });
    if (note === null) return;
    try {
      await api.post(`/admin/matches/${b.dataset.m}`, { status: b.dataset.to, note });
      toast(t("adm.match_updated"), "ok");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  });
  load();
}

// ── Users ─────────────────────────────────────────────
async function users(box) {
  let q = "";
  render(box, html`${head(t("adm.users"), t("adm.users_p"))}
    <div class="toolbar"><div class="search-bar">${icon("search")}<input class="input" id="u-q" placeholder="${t("adm.users_search")}"></div></div><div id="u-list">${skeletonRows(5)}</div>`);
  const load = async () => {
    try {
      const { users: list } = await api.get("/admin/users" + qs({ q }));
      render($("#u-list"), tableOrEmpty(list, { icon: "users", title: t("adm.no_users") }, html`<table class="table">
        <thead><tr><th>${t("adm.th_user")}</th><th>${t("adm.th_role")}</th><th>${t("adm.th_status")}</th><th>${t("adm.reports")}</th><th>${t("adm.th_claims_rej")}</th><th>${t("adm.th_flags")}</th><th>${t("adm.th_last")}</th><th></th></tr></thead>
        <tbody>${list.map((u) => html`<tr>
          <td><strong>${u.full_name || u.username}</strong><div class="tiny muted">@${u.username} · ${u.email}</div></td>
          <td>${u.role === "admin" ? html`<span class="badge badge-violet">${icon("shield-check")}${t("nav.administrator")}</span>` : html`<span class="small muted">${t("adm.user")}</span>`}</td>
          <td>${u.status === "active" ? html`<span class="badge badge-ok">${t("status.active")}</span>` : html`<span class="badge badge-danger">${t("adm.suspended")}</span>`}</td>
          <td>${u.reports}</td><td>${u.claims} ${u.rejected_claims ? html`<span class="${u.rejected_claims >= 2 ? "badge badge-amber" : "muted small"}">(${u.rejected_claims})</span>` : ""}</td>
          <td>${u.open_flags ? html`<span class="badge badge-danger">${icon("flag")}${u.open_flags}</span>` : "—"}</td>
          <td class="small muted">${u.last_login_at ? timeAgo(u.last_login_at) : t("adm.never")}</td>
          <td>${u.id === store.user.id ? html`<span class="tiny muted">${t("item.you")}</span>` : html`<div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
            ${u.status === "active" ? html`<button class="btn btn-danger btn-sm" data-u="${u.id}" data-set="status" data-v="suspended">${t("adm.suspend")}</button>` : html`<button class="btn btn-sm" data-u="${u.id}" data-set="status" data-v="active">${t("adm.reactivate")}</button>`}
            ${u.role === "admin" ? html`<button class="btn btn-ghost btn-sm" data-u="${u.id}" data-set="role" data-v="user">${t("adm.remove_admin")}</button>` : html`<button class="btn btn-ghost btn-sm" data-u="${u.id}" data-set="role" data-v="admin">${t("adm.make_admin")}</button>`}</div>`}</td>
        </tr>`)}</tbody></table>`));
    } catch (err) {
      render($("#u-list"), errorState(err, load));
    }
  };
  $("#u-q").addEventListener("input", debounce((e) => ((q = e.target.value.trim()), load()), 350));
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-u]");
    if (!b) return;
    const key = b.dataset.set === "status" ? (b.dataset.v === "suspended" ? "suspend" : "reactivate") : b.dataset.v === "admin" ? "grant" : "revoke";
    const note = await confirmDialog({ title: t("adm.u_" + key), text: t("adm.audit_note"), confirm: t("common.confirm"), danger: b.dataset.v === "suspended", input: { label: t("adm.note_audit"), multiline: true, required: b.dataset.v === "suspended" } });
    if (note === null) return;
    try {
      await api.post(`/admin/users/${b.dataset.u}`, { [b.dataset.set]: b.dataset.v, note });
      toast(t("adm.user_updated"), "ok");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  });
  load();
}

// ── Flags ─────────────────────────────────────────────
async function flags(box, status = "open") {
  render(box, html`${head(t("adm.flags"), t("adm.flags_p"))}
    <div class="tabs">${["open", "resolved", "dismissed"].map((k) => html`<button class="${status === k ? "on" : ""}" data-st="${k}">${t("adm.f_" + k)}</button>`)}</div><div id="f-list">${skeletonRows(4)}</div>`);
  $$("[data-st]", box).forEach((b) => b.addEventListener("click", () => flags(box, b.dataset.st)));
  const link = (f) => ({ item: `/items/${f.target_id}`, claim: `/claims/${f.target_id}`, user: `/admin/users`, match: `/admin/matches?status=disputed` })[f.target_type];
  try {
    const { flags: list } = await api.get(`/admin/flags?status=${status}`);
    render($("#f-list"), tableOrEmpty(list, { icon: "shield-check", title: t("adm.no_flags"), text: t("adm.no_flags_p") }, html`<table class="table">
      <thead><tr><th>${t("adm.th_target")}</th><th>${t("flag.reason")}</th><th>${t("flag.details")}</th><th>${t("adm.th_reported_by")}</th><th>${t("adm.th_when")}</th><th></th></tr></thead>
      <tbody>${list.map((f) => html`<tr>
        <td><span class="badge">${t("adm.t_" + f.target_type)}</span> <a href="${link(f)}" data-link>${f.target_label || "#" + f.target_id}</a></td>
        <td><span class="badge badge-amber">${t("flag.r." + f.reason)}</span></td><td class="small" style="max-width:280px">${f.details || "—"}</td>
        <td class="small">@${f.reporter || "—"}</td><td class="small muted">${timeAgo(f.created_at)}</td>
        <td>${f.status === "open" ? html`<div class="row" style="flex-wrap:nowrap;justify-content:flex-end"><button class="btn btn-sm" data-f="${f.id}" data-to="resolved">${icon("check")}${t("adm.f_resolved")}</button><button class="btn btn-ghost btn-sm" data-f="${f.id}" data-to="dismissed">${t("adm.dismiss")}</button></div>` : ""}</td>
      </tr>`)}</tbody></table>`));
    $$("[data-f]", box).forEach((b) => b.addEventListener("click", async () => {
      try {
        await api.post(`/admin/flags/${b.dataset.f}`, { status: b.dataset.to });
        toast(t("item.updated"), "ok");
        flags(box, status);
      } catch (err) {
        toast(err.message, "error");
      }
    }));
  } catch (err) {
    render($("#f-list"), errorState(err, () => flags(box, status)));
  }
}

// ── Audit ─────────────────────────────────────────────
function auditTable(entries) {
  if (!entries.length) return emptyState({ icon: "history", title: t("adm.no_activity") });
  return html`<div class="card table-wrap"><table class="table"><thead><tr><th>${t("adm.th_when")}</th><th>${t("adm.th_who")}</th><th>${t("adm.th_action")}</th><th>${t("adm.th_target")}</th><th>${t("flag.details")}</th></tr></thead><tbody>
    ${entries.map((a) => html`<tr><td class="small muted" style="white-space:nowrap">${formatDateTime(a.created_at)}</td><td class="small">${a.username ? "@" + a.username : t("adm.system")}</td><td><code class="small" dir="ltr">${a.action}</code></td><td class="small">${a.target_type ? `${a.target_type} #${a.target_id ?? ""}` : "—"}</td><td class="tiny muted" style="max-width:320px;word-break:break-word" dir="ltr">${a.details ? JSON.stringify(a.details) : ""}</td></tr>`)}
  </tbody></table></div>`;
}

async function audit(box) {
  render(box, html`${head(t("adm.audit"), t("adm.audit_p"))}<div class="toolbar"><select class="select" id="a-filter" style="width:auto"><option value="">${t("adm.a_all")}</option><option value="admin">${t("adm.a_admin")}</option><option value="claim">${t("adm.claims")}</option><option value="item">${t("adm.reports")}</option><option value="user">${t("adm.a_accounts")}</option></select></div><div id="a-list">${skeletonRows(6)}</div>`);
  const load = async (action = "") => {
    try {
      const { entries } = await api.get("/admin/audit" + qs({ action }));
      render($("#a-list"), auditTable(entries));
    } catch (err) {
      render($("#a-list"), errorState(err, load));
    }
  };
  $("#a-filter").addEventListener("change", (e) => load(e.target.value));
  load();
}

// ── Settings & outbox ─────────────────────────────────
async function settings(box) {
  try {
    const [s, { emails }] = await Promise.all([api.get("/admin/settings"), api.get("/admin/outbox")]);
    render(box, html`${head(t("dash.settings"), t("adm.settings_p"))}
      <div class="panel stack" style="--gap:14px">
        <h3 style="margin:0">${icon("shield-check")} ${t("adm.moderation")}</h3>
        <label class="check"><input type="radio" name="mode" value="post" ${s.moderation_mode !== "pre" ? raw("checked") : ""}><span><strong>${t("adm.mode_post")}</strong><br><span class="small muted">${t("adm.mode_post_p")}</span></span></label>
        <label class="check"><input type="radio" name="mode" value="pre" ${s.moderation_mode === "pre" ? raw("checked") : ""}><span><strong>${t("adm.mode_pre")}</strong><br><span class="small muted">${t("adm.mode_pre_p")}</span></span></label>
        <div><button class="btn btn-primary" id="save-mode">${icon("save")}${t("common.save")}</button></div>
      </div>
      <div class="row between" style="margin:26px 0 12px"><h3 style="margin:0">${icon("mail")} ${t("adm.outbox")}</h3><span class="tiny muted">${t("adm.outbox_p")}</span></div>
      ${emails.length ? html`<div class="card table-wrap"><table class="table"><thead><tr><th>${t("adm.th_to")}</th><th>${t("adm.th_subject")}</th><th>${t("adm.th_status")}</th><th>${t("adm.th_when")}</th></tr></thead><tbody>${emails.map((m) => html`<tr><td class="small">${m.to_email}</td><td class="small">${m.subject}</td><td>${m.sent_at ? html`<span class="badge badge-ok">${t("adm.sent")}</span>` : m.error ? html`<span class="badge badge-danger" title="${m.error}">${t("adm.failed")}</span>` : html`<span class="badge">${t("adm.not_sent")}</span>`}</td><td class="small muted">${timeAgo(m.created_at)}</td></tr>`)}</tbody></table></div>` : emptyState({ icon: "mail", title: t("adm.no_emails"), text: t("adm.no_emails_p") })}`);
    $("#save-mode").addEventListener("click", async () => {
      try {
        await api.post("/admin/settings", { moderation_mode: box.querySelector('input[name="mode"]:checked').value });
        toast(t("adm.settings_saved"), "ok");
      } catch (err) {
        toast(err.message, "error");
      }
    });
  } catch (err) {
    render(box, errorState(err, () => settings(box)));
  }
}
