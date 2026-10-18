// Sign in and create account: a glass card over a "way back home" scene — lost items
// floating like bubbles, and a dashed route from a lost pin to a found pin.
import { api } from "../api.js";
import { html, icon, render, $, $$, raw } from "../lib.js";
import { showErrors, withButton, toast } from "../components.js";
import { setSession, store } from "../store.js";
import { navigate } from "../router.js";
import { t } from "../i18n.js";

// icon, position (% from the start edge / top), size (px), animation delay (s)
const BUBBLES = [
  ["key-round", 8, 18, 74, 0], ["wallet", 18, 68, 92, -2], ["smartphone", 82, 16, 84, -4], ["glasses", 90, 58, 70, -1],
  ["backpack", 6, 84, 64, -3], ["watch", 74, 82, 60, -5], ["umbrella", 30, 8, 54, -2.5], ["headphones", 64, 6, 58, -1.5],
  ["gem", 94, 34, 44, -3.5], ["book-open", 40, 90, 48, -4.5],
];

function scene() {
  return html`<div class="auth-bg" aria-hidden="true">
    <div class="auth-glow g1"></div><div class="auth-glow g2"></div>
    ${raw(`<svg class="auth-route" viewBox="0 0 1200 800" preserveAspectRatio="none">
      <path d="M140 640 C 320 520, 260 300, 520 330 S 860 520, 1060 170" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 14"/>
    </svg>`)}
    <span class="auth-pin lost" style="inset-inline-start:10%;top:76%">${icon("search")}</span>
    <span class="auth-pin found" style="inset-inline-start:87%;top:18%">${icon("hand-heart")}</span>
    ${BUBBLES.map(([ico, x, y, s, d]) => html`<span class="auth-bubble" style="inset-inline-start:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:${d}s">${icon(ico)}</span>`)}
    ${Array.from({ length: 26 }, (_, i) => raw(`<i class="auth-dot" style="inset-inline-start:${(i * 37) % 100}%;top:${(i * 53) % 100}%;animation-delay:${-(i % 7)}s"></i>`))}
    ${raw(`<svg class="auth-waves" viewBox="0 0 1440 320" preserveAspectRatio="none">
      <path class="w1" d="M0 200 C 240 120, 480 280, 720 210 S 1200 120, 1440 190 V 320 H 0 Z"/>
      <path class="w2" d="M0 250 C 300 190, 520 310, 820 250 S 1260 200, 1440 240 V 320 H 0 Z"/>
      <path class="w3" d="M0 290 C 360 250, 700 320, 1000 280 S 1320 270, 1440 290 V 320 H 0 Z"/>
    </svg>`)}
  </div>`;
}

export default function auth({ el, query }) {
  const register = location.pathname === "/register";
  const next = query.next && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : "/dashboard";
  if (store.user) return navigate(next, { replace: true });

  const field = (id, name, ico, label, type = "text", ac = "") => html`<div class="field auth-field">
    <label class="sr-only" for="${id}">${label}</label>
    <div class="pill-input">${icon(ico)}<input id="${id}" name="${name}" type="${type}" placeholder="${label}" autocomplete="${ac}" required>
      ${type === "password" ? html`<button type="button" class="pw-toggle" data-pw="${id}" aria-label="${t("auth.show_pw")}">${icon("eye")}</button>` : ""}</div>
  </div>`;

  render(
    el,
    html`<section class="auth-scene page">
      ${scene()}
      <div class="auth-wrap">
        <form id="auth-form" class="auth-card" novalidate>
          <a class="brand auth-brand" href="/" data-link><span class="brand-mark">${icon("scan-search")}</span><span>Lost&nbsp;&amp;&nbsp;Found</span></a>
          <h1 class="auth-title">${register ? t("auth.reg_h") : t("auth.login_h")}</h1>
          <p class="auth-sub">${register ? t("auth.reg_sub") : t("auth.login_sub")}</p>
          ${register
            ? html`
              <input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
              ${field("full_name", "full_name", "user", t("auth.full_name"), "text", "name")}
              ${field("username", "username", "at-sign", t("auth.username"), "text", "username")}
              ${field("email", "email", "mail", t("auth.email"), "email", "email")}
              ${field("password", "password", "lock", t("auth.password"), "password", "new-password")}
              <p class="auth-hint">${t("auth.pw_rule")}</p>
              <div class="field"><label class="check auth-check"><input type="checkbox" name="accept_privacy" value="1"> <span>${raw(t("auth.accept", { link: '<a href="/privacy" target="_blank">' + t("title.privacy") + "</a>" }))}</span></label></div>`
            : html`
              ${field("login", "login", "user", t("auth.login_field"), "text", "username")}
              ${field("password", "password", "lock", t("auth.password"), "password", "current-password")}`}
          <div id="form-error"></div>
          <button class="auth-btn" type="submit"><span>${register ? t("auth.reg_btn") : t("auth.login_btn")}</span>${icon("arrow-right")}</button>
          <p class="auth-switch">${register ? t("auth.have_account") : t("auth.no_account")} <a href="${register ? "/login" : "/register"}" data-link>${register ? t("nav.login") : t("auth.sign_up")}</a></p>
          ${!register && store.meta.demo
            ? html`<div class="auth-demo"><span class="tiny">${icon("info")} ${t("auth.demo")}</span>
                <div class="row" style="justify-content:center;gap:6px"><button type="button" class="chip" data-demo="demo:Demo12345">${icon("user")}demo</button><button type="button" class="chip" data-demo="admin:Admin12345">${icon("shield-check")}admin</button></div></div>`
            : ""}
        </form>
        <ul class="auth-perks">
          ${[["bell-ring", t("auth.perk1")], ["lock-keyhole", t("auth.perk2")], ["message-circle", t("auth.perk3")]].map(([i, txt]) => html`<li>${icon(i)}<span>${txt}</span></li>`)}
        </ul>
      </div>
    </section>`
  );

  const form = $("#auth-form");
  $$("[data-pw]", form).forEach((b) =>
    b.addEventListener("click", () => {
      const input = $("#" + b.dataset.pw);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-label", show ? t("auth.hide_pw") : t("auth.show_pw"));
      render(b, icon(show ? "eye-off" : "eye"));
    })
  );
  $$("[data-demo]", form).forEach((b) =>
    b.addEventListener("click", () => {
      const [u, p] = b.dataset.demo.split(":");
      form.login.value = u;
      form.password.value = p;
      form.requestSubmit();
    })
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    withButton(form.querySelector('[type="submit"]'), async () => {
      render($("#form-error"), "");
      try {
        const s = await api.post(register ? "/auth/register" : "/auth/login", data);
        setSession(s);
        toast(register ? t("auth.ready") : t("auth.welcome", { name: (s.user.full_name || s.user.username).split(" ")[0] }), "ok");
        navigate(next, { replace: true });
      } catch (err) {
        if (!showErrors(form, err)) render($("#form-error"), html`<div class="alert alert-danger">${icon("circle-alert")}<div>${err.message}</div></div>`);
      }
    });
  });
}
