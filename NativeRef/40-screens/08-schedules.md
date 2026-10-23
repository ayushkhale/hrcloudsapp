# 08 · My Schedules

**Tab:** SchedulesTab (took Docs' slot, 2026-10-22) · **Screen:** `Schedules` · **Built:** `src/features/schedules/`

**This screen is the app's half of the web's `src/shared/screens/MySchedulePage.jsx`** ("My Schedule & Rules"). Four sections here, four tabs there, the same two reads behind both. A change to one is a change to both in the same sitting (CLAUDE.md §10) — the 2026-10-23 parity pass exists because that wasn't done the first time.

**Contract:** web `public/ref docs/md_updates/`:
- `2026-10-21_my_schedule_forward_view_data_requirements.md`: what was asked for
- `2026-10-22_my_schedule_forward_view_api_delivery.md`: what the backend built
- `2026-10-22_frontend_my_schedule_forward_view_integration_guide.md`: **v1 of the contract**
- `2026-10-22_my_schedule_enriched_agenda_and_policy_provenance_integration_guide.md`: **v2 — `employee`, `weekly_off_policy`, `attendance_policy`, rich tasks. What this screen reads.**
- `2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md`: the `policy` on `/attendance/shift`

## What it answers

| Section | Question | Data |
|---|---|---|
| Agenda | What do my next 7 days look like? | `GET /attendance/schedule/agenda`, one card per day, grouped by week |
| Due | What do I owe, and when? | The same response's `days[].items`, one card per item, grouped by date |
| My shift | What am I set up with? | `GET /attendance/shift`: hours, day length, the rotation, the days-off row — plus the agenda's `weekly_off_policy` for the rule's NAME and who else it covers |
| How days count | How is a day of mine counted? | `ruleLines()` over the resolved policy: the grading ladder, then one card per published rule |

The hero (Agenda and Due) shows the next day off and the next holiday, then four tiles: **Working · Off · On leave · Falling due** — the web's `summaryTiles()`, so weekly offs and holidays are ONE "off" figure and the count of things due is on screen. Day counts print through `formatDayCount` ("20d and 1/2 d"), never a local half-symbol.

**The window is the next 7 days, fixed** (user, 2026-10-23, matching the web's call of 2026-10-22). There is no picker: everything the screen is for is answered inside a week, and the 92-day server cap is now out of the UI's reach entirely.

## Where the policy comes from — two sources, deliberately

`policyOf(shiftData) || agenda.attendance_policy`. v2 sends the same resolved policy on **both** reads, so the rules survive either one failing; the shift read is preferred only because it is the older, more exercised path. Reading one place of three is what made this section vanish for a day — see `lib/policyRules.js`'s header.

The days-off row merges **both** sources too: `/attendance/shift`'s `weekly_offs` (every rule touching this person) with the agenda's `weekly_off_policy.days_of_week` (the one that matched). Either read being thin still draws the right week.

## States

- **First load:** a hero skeleton and card skeletons. A refresh keeps what is on screen.
- **Agenda answers 404, or attendance is off:** Agenda and Due are absent; My shift and How days count stand alone on `/attendance/shift`.
- **Network or 500:** `ErrorState` with a retry, in place of the section. A network failure is **not** a 404 and must not make sections vanish.
- **The tasks lane is `unavailable`:** the agenda's own tasks query failed, so `useAgenda.js` **re-reads `/tasks/me` for the same window** and merges the rows back by date. Nothing is said — the deadlines are on screen. Only when that retry fails too is a rose notice shown.
- **The tasks lane is `unavailable` because the tenant has no tasks** (403 `tasks.access`): silent. Absence is not an error, and "Nothing due" drops the task sentence rather than promising deadlines they can never be given.
- **Another lane is `unavailable`:** a rose notice naming it, with "Try again". Due never claims "Nothing due" while a reckoned lane is `unavailable`.
- **A lane is `truncated`:** "Showing the first 500 …".
- **No shift (404 on `/attendance/shift`):** "No shift assigned to you" — a normal state for a new joiner. The rules still apply and still show: a policy with no shift is the org default.
- **No policy on either read:** "No rules published for you yet", never a column of N/A.

## Actions

Read-only, on purpose — shift assignment and policy editing are HR-only, so there is no control here that would 403. Tapping a due item opens it: a task opens TaskDetail, a document request opens My Documents › Requests, a document expiry opens Personal, and an Earned Leave expiry opens My Time › Earned Leave. A shift change has nowhere to go.

## Refresh

Pull, return to the tab, and the event bus (`AGENDA_EVENT_KINDS` in `useAgenda.js`): leave, task, document, document request, Earned Leave, correction, punch and config changes. The recovery read listens to the same bus, or it becomes the one stale thing on a screen built to refresh itself.

## Not here

The team coverage view (`team-agenda`) belongs to the manager app; its API wrapper (`getTeamAgenda`) exists. The web's week TABLE (`AgendaWeek`) is a web shape — day cards replace it (§1). `probation_end` doesn't exist on the backend.
