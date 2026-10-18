// App-wide state: who is signed in, categories/colors, unread notifications.
import { api } from "./api.js";

const listeners = new Set();
export const store = {
  user: null,
  unread: 0,
  meta: { categories: [], colors: [], limits: { photos: 6, photoMb: 8 }, ai: { status: "idle" } },
};

export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(store));

export async function loadSession() {
  const s = await api.get("/session");
  store.user = s.user;
  store.unread = s.unread || 0;
  emit();
}

export async function loadMeta() {
  store.meta = await api.get("/meta");
  emit();
}

export function setSession(s) {
  store.user = s.user;
  store.unread = s.unread || 0;
  emit();
}

export function setUnread(n) {
  store.unread = n;
  emit();
}

export const isAdmin = () => store.user?.role === "admin";
export const category = (slug) => store.meta.categories.find((c) => c.slug === slug) || { slug, label: "Other", icon: "package" };
export const color = (slug) => store.meta.colors.find((c) => c.slug === slug);
