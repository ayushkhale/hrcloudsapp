// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/screens/SchedulesScreen.jsx — "My Schedules". The
// SchedulesTab root.
//
// The tab took Docs' slot on 2026-10-22 and was an empty state for a day. It
// is built now, on the backend's forward-view contract (web ref docs,
// md_updates/2026-10-22_frontend_my_schedule_forward_view_integration_guide.md,
// with the delivery note and the requirements beside it), BEFORE that API is
// deployed — the user's call. It answers what people actually bring to a
// schedule:
//
//   1. "What do my next weeks look like?"  → Agenda: one card per day
//   2. "What do I owe, and when?"           → Due: everything falling due
//   3. "What am I measured against?"        → My rules: shift, days off, policy
//
// ── ONE SCREEN, THREE SECTIONS — THE SAME SHAPE AS MY TIME AND MY PAY ───────
//
// A CategoryStrip, the body swapping underneath, each section its own list
// with the hero in its header (never a FlatList inside a ScrollView). The day
// cards and the due cards are RecordCards — the correction card's structure,
// the user's standing ask (2026-10-22).
//
// ── ONE REQUEST PER WINDOW, AND THE SERVER DECIDES EVERY DAY ────────────────
//
// `GET /attendance/schedule/agenda?from=&to=` returns a DENSE day per date with
// a resolved `day_kind`. This screen never re-derives precedence, rotation or
// holiday targeting — they affect pay, and a second copy would drift until
// this page contradicted the payslip. The rules for reading the payload are in
// ../scheduleMeta.js's header; read them before changing anything here.
//
// The window is 7 / 30 / 90 days from today (the server refuses more than 92,
// so the picker can't ask for it). Changing it keeps the old window on screen
// until the new one lands — only the very first load is a skeleton (§2).
//
// ── "COULDN'T LOAD" IS NEVER "NOTHING DUE" ──────────────────────────────────
//
// Item lanes can fail on their own (`lanes.tasks: "unavailable"`) while the
// calendar is fine. A failed lane says so above the list, with a retry; a
// capped one says it is capped. An empty Due section only claims "nothing due"
// when every item lane came back `ok`.
//
// ── ABSENT, NOT BROKEN, UNTIL THE API SHIPS (§6) ────────────────────────────
//
// Until the agenda is deployed it answers 404. A 404 — or attendance being
// switched off for the org — DROPS Agenda and Due; My rules still works off
// `/attendance/shift`, which is live today. A network failure is NOT a 404 and
// keeps the sections, showing their own error state with a retry.
//
// ── FRESH, NEVER CACHED (guide Pattern D) ───────────────────────────────────
//
// The agenda is re-read on pull, on returning to the tab, and when anything
// that can change a future day happens in this app: leave applied or
// cancelled, a task moved, a document uploaded, an earned day used, a
// correction, a punch, a shift or policy change (the event bus).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { isFeatureDisabled, isNotFound } from '../../../lib/errors/attendanceErrors';
import { clockMinutes, fmtClockMinutes, fmtDate, fmtMinutes, todayYMD } from '../../../lib/dates';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, FilterTabs, Pill, StatusBadge } from '../../../ui';
import { CardsSkeleton, CategoryStrip, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { AppTopBar } from '../../../navigation/AppTopBar';
import { ROUTES, useGo } from '../../../navigation/routes';
import { useAuth } from '../../../state/AuthContext';
import { AgendaDayCard, LaneNotice, ScheduleHero } from '../components/ScheduleCards';
import {
  AGENDA_WINDOWS, ITEM_LANES, dayTitle, presentItem, shiftWindow, weeklyOffLabel, weeksOf, windowRange,
} from '../scheduleMeta';

/* The events after which a future day may read differently. */
const AGENDA_EVENTS = [
  ATTENDANCE_EVENTS.LEAVE,
  ATTENDANCE_EVENTS.TASK,
  ATTENDANCE_EVENTS.DOCUMENT,
  ATTENDANCE_EVENTS.DOCUMENT_REQUEST,
  ATTENDANCE_EVENTS.COMPOFF,
  ATTENDANCE_EVENTS.REGULARIZATION,
  ATTENDANCE_EVENTS.PUNCH,
  ATTENDANCE_EVENTS.CONFIG,
];

const ALL_SECTIONS = [
  { value: 'agenda', label: 'Agenda', icon: icons.schedule || icons.calendar },
  { value: 'due', label: 'Due', icon: icons.clipboardCheck },
  { value: 'rules', label: 'My rules', icon: icons.info },
];

/* ─── My rules, from /attendance/shift ────────────────────────────────────────
   The wrapper is { assignment, shift, rotation, weekly_offs, policy? } — not a
   bare shift (attendance.api.js). `policy` is the enrichment in md_updates/
   2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md; until
   the server sends it, the rules card is simply absent. */
function readShift(data) {
  const wrapped = !!data && typeof data === 'object' && 'shift' in data;
  return {
    assignment: wrapped ? data.assignment : null,
    shift: wrapped ? data.shift : data,
    rotation: wrapped ? data.rotation : null,
    weeklyOffs: wrapped ? data.weekly_offs : null,
    policy: wrapped ? data.policy : null,
  };
}

const hours = (h) => (h != null && Number.isFinite(Number(h)) ? fmtMinutes(Number(h) * 60, '0m') : null);

/** The policy, as the label/value pairs a RecordCard strip wraps. */
function policyMeta(p) {
  if (!p) return [];
  const out = [];
  if (p.grace_minutes != null) out.push({ label: 'Grace', value: fmtMinutes(p.grace_minutes, '0m') });
  if (p.half_day_min_hours != null) out.push({ label: 'Half day', value: hours(p.half_day_min_hours) });
  if (p.full_day_min_hours != null) out.push({ label: 'Full day', value: hours(p.full_day_min_hours) });
  if (p.max_breaks_per_day != null || p.max_break_duration_minutes != null) {
    const n = p.max_breaks_per_day != null ? `${p.max_breaks_per_day} breaks` : null;
    const m = p.max_break_duration_minutes != null ? fmtMinutes(p.max_break_duration_minutes, '0m') : null;
    out.push({ label: 'Breaks', value: [n, m].filter(Boolean).join(' · ') });
  }
  if (p.regularization_allowed === false) out.push({ label: 'Corrections', value: 'Not allowed' });
  else if (p.regularization_window_days != null) out.push({ label: 'Corrections', value: `Within ${p.regularization_window_days} days` });
  if (p.overtime_enabled === false) out.push({ label: 'Overtime', value: 'Off' });
  else if (p.overtime_min_minutes != null) out.push({ label: 'Overtime', value: `After ${fmtMinutes(p.overtime_min_minutes, '0m')}` });
  if (p.auto_clock_out_enabled && p.auto_clock_out_after_hours != null) {
    out.push({ label: 'Auto clock-out', value: `After ${hours(p.auto_clock_out_after_hours)}` });
  }
  return out;
}

function RulesSection({ resource, refreshControl }) {
  const { data, loading, error, reload } = resource;
  const { assignment, shift, rotation, weeklyOffs, policy } = readShift(data);

  if (loading && !data) return <CardsSkeleton rows={3} height={110} />;
  // No assignment answers 404 — a normal state for a new joiner, not an error.
  if (error && !data && !isNotFound(error)) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState error={error} domain="attendance" onRetry={reload} fallback="We couldn’t load your shift." />
      </View>
    );
  }

  const offs = weeklyOffLabel(weeklyOffs);
  const window = shiftWindow(shift);
  // "Clock in by 9:45 am" — the grace period as the one fact it decides.
  const start = clockMinutes(shift?.start_time);
  const onTimeBy = start != null && policy?.grace_minutes != null
    ? fmtClockMinutes(start + Number(policy.grace_minutes))
    : null;
  const rules = policyMeta(policy);

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <RecordCard
        icon={icons.clock}
        tone="purple"
        title={shift?.name || 'No shift assigned'}
        subtitle={window || 'Your HR team assigns your shift.'}
        badge={shift ? <Pill>{rotation ? 'Rotating' : 'Fixed'}</Pill> : null}
        meta={[
          assignment?.effective_from ? { label: 'Since', value: fmtDate(assignment.effective_from, '') } : null,
          assignment?.effective_to ? { label: 'Until', value: fmtDate(assignment.effective_to, '') } : null,
          rotation ? { label: 'Pattern', value: rotation.name || rotation.pattern_name || 'Rotating' } : null,
        ].filter(Boolean)}
      />

      <RecordCard
        icon={icons.calendar}
        tone="slate"
        title={offs || 'No weekly offs set'}
        subtitle={offs ? 'Your weekly days off' : 'Ask your HR team if this looks wrong.'}
      />

      {rules.length ? (
        <RecordCard
          icon={icons.info}
          tone="indigo"
          title={policy?.name || 'How your day is counted'}
          subtitle={onTimeBy ? `Clock in by ${onTimeBy} to be on time.` : 'The rules your attendance is measured against.'}
          meta={rules}
        />
      ) : null}
    </ScrollView>
  );
}

