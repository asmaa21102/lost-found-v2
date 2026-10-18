import { lang, t, LANGS, setLang, translateStatic } from "./i18n.js";
import { store, onChange, loadSession, loadMeta, setUnread, setSession } from "./store.js";
import { route, startRouter, navigate } from "./router.js";
import { api } from "./api.js";
import { html, icon, render, $, initials, timeAgo, whenLoaded, icons } from "./lib.js";
import { toast } from "./components.js";

const page = (name) => () => import(`./pages/${name}.js`);

// title = dictionary key; bare = full-screen page without the footer
route("/", page("home"), { title: "" });
route("/browse", page("browse"), { title: "title.browse" });
route("/map", page("map"), { title: "title.map" });
route("/items/:id", page("item"), { title: "title.item" });
route("/report/:type", page("report"), { title: "title.new_report", auth: true });
route("/items/:id/edit", page("report"), { title: "title.edit_report", auth: true });
route("/login", page("auth"), { title: "title.login", bare: true });
route("/register", page("auth"), { title: "title.register", bare: true });
route("/dashboard", page("dashboard"), { title: "title.dashboard", auth: true });
route("/dashboard/:tab", page("dashboard"), { title: "title.dashboard", auth: true });
route("/claims/:id", page("claim"), { title: "title.claim", auth: true });
route("/admin", page("admin"), { title: "title.admin", admin: true });
route("/admin/:tab", page("admin"), { title: "title.admin", admin: true });
route("/how-it-works", page("info"), { title: "nav.how" });
route("/privacy", page("info"), { title: "title.privacy" });
route("/guide", page("info"), { title: "title.guide" });
route("/guide/admin", page("info"), { title: "title.guide_admin" });
route("/credits", page("info"), { title: "title.credits" });

// ── Header ─────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("lf-theme", theme);
  } catch {
    /* private mode */
  }
  document.querySelector('meta[name="theme-color"]').content = theme === "light" ? "#f6ece1" : "#1a100d";
}

function header() {
  const box = $("#header-actions");
  const u = store.user;
  const dark = document.documentElement.dataset.theme !== "light";
  const current = LANGS.find((l) => l.code === lang);
  render(
    box,
    html`
    <a class="btn btn-primary btn-sm btn-report" href="/report/lost" data-link>${icon("plus")}${t("nav.report")}</a>
    <div class="dropdown" id="lang-dd">
      <button class="icon-btn" id="lang-btn" aria-haspopup="true" aria-label="${t("nav.language")}" title="${current.label}">${icon("languages")}</button>
      <div class="dropdown-menu lang-menu" style="min-width:160px">${LANGS.map((l) => html`<button data-lang="${l.code}" class="${l.code === lang ? "on" : ""}" lang="${l.code}">${l.label}</button>`)}</div>
    </div>
    <button class="icon-btn" id="theme-btn" aria-label="${dark ? t("nav.light") : t("nav.dark")}" title="${dark ? t("nav.light") : t("nav.dark")}">${icon(dark ? "sun" : "moon")}</button>
    ${u
      ? html`
      <div class="dropdown" id="notif-dd">
        <button class="icon-btn" id="notif-btn" aria-label="${t("nav.notifications")}" aria-haspopup="true">${icon("bell")}${store.unread ? html`<span class="dot">${store.unread > 9 ? "9+" : store.unread}</span>` : ""}</button>
        <div class="dropdown-menu" style="width:340px" id="notif-menu"></div>
      </div>
      <div class="dropdown" id="user-dd">
        <button class="user-chip" id="user-btn" aria-haspopup="true"><span class="avatar">${initials(u.full_name || u.username)}</span><span class="uname small">${(u.full_name || u.username).split(" ")[0]}</span>${icon("chevron-down")}</button>
        <div class="dropdown-menu">
          <div class="menu-head"><strong>${u.full_name || u.username}</strong><div class="tiny muted">@${u.username}${u.role === "admin" ? " · " + t("nav.administrator") : ""}</div></div>
          <hr>
          <a href="/dashboard" data-link>${icon("layout-dashboard")}${t("dash.overview")}</a>
          <a href="/dashboard/lost" data-link>${icon("search")}${t("dash.lost")}</a>
          <a href="/dashboard/found" data-link>${icon("hand-heart")}${t("dash.found")}</a>
          <a href="/dashboard/matches" data-link>${icon("git-compare-arrows")}${t("dash.matches")}</a>
          <a href="/dashboard/claims" data-link>${icon("handshake")}${t("dash.claims")}</a>
          <a href="/dashboard/settings" data-link>${icon("settings")}${t("dash.settings")}</a>
          ${u.role === "admin" ? html`<hr><a href="/admin" data-link>${icon("shield-check")}${t("title.admin")}</a>` : ""}
          <hr>
          <button id="logout-btn">${icon("log-out")}${t("nav.logout")}</button>
        </div>
      </div>`
      : html`<a class="btn btn-ghost btn-sm" href="/login" data-link>${t("nav.login")}</a><a class="btn btn-sm" href="/register" data-link>${t("nav.join")}</a>`}
    <button class="icon-btn menu-toggle" id="menu-btn" aria-label="${t("nav.menu")}" aria-controls="main-nav">${icon("menu")}</button>`
  );

  $("#theme-btn").onclick = () => {
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    header();
  };
  $("#menu-btn").onclick = () => $("#main-nav").classList.toggle("open");
  box.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => b.dataset.lang !== lang && setLang(b.dataset.lang)));
  const dd = (btnId, ddId, onOpen) => {
    $(btnId).onclick = (e) => {
      e.stopPropagation();
      const el = $(ddId);
      const open = !el.classList.contains("open");
      document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
      el.classList.toggle("open", open);
      if (open) onOpen?.();
    };
  };
  dd("#lang-btn", "#lang-dd");
  if (!u) return;
  $("#logout-btn").onclick = async () => {
    await api.post("/auth/logout").catch(() => {});
    setSession({ user: null });
    toast(t("nav.logged_out"), "ok");
    navigate("/");
  };
  dd("#user-btn", "#user-dd");
  dd("#notif-btn", "#notif-dd", loadNotifMenu);
}

