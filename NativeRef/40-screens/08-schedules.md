# 08 · My Schedules

**Tab:** SchedulesTab (took Docs' slot, 2026-10-22) · **Screen:** `Schedules` · **Built:** `src/features/schedules/`

**Contract:** web `public/ref docs/md_updates/`:
- `2026-10-21_my_schedule_forward_view_data_requirements.md`: what was asked for
- `2026-10-22_my_schedule_forward_view_api_delivery.md`: what the backend built
- `2026-10-22_frontend_my_schedule_forward_view_integration_guide.md`: **the contract**
- `2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md`: the proposed `policy` on `/attendance/shift`

## What it answers

| Section | Question | Data |
|---|---|---|
| Agenda | What do my next weeks look like? | `GET /attendance/schedule/agenda`, one card per day, grouped by week |
| Due | What do I owe, and when? | The same response's `days[].items`, one card per item, grouped by date |
| My rules | What am I measured against? | `GET /attendance/shift`: shift, days off, policy rules when `policy` is sent |

The hero (Agenda and Due) shows the next day off and the next holiday, then working days · days off · holidays · leave for the window. The window is 7 / 30 / 90 days from today. The server caps at 92, so the picker can't reach the refusal.

## States

- **First load:** a hero skeleton and card skeletons. Changing the window keeps the old one on screen.
- **Agenda answers 404, or attendance is off:** Agenda and Due are absent and My rules stands alone. This is the state until the API is deployed.
- **Network or 500:** `ErrorState` with a retry, in place of the section.
- **An item lane is `unavailable`:** a rose notice with "Try again" above the list. Due shows "Nothing due" only when every item lane is `ok`.
- **A lane is `truncated`:** "Showing the first 500 …".
- **No shift (404 on `/attendance/shift`):** "No shift assigned", a normal state.

## Actions

Tapping a due item opens it: a task opens TaskDetail, a document request opens My Documents › Requests, a document expiry opens Personal, and an Earned Leave expiry opens My Time › Earned Leave. A shift change has nowhere to go.

## Refresh

Pull, return to the tab, and the event bus: leave, task, document, document request, Earned Leave, correction, punch and config changes.

## Not here

The team coverage view (`team-agenda`) belongs to the manager app; its API wrapper exists. `probation_end` doesn't exist on the backend.
