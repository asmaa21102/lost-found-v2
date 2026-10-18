// Leaflet helpers: themed tiles, pins, a location picker and approximate-area circles.
import { whenLoaded, esc } from "./lib.js";
import { t, lang } from "./i18n.js";

export const DEFAULT_CENTER = [41.2061, 32.6204]; // Karabük city centre (demo area)

const ICON_SVG = {
  lost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  found: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  pick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>',
};

export async function leaflet() {
  return whenLoaded("L");
}

// OpenStreetMap tiles for both themes; dark mode tints them navy with a CSS filter
// (see .leaflet-tile-pane in app.css), so no tile API key is needed.
function tiles(L) {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
}

export function pin(L, kind) {
  return L.divIcon({ className: "", html: `<div class="pin ${kind}">${ICON_SVG[kind] || ICON_SVG.pick}</div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
}

export async function createMap(el, { center = DEFAULT_CENTER, zoom = 14, scrollWheelZoom = true } = {}) {
  const L = await leaflet();
  const map = L.map(el, { zoomControl: true, scrollWheelZoom, attributionControl: true }).setView(center, zoom);
  tiles(L).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  return { L, map, destroy: () => map.remove() };
}

// Shows the approximate area (not the exact spot) of a public report.
export async function areaMap(el, location, type) {
  const { L, map, destroy } = await createMap(el, { center: [location.lat, location.lng], zoom: 15, scrollWheelZoom: false });
  const colour = type === "lost" ? "#d32f2f" : "#a0682e";
  L.circle([location.lat, location.lng], { radius: location.radius_m || 300, color: colour, weight: 2, fillColor: colour, fillOpacity: 0.18 }).addTo(map);
  return destroy;
}

// Short readable place name from Nominatim (avoids house numbers for privacy).
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`, { headers: { "Accept-Language": lang } });
    const d = await res.json();
    const a = d.address || {};
    const parts = [d.name || a.amenity || a.building || a.shop || a.leisure, a.road || a.pedestrian, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village].filter(Boolean);
    return [...new Set(parts)].slice(0, 3).join(", ") || null;
  } catch {
    return null;
  }
}

export async function searchPlace(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": lang } });
  return res.json();
}

// Click-to-pick map for the report form.
export async function pickerMap(el, { value = null, onPick }) {
  const { L, map, destroy } = await createMap(el, { center: value ? [value.lat, value.lng] : DEFAULT_CENTER, zoom: value ? 16 : 14 });
  let marker = null;
  const place = (latlng, notify = true) => {
    if (marker) marker.setLatLng(latlng);
    else {
      marker = L.marker(latlng, { icon: pin(L, "pick"), draggable: true }).addTo(map);
      marker.on("dragend", () => place(marker.getLatLng()));
    }
    if (notify) onPick({ lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) });
  };
  if (value) place(L.latLng(value.lat, value.lng), false);
  map.on("click", (e) => place(e.latlng));
  return {
    map,
    destroy,
    setView: (lat, lng) => {
      map.setView([lat, lng], 17);
      place(L.latLng(lat, lng));
    },
    locate: () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error(t("map.no_geo")));
        navigator.geolocation.getCurrentPosition(
          (p) => {
            map.setView([p.coords.latitude, p.coords.longitude], 17);
            place(L.latLng(p.coords.latitude, p.coords.longitude));
            resolve();
          },
          () => reject(new Error(t("map.geo_failed"))),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }),
  };
}

export const popupHtml = (item, catLabel) => `<div class="map-pop">
  ${item.thumb ? `<img src="${esc(item.thumb)}" alt="">` : ""}
  <div class="b">
    <span class="badge ${item.type === "lost" ? "badge-lost" : "badge-found"}">${t("type." + item.type)}</span>
    <strong>${esc(item.title)}</strong>
    <div class="tiny muted">${esc(catLabel)} · ${esc(item.event_date || "")}</div>
    <div class="tiny muted" style="margin:4px 0 10px">${esc((item.location_name || "").split(",")[0])} · ${esc(t("map.approx"))}</div>
    <a class="btn btn-primary btn-sm btn-block" href="/items/${item.id}" data-link>${esc(t("map.view"))}</a>
  </div>
</div>`;
