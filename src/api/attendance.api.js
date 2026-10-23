// ─────────────────────────────────────────────────────────────────────────────
// api/attendance.api.js — SELF-SERVICE ATTENDANCE ONLY.
//
// This app is the employee workspace, so there is no `/attendance/hr/*` or
// `/attendance/manager/*` method in here — not even a commented-out one. The
// self-service routes below are authorised for every org role, which is exactly
// why the app needs its own role gate (state/session.js).
//
// Contract source of truth:
//   public/ref docs/md_attendance/ATTENDANCE_API_CONTRACT.md
//
// The ON-DEMAND LOCATION endpoints below are the newest example of that rule:
// the requester's half (`/attendance/hr/employees/:id/locate`, the 2 s result
// poll, the org policy) is deliberately ABSENT, because this app is never the
// requester. Only the three the SUBJECT calls are here.
//
// Every query goes through qs() so a cleared filter never reaches the URL as
// `?status=` — which is a 400 on several endpoints. Unknown keys are SILENTLY
// STRIPPED server-side (stripUnknown wins over allowUnknown), so a 200 is not
// evidence that a field was understood: verify by reading the record back.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';

/**
 * Query string from a params object, dropping undefined / null / "".
 * @returns {string} "" or "?a=1&b=2"
 */
export function qs(params = {}) {
  const parts = [];
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'number' && Number.isNaN(value)) return;
    // Arrays repeat the key (`status=open&status=overdue`) — what the API
    // reads, and what the web's client sends. String(array) would send one
    // comma-joined value the server matches against nothing.
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== '')
        .forEach((v) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`));
      return;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

// Path params are URI-encoded: a malformed id must not change which endpoint
// is called.
export const seg = (value) => encodeURIComponent(String(value ?? ''));

const post = (path, payload) =>
  request(path, payload === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(payload) });

export const attendanceAPI = {
  // ── Punch (U1–U4) ──────────────────────────────────────────────────────────
  /**
   * body: { source, latitude?, longitude?, client_timestamp?, notes?,
   *         work_mode?, metadata? }
   *
   * `source` is 'mobile' for this app. Coordinates are OPTIONAL and nullable —
   * the backend accepts a punch without them and raises its own flag, so a
   * punch must NEVER be blocked on location.
   *
   * `work_mode` only for a HYBRID contract: for anyone else the server
   * overrides it, and sending it anyway raises a `work_mode_claim_mismatch`
   * flag against the employee.
   *
   * Errors: ALREADY_CLOCKED_IN (409), PREVIOUS_SHIFT_OPEN (409),
   *         PERIOD_LOCKED (403 — not DATE_LOCKED, which never existed).
   */
  /**
   * Also carries the clock-in PHOTO, top-level like the coordinates:
   * `photo` ("data:image/jpeg;base64,…", ~60–120 KB, location stamped on it)
   * and `photo_captured_at` (ISO). The backend does not read them yet and
   * strips them; PunchCard retries without them if they are ever refused.
   * Spec for the backend: NativeRef/00-plan/08-clock-in-photo.md.
   */
  clockIn: (payload) => post('/attendance/clock-in', payload),

  /** Same as clock-in MINUS `work_mode` — not a clock-out field, silently stripped. */
  clockOut: (payload) => post('/attendance/clock-out', payload),

  /** body { source, notes? }. Errors: NOT_CLOCKED_IN, MAX_BREAKS_EXCEEDED. */
  breakStart: (payload = { source: 'mobile' }) => post('/attendance/break/start', payload),
  /** body { source, notes? }. Errors: NOT_CLOCKED_IN, NO_ACTIVE_BREAK. */
  breakEnd: (payload = { source: 'mobile' }) => post('/attendance/break/end', payload),

  // ── Today & history (U5, U11, U12) ─────────────────────────────────────────
  /**
   * MAY RETURN YESTERDAY: while an overnight record is still open, this returns
   * THAT record and `date` is yesterday. Always render from the returned
   * `date`, never from your own "today".
   */
  getToday: () => request('/attendance/today'),

  /**
   * `month`/`year` are NOT accepted — build the range with monthRange().
   * @param {{from?: string, to?: string, page?: number, limit?: number}} params
   */
  getHistory: (params = {}) => request(`/attendance/history${qs(params)}`),

  /** Defaults to the current IST month. Pass both explicitly. */
  getSummary: (month, year) => request(`/attendance/summary${qs({ month, year })}`),

  // ── Day detail & insights (U16–U19) ────────────────────────────────────────
  /** An OBJECT (record, logs, sessions, breaks, anomalies) — not an array. */
  getDailyLog: (date) => request(`/attendance/daily-log${qs({ date })}`),
  getGraphData: (month, year) => request(`/attendance/graph-data${qs({ month, year })}`),
  /** @param {string} [date] YYYY-MM-DD — the week containing this date */
  getWeeklyCalendar: (date) => request(`/attendance/weekly-calendar${qs({ date })}`),
  /** @param {number} [months] 1–12 (backend default 3) */
  getTrends: (months) => request(`/attendance/trends${qs({ months })}`),

  // ── Shift & holidays (U13, U20) ────────────────────────────────────────────
  /**
   * Returns a WRAPPER: { assignment, shift, rotation, weekly_offs } — not a
   * bare shift. Reading `name` off the top level leaves the shift line blank.
   * A null `shift` means no assignment, which is a valid state.
   */
  getMyShift: () => request('/attendance/shift'),

  // ── My Schedule — the forward agenda (2026-10-22) ───────────────────────────
  // Web ref docs: md_updates/2026-10-22_frontend_my_schedule_forward_view_
  // integration_guide.md (v1) and ..._my_schedule_enriched_agenda_and_policy_
  // provenance_integration_guide.md (v2, which the screen reads). One request
  // per visible window: a DENSE day per date from `from` to `to` (inclusive),
  // each with a server-resolved `day_kind`. Range cap 92 days — a refusal
  // (SCHEDULE_RANGE_TOO_LARGE), never a truncation. No `user_id`: the subject
  // is the token.
  /**
   * Named `getMyAgenda` to match the web's api module exactly (§10). It was
   * `getScheduleAgenda` here for a day, which is how one call ends up with
   * two names.
   * @param {{from?: string, to?: string, include?: string}} [params]
   */
  getMyAgenda: (params = {}) => request(`/attendance/schedule/agenda${qs(params)}`),
  // The manager plane's coverage view over DIRECT reports (HR included —
  // never org-wide). Not used by the employee app; here for the manager app.
  /** @param {{from?: string, to?: string, subordinate_id?: string}} [params] */
  getTeamAgenda: (params = {}) => request(`/attendance/manager/schedule/team-agenda${qs(params)}`),

  /** Takes NO parameters — a `year` is silently ignored. Filter client-side. */
  getUpcomingHolidays: () => request('/attendance/holidays'),

  // ── Work mode & field sites (2026-10-05) ───────────────────────────────────
  /**
   * The caller's own sites plus their contractual work mode:
   *   { user_id, work_mode, assigned_office, total, records[] }
   *
   * THE ONLY source for whether to show the work-mode toggle. `work_mode` here
   * is already normalised and fail-secure (a null contract reads as "office").
   * A failed read leaves the contract null, which HIDES the toggle and the
   * sites panel — a missing feature degrades to a hidden control, never a crash.
   */
  getMyFieldAssignments: () => request('/attendance/my-field-assignments'),

  // ── Corrections (U6–U8) ────────────────────────────────────────────────────
  /**
   * → 201. body: { date, requested_clock_in?, requested_clock_out?, reason,
   *                work_mode? }
   * At least ONE of the two times is required. `reason` is 5–1000 chars.
   * For an OVERNIGHT correction send full ISO datetimes — with bare "HH:mm"
   * the backend cannot tell the clock-out belongs to the next day.
   */
  submitRegularization: (payload) => post('/attendance/regularization', payload),

  /**
   * `status` is validated and then IGNORED by the controller. Fetch
   * unfiltered and filter the loaded page client-side — and say so in the UI.
   */
  getMyRegularizations: (params = {}) => request(`/attendance/regularizations${qs(params)}`),

  /** No body. Self-scoped. Errors: FORBIDDEN, ALREADY_PROCESSED, NOT_FOUND. */
  cancelRegularization: (id) => post(`/attendance/regularizations/${seg(id)}/cancel`),

  // ── Overtime (U9) ──────────────────────────────────────────────────────────
  /** `page`/`limit` only — NO status filter exists. */
  getMyOvertime: ({ page, limit } = {}) => request(`/attendance/overtime/mine${qs({ page, limit })}`),

  // ── Flags / anomalies (U10) ────────────────────────────────────────────────
  /**
   * Records carry `is_resolved` (boolean), NOT `status` — derive the key with
   * anomalyStatusKey().
   * @param {{status?: "open"|"resolved"|"all", page?: number, limit?: number}} params
   */
  getMyAnomalies: (params = {}) => request(`/attendance/anomalies/mine${qs(params)}`),

  // ── Earned Leave / comp-offs (U14, U15) ────────────────────────────────────
  /**
   * There is NO `rejected` status: reject writes `cancelled`, so "Cancelled"
   * must read as "rejected or cancelled".
   * @param {{status?: "earned"|"approved"|"used"|"expired"|"cancelled", page?: number, limit?: number}} params
   */
  getMyCompOffs: (params = {}) => request(`/attendance/comp-offs/mine${qs(params)}`),
  getMyCompOffSummary: () => request('/attendance/comp-offs/mine/summary'),

  // ── On-demand location tracking, SUBJECT SIDE (2026-10-23) ─────────────────
  // Ref: NativeRef/10-api/06-location-requests.md, from the backend's
  // 2026-10-23 frontend + mobile integration guides.
  //
  // HR (or a reporting manager) can ask where an employee is during an open
  // shift. The ask arrives as a silent FCM data push, this app reads a fresh
  // GPS fix and posts it back, and the requester POLLS for the result. There
  // is no socket and nothing for the employee to tap — see
  // features/attendance/liveLocation.js for the whole cycle.
  //
  // THREE CALLS, AND THE APP IS NEVER THE REQUESTER. Registering the push
  // device (api/notifications.api.js) is a hard prerequisite for any of it.

  /**
   * Report this phone's coordinates for one request. → 200 { logged: true }.
   *
   * body: { request_id, latitude, longitude, accuracy_meters, is_mock,
   *         battery_level?, captured_at, platform }
   *
   * THE FIX MUST BE FRESH. `captured_at` is the hardware `position.timestamp`
   * and the fix must come from a `maximumAge: 0` read: the server runs a
   * six-signal anti-spoof pass, and a cached coordinate older than the request
   * trips its `stale_fix` signal. Faking the timestamp to get round that trips
   * `future_fix` instead. Send what the GPS said.
   *
   * `is_mock` is `position.mocked` passed straight through. The server RECORDS
   * it and does not reject on it (same rule as a punch — lib/location.js), so
   * there is nothing to gain by hiding it and a flagged-but-present fix is
   * worth more to everyone than no fix.
   *
   * IDEMPOTENT: re-posting the same `request_id` after a success returns
   * `{ logged: true }` again, so a retry on a flaky network is safe.
   *
   * Errors: 404 LOCATION_REQUEST_NOT_FOUND (unknown or someone else's),
   *         409 LOCATION_REQUEST_EXPIRED (the ~60 s TTL elapsed). BOTH ARE
   *         DEAD ENDS — discard the request, never retry it.
   */
  reportLiveLocation: (payload) => post('/attendance/locations/live-ping', payload),

  /**
   * Acknowledge the location-verification notice. → 200
   * { acknowledged_at, consent_version }.
   *
   * Required ONCE where the org policy is in `acknowledgement` mode; until it
   * lands, every locate against this person fails `422
   * EMPLOYEE_CONSENT_PENDING` — on the REQUESTER's screen, which the employee
   * never sees. There is no employee-readable policy endpoint, so the app
   * cannot tell the two consent modes apart and does not try: it shows the
   * notice either way and sends this when it is acknowledged. Harmless in
   * `notice_only`, and the difference between working and not in the other.
   *
   * body: { version } — optional; features/attendance/liveLocation.js owns the
   * string so there is one of it.
   */
  acknowledgeLocationNotice: (payload) => post('/attendance/locations/consent', payload),

  /**
   * WHO LOOKED, WHEN, AND WHY — this person's own audit trail. The GDPR Art.
   * 15 / DPDP 2023 right to know, and the My Time › Location checks section
   * (features/attendance/components/LocationChecksTab.jsx).
   *
   * Rows: { id, reason, requested_by, requester_role, created_at,
   *         responded_at, fix_returned }.
   *
   * `spoof_flagged` IS DELIBERATELY ABSENT from this endpoint and present on
   * the requester's history — the subject is not told which heuristic fired,
   * so nobody can tune a spoof against it. Don't go looking for the field.
   *
   * @param {{page?: number, limit?: number}} params
   */
  getMyLocationRequests: (params = {}) => request(`/attendance/locations/mine${qs(params)}`),

  // ── Device trust & my trusted devices (D1–D7) ──────────────────────────────
  // What the organisation asks for at punch time, and the devices this person
  // has registered. Since 2026-10-21 the app REGISTERS this phone too, as a
  // `device_key` credential — a Keystore key, not the browser's WebAuthn
  // (features/devices/deviceKey.js) — and signs every enforced punch with it.
  //
  // The context read degrades to "off" on a 404/403 (an older server, or the
  // feature switched off) — attendance then behaves exactly as before. The
  // caller treats a thrown error as absent, never as a crash.

  /** What the org requires right now: `{ enabled, effective_mode, enforce_from,
   *  max_active_devices, my_active_device_count, registration_approval, … }`. */
  getDeviceTrustContext: () => request('/attendance/device-trust/context'),

  /** My registered devices. Never carries `public_key`, `credential_id` or `sign_count`. */
  getMyTrustedDevices: () => request('/attendance/trusted-devices'),

  /** Rename only — `device_name` is the one owner-editable field. */
  renameTrustedDevice: (id, payload) =>
    request(`/attendance/trusted-devices/${seg(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  /**
   * Shut a device off for good (D7). Self-revoke takes NO reason — the server
   * writes `user_revoked` itself. Idempotent (revoking a revoked device is a
   * 200) and IRREVERSIBLE: the same screen lock can never be registered again.
   */
  revokeMyTrustedDevice: (id) => post(`/attendance/trusted-devices/${seg(id)}/revoke`),

  /**
   * D2 — a single-use challenge for one punch. `{ operation, credential_type }`
   * → `{ required: false }` (nothing to sign), `{ required: true,
   * registration_required: true }` (no device yet), or a challenge with a
   * `device_key` block carrying EVERY field the canonical bytes need. Never
   * cache, reuse or retry one: it dies on first submit, success or failure.
   * Rate limited 60/h; the two fast paths are free.
   */
  getDeviceChallenge: (payload) => post('/attendance/device-trust/challenge', payload),

  /**
   * D3 — open enrollment. Sends an OTP to the person's email and mints a
   * registration challenge that dies in ~180s. Rate limited 5/h.
   * 409 DEVICE_LIMIT_REACHED carries `details.devices[]`: re-call with
   * `replace_device_id`.
   */
  startDeviceRegistration: (payload) => post('/attendance/trusted-devices/registration/start', payload),

  /**
   * D4 — OTP + the SPKI public key, one transaction. The possession
   * signature is OPTIONAL for device_key (ATTENDANCE_API_CONTRACT §11.2) and
   * this app does not send one — see deviceKey.js for why.
   */
  completeDeviceRegistration: (payload) => post('/attendance/trusted-devices/registration/complete', payload),
};

export default attendanceAPI;
