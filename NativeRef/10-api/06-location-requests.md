# On-demand location requests — the employee app's half of the contract

**Added 2026-10-23.** Source documents, kept verbatim in
`NativeRef/70-reference/vendor/`:

- `2026-10-23_on_demand_location_tracking_mobile_guide.md` — the mobile guide
- `2026-10-23_on_demand_location_tracking_frontend_guide.md` — the web/overview
  guide, which carries the **authoritative** route paths and status codes and
  corrects the first draft (its §7 lists what changed)

Where the two disagree, the frontend guide wins — it says so itself, and it was
reconciled against the shipped backend. Where the guides disagree with the live
API, **the API wins** (CLAUDE.md §9) and the deviation gets recorded here.

---

## 1. What the feature is

HR — or a reporting manager, for their own direct reports — can ask where an
employee is **during an open shift**. The ask arrives on the employee's phone as
a **silent FCM data push**; the app reads a fresh GPS fix and posts it back; the
requester **polls** for the result.

Four things follow from that, and all four are design constraints on this app:

1. **No background GPS, ever.** The phone is woken by a push and takes one fix.
   There is no persistent location service and no battery cost when idle. Do not
   add one.
2. **Zero taps.** The employee does not approve, confirm or dismiss anything
   mid-shift. The whole cycle is push → local notification → fix → POST, in
   5–15 s.
3. **A notification is posted anyway**, as transparency. The employee is told
   their location was requested, every time. This is a legal/trust requirement,
   not a nicety — see §5.
4. **Nothing is "verified".** The server can test a fix for *plausibility*, not
   truth. The word on screen is **"Reported"**, never "Verified".

## 2. This app is never the requester

`/attendance/hr/*` and `/attendance/manager/*` are deliberately absent from
`src/api/attendance.api.js`, this feature included. The employee app implements
only the three calls the **subject** makes:

| Call | Method / path | Lives in |
|---|---|---|
| Register this handset for push | `POST /notifications/devices` | `src/api/notifications.api.js` |
| Report a fix | `POST /attendance/locations/live-ping` | `attendanceAPI.reportLiveLocation` |
| Acknowledge the notice | `POST /attendance/locations/consent` | `attendanceAPI.acknowledgeLocationNotice` |
| My own audit trail | `GET /attendance/locations/mine` | `attendanceAPI.getMyLocationRequests` |

The requester's half — `POST …/locate`, the ~2 s result poll on
`GET …/location-requests/:requestId`, the location-history reads and the org
policy `GET`/`PUT` (which needs an `If-Match` ETag) — belongs to the **manager
app** and the web portal. Don't add it here "for later".

## 3. Device registration is a hard prerequisite

> A locate against an employee with no active push device returns
> **`422 NO_ACTIVE_DEVICE`**. (The first draft said 404. It is 422.)

That error lands on the **requester's** screen. The employee sees nothing at
all — no prompt, no error. So a registration that quietly failed is
indistinguishable, from HR's side, from an employee refusing to answer.

```json
POST /notifications/devices
{ "platform": "android", "push_token": "<FCM token>",
  "device_name": "Pixel 8", "app_version": "1.4.2" }
→ 201 { "success": true, "data": { "id": "…", "is_active": true, … } }
```

- `platform`: `"android"` | `"ios"` (the API also takes `"web"`; this app never
  sends it).
- `push_token`: 1–8192 chars. The FCM registration token.
- `device_name` ≤ 100 chars, `app_version` ≤ 50 chars — both optional.
- **Re-registering the same token upserts.** No duplicate rows, so calling it
  again is the cheap fix for "it might not have landed".
- Keep the returned `id`: it is the only thing `DELETE /notifications/devices/:id`
  takes, and that call is what unbinds a handset at sign-out.
- The token and its hash are **never** returned.

**Not to be confused with `/attendance/trusted-devices`.** That is device trust
— a Keystore credential that signs a punch, enrolled with an OTP, shown on "My
Registered Devices". The two have separate ids, separate lifecycles, and neither
implies the other. `src/api/notifications.api.js`'s header spells this out.

## 4. Reporting a fix

```json
POST /attendance/locations/live-ping
{ "request_id": "c7a8b42e-…", "latitude": 28.61412055, "longitude": 77.20915012,
  "accuracy_meters": 12.5, "is_mock": false, "battery_level": 82,
  "captured_at": "2026-10-23T13:40:15.123Z", "platform": "android" }
→ 200 { "success": true, "data": { "logged": true } }
```

| Field | Rules |
|---|---|
| `request_id` | uuid, required — from the push payload's `requestId` |
| `latitude` | required, −90…90 |
| `longitude` | required, −180…180 |
| `accuracy_meters` | required, > 0 and ≤ 100000 |
| `captured_at` | required, ISO-8601 — the **hardware** `position.timestamp` |
| `is_mock` | optional, default false — `position.mocked` passed straight through |
| `battery_level` | optional, integer 0–100 |
| `platform` | optional, `android` \| `ios` \| `web` |

