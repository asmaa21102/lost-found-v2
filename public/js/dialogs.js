// Dialogs used from several pages: request an item / say you found it, and report content.
import { api } from "./api.js";
import { html, icon } from "./lib.js";
import { modal, showErrors, withButton, toast } from "./components.js";
import { navigate } from "./router.js";
import { t } from "./i18n.js";

export function claimDialog(item, { matchId = null } = {}) {
  const ownership = item.type === "found";
  const m = modal(
    String(html`<div class="modal-head">
      <div><span class="eyebrow">${icon(ownership ? "hand" : "hand-heart")}${ownership ? t("claimdlg.kind_ownership") : t("claimdlg.kind_finder")}</span><h3 style="margin-top:6px">${ownership ? t("claimdlg.title_ownership") : t("claimdlg.title_finder")}</h3></div>
      <button class="icon-btn" data-close aria-label="${t("common.close")}">${icon("x")}</button>
    </div>
    <form id="claim-form" class="stack" novalidate>
      <div class="alert alert-info">${icon("lock")}<div>${ownership ? t("claimdlg.privacy_ownership") : t("claimdlg.privacy_finder")}</div></div>
      <div class="field">
        <label for="c-message">${t("claimdlg.message")}</label>
        <textarea class="textarea" id="c-message" name="message" maxlength="1000" placeholder="${ownership ? t("claimdlg.message_ph_ownership") : t("claimdlg.message_ph_finder")}" required></textarea>
      </div>
      <div class="field">
        <label for="c-proof">${ownership ? t("claimdlg.proof_ownership") : t("claimdlg.proof_finder")} ${ownership ? "" : html`<span class="optional">${t("common.recommended")}</span>`}</label>
        <textarea class="textarea" id="c-proof" name="proof" maxlength="1000" placeholder="${ownership ? t("claimdlg.proof_ph_ownership") : t("claimdlg.proof_ph_finder")}"></textarea>
        <span class="hint">${ownership ? t("claimdlg.proof_hint_ownership") : t("claimdlg.proof_hint_finder")}</span>
      </div>
      ${item.is_valuable ? html`<div class="alert alert-warn">${icon("shield-alert")}<div>${t("claimdlg.valuable")}</div></div>` : ""}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t("common.cancel")}</button><button class="btn btn-primary" type="submit">${icon("send")}${t("claimdlg.send")}</button></div>
    </form>`)
  );
  const form = m.el.querySelector("#claim-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    withButton(form.querySelector('[type="submit"]'), async () => {
      try {
        const r = await api.post(`/items/${item.id}/claims`, { message: form.message.value, proof: form.proof.value, match_id: matchId });
        m.close();
        toast(r.requires_admin ? t("claimdlg.sent_admin") : t("claimdlg.sent"), "ok", { title: t("claimdlg.sent_title") });
        navigate(`/claims/${r.id}`);
      } catch (err) {
        if (!showErrors(form, err)) toast(err.message, "error");
      }
    });
  });
}

const REASONS = ["spam", "fake", "scam", "offensive", "privacy", "other"];

export function flagDialog(targetType, targetId, { label = t("flag.this_report") } = {}) {
  const m = modal(
    String(html`<div class="modal-head"><h3>${t("flag.title", { label })}</h3><button class="icon-btn" data-close aria-label="${t("common.close")}">${icon("x")}</button></div>
    <p class="muted small">${t("flag.intro")}</p>
    <form id="flag-form" class="stack">
      <div class="field"><label>${t("flag.reason")}</label>
        <div class="filter-chips">${REASONS.map((v, i) => html`<label class="chip"><input type="radio" name="reason" value="${v}" ${i === 0 ? "checked" : ""}>${t("flag.r." + v)}</label>`)}</div>
      </div>
      <div class="field"><label for="f-details">${t("flag.details")} <span class="optional">${t("common.optional")}</span></label><textarea class="textarea" id="f-details" name="details" maxlength="1000" placeholder="${t("flag.details_ph")}"></textarea></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t("common.cancel")}</button><button class="btn btn-danger" type="submit">${icon("flag")}${t("flag.send")}</button></div>
    </form>`)
  );
  const form = m.el.querySelector("#flag-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    withButton(form.querySelector('[type="submit"]'), async () => {
      try {
        await api.post("/flags", { target_type: targetType, target_id: targetId, reason: form.reason.value, details: form.details.value });
        m.close();
        toast(t("flag.thanks"), "ok");
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}