const NOTIF_ICON = { match: "git-compare-arrows", claim: "handshake", status: "refresh-cw", message: "message-circle", system: "bell" };

async function loadNotifMenu() {
  const menu = $("#notif-menu");
  render(menu, html`<div class="loading-center" style="padding:30px 0"><div class="spinner"></div></div>`);
  try {
    const { notifications, unread } = await api.get("/notifications?limit=6");
    setUnreadSilently(unread);
    render(
      menu,
      html`<div class="row between menu-head"><strong>${t("nav.notifications")}</strong>${unread ? html`<button class="btn btn-ghost btn-sm" id="mark-all" style="width:auto">${t("notif.mark_all")}</button>` : ""}</div>
      ${notifications.length
        ? notifications.map(
            (n) => html`<a href="${n.link || "/dashboard/notifications"}" data-link data-nid="${n.id}" style="align-items:flex-start;${n.is_read ? "" : "background:var(--violet-soft)"}">
              <span class="notif-ico ${n.type}" style="width:32px;height:32px">${icon(NOTIF_ICON[n.type] || "bell")}</span>
              <span style="min-width:0"><span style="display:block;font-weight:600;color:var(--ink);font-size:.86rem">${n.title}</span><span class="tiny muted">${timeAgo(n.created_at)}</span></span></a>`
          )
        : html`<p class="muted small center" style="padding:16px">${t("notif.none")}</p>`}
      <hr><a href="/dashboard/notifications" data-link style="justify-content:center">${t("notif.see_all")}</a>`
    );
    menu.querySelector("#mark-all")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await api.post("/notifications/read", {});
      setUnread(0);
    });
    menu.querySelectorAll("[data-nid]").forEach((a) =>
      a.addEventListener("click", () => {
        api.post("/notifications/read", { ids: [Number(a.dataset.nid)] }).then(refreshUnread).catch(() => {});
        $("#notif-dd")?.classList.remove("open");
      })
    );
  } catch (err) {
    render(menu, html`<p class="small center muted" style="padding:16px">${err.message}</p>`);
  }
}

// Update the badge without re-rendering the open dropdown.
function setUnreadSilently(n) {
  store.unread = n;
  const btn = $("#notif-btn");
  if (!btn) return;
  btn.querySelector(".dot")?.remove();
  if (n) btn.insertAdjacentHTML("beforeend", `<span class="dot">${n > 9 ? "9+" : n}</span>`);
}

export async function refreshUnread() {
  if (!store.user) return;
  try {
    const { unread } = await api.get("/notifications?unread=1&limit=1");
    if (unread !== store.unread) setUnreadSilently(unread);
  } catch {
    /* offline */
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown")) document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
  if (e.target.closest(".dropdown-menu a")) document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
});

// ── Boot ───────────────────────────────────────────────
translateStatic();
document.querySelector('meta[name="description"]').content = t("meta.description");
document.getElementById("year").textContent = new Date().getFullYear();
onChange(header);

(async () => {
  await Promise.all([loadSession().catch(() => {}), loadMeta().catch(() => {})]);
  header();
  await startRouter();
  whenLoaded("lucide").then(() => icons());
  setInterval(refreshUnread, 45000);
})();
