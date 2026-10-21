// ─────────────────────────────────────────────────────────────────────────────
// lib/fieldPlanes.js — field-site helpers, ported from the web's
// src/shared/attendance/fieldPlanes.js (CLAUDE.md §10).
//
// PARTIAL PORT, ON PURPOSE. The web file is mostly the HR / manager "plane"
// adapter — who may create, edit and assign field sites — and an employee
// has neither plane (they self-read /attendance/my-field-assignments). Only
// the two pure helpers an employee screen needs came across, with their web
// names and behaviour unchanged: `coord` and `hasPin`.
//
// `mapsUrl` is the web's MyWorkLocationsPage helper, kept beside them so the
// "View on map" link is built one way in both products.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coordinates arrive as STRINGS from `numeric` columns via pg. A map component
 * handed "18.52043000" silently renders nothing, so every read goes through
 * this rather than trusting the payload's type.
 * @returns {number|null}
 */
export function coord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** True when a site has a usable GPS pin — the only thing that makes it geofenceable. */
export const hasPin = (loc) => coord(loc?.latitude) !== null && coord(loc?.longitude) !== null;

/** Open the site on a map the person already has. Site coords only — no personal data. */
export const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
