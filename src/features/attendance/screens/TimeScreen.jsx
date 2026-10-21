// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/screens/TimeScreen.jsx — "My Time". The TimeTab root.
//
// Spec: NativeRef/40-screens/03-time.md. THE WHOLE MY TIME MENU, ONE SCREEN.
//
// ── THE EIGHT ENTRIES, AND WHERE EACH ONE WENT (2026-10-18) ──────────────────
//
// The web sidebar's MY TIME menu has seven entries. All seven are in the
// strip, in the web's order, so the menu a person learned on the web is the
// menu they get here — plus Holidays, which the web tucks at the bottom of
// the leave page:
//
//   My Attendance       → section 'attendance'  (EmployeeAttendancePage)
//   My Work Locations   → section 'locations'   (field assignments)
//   My Leaves           → section 'leave'       (LeaveDashboard)
//   My Corrections      → section 'corrections' (AttendanceRegularizationsPage)
//   My Overtime         → section 'overtime'    (EmployeeOvertimePage)
//   My Flags            → section 'flags'       (AttendanceAnomaliesPage)
//   My Earned Leave     → section 'earned'      (EmployeeCompOffsPage)
//   Holidays            → section 'holidays'    (the leave page's widget)
//
// ALL EIGHT ARE SECTIONS OF THIS SCREEN, because they are eight views of the
// same months of the same person's time, which people compare against each
// other ("I was marked absent on the 3rd — did my correction go through, or
// was that a holiday?"). Eight stack screens would be eight native headers
// and eight back presses for that one question; a section switch costs a tap
// and keeps the scroll.
//
// Leave was the last exception and stopped being one on 2026-10-18. It is a
// bigger module than the rest — balances, requests, an apply flow — and that
// was the argument for a pushed screen. It was the wrong argument: the size
// of a section is a reason to give it room in the body, not a reason to make
// it the one tile that behaves differently from the seven beside it.
// Applying for leave IS still a page (`ApplyLeave`), because a record being
// written is a page; a record being read is a sheet (§3).
//
// ── THE SELECTOR IS ONE SCROLLING ROW OF ICONS (user, 2026-10-21) ────────────
//
// It was a `ui/TabStrip` of text tabs, then three tiles and a `More`, then a
// two-row grid of boxed tiles. The user asked for one horizontal row that
// scrolls, with no box around each item — `CategoryStrip`'s header says how
// the row still shows that there is more past the edge. Each item has room
// for a COUNT, and an open flag is exactly the thing somebody should see
// without opening the section.
//
// The first entry says "Attendance", not "Days" (same day): it is the web's
// "My Attendance", and one thing has one name (CLAUDE.md §10).
//
// ── WHY THE MONTH MOVED INTO THE ATTENDANCE SECTION ──────────────────────────
//
// The spec puts a stepper above everything, shared by all five, so somebody
// looking at September's attendance who taps Corrections sees September's
// corrections. THAT IS NOT BUILDABLE AGAINST THIS API and the spec was written
// before the endpoints were pinned:
//
//   • /attendance/history + /attendance/summary  → take the month. ✅
//   • /attendance/regularizations                → `page`/`limit` only
//   • /attendance/overtime/mine                  → `page`/`limit` only
//   • /attendance/anomalies/mine                 → `status`/`page`/`limit`
//   • /attendance/comp-offs/mine                 → `status`/`page`/`limit`
//
// A stepper over a list it does not filter is a control that silently does
// nothing, which is worse than no control — and narrowing those lists to a
// month CLIENT-SIDE would show an empty September for a request that is
// simply on page three (the stale-page bug T-T1 exists to avoid). So the
// stepper lives INSIDE the Attendance section's hero, where it belongs to the
// only data it moves, and the other four are "everything, newest first".
//
// The month state still lives here, so stepping it in Attendance and then
// opening Overtime still scopes Overtime's "approved this month" figure to
// the month you were looking at.
//
// Move it back up the moment those endpoints take a date range.
//
// ── A SECTION AN ORG DOESN'T HAVE IS ABSENT, NOT BROKEN (§2) ─────────────────
//
// `useTimeSections` probes overtime and earned leave once. A 404 or a disabled
// feature DROPS THE SECTION FROM THE STRIP — never a section that opens onto a
// page explaining it isn't available. A network failure is not a 404 and keeps
// it: a flaky minute must not make features disappear.
//
// ── WHAT ISN'T HERE, AND WHY ─────────────────────────────────────────────────
//
// `OvertimeForm` and `EarnedLeaveForm` are in the spec and in
// tabs.employee.js, and NEITHER IS BUILT. There is no claim endpoint and no
// redeem endpoint — not in api/attendance.api.js and not in the web app's own
// api module. Overtime is derived from punches; an earned day is applied for
// as leave. Each section says so in words. A button opening a form that cannot
// submit is the thing §2 forbids.
//
// ── EVERY SECTION IS A FlatList, SO THIS SCREEN IS NOT A ScrollView ──────────
//
// A FlatList inside a ScrollView renders every row at once and windowing dies
// (ui/Screen.jsx). The strip is the only pinned chrome; everything below it is
// the section's own list, and each section puts its hero, figures and filters
// in `ListHeaderComponent` so they scroll with the cards instead of eating
// 160pt of a phone permanently.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { isFeatureDisabled, isNotFound } from '../../../lib/errors/attendanceErrors';
import { normalizePaginated } from '../../../lib/normalize';
import { TERMS } from '../../../config/dictionary';
import { color, space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { AttendanceTab } from '../components/AttendanceTab';
import { CorrectionsTab } from '../components/CorrectionsTab';
import { OvertimeTab } from '../components/OvertimeTab';
import { FlagsTab } from '../components/FlagsTab';
import { EarnedLeaveTab } from '../components/EarnedLeaveTab';
import { LocationsTab } from '../components/LocationsTab';
import { LeaveTab } from '../components/LeaveTab';
import { HolidaysTab } from '../components/HolidaysTab';
import { CategoryStrip } from '../../../ui/ListCards';
import { AppTopBar } from '../../../navigation/AppTopBar';

/* ─── Which sections this organisation actually has ───────────────────────────
   Two cheap probes at mount, in parallel. `null` means "still asking", and
   while it is null the section IS shown — a strip that grows an item a second
   after you look at it is worse than one that loses an item nobody could use.

   Only a 404 or an explicitly disabled feature hides anything. A 500, a
   timeout or no signal leaves it alone; the section's own error state is where
   a failed read belongs. */
function useTimeSections() {
  const [available, setAvailable] = useState({ overtime: null, earnedLeave: null });

  useEffect(() => {
    let cancelled = false;
    const probe = (key, call) => call()
      .then(() => { if (!cancelled) setAvailable((a) => ({ ...a, [key]: true })); })
      .catch((err) => {
        const missing = isNotFound(err) || isFeatureDisabled(err);
        if (!cancelled) setAvailable((a) => ({ ...a, [key]: !missing }));
      });

    // limit: 1 — this asks "does this exist?", not "what is in it?". The
    // section fetches its own first page when it opens.
    probe('overtime', () => attendanceAPI.getMyOvertime({ page: 1, limit: 1 }));
    probe('earnedLeave', () => attendanceAPI.getMyCompOffSummary());

    return () => { cancelled = true; };
  }, []);

  return available;
}

/* ─── The one badge on the strip ──────────────────────────────────────────────
   How many flags are still open. A `limit: 1` read, for the `total` only.

   Only flags gets one, and that is a deliberate limit rather than a half-done
   job: /attendance/anomalies/mine HONOURS `status`, so one tiny request gives
   a true count. /attendance/regularizations does NOT (T-T3) — it validates
   `status` and returns everything — so a "3 pending" badge there could only be
   counted from pages already loaded, and a badge that says 3 when the real
   answer is 11 is worse than no badge. Add it the day that filter works. */
function useOpenFlagCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    attendanceAPI.getMyAnomalies({ status: 'open', page: 1, limit: 1 })
      .then((res) => {
        const { total } = normalizePaginated(res, ['anomalies', 'records'], { page: 1, limit: 1 });
        if (!cancelled) setCount(Number(total) || 0);
      })
      .catch(() => { /* A badge is a nicety. A failed read just means none. */ });
    return () => { cancelled = true; };
  }, []);

  return count;
}

