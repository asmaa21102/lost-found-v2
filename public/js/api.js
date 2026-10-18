// fetch() wrapper for the JSON API. Errors carry the server message and field errors.
// The interface language goes with every request so the server answers in it.
import { lang, t } from "./i18n.js";
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

async function request(method, url, body) {
  const opts = { method, headers: { "X-Requested-With": "fetch", "X-Lang": lang }, credentials: "same-origin" };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch("/api" + url, opts);
  } catch {
    throw new ApiError(0, t("err.network"));
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || t("err.status", { status: res.status }), data?.fields);
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body = {}) => request("POST", url, body),
  patch: (url, body = {}) => request("PATCH", url, body),
  del: (url, body) => request("DELETE", url, body),
};

export const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)) p.set(k, Array.isArray(v) ? v.join(",") : v);
  const s = p.toString();
  return s ? "?" + s : "";
};