/* ─── The screen ──────────────────────────────────────────────────────────── */

export default function SchedulesScreen({ navigation, route }) {
  const today = todayYMD();
  const go = useGo();
  const { workspace } = useAuth();
  const [windowDays, setWindowDays] = useState(30);
  const [section, setSection] = useState('agenda');

  const range = useMemo(() => windowRange(today, windowDays), [today, windowDays]);

  const agenda = useResource(
    () => attendanceAPI.getScheduleAgenda({ from: range.from, to: range.to }),
    { deps: [range.from, range.to] },
  );
  const shift = useResource(() => attendanceAPI.getMyShift());

  const { reload: reloadAgenda } = agenda;
  const { reload: reloadShift } = shift;
  useAttendanceChanged(AGENDA_EVENTS, reloadAgenda);
  useAttendanceChanged([ATTENDANCE_EVENTS.CONFIG], reloadShift);
  const { refreshControl } = useListRefresh(
    useCallback(() => { reloadAgenda(); reloadShift(); }, [reloadAgenda, reloadShift]),
    agenda.loading || shift.loading,
  );

  // Not deployed yet (404) or attendance off → no Agenda, no Due (see header).
  const agendaAbsent = !!agenda.error && !agenda.data
    && (isNotFound(agenda.error) || isFeatureDisabled(agenda.error));
  const sections = useMemo(
    () => (agendaAbsent ? ALL_SECTIONS.filter((s) => s.value === 'rules') : ALL_SECTIONS),
    [agendaAbsent],
  );
  useEffect(() => {
    if (!sections.some((s) => s.value === section)) setSection(sections[0].value);
  }, [sections, section]);

  // A drawer row or quick action may name a section; applied once, then cleared.
  const requested = route?.params?.section;
  useEffect(() => {
    if (!requested) return;
    setSection(requested);
    navigation.setParams({ section: undefined });
  }, [requested, navigation]);

  const data = agenda.data;
  const days = useMemo(() => (Array.isArray(data?.days) ? data.days : []), [data]);
  const weeks = useMemo(() => weeksOf(days, today), [days, today]);
  const dueGroups = useMemo(() => days
    .filter((d) => Array.isArray(d.items) && d.items.length)
    .map((d) => ({ key: d.date, title: dayTitle(d.date, today), data: d.items })), [days, today]);
  const laneStates = ITEM_LANES.map((l) => ({ ...l, state: data?.lanes?.[l.key] }));
  const allItemLanesOk = laneStates.every((l) => !l.state || l.state === 'ok' || l.state === 'excluded');

  /* Opening a due item. A task opens itself; the rest open the section that
     owns them. Destinations come from routes.js, never hardcoded (§6). */
  const openItem = useCallback((routeKey, item) => {
    if (item?.kind === 'task_due' && item.id) {
      go(['HomeTab', 'TaskDetail'], { task: { id: item.id, title: item.title } });
      return;
    }
    const target = ROUTES[workspace]?.[routeKey];
    if (target) go(target);
  }, [go, workspace]);

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[1] }}>
      <ScheduleHero summary={data?.summary} loading={agenda.loading && !data} />
      <FilterTabs options={AGENDA_WINDOWS} value={windowDays} onChange={setWindowDays} />
      <LaneNotice lanes={laneStates} onRetry={reloadAgenda} />
    </View>
  );

  const sectionHeader = ({ section: s }) => (
    <Text style={[text.label, { color: color.textMuted, paddingTop: space[2] }]}>{s.title}</Text>
  );

  let body;
  if (section === 'rules') {
    body = <RulesSection resource={shift} refreshControl={refreshControl} />;
  } else if (agenda.error && !data) {
    body = (
      <View style={{ padding: space[4] }}>
        <ErrorState error={agenda.error} domain="attendance" onRetry={reloadAgenda} fallback="We couldn’t load your schedule." />
      </View>
    );
  } else if (section === 'due') {
    body = (
      <SectionList
        sections={dueGroups}
        keyExtractor={(item, i) => `${item.kind}:${item.id || i}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        renderSectionHeader={sectionHeader}
        renderItem={({ item }) => {
          const p = presentItem(item);
          return (
            <RecordCard
              icon={p.icon}
              tone={p.tone}
              title={p.title}
              subtitle={p.when}
              badge={item.kind === 'task_due' && item.status
                ? <StatusBadge kind="task" status={item.status} dense />
                : null}
              highlight={p.overdue}
              onPress={p.route ? () => openItem(p.route, item) : undefined}
              accessibilityLabel={`${p.title}. ${p.when}`}
            />
          );
        }}
        ListEmptyComponent={
          agenda.loading && !data ? (
            <CardsSkeleton rows={4} height={84} />
          ) : allItemLanesOk ? (
            <EmptyState
              icon={icons.ok}
              title="Nothing due"
              message={`Nothing falls due in the next ${windowDays} days.`}
            />
          ) : null
        }
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />
    );
  } else {
    body = (
      <SectionList
        sections={weeks}
        keyExtractor={(day) => day.date}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        renderSectionHeader={sectionHeader}
        renderItem={({ item }) => <AgendaDayCard day={item} today={today} onOpenItem={openItem} />}
        ListEmptyComponent={agenda.loading && !data ? <CardsSkeleton rows={6} height={96} /> : null}
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AppTopBar />
      {sections.length > 1 ? (
        <View style={{ paddingTop: space[1] }}>
          <CategoryStrip items={sections} value={section} onChange={setSection} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

export { SchedulesScreen };
