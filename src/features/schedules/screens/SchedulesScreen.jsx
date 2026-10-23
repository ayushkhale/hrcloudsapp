// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/screens/SchedulesScreen.jsx — "My Schedules". The
// SchedulesTab root, and this app's half of the web's "My Schedule & Rules"
// (src/shared/screens/MySchedulePage.jsx). Read that page's header before
// changing anything here: the two answer the same four questions off the same
// two reads, and §10 means a change to one is a change to both.
//
// It answers what people actually bring to a schedule:
//
//   1. "What do my next 7 days look like?" → Agenda: one card per day
//   2. "What do I owe, and when?"           → Due: everything falling due
//   3. "What am I set up with?"             → My shift: hours, cycle, days off
//   4. "How is a day of mine counted?"      → How days count: the published rules
//
// The web has those as four tabs; here they are four chips on the section
// strip, which is the same layout decision at a quarter of the width.
//
// ── MATCHED BACK TO THE WEB, 2026-10-23 ─────────────────────────────────────
//
// This screen shipped on 2026-10-22 against v1 of the agenda contract and
// drifted from the web inside a day. What was wrong, so it isn't undone:
//
//  · THE POLICY WAS READ FROM ONE PLACE OF THREE. It took `data.policy` off
//    the shift wrapper alone, so the rules vanished whenever the server nested
//    it under `shift` — which is how NativeRef documents it. It now goes
//    through `policyOf()` (lib/policyRules.js, ported), and falls back to the
//    agenda's own `attendance_policy`. TWO SOURCES, DELIBERATELY: v2 sends the
//    resolved policy on both reads, so the rules survive either one failing.
//  · THE RULES HAD THEIR OWN VOCABULARY. A hand-rolled `policyMeta()` said
//    "Grace" and "Auto clock-out" where the web says "Arriving late" and
//    "Forgotten clock-out", and printed figures with no consequence beside
//    them. `ruleLines()` is the one wording now (§5, §10).
//  · THE DAYS OFF HAD ONE SOURCE. The web merges `/attendance/shift`'s
//    `weekly_offs` (every rule touching this person) with the agenda's
//    `weekly_off_policy` (the one that MATCHED, with its name and audience),
//    so the row stays right when either read is thin. This took only the
//    first, and said "No weekly offs set" whenever it was empty.
//  · THE FIGURES DISAGREED WITH THE WEB'S. A local `dayFigure()` printed
//    "20½" where the web prints "20d" — `formatDayCount`, the helper §10
//    names as its worked example, on a screen built after that lesson. The
//    hero also split weekly offs and holidays into two tiles the web had
//    deliberately merged, and dropped the "Falling due" count entirely.
//  · EVERY DAY WORE A BADGE. Badging all five working days "Working" is what
//    makes the two exceptions in a week invisible; the web gives `working` no
//    tone at all (scheduleMeta DAY_KINDS).
//  · A FAILED TASKS LANE WAS AN APOLOGY, NEVER A RETRY. See useAgenda.js.
//
// ── ONE REQUEST PER WINDOW, AND THE SERVER DECIDES EVERY DAY ────────────────
//
// `GET /attendance/schedule/agenda?from=&to=` returns a DENSE day per date
// with a resolved `day_kind`. This screen never re-derives precedence,
// rotation or holiday targeting — they affect pay, and a second copy would
// drift until this screen contradicted the payslip. The rules for reading the
// payload are in ../scheduleMeta.js's header; read them before changing
// anything here.
//
// THE WINDOW IS THE NEXT 7 DAYS, FIXED. The 7/30/90 picker is gone (user,
// 2026-10-23, matching the web's own call of 2026-10-22): everything this
// screen is for is answered inside a week, and a 90-day agenda was a scroll
// nobody finished. It also puts the 92-day server cap out of the UI's reach.
//
// ── "COULDN'T LOAD" IS NEVER "NOTHING DUE" ──────────────────────────────────
//
// Item lanes can fail on their own (`lanes.tasks: "unavailable"`) while the
// calendar is fine. A failed lane says so above the list, with a retry; a
// capped one says it is capped. An empty Due section only claims "nothing due"
// when no lane is `unavailable` — and a lane the hook recovered is no longer
// missing, so it is not reckoned at all (useAgenda.js).
//
// ── ABSENT, NOT BROKEN, IF THE API ISN'T THERE (§6) ─────────────────────────
//
// A 404 — or attendance being switched off for the org — DROPS Agenda and Due;
// My shift and How days count still work off `/attendance/shift`. A network
// failure is NOT a 404 and keeps the sections, showing their own error state
// with a retry.
//
// ── FRESH, NEVER CACHED (guide Pattern D) ───────────────────────────────────
//
// The agenda is re-read on pull, on returning to the tab, and when anything
// that can change a future day happens in this app — the event bus, in
// useAgenda.js's AGENDA_EVENT_KINDS.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { isFeatureDisabled, isNotFound } from '../../../lib/errors/attendanceErrors';
import { fmtDate, fmtMinutes, clockMinutes, todayYMD } from '../../../lib/dates';
import {
  fullDayMinutes, halfDayMinutes, policyOf, ruleLines, shiftOf, weeklyOffNames,
} from '../../../lib/policyRules';
import { TERMS } from '../../../config/dictionary';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, InlineAlert, Pill, StatusBadge } from '../../../ui';
import { CardsSkeleton, CategoryStrip, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { AppTopBar } from '../../../navigation/AppTopBar';
import { ROUTES, useGo } from '../../../navigation/routes';
import { useAuth } from '../../../state/AuthContext';
import {
  AgendaDayCard, LaneNotice, PolicyHeroCard, RuleCard, ScheduleHero, WeekdayOffRow,
} from '../components/ScheduleCards';
import { useMyAgenda } from '../useAgenda';
import {
  AGENDA_WINDOW_DAYS, ITEM_LANES, LANE_TRUNCATED_NOTE, cappedLaneNames,
  dayTitle, employeeTargeting, failedLaneNames, flattenAgendaItems, itemTone,
  mergeAgendaItems, presentItem, shiftWindowLabel, weekdayOffRow, weeklyOffPhrase,
  weeklyOffRule, weeklyOffRules, weeksOf, worstLaneState,
} from '../scheduleMeta';

const ALL_SECTIONS = [
  { value: 'agenda', label: 'Agenda', icon: icons.schedule },
  { value: 'due', label: 'Due', icon: icons.clipboardCheck },
  { value: 'shift', label: 'My shift', icon: icons.clock },
  { value: 'rules', label: 'How days count', icon: icons.rules },
];

/* The two sections the agenda endpoint feeds. Everything else runs off
   `/attendance/shift`, which is live today. */
const AGENDA_SECTIONS = ['agenda', 'due'];

/* ─── My shift ────────────────────────────────────────────────────────────────
   The web's "Working week" tab: your hours, the cycle they run on, and the
   days you are not expected in — with the rule that gives them its name. */
function ShiftSection({ shiftRes, agenda, refreshControl }) {
  const { data, loading, error, reload } = shiftRes;
  const shift = shiftOf(data);
  const assignment = data?.assignment || null;
  const rotation = data?.rotation || null;

  // The matched rule's days and every rule's days, merged: the agenda knows
  // which rule won, the shift read knows about all of them, and a person can
  // be covered by two overlapping rules.
  const offRule = weeklyOffRule(agenda.weeklyOffPolicy);
  const offNames = weeklyOffNames([
    // `weekly_offs` arrives as rules OR as a flat [0, 6] — see weeklyOffRules().
    ...weeklyOffRules(data?.weekly_offs),
    ...(offRule?.days ? [{ days_of_week: offRule.days }] : []),
  ]);
  const joined = agenda.employee?.joining_date || '';

  if (loading && !data) return <CardsSkeleton rows={3} height={110} />;
  // No assignment answers 404 — a normal state for a new joiner, not an error.
  if (error && !data && !isNotFound(error)) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState error={error} domain="attendance" onRetry={reload} fallback="We couldn’t load your shift and days off." />
      </View>
    );
  }

  const hours = shiftWindowLabel(shift);
  const start = clockMinutes(shift?.start_time);
  let end = clockMinutes(shift?.end_time);
  if (start !== null && end !== null && (shift.is_overnight || end <= start)) end += 1440;
  const length = start !== null && end !== null ? end - start : null;

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <RecordCard
        icon={icons.clock}
        tone="purple"
        title={shift?.name || 'No shift assigned to you'}
        subtitle={hours || 'You don’t have set hours, so nothing is measured against a start or end time. Ask HR if you expected a shift.'}
        badge={shift ? <Pill>{rotation ? 'Rotating' : 'Fixed'}</Pill> : null}
        meta={shift ? [
          length !== null ? { label: 'Day length', value: fmtMinutes(length) } : null,
          assignment?.effective_from ? { label: 'Since', value: fmtDate(assignment.effective_from, '') } : null,
          assignment?.effective_to ? { label: 'Until', value: fmtDate(assignment.effective_to, '') } : null,
          // Only worth saying when the agenda knows it: it is what makes the
          // "Before you joined" days in the week make sense.
          joined ? { label: 'You joined', value: fmtDate(joined, '') } : null,
        ].filter(Boolean) : []}
      />

      {rotation ? (
        <RecordCard
          icon={icons.switch || icons.clock}
          tone="indigo"
          title={rotation.name || 'Rotating shifts'}
          subtitle="Your shift changes on a cycle, so the hours above are today’s. The Agenda shows what the cycle lands on for each day."
        />
      ) : null}

      <RecordCard
        icon={icons.calendar}
        tone="slate"
        title={weeklyOffPhrase(offNames) || 'No weekly day off is set for you'}
        subtitle={offNames.length
          ? `You can still clock in on a day off — that’s how ${TERMS.COMP_OFF.toLowerCase()} is earned.`
          : 'That doesn’t mean you work every day — ask HR which days you’re expected in.'}
      >
        {offNames.length ? (
          <View style={{ gap: space[3] }}>
            <WeekdayOffRow days={weekdayOffRow(offNames)} />
            {/* The "nameless weekend" v2 fixed: the rule's own name, and who
                else it covers. `matched_by` never reaches the screen (§5) —
                `weeklyOffAudience` says it as the group instead. The one grey
                block this card gets; a second would be a box in a box (§1). */}
            {offRule ? (
              <View style={{ gap: 2 }}>
                <Text style={text.smallStrong}>{offRule.name}</Text>
                {offRule.audience ? <Text style={text.small}>{offRule.audience}</Text> : null}
                {offRule.from ? (
                  <Text style={text.caption}>
                    {`In force since ${fmtDate(offRule.from, '')}${offRule.to ? ` until ${fmtDate(offRule.to, '')}` : ''}`}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </RecordCard>

      {/* The clock this schedule is read against. Only worth saying when it
          isn't the phone's — otherwise it is noise on every screen. */}
      {shift?.timezone && shift.timezone !== deviceZone() ? (
        <InlineAlert tone="indigo">
          {`These times are in ${shift.timezone}, which isn’t your phone’s time zone — your clock may read differently from your shift.`}
        </InlineAlert>
      ) : null}
    </ScrollView>
  );
}

function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

/* ─── How days count ──────────────────────────────────────────────────────────
   The web's "How days are counted" tab, which is the whole reason that page
   exists: HR could always set a grace period and a correction window, and the
   people those rules land on could see neither. */
function RulesSection({ shiftRes, agenda, refreshControl }) {
  const { data, loading, error, reload } = shiftRes;
  const shift = shiftOf(data);
  // Two sources for one policy since v2 — either read failing leaves the rules
  // standing. The shift read is preferred only because it is the older, more
  // widely exercised path.
  const policy = policyOf(data) || agenda.policy;
  const targeting = employeeTargeting(agenda.employee);
  const rules = ruleLines(shift, policy);

  // The ladder draws the half/full thresholds, so the rule card that printed
  // the same two figures drops out — one concept, drawn once.
  // Asked of the helpers, not of the fields: they are the two that know both
  // threshold spellings (lib/policyRules.js), and a fifth place checking field
  // names is how the minutes/hours trap bites again.
  const ladderShown = halfDayMinutes(policy) !== null || fullDayMinutes(policy) !== null;
  const cards = ladderShown ? rules.filter((r) => r.key !== 'full_day_min_hours') : rules;

  if (loading && !data && !policy) return <CardsSkeleton rows={4} height={96} />;
  if (error && !data && !policy && !isNotFound(error)) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState error={error} domain="attendance" onRetry={reload} fallback="We couldn’t load the rules your days are counted by." />
      </View>
    );
  }

  if (!policy) {
    return (
      <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
        <EmptyState
          icon={icons.rules}
          title="No rules published for you yet"
          message="Your organisation hasn’t published the rules your attendance is measured against. Your clock-ins are still recorded as normal — ask HR how your days are counted."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <PolicyHeroCard
        policy={policy}
        targeting={targeting}
        ladderShown={ladderShown}
      />

      {cards.length ? (
        <View style={{ gap: space[3], marginTop: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
            <Text style={[text.label, { color: color.textMuted, letterSpacing: 0.5 }]}>
              PUBLISHED ATTENDANCE RULES
            </Text>
            <Pill variant="muted">
              {`${cards.length} ${cards.length === 1 ? 'Rule' : 'Rules'}`}
            </Pill>
          </View>
          {cards.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

/* ─── The screen ──────────────────────────────────────────────────────────── */

export default function SchedulesScreen({ navigation, route }) {
  const today = todayYMD();
  const go = useGo();
  const { workspace } = useAuth();
  const [section, setSection] = useState('agenda');

  const agenda = useMyAgenda(AGENDA_WINDOW_DAYS);
  const shiftRes = useResource(() => attendanceAPI.getMyShift());

  const { reload: reloadAgenda } = agenda;
  const { reload: reloadShift } = shiftRes;
  useAttendanceChanged([ATTENDANCE_EVENTS.CONFIG], reloadShift);
  const { refreshControl } = useListRefresh(
    useCallback(() => { reloadAgenda(); reloadShift(); }, [reloadAgenda, reloadShift]),
    agenda.loading || shiftRes.loading,
  );

  // Not deployed, or attendance off → no Agenda, no Due (see header).
  const agendaAbsent = !!agenda.error && !agenda.data
    && (isNotFound(agenda.error) || isFeatureDisabled(agenda.error));
  const sections = useMemo(
    () => (agendaAbsent ? ALL_SECTIONS.filter((s) => !AGENDA_SECTIONS.includes(s.value)) : ALL_SECTIONS),
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

  const { days, lanes, summary, recoveredTasks, tasksUnrecoverable, tasksAbsent, tasksRecovering } = agenda;
  const weeks = useMemo(() => weeksOf(days, today), [days, today]);

  // The agenda's items plus any the hook re-read for a failed tasks lane.
  const items = useMemo(
    () => mergeAgendaItems(flattenAgendaItems(days), recoveredTasks),
    [days, recoveredTasks],
  );
  const dueGroups = useMemo(() => {
    const byDate = new Map();
    const out = [];
    items.forEach((item) => {
      let group = byDate.get(item.date);
      if (!group) {
        group = { key: item.date, title: dayTitle(item.date, today), data: [], overdue: false };
        byDate.set(item.date, group);
        out.push(group);
      }
      group.data.push(item);
      if (itemTone(item) === 'rose') group.overdue = true;
    });
    return out;
  }, [items, today]);

  // A lane we read ourselves is no longer missing, so it must not count
  // towards what this screen reports — otherwise the reader is warned about
  // deadlines that are on the screen in front of them. Narrowly: ONLY the
  // `unavailable` tasks lane, and only while the second read hasn't failed too.
  const tasksHandled = lanes?.tasks === 'unavailable' && !tasksUnrecoverable;
  const reckoned = tasksHandled ? ITEM_LANES.filter((k) => k !== 'tasks') : ITEM_LANES;
  const laneState = worstLaneState(lanes, reckoned);
  const failed = failedLaneNames(lanes, reckoned);
  const capped = cappedLaneNames(lanes, reckoned);

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
      <ScheduleHero summary={summary} loading={agenda.loading && !agenda.data} />
      <LaneNotice failed={failed} capped={capped} onRetry={reloadAgenda} />
    </View>
  );

  const sectionHeader = ({ section: s }) => (
    <Text style={[text.label, { color: color.textMuted, paddingTop: space[2] }]}>{s.title}</Text>
  );

  let body;
  if (section === 'shift') {
    body = <ShiftSection shiftRes={shiftRes} agenda={agenda} refreshControl={refreshControl} />;
  } else if (section === 'rules') {
    body = <RulesSection shiftRes={shiftRes} agenda={agenda} refreshControl={refreshControl} />;
  } else if (agenda.error && !agenda.data) {
    body = (
      <View style={{ padding: space[4] }}>
        <ErrorState error={agenda.error} domain="attendance" onRetry={reloadAgenda} fallback="We couldn’t load your schedule." />
      </View>
    );
  } else if (section === 'due') {
    const busy = (agenda.loading && !agenda.data) || tasksRecovering;
    body = (
      <SectionList
        sections={dueGroups}
        keyExtractor={(item, i) => `${item.kind}:${item.id || i}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: space[3], paddingBottom: space[1] }}>
            {header}
            {laneState === 'truncated' ? <InlineAlert tone="indigo">{LANE_TRUNCATED_NOTE}</InlineAlert> : null}
          </View>
        }
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
          busy ? (
            <CardsSkeleton rows={4} height={84} />
          ) : laneState === 'unavailable' ? (
            // The notice in the header already says what is missing. Claiming
            // "nothing due" under it would be the one untrue line on screen.
            null
          ) : (
            <EmptyState
              icon={icons.ok}
              title={`Nothing due in the next ${AGENDA_WINDOW_DAYS} days`}
              message={tasksAbsent
                // Tasks aren't part of this organisation's plan, so promising
                // we looked for deadlines they can never be given would be
                // the one sentence here that isn't true.
                ? `No document dates or expiring ${TERMS.COMP_OFF.toLowerCase()} are coming up this week.`
                : `No task deadlines, document dates or expiring ${TERMS.COMP_OFF.toLowerCase()} are coming up this week.`}
            />
          )
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
        ListEmptyComponent={agenda.loading && !agenda.data ? <CardsSkeleton rows={6} height={96} /> : null}
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
