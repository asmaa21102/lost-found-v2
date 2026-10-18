// One return request: status, verification details, timeline, private messages, actions.
import { api } from "../api.js";
import { html, icon, render, $, $$, timeAgo, formatDateTime, formatDate } from "../lib.js";
import { claimBadge, claimStatusLabel, typeBadge, errorState, loading, toast, confirmDialog, withButton } from "../components.js";
import { flagDialog } from "../dialogs.js";
import { category } from "../store.js";
import { t } from "../i18n.js";

const STEPS = ["pending", "under_review", "approved", "returned"];

// action → [icon, button class, confirm dialog key or null, needs a reason?, danger?]
const ACTION = {
  under_review: ["search-check", "btn", null],
  approved: ["circle-check", "btn btn-mint", "approve"],
  rejected: ["circle-x", "btn btn-danger", "reject", "required", true],
  returned: ["party-popper", "btn btn-primary", "returned"],
  cancelled: ["undo-2", "btn btn-ghost", "cancel", null, true],
  resolve_dispute: ["scale", "btn", "resolve", "optional"],
  dispute: ["scale", "btn", null],
};

export default function claimPage({ el, params }) {
  let timer = null;
  render(el, html`<div class="container page">${loading(t("cl.loading"))}</div>`);

  const load = async (quiet = false) => {
    try {
      const data = await api.get(`/claims/${params.id}`);
      if (quiet && $("#chat") && $$(".bubble", el).length === data.messages.length && el.dataset.status === data.claim.status) return;
      show(data);
    } catch (err) {
      if (!quiet) render(el, html`<div class="container page" style="padding-top:40px">${errorState(err, load)}</div>`);
    }
  };

  function show({ claim, item, people, events, messages, can_message }) {
    el.dataset.status = claim.status;
    const failed = ["rejected", "cancelled"].includes(claim.status);
    const reached = failed ? STEPS.indexOf(events.filter((e) => STEPS.includes(e.to)).pop()?.to || "pending") : STEPS.indexOf(claim.status);
    const ownership = claim.kind === "ownership";
    const me = claim.role;
    const other = me === "claimant" ? people.owner : people.claimant;
    const draft = $("#chat-input")?.value || "";
    const heading =
      me === "claimant" ? (ownership ? t("dash.c_you_asked") : t("dash.c_you_found"))
      : me === "owner" ? (ownership ? t("dash.c_theirs", { name: people.claimant }) : t("dash.c_may_found", { name: people.claimant }))
      : t("cl.by", { name: people.claimant });

    render(
      el,
      html`<div class="page container" style="padding-top:26px">
        <nav class="small muted" style="margin-bottom:16px"><a href="/dashboard/claims" data-link>${icon("arrow-left")} ${t("cl.all")}</a></nav>
        <div class="split">
          <div class="stack" style="--gap:20px">
            <div class="panel stack" style="--gap:16px">
              <div class="row between">
                <div><span class="eyebrow">${icon("handshake")}${ownership ? t("claimdlg.kind_ownership") : t("claimdlg.kind_finder")} #${claim.id}</span>
                  <h2 style="margin:6px 0 0">${heading}</h2></div>
                ${claimBadge(claim.status)}
              </div>
              <div class="status-track ${failed ? "failed" : ""}">${STEPS.map((s, i) => html`<div class="${i <= reached ? "on" : ""}" title="${claimStatusLabel(s)}"></div>`)}</div>
              <div class="row between tiny muted">${STEPS.map((s) => html`<span>${claimStatusLabel(s)}</span>`)}</div>
              ${claim.disputed ? html`<div class="alert alert-danger">${icon("triangle-alert")}<div><strong>${t("cl.disputed_h")}</strong> ${ownership ? t("cl.disputed_p_own") : t("cl.disputed_p")}</div></div>` : ""}
              ${claim.requires_admin && !["returned", "rejected", "cancelled"].includes(claim.status) ? html`<div class="alert alert-warn">${icon("shield-check")}<div><strong>${t("cl.valuable_h")}</strong> ${claim.owner_approved ? t("cl.valuable_approved") : t("cl.valuable_p")}</div></div>` : ""}
              ${actionsBar(claim)}
            </div>

            <div class="panel stack" style="--gap:14px">
              <h3 style="margin:0">${icon("lock")} ${t("cl.private_h")}</h3>
              <p class="tiny muted" style="margin:0">${t("cl.private_p")}</p>
              <div><div class="small" style="font-weight:700">${t("claimdlg.message")}</div><p style="white-space:pre-wrap;margin:4px 0 0">${claim.message}</p></div>
              ${claim.proof ? html`<div class="private-box"><div class="small" style="font-weight:700">${ownership ? t("cl.proof_own") : t("cl.proof_finder")}</div><p style="white-space:pre-wrap;margin:4px 0 0" class="small">${claim.proof}</p></div>` : ""}
              ${item.can_manage && item.private_details ? html`<div class="private-box" style="border-color:color-mix(in srgb,var(--violet) 40%,transparent);background:var(--violet-soft)"><div class="small" style="font-weight:700">${icon("eye")} ${t("cl.compare")}</div><p style="white-space:pre-wrap;margin:4px 0 0" class="small">${item.private_details}</p></div>` : ""}
            </div>

            <div class="panel">
              <div class="row between" style="margin-bottom:12px"><h3 style="margin:0">${icon("message-circle")} ${t("cl.messages")} ${other ? html`<span class="muted small">${t("cl.with", { name: other })}</span>` : ""}</h3><span class="tiny muted">${t("cl.private")}</span></div>
              <div class="chat" id="chat">${messages.length ? messages.map((m) => html`<div class="bubble ${m.mine ? "mine" : ""}"><div class="by">${m.by} · ${timeAgo(m.at)}</div>${m.body}</div>`) : html`<p class="muted small center" style="padding:20px">${t("cl.no_messages")}</p>`}</div>
              ${can_message
                ? html`<form class="chat-form" id="chat-form"><textarea class="textarea" id="chat-input" name="body" maxlength="2000" placeholder="${t("cl.write")}" aria-label="${t("claimdlg.message")}"></textarea><button class="btn btn-primary" type="submit" aria-label="${t("cl.send")}">${icon("send")}</button></form>
                       <p class="tiny muted" style="margin:8px 0 0">${icon("shield-check")} ${t("cl.safety")}</p>`
                : html`<p class="tiny muted center" style="margin:12px 0 0">${t("cl.closed")}</p>`}
            </div>
          </div>

          <aside class="stack sticky" style="--gap:18px">
            <a class="card" href="/items/${item.id}" data-link style="display:block;overflow:hidden;color:var(--ink)">
              ${item.photos?.[0] ? html`<img src="${item.photos[0].thumb}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover">` : html`<div style="aspect-ratio:4/3;display:grid;place-items:center;background:var(--surface-2);color:var(--ink-3)">${icon(category(item.category).icon)}</div>`}
              <div class="card-pad" style="padding:16px"><div class="row" style="margin-bottom:6px">${typeBadge(item.type)}</div><strong>${item.title}</strong><div class="tiny muted">${(item.location_name || "").split(",")[0]} · ${formatDate(item.event_date)}</div></div>
            </a>
            <div class="card card-pad">
              <h3>${icon("history")} ${t("cl.history")}</h3>
              <ul class="timeline">${events.map((e) => html`<li class="${e.to}"><strong class="small">${e.from === e.to ? t("cl.note") : claimStatusLabel(e.to)}</strong> <span class="tiny muted">· ${e.by} · ${formatDateTime(e.at)}</span>${e.note ? html`<div class="small muted">${e.note}</div>` : ""}</li>`)}</ul>
            </div>
            ${me !== "admin" ? html`<button class="btn btn-ghost btn-sm" id="flag">${icon("flag")}${t("cl.report_problem")}</button>` : ""}
          </aside>
        </div>
      </div>`
    );

    const chat = $("#chat");
    chat.scrollTop = chat.scrollHeight;
    const form = $("#chat-form");
    if (form) {
      const input = $("#chat-input");
      input.value = draft;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const body = input.value.trim();
        if (!body) return;
        withButton(form.querySelector("[type=submit]"), async () => {
          try {
            await api.post(`/claims/${claim.id}/messages`, { body });
            input.value = "";
            load();
          } catch (err) {
            toast(err.message, "error");
          }
        });
      });
    }

    $$("[data-action]", el).forEach((b) =>
      b.addEventListener("click", async () => {
        const to = b.dataset.action;
        const [, , dlg, needsReason, danger] = ACTION[to];
        if (to === "dispute") {
          const reason = await confirmDialog({ title: t("cl.dispute_h"), text: t("cl.dispute_p"), confirm: t("cl.send"), input: { label: t("cl.reason"), multiline: true, required: true } });
          if (!reason) return;
          return run(() => api.post(`/claims/${claim.id}/dispute`, { reason }), t("cl.dispute_sent"));
        }
        let note = null;
        if (dlg) {
          const input = needsReason ? { label: needsReason === "required" ? t("cl.reason") : t("cl.note_record"), multiline: true, required: needsReason === "required", placeholder: needsReason === "required" ? t("cl.reject_ph") : "" } : null;
          const r = await confirmDialog({ title: t(`cl.c_${dlg}_h`), text: t(`cl.c_${dlg}_p`), confirm: t("cl.a_" + to), danger: !!danger, input });
          if (r === null) return;
          if (typeof r === "string") note = r;
        }
        run(() => api.post(`/claims/${claim.id}/status`, { status: to, note }), to === "returned" ? t("cl.returned_toast") : null);
      })
    );
    $("#flag")?.addEventListener("click", () => flagDialog("claim", claim.id, { label: t("flag.this_request") }));
  }

  async function run(fn, msg) {
    try {
      const r = await fn();
      toast(msg || (r?.status === "under_review" ? t("cl.approved_admin") : t("cl.updated")), "ok");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function actionsBar(claim) {
    const list = claim.actions;
    if (!list.length) return claim.status === "returned" ? html`<div class="alert alert-ok">${icon("party-popper")}<div><strong>${t("cl.returned_h")}</strong> ${t("cl.returned_p")}</div></div>` : "";
    const hint =
      claim.role === "owner" && claim.status === "pending" ? t("cl.h_owner_pending")
      : claim.role === "owner" && claim.status === "approved" ? t("cl.h_owner_approved")
      : claim.role === "claimant" && claim.status === "approved" ? t("cl.h_claimant_approved")
      : claim.role === "claimant" ? t("cl.h_claimant")
      : claim.role === "admin" ? t("cl.h_admin")
      : "";
    return html`<div class="stack" style="--gap:10px">${hint ? html`<p class="small muted" style="margin:0">${hint}</p>` : ""}<div class="row">${list.map((k) => html`<button class="${ACTION[k][1]}" data-action="${k}">${icon(ACTION[k][0])}${t("cl.a_" + k)}</button>`)}</div></div>`;
  }

  load();
  timer = setInterval(() => document.visibilityState === "visible" && load(true), 15000);
  return () => clearInterval(timer);
}
