# Attendance screens — reference composition vs. what the backend actually sends

The third reference image shows three screens: **Attendance**, **Clock In /
Clock Out**, and **Break Management**. This is what each one needs, which of it
the gateway already returns, and which parts have no data behind them today.

Everything below is checked against `NativeRef/10-api/03-payload-shapes.md`
(the verified shapes), `NativeRef/10-api/02-endpoint-registry.md`, and
`src/api/attendance.api.js`. Where a shape is marked "not verified" in those
docs, it is marked that way here too rather than assumed.

---

## 0 · The short version

| Reference element | Backend | Verdict |
|---|---|---|
| Check-in time, work hours, break time | `GET /attendance/today` | ✅ verified |
| The progress ring | `GET /attendance/shift` → `shift.start_time`/`end_time` | ✅ verified |
| "On Time" / late | `today.late_minutes` | ✅ verified |
| Punch timeline (In · Break out · Break in · Out) | `GET /attendance/daily-log` → `logs[]` | ⚠️ shape not exhaustively verified |
| This Week day strip | `GET /attendance/weekly-calendar` | ⚠️ **shape undocumented** |
| This Month summary (Present / Absent / Late) | `GET /attendance/summary` | ✅ verified, all 14 keys |
| Office name on the clock screen | `GET /attendance/my-field-assignments` | ✅ |
| Break list with durations | `today.breaks[]` + `daily-log.breaks[]` | ✅ |
| **Break names** ("Lunch Break", "Short Break") | — | ❌ **no such field** |
| **"Total break time allowed 1h 00m"** | — | ❌ **not exposed on any read** |
| Overtime tile | `GET /attendance/overtime/mine` | ⚠️ shape undocumented (audit C14) |

Two things in the mock have nothing behind them. Both are handled in §5.

---

## 1 · Screen A — Attendance (the `TimeTab` root)

This is the existing planned **My Time** screen
(`NativeRef/40-screens/03-time.md`) with the reference's visual language
applied. The five-tab `TabStrip` (Attendance · Corrections · Overtime · Flags ·
Earned Leave) stays — it is how five web pages become one screen — and the
reference's **Today / This Week / This Month** segment becomes the period
control *inside* the Attendance tab, not a replacement for the strip.

```
My Time                                       ← native header
┌ TabStrip ───────────────────────────────┐
│ Attendance · Corrections · Overtime · …  │
└──────────────────────────────────────────┘
[ Today | This Week | This Month ]            ← FilterTabs, Attendance tab only
┌ the purple hero card ────────────────────┐  ← the same PunchCard as Home
│ ◷ 09:00 am   Checked in   WORK HOURS 6h24│
│              Shift 9:00 am – 6:00 pm     │
│ [ Check out ]  [ Start break ]           │
└──────────────────────────────────────────┘
┌ quick actions (4 across) ────────────────┐
│  Break    Correction   Overtime   Logs   │
└──────────────────────────────────────────┘
This Week      ● ● ● ● ● ○ ○                  ← day chips, dots from dayChipKey()
Attendance summary   Present 20 · Absent 1 · Late 2
```

### Data

| Segment | Call | Notes |
|---|---|---|
| Today | `useTodayAttendance()` | already built — owns midnight re-arm, foreground refresh, event bus |
| This Week | `attendanceAPI.getWeeklyCalendar(date)` | **shape unknown — see §5.3** |
| This Month | `attendanceAPI.getSummary(month, year)` + `getHistory({ from, to, page, limit: 20 })` | `monthRange()` builds from/to; history does **not** accept `month`/`year` |

### Notes that change the build

- **The hero card is `PunchCard`, unchanged.** It is already the brand
  gradient with the ring, the live clock and the punch buttons, and it is
  already what Home renders. Building a second punch surface here is how the
  web app ended up with eight status badges.
- **The week dots come from `dayChipKey()`** (`src/lib/dayStatus.js`), not from
  a new colour map. Present is violet, late is fuchsia, absent is rose — the
  same tones the day list and the calendar use, so a dot and a badge can never
  disagree.