export default function TimeScreen({ navigation, route }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [section, setSection] = useState('attendance');
  // The day inspector is LOCAL STATE, never a route (§3) — this screen and its
  // list stay mounted behind it, which is the whole point of a sheet.

  const available = useTimeSections();
  const openFlags = useOpenFlagCount();

  // The web's MY TIME menu, entry for entry, in its order, plus Holidays —
  // which the web keeps at the bottom of the leave page and a phone deserves
  // as its own tile ("is Monday a holiday, or do I apply for leave?").
  //
  // Eight entries, every one of them a SECTION. Nothing here navigates. Two
  // of them used to: Leave and Holidays pushed a screen, the strip vanished,
  // and getting back to Corrections took a back press and a tap. A tile that
  // behaves differently from the seven beside it is a tile people stop
  // trusting, and comparing these lists against each other is the entire
  // reason the strip exists.
  const sections = useMemo(() => [
    { value: 'attendance', label: 'Attendance', icon: icons.calendar },
    { value: 'locations', label: 'Locations', icon: icons.location },
    { value: 'leave', label: 'Leave', icon: icons.leave },
    { value: 'corrections', label: 'Corrections', icon: icons.edit },
    available.overtime !== false && { value: 'overtime', label: 'Overtime', icon: icons.overtime },
    { value: 'flags', label: 'Flags', icon: icons.flag, badge: openFlags },
    available.earnedLeave !== false && { value: 'earned', label: TERMS.COMP_OFF, icon: icons.earnedLeave },
    { value: 'holidays', label: 'Holidays', icon: icons.holiday },
  ].filter(Boolean), [available.overtime, available.earnedLeave, openFlags]);

  // A section that disappears under somebody standing on it sends them back to
  // the default rather than leaving the strip pointing at nothing.
  useEffect(() => {
    if (!sections.some((s) => s.value === section)) setSection('attendance');
  }, [sections, section]);

  /* A drawer row names its section (navigation/routes.js: `workLocations` →
     `{ section: 'locations' }`). Without this every one of those seven rows
     landed on Attendance, which is how six of them became invisible.

     The param is CLEARED once applied. Otherwise it is sticky: tap "My
     Overtime" in the drawer, switch to Flags by hand, come back to the tab
     later and the screen snaps to Overtime again, because the param is still
     sitting on the route saying so. */
  const requestedSection = route?.params?.section;
  useEffect(() => {
    if (!requestedSection) return;
    setSection(requestedSection);
    navigation.setParams({ section: undefined });
  }, [requestedSection, navigation]);

  /* Picking from the strip. EVERY tile swaps the body — there is no longer a
     tile that navigates away (Leave and Holidays used to, and were the two
     people trusted least, because the strip vanished under them). */
  const chooseSection = useCallback((value) => setSection(value), []);

  // A page, not a sheet (2026-10-21) — see features/attendance/screens/DayLogScreen.jsx.
  const openDay = useCallback((ymd) => navigation.navigate('DayLog', { date: ymd }), [navigation]);

  /* The two forms are ROUTES, not sheets: each is a modal page with a pinned
     footer and five fields, which is what `presentation: 'modal'` is for in
     tabs.employee.js. A record being READ is a sheet; a record being WRITTEN
     is a page. Both lists refresh from the event the form emits, not from a
     callback threaded back through navigation. */
  const newCorrection = useCallback(
    (date) => navigation.navigate('CorrectionForm', typeof date === 'string' ? { date } : undefined),
    [navigation],
  );
  const applyForLeave = useCallback(() => navigation.navigate('ApplyLeave'), [navigation]);

  return (
    // Slate-50, not white: this screen is nothing but lists of cards, and a
    // white card on a white screen has to draw a heavier edge to exist.
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AppTopBar />
      {/* On the canvas, not a white band with a hairline (2026-10-20). */}
      <View style={{ paddingTop: space[1] }}>
        <CategoryStrip items={sections} value={section} onChange={chooseSection} />
      </View>

      {/* Mounted one at a time on purpose: eight lists kept alive would be
          eight sets of requests on the first open and eight FlatLists in
          memory, for seven views nobody is looking at. The month and the
          strip survive the switch because they live HERE. */}
      <View style={{ flex: 1 }}>
        {section === 'attendance' ? (
          <AttendanceTab period={period} onChangePeriod={setPeriod} onDayPress={openDay} onCorrectDay={newCorrection} />
        ) : section === 'locations' ? (
          <LocationsTab />
        ) : section === 'leave' ? (
          <LeaveTab onApply={applyForLeave} />
        ) : section === 'corrections' ? (
          <CorrectionsTab onNewRequest={newCorrection} />
        ) : section === 'overtime' ? (
          <OvertimeTab period={period} />
        ) : section === 'flags' ? (
          <FlagsTab />
        ) : section === 'holidays' ? (
          <HolidaysTab />
        ) : (
          <EarnedLeaveTab />
        )}
      </View>

    </View>
  );
}

export { TimeScreen };
