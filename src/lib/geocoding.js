// ─────────────────────────────────────────────────────────────────────────────
// lib/geocoding.js — what someone types into a pin, and a pin back into an
// address. Google Geocoding v4 first, OpenStreetMap's Nominatim behind it.
//
// PORTED from the web's `src/shared/utils/geocoding.js` (CLAUDE.md §10): same
// providers, same order, same names, same soft failures. Both sides moved to
// Google in the same sitting (2026-10-24), so the address the clock-in photo
// prints still comes from the provider HR used to place the office.
//
// ── GOOGLE IS A DEMO KEY, SO IT IS ALLOWED TO RUN OUT (user, 2026-10-24) ────
//
// "for now use it on app and on frontend only, we'll upgrade later, it's a demo
// key so kindly manage." A Maps Demo Key needs no billing but has a small daily
// allowance per API, and it only works with the NEW Geocoding API v4
// (geocode.googleapis.com/v4) — the classic maps/api/geocode/json endpoint
// answers REQUEST_DENIED "enable billing" for the same key. So:
//
//   • Google first. Nominatim when Google has no answer, fails, or is resting.
//   • A refusal that won't heal today (429 — the day's allowance is spent; 403;
//     an invalid key) RESTS Google until local midnight, so the rest of the day
//     goes straight to Nominatim instead of paying a dead round trip each time.
//   • Every answer is kept in memory for the session, keyed on the coordinate
//     to ~1m, so re-opening the camera at the same desk costs nothing.
//
// Google results are reshaped into a NOMINATIM-SHAPED item (`fromGoogle`), so
// `normalizePlace` and `placeLines` read both providers the same way and no
// caller changed. On the upgrade to a billed key: point ENV.GOOGLE_MAPS_API_KEY
// at it (or move the call behind the backend) and nothing else here moves.
//
// GOOGLE'S TERMS: its results may not be drawn on a non-Google map. The photo's
// map window is still OpenStreetMap tiles (`osmTiles`). Fine for a demo; the
// billed upgrade should swap that window for Google Static Maps.
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

import ENV from '../config/env';

const BASE = 'https://nominatim.openstreetmap.org';
// Nominatim refuses anonymous app traffic; a browser sends a Referer, an app
// has to say who it is.
const HEADERS = { 'Accept-Language': 'en', 'User-Agent': 'HRClouds-Employee-App/1.0 (hrclouds)' };

const GOOGLE = 'https://geocode.googleapis.com/v4/geocode';

/* ─── Google, and when to stop asking it ─────────────────────────────────── */

let googleRestingUntil = 0;

const googleReady = () => !!ENV.GOOGLE_MAPS_API_KEY && Date.now() >= googleRestingUntil;

function restGoogleUntilTomorrow() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  googleRestingUntil = midnight.getTime();
}

const memo = new Map();
const MEMO_MAX = 100;
function remember(key, value) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(key, value);
}

/**
 * One Google call. The results array ([] for "no match"), or null when Google
 * couldn't be asked — the caller then tries Nominatim.
 */
async function askGoogle(path, params, signal) {
  if (!googleReady()) return null;
  const qs = Object.entries({ ...params, languageCode: 'en', key: ENV.GOOGLE_MAPS_API_KEY })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  try {
    const res = await fetch(`${GOOGLE}/${path}?${qs}`, { signal });
    const data = await res.json().catch(() => null);
    if (res.ok) return Array.isArray(data?.results) ? data.results : [];
    const reason = (data?.error?.details || []).find((d) => d?.reason)?.reason;
    if (res.status === 429 || res.status === 403 || reason === 'API_KEY_INVALID') restGoogleUntilTomorrow();
    return null;
  } catch {
    return null;
  }
}

/**
 * A Google v4 result as the Nominatim item every reader here already knows —
 * `lat`/`lon` strings, `display_name`, and an `address` object with
 * Nominatim's key names. In India Google files the sector under
 * sublocality_level_1 and the block or industrial area under level 2/3.
 */
function fromGoogle(r) {
  const comps = r?.addressComponents || [];
  const pick = (...types) => {
    for (const t of types) {
      const c = comps.find((x) => x.types?.includes(t));
      if (c?.longText) return c.longText;
    }
    return '';
  };
  const pa = r?.postalAddress || {};
  const display = r?.formattedAddress || '';
  return {
    place_id: r?.placeId || display,
    lat: String(r?.location?.latitude),
    lon: String(r?.location?.longitude),
    display_name: display,
    name: display.split(',')[0].trim(),
    address: {
      building: pick('premise'),
      amenity: pick('establishment', 'point_of_interest'),
      house_number: pick('street_number'),
      road: pick('route'),
      neighbourhood: pick('sublocality_level_2', 'neighborhood'),
      suburb: pick('sublocality_level_1', 'sublocality'),
      city: pick('locality', 'postal_town') || pa.locality || '',
      county: pick('administrative_area_level_2'),
      state: pick('administrative_area_level_1') || pa.administrativeArea || '',
      country: pick('country'),
      postcode: pick('postal_code') || pa.postalCode || '',
    },
    provider: 'google',
  };
}

const hasPoint = (r) => Number.isFinite(r?.location?.latitude) && Number.isFinite(r?.location?.longitude);

/** A signal that fires on the caller's abort OR after `ms` — one per provider attempt. */
function timed(signal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.('abort', onAbort);
  return {
    signal: controller.signal,
    done: () => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); },
  };
}

/* ─── The shared surface ─────────────────────────────────────────────────── */

/** One search hit (either provider), flattened to the fields our location forms store. */
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
  const key = `s:${q.toLowerCase()}`;
  if (memo.has(key)) return memo.get(key);

  const google = await askGoogle('address', { addressQuery: q, regionCode: 'IN' }, signal);
  const hits = (google || []).filter(hasPoint).slice(0, 5).map(fromGoogle);
  if (hits.length) {
    remember(key, hits);
    return hits;
  }
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
  const key = `r:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (memo.has(key)) return memo.get(key);

  // A phone on a weak signal can leave either call hanging; somebody is
  // standing at the door waiting to clock in. Each provider gets `timeout`,
  // then the stamp says "not found".
  if (googleReady()) {
    const g = timed(signal, timeout);
    const results = await askGoogle(`location/${latitude},${longitude}`, {}, g.signal);
    g.done();
    // Google lists the most specific match first; a bare plus code ("J9GF+R3")
    // is not an address anyone recognises, so it never wins.
    const best = (results || []).find((r) => hasPoint(r) && !r.types?.includes('plus_code'));
    if (best) {
      const place = normalizePlace(fromGoogle(best));
      remember(key, place);
      return place;
    }
  }

  const n = timed(signal, timeout);
  try {
    const res = await fetch(`${BASE}/reverse?format=json&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`, { signal: n.signal, headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data && data.address ? normalizePlace(data) : null;
    if (place) remember(key, place);
    return place;
  } catch {
    return null;
  } finally {
    n.done();
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
