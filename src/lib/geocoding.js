// ─────────────────────────────────────────────────────────────────────────────
// lib/geocoding.js — a pin back into an address. OpenStreetMap's Nominatim.
//
// PORTED from the web's `src/shared/utils/geocoding.js` (CLAUDE.md §10): same
// provider, same names, same soft failures. The web has used Nominatim since
// office locations were built, and keeping ONE provider means the address the
// clock-in photo prints is the address HR typed for that office.
//
// Failures are SOFT, as on the web — an address is a nicety on top of the
// coordinates, so a dead network gives `null` and the caller falls back to
// saying where in numbers. Nominatim's usage policy asks apps to identify
// themselves and not hammer it: one request per clock-in, never per render.
//
// NATIVE-ONLY ADDITIONS (extras, not divergence):
//   `placeLines`  the two short lines a photo stamp has room for
//   `osmTiles`    the OpenStreetMap tiles around a point — the same tile
//                 server the web's maps draw from (GeofenceMapPicker)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://nominatim.openstreetmap.org';
// Nominatim refuses anonymous app traffic; a browser sends a Referer, an app
// has to say who it is.
const HEADERS = { 'Accept-Language': 'en', 'User-Agent': 'HRClouds-Employee-App/1.0 (hrclouds)' };

/** One Nominatim hit, flattened to the fields our location forms store. */
export function normalizePlace(item) {
  const a = item?.address || {};
  return {
    latitude: Number(parseFloat(item.lat).toFixed(6)),
    longitude: Number(parseFloat(item.lon).toFixed(6)),
    address: item.display_name || '',
    city: a.city || a.town || a.village || a.suburb || a.county || '',
    state: a.state || '',
    country: a.country || '',
    pincode: a.postcode || '',
    // Kept for `placeLines` — the web reads only the flat fields above.
    parts: a,
  };
}

/** Places matching free text, best first, at most 5. [] on any failure. */
export async function searchPlaces(query, { signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  try {
    const res = await fetch(`${BASE}/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`, { signal, headers: HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** The address at a coordinate. A normalized place, or null. */
export async function reverseGeocode(latitude, longitude, { signal, timeout = 6000 } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // A phone on a weak signal can leave this hanging; somebody is standing at
  // the door waiting to clock in. Give up after `timeout` and say "not found".
  const controller = signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const res = await fetch(`${BASE}/reverse?format=json&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`, { signal: signal || controller.signal, headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.address ? normalizePlace(data) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Two short lines for a photo stamp: WHERE (the building or street) and the
 * AREA (locality, city, state, pincode). `display_name` is the whole postal
 * chain — eight commas long — and does not fit on a phone photo.
 */
export function placeLines(place) {
  if (!place) return null;
  const a = place.parts || {};
  const where = [
    a.amenity || a.building || a.office || a.shop || a.house_name,
    [a.house_number, a.road].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || a.neighbourhood || a.suburb || '';
  const locality = a.suburb || a.neighbourhood || a.quarter || '';
  const area = [
    locality && locality !== where ? locality : null,
    place.city,
    [place.state, place.pincode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const line1 = where || place.city || '';
  const line2 = area || place.country || '';
  if (!line1 && !line2) return null;
  return { line1: line1 || line2, line2: line1 ? line2 : '' };
}

/* ─── Map tiles ──────────────────────────────────────────────────────────── */

const TILE = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/**
 * The 2×2 block of OpenStreetMap tiles that contains a point, and where the
 * point sits in it — enough to centre a small map window on any coordinate.
 * @returns {{ tiles: {uri, col, row}[], fx: number, fy: number }} fx/fy are the
 *          point's position inside the 2×2 block, in tile units (0–2).
 */
export function osmTiles(latitude, longitude, zoom = 16) {
  const n = 2 ** zoom;
  const xf = ((longitude + 180) / 360) * n;
  const latR = (latitude * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  // Take the neighbour on the side the point is nearest to, so the point is
  // never close to the block's edge.
  const x0 = xf - x < 0.5 ? x - 1 : x;
  const y0 = yf - y < 0.5 ? y - 1 : y;
  const tiles = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      tiles.push({ uri: TILE(zoom, ((x0 + col) % n + n) % n, y0 + row), col, row });
    }
  }
  return { tiles, fx: xf - x0, fy: yf - y0 };
}