**Errors are both dead ends.** `404 LOCATION_REQUEST_NOT_FOUND` (unknown or
someone else's request) and `409 LOCATION_REQUEST_EXPIRED` (the ~60 s TTL
elapsed, or the request already reached a terminal state). Discard the request;
never retry either.

**Idempotent on success.** Re-posting the same `request_id` returns
`{ logged: true }` again, so a retry on a flaky network is safe.

### The anti-spoof rules the app has to respect

The backend runs a six-signal plausibility pass. Three of its signals are
things *this app* can trip by accident:

1. **`maximumAge: 0`, always.** A cached coordinate older than the request trips
   `stale_fix`. This is the one place in the app that must *not* use
   `getPunchLocation()`'s cached-first strategy (`src/lib/location.js`) — that
   function deliberately takes a 60 s-old fix so the Clock in button doesn't
   spin, which is right for a punch and wrong here.
2. **Report `is_mock` honestly.** The server records it and does **not** reject
   on it. Same rule as a punch: a flagged-but-present fix is worth more than no
   fix, and hiding the flag gains nothing.
3. **Don't touch `captured_at`.** It is the GPS timestamp. A device clock skewed
   more than ~2 minutes from real UTC trips `future_fix` or `stale_fix` —
   "correcting" it by sending `Date.now()` is how you cause that.

`spoof_flagged` is returned to the **requester** and is deliberately **absent**
from `GET /attendance/locations/mine`: the subject is never told which heuristic
fired, so nobody can tune a spoof against it. Don't go looking for the field.

## 5. Consent, and the mode this app cannot read

The org policy has a `consent_mode` of `notice_only` or `acknowledgement`. In
`acknowledgement` mode, every locate fails `422 EMPLOYEE_CONSENT_PENDING` until
the employee has acknowledged once.

**There is no employee-readable policy endpoint.** `GET /attendance/hr/location-policy`
is HR-only. So the app genuinely cannot tell the two modes apart, and does not
try: it shows the notice either way and posts the acknowledgement when the
person taps it. Harmless in `notice_only`; the difference between working and
not in `acknowledgement`.

```json
POST /attendance/locations/consent
{ "version": "v1" }
→ 200 { "data": { "acknowledged_at": "…", "consent_version": "v1" } }
```

## 6. The employee's audit trail

```
GET /attendance/locations/mine?page=1&limit=20
→ { "data": { "requests": [ { "id", "reason", "requested_by",
                              "requester_role", "created_at",
                              "responded_at", "fix_returned" } ],
              "pagination": { "total", "page", "limit" } } }
```

GDPR Art. 15 / India DPDP 2023: the employee has a right to know **who** looked,
**when**, and **why**. `reason` is the requester's own words (10–255 chars,
required only where the policy sets `require_reason`), so it is shown as written
and never replaced with a label.

`fix_returned: false` means the phone didn't answer in time — unreachable, app
force-quit, permission denied. Word it as **"No location sent"**, never as
anything the employee did wrong.

## 7. Feature gating — three switches, all server-side

The whole feature sits behind the `attendance.geofencing` org feature **and** a
server kill switch (`ATTENDANCE_LOCATION_TRACKING_ENABLED`) **and** a per-org
`enabled` policy flag. All three must be on.

The app cannot read any of them. Per CLAUDE.md §6 it gates on **what the server
returned**: `GET /attendance/locations/mine` is the probe, and a 404 or an
explicitly disabled feature **drops the My Time section**. A network failure is
not a 404 and must keep it — a flaky minute must not make a feature vanish.

## 8. The push payload

A **data-only, high-priority** message. There is no `notification` block, which
is exactly why the app posts its own (§1.3):

```json
{ "action": "REQUEST_LOCATION", "requestId": "<uuid>", "expiresAt": "<ISO>" }
```

Check `expiresAt` before doing anything: a push that arrives after the TTL is
discarded without a fix and without a notification.

## 9. Platform traps

- **iOS force-quit.** Apple does not deliver silent push to an app the user
  swiped away. Those requests simply time out, and the backend derives
  `timed_out` and reports "device unreachable" to HR rather than erroring. There
  is nothing the app can do about it and nothing to work around.
- **OEM battery managers** (Samsung, Xiaomi, OnePlus) put background apps into
  deep sleep, so a field employee's phone may not wake. The guide suggests
  prompting for a battery-optimisation exemption. **Not implemented** — see the
  handover notes.
- **Android 13+** needs the `POST_NOTIFICATIONS` runtime grant before any local
  notification can be posted. `features/notifications/push.js` already asks for
  it at sign-in.

## 10. Permissions already in place

`android/app/src/main/AndroidManifest.xml` already declares everything this
feature needs — `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
`ACCESS_BACKGROUND_LOCATION`, `POST_NOTIFICATIONS`, `WAKE_LOCK` — because the
punch flow and FCM needed them first. Nothing new to add.

iOS needs `NSLocationWhenInUseUsageDescription` (present) and the **Remote
notifications** background mode in Signing & Capabilities.
