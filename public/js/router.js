// History-API router. Each page module exports `default (ctx) => cleanup?`.
import { store } from "./store.js";
import { render, html, icon, $$ } from "./lib.js";
import { t } from "./i18n.js";

const routes = [];
let cleanup = null;
let navId = 0;

export function route(path, load, opts = {}) {
  const keys = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
  routes.push({ re, keys, load, ...opts });
}

function match(pathname) {
  for (const r of routes) {
    const m = pathname.match(r.re);
    if (m) return { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(url, { replace = false, scroll = true } = {}) {
  if (replace) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
  return go({ scroll });
}

// Re-run the current page with new query parameters, without adding history noise.
export function setQuery(params, { replace = true } = {}) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) u.searchParams.delete(k);
    else u.searchParams.set(k, Array.isArray(v) ? v.join(",") : v);
  }
  if (replace) history.replaceState({}, "", u);
  else history.pushState({}, "", u);
}

async function go({ scroll = true } = {}) {
  const id = ++navId;
  const el = document.getElementById("app");
  const found = match(location.pathname);
  document.body.classList.toggle("bare", !!found?.r.bare);
  const query = Object.fromEntries(new URLSearchParams(location.search));

  document.getElementById("main-nav")?.classList.remove("open");
  $$("[data-nav]").forEach((a) => {
    const nav = a.dataset.nav;
    const on = (nav === "browse" && location.pathname === "/browse" && query.mode !== "photo") || (nav === "photo" && query.mode === "photo") || (nav === "map" && location.pathname === "/map") || (nav === "how" && location.pathname === "/how-it-works");
    a.classList.toggle("active", on);
  });

  if (typeof cleanup === "function") cleanup();
  cleanup = null;

  const swap = async () => {
    if (!found) {
      notFound(el);
      return;
    }
    const { r, params } = found;
    if ((r.auth || r.admin) && !store.user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
      return;
    }
    if (r.admin && store.user.role !== "admin") {
      render(el, html`<div class="container page"><div class="empty" style="margin-top:60px"><div class="ico">${icon("shield-alert")}</div><h2>${t("router.admin_only")}</h2><p>${t("router.no_access")}</p><a class="btn btn-primary" href="/" data-link>${t("common.go_home")}</a></div></div>`);
      return;
    }
    const mod = await r.load();
    if (id !== navId) return;
    document.title = (r.title ? t(r.title) + " · " : "") + "Lost & Found";
    el.innerHTML = "";
    cleanup = (await mod.default({ el, params, query })) || null;
  };

  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    await document.startViewTransition(swap).updateCallbackDone.catch(() => {});
  } else await swap();

  if (scroll && !location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
}

function notFound(el) {
  document.title = t("router.nf_title") + " · Lost & Found";
  render(el, html`<div class="container page"><div class="empty" style="margin-top:60px">
    <div class="ico">${icon("map-pin-off")}</div>
    <h2>${t("router.nf_h")}</h2>
    <p>${t("router.nf_p")}</p>
    <div class="row" style="justify-content:center"><a class="btn btn-primary" href="/" data-link>${t("common.go_home")}</a><a class="btn" href="/browse" data-link>${t("nav.browse_reports")}</a></div>
  </div></div>`);
}

export function startRouter() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;
    e.preventDefault();
    if (url.pathname === location.pathname && url.search === location.search && url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    navigate(url.pathname + url.search + url.hash);
  });
  window.addEventListener("popstate", () => go({ scroll: false }));
  return go();
}

export const reload = () => go({ scroll: false });