- **`late_days` is not a bucket.** It counts records with `late_minutes > 0`
  and therefore overlaps `present_days`. It can sit in the summary row; it must
  never go into a total-days donut.
- **Infinite scroll, not numbered pages** (T-T1), and the footer noun is
  **days**, not records (T-T2) — these endpoints paginate over calendar days,
  so a month is 28–31 rows whatever happened in it.

---

## 2 · Screen B — Clock In / Clock Out

The reference's middle screen is **today in full**: the date, the office, the
ring, the two figures, and the punch timeline.

We already have a component for "one day in full" — `DayLogSheet`, opened from
a row or a bar. **The recommendation is that this screen is that sheet, for
today, opened from the hero card's chevron**, rather than a new route:

- The sheet already reads `getDailyLog(date)` and already handles the four
  states (loading · loaded · nothing recorded · couldn't load).
- Routing it would unmount the list behind it, which is the whole reason
  record inspectors are sheets in this app.
- The one thing the sheet does not do today is **punch**, and that is the
  reference screen's main button. So: add the punch buttons to the sheet's
  footer **when the date is today**, and nothing else changes.

### Mapping the timeline

`GET /attendance/daily-log` returns an object:

```jsonc
{
  "record":   { /* the day's attendance record */ },
  "logs":     [ { "type": "clock_in", "timestamp": "…", "work_mode": "office", "notes": null } ],
  "sessions": [ { "start": "…", "end": "…", "minutes": 240 } ],
  "breaks":   [ { "start_time": "…", "end_time": "…", "minutes": 30 } ],
  "anomalies":[ { "type": "late_arrival", "severity": "low", "is_resolved": false, "description": "…" } ]
}
```

`logs[].type` is one of `clock_in` · `clock_out` · `break_start` · `break_end`,
which is **exactly** the reference's four-row timeline. Render it straight
from `logs[]` in order; do not reconstruct it from `clock_in_time` and
`breaks[]`, or a day with two sessions comes out wrong.

**Older payloads return the punch list directly as an array.** Handle both:

```js
const logs = Array.isArray(payload) ? payload
  : payload?.logs || payload?.punches || payload?.attendance_logs || [];
```

### "On Time"

The green "On Time" pill under the check-in time is `late_minutes === 0`.
`late_minutes > 0` becomes a fuchsia "14m late" — our `amber` tone, which is
fuchsia in this palette. It is **not** rose: being late is not an error state,
and rose is reserved for errors, deductions and destructive actions.

### The office name

"Bengaluru Office" comes from `getMyFieldAssignments()` →
`assigned_office` / `records[]`, resolved by id. **Never render
`geofence.matched_location_id`** — it is a UUID (T-H8). If the id does not
resolve to a name, the line is dropped entirely rather than showing the id.

---

## 3 · Screen C — Break Management

The live break timer, today's breaks, and the policy line.

### What works today

- **The live timer** — `useLiveWorked(today)` already returns `breakMinutes`
  and `onBreak`, ticking once a second and only while the app is foregrounded
  (T-H5). The reference shows `00:24:15`; `fmtDuration(ms)` already prints
  exactly that format.
- **"Started at 12:30 PM"** — `today.active_break.start_time`.
- **End Break** — `attendanceAPI.breakEnd({ source: 'mobile' })`, through the
  same `run()` wrapper the punch buttons use, so state reconciliation stays
  silent and the event bus fires.
- **Today's breaks** — `today.breaks[]`, each `{ id, start_time, end_time }`,
  with `daily-log.breaks[]` carrying `minutes` as well.
- **`break_duration_minutes` is authoritative for CLOSED breaks.** Live
  elapsed time is added from `active_break.start_time` only while one is open.
  `lib/liveHours.js` already does this — do not re-derive it.

### What does not exist

- **Break names.** The reference labels them "Lunch Break" and "Short Break".
  The API carries no `name`, `type` or `category` on a break. Proposal: label
  each row by its clock window (`12:30 pm – 1:00 pm`) with the duration as the
  row's value, which is the fact we actually have. Inventing "Lunch Break" from
  the time of day would be a guess rendered as a label.
- **The break allowance** ("Total break time allowed 1h 00m"). No read exposes
  it. We know a limit exists server-side because `break/start` can fail with
  `MAX_BREAKS_EXCEEDED` — but a limit we only learn about by hitting it cannot
  be displayed before it is hit. Options in §5.1.

---

## 4 · What to build, in order

1. **`TimeScreen`** — the `TabStrip` shell, the shared `MonthStepper`, and the
   Attendance tab (tiles + paginated day list). Registers `Time` in
   `navigation/screens.js`. This is the biggest single piece and everything
   else hangs off it.
2. **`DayLogSheet` + punch footer** — makes the reference's Clock In/Out screen
   real without a new route. Small, and it finishes Home too (Home already
   opens this sheet from the recent rows and the chart bars).
3. **Break management** — as a section of the day sheet when the date is today,
   or as its own modal if it grows past three rows. Decide once the sheet is
   built; do not build both.
4. **Corrections tab** + `CorrectionForm` — the only route from "this day is
   wrong" to a form, which is what makes the day sheet's footer note true.
5. **Overtime · Flags · Earned Leave tabs** — each hidden entirely when its
   endpoint 404s or returns no capability. A capability the org lacks is
   absent, not a tab explaining it is unavailable.

---

## 5 · Open questions

### 5.1 The break allowance

Three options, in order of preference:

1. **Ask for it on `/attendance/shift`.** The wrapper already returns
   `shift.policy` (with `full_day_threshold_minutes`), which is exactly where a
   `max_break_minutes` belongs. One field, no new endpoint. *This is the ask.*
2. Return it on `/attendance/today` beside `break_duration_minutes`.
3. Ship without it. The row is dropped; the breaks list still shows what was
   taken. This is the fallback, and it is honest — better than a hardcoded
   "1h 00m" that is wrong for half the shifts in the org.

### 5.2 Break names

Does the backend intend to categorise breaks (lunch / short / tea)? If yes,
the field belongs on the break row and the UI is ready for it. If no, the
clock-window label in §3 is the permanent answer and the mock's labels are
decoration.

### 5.3 `GET /attendance/weekly-calendar` shape

**Undocumented.** It is in the endpoint registry and in
`api/attendance.api.js`, with no payload shape recorded anywhere in
`NativeRef/10-api/`. Needed before the "This Week" strip can be built. If it
returns dense rows in the same shape as `/attendance/history`, the strip is
about twenty lines because `dayChipKey()` already handles that shape — so the
first question is simply whether it does.

Until it is pinned, **This Week can be derived from
`getHistory({ from, to })` over the current week** at the cost of one extra
call. That is the cheap unblock if the shape takes a while to confirm.

### 5.4 Overtime response shape

Marked undocumented in the API notes (audit C14). Two things matter before the
tab is built: **minutes are canonical** (a response handing back `1.5` as hours
must not be printed as `1.5`), and the same entity is read with different field
spellings by the employee, manager and HR views — so one accessor per field,
used everywhere.

---

## 6 · What the reference gets wrong for this product

- **The yellow.** Every accent in the reference is amber. This app is purple
  only, and the tone names in `theme/tokens.js` are already mapped so that
  `amber` renders fuchsia and `emerald` renders violet. Nothing in the
  reference needs a new colour; it needs the existing tone keys.
- **"20 Dep" / "1 Day" / "2 Days"** in the summary row — the mock's units are
  inconsistent. Use `formatDayCount()`, which carries its own unit, and do not
  add a "days" caption beside it or it reads "2 Days days".
- **The floating action arrow** on the attendance card is a chevron into the
  day detail, not a punch shortcut. Two punch affordances on one screen is one
  too many.
