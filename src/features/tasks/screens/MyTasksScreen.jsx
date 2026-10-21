// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/screens/MyTasksScreen.jsx — "My Tasks". The work somebody has
// been given (#249–#252).
//
// ── ONE SCREEN, SECTIONS — THE SAME SHAPE AS MY TIME, MY PAY AND MY DOCUMENTS ─
//
// The web has a MyTasksPage with a row of status FilterTabs plus a separate
// "Overdue Tasks" route; on a phone a seven-item filter bar scrolls and hides
// its last tabs (CLAUDE.md §1), and a second route for "the same list, filtered"
// is a second header and a second back press. So this is one screen: a hero that
// answers "what needs me?", a strip of status sections, and a list that swaps
// underneath. Overdue is a section here, not a route — exactly as the web's
// `view="overdue"` is "the same page" (MyTasksPage header).
//
// ── THE HERO IS TWO CHEAP COUNTS, AND IT POINTS SOMEWHERE ───────────────────
//
// There is no summary endpoint, so the hero asks #249 for the TOTAL of two
// filters at `limit: 1` — overdue, and not-yet-started — and reads
// `pagination.total`. Overdue wins the headline because it is the only urgent
// one; a tap jumps to that section. Never a fake zero: while it loads it is a
// skeleton, and a failed count just drops (the list below carries the real
// error, and its own retry).
//
// ── A TASKS-OFF ORG IS ABSENT, NOT BROKEN (CLAUDE.md §6) ────────────────────
//
// The plan may not include tasks; #249 answers FEATURE_NOT_AVAILABLE. The screen
// says so once, with no strip and no retry, rather than seven sections each
// failing the same way.
//
// ── A RECORD IS A SCREEN HERE, NOT A SHEET ──────────────────────────────────
//
// The house rule is that a record being READ is a RecordSheet, not a route
// (CLAUDE.md §3). A task is the exception that proves it: opening one is a WRITE
// (#250 stamps the read receipt), and the thing you do there — read the brief,
// start work, hand it in, hold a discussion with a keyboard open — is a
// workspace, not a glance at a record. A keyboard inside a draggable bottom
// sheet is a fight (RecordSheet header), so TaskDetail is a pushed screen. The
// list → detail → back path is unchanged; only the container is a route.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { tasksAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { isTaskFeatureDisabled } from '../../../lib/errors/taskErrors';
import { color, space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, HeroCard } from '../../../ui';
import { CategoryStrip } from '../../../ui/ListCards';
import { TaskList } from '../components/TaskList';

/* Each section is one #249 query. A section = one server filter, so the list is
   one request and the counts never disagree with it. */
const SECTIONS = [
  { value: 'all', label: 'All', icon: icons.clipboard, params: {} },
  { value: 'todo', label: 'To do', icon: icons.play, params: { status: 'pending' } },
  { value: 'doing', label: 'Doing', icon: icons.overtime, params: { status: 'in_progress' } },
  { value: 'changes', label: 'Changes', icon: icons.edit, params: { status: 'reopened' } },
  { value: 'review', label: 'In review', icon: icons.clock, params: { status: 'in_review' } },
  { value: 'done', label: 'Done', icon: icons.check, params: { status: 'completed' } },
  { value: 'overdue', label: 'Overdue', icon: icons.flag, params: { is_overdue: true } },
];

const EMPTY = {
  all: { icon: icons.clipboardCheck, title: 'Nothing on your plate', message: 'Tasks appear here when your manager or HR gives you one. Nothing to do for now.' },
  todo: { icon: icons.play, title: 'Nothing to start', message: 'Everything you’ve been given is already being worked on, handed in or done.' },
  doing: { icon: icons.overtime, title: 'Nothing on the go', message: 'Open a task and start work to move it here.' },
  changes: { icon: icons.edit, title: 'No changes asked for', message: 'When a reviewer sends work back with notes, it shows up here.' },
  review: { icon: icons.clock, title: 'Nothing waiting on a reviewer', message: 'Hand a task in and it sits here until it’s approved or sent back.' },
  done: { icon: icons.check, title: 'Nothing finished yet', message: 'Approved tasks are kept here so you can look back at them.' },
  overdue: { icon: icons.flag, title: 'Nothing overdue', message: 'Everything is either still inside its deadline or already handed in.' },
};

/** Total for a filter, read from #249's pagination at limit 1. */
function useCount(params, enabled = true) {
  return useResource(
    () => tasksAPI.getMyTasks({ ...params, limit: 1 }),
    { enabled, select: (d) => Number(d?.pagination?.total ?? (Array.isArray(d?.tasks) ? d.tasks.length : 0)) || 0 },
  );
}

/* The state card (ui/HeroCard, 2026-10-20). Overdue outranks "to start";
   with neither, it is the CALM card — a check, two quiet lines, no press.
   It used to be a solid violet block shouting "All caught up". */
function Hero({ overdue, pending, loading, onGo }) {
  const target = overdue > 0 ? 'overdue' : pending > 0 ? 'todo' : null;
  const headline = overdue > 0
    ? `${overdue} overdue`
    : pending > 0
      ? `${pending} to start`
      : 'You’re all caught up';
  const blurb = overdue > 0
    ? 'Past the deadline and not handed in yet.'
    : pending > 0
      ? 'Given to you and waiting to be picked up.'
      : 'Nothing needs you right now.';

  return (
    <HeroCard
      icon={overdue > 0 ? icons.flag : icons.clipboardCheck}
      eyebrow="Your tasks"
      title={headline}
      caption={blurb}
      calm={!target}
      loading={loading}
      onPress={target ? () => onGo(target) : undefined}
      accessibilityLabel={target ? `${headline}. Open them.` : `${headline}. ${blurb}`}
    />
  );
}

export default function MyTasksScreen({ navigation, route }) {
  const [section, setSection] = useState('all');

  const overdue = useCount({ is_overdue: true });
  const pending = useCount({ status: 'pending' });

  // A task reassigned to me, a deadline moved, or one I just handed in all
  // change these counts and the open list (CLAUDE.md §7).
  const reloadOverdue = overdue.reload;
  const reloadPending = pending.reload;
  useAttendanceChanged([ATTENDANCE_EVENTS.TASK], useCallback(() => {
    reloadOverdue();
    reloadPending();
  }, [reloadOverdue, reloadPending]));

  // A drawer row names its section ('overdueTasks' → { section: 'overdue' }).
  // Applied once and CLEARED, or it is sticky and the screen snaps back to it
  // every time the tab regains focus (CLAUDE.md §6).
  const requested = route?.params?.section;
  useEffect(() => {
    if (!requested) return;
    if (SECTIONS.some((s) => s.value === requested)) setSection(requested);
    navigation.setParams({ section: undefined });
  }, [requested, navigation]);

  const disabled = isTaskFeatureDisabled(overdue.error) || isTaskFeatureDisabled(pending.error);
  const loadingCounts = (overdue.loading || pending.loading) && overdue.data == null && pending.data == null;

  const sections = useMemo(() => SECTIONS.map((s) => {
    if (s.value === 'overdue' && overdue.data > 0) return { ...s, badge: overdue.data };
    if (s.value === 'todo' && pending.data > 0) return { ...s, badge: pending.data };
    return s;
  }), [overdue.data, pending.data]);

  const active = SECTIONS.find((s) => s.value === section) || SECTIONS[0];
  const openTask = useCallback((task) => navigation.navigate('TaskDetail', { task }), [navigation]);

  if (disabled) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <EmptyState
          icon={icons.clipboardCheck}
          title="Tasks aren’t switched on"
          message="Your organisation isn’t using tasks in HR Clouds yet."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>

      {/* On the canvas, not a white band with a hairline (2026-10-20): the
          header, the hero and the strip read as one surface with the list. */}
      <View style={{ paddingTop: space[1] }}>
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
          <Hero
            overdue={overdue.data || 0}
            pending={pending.data || 0}
            loading={loadingCounts}
            onGo={setSection}
          />
        </View>
        <CategoryStrip items={sections} value={section} onChange={setSection} />
      </View>

      <View style={{ flex: 1 }}>
        {/* `key` remounts the list when the section changes, so each section
            starts at the top and its own page 1 rather than inheriting the
            previous section's scroll and accumulated rows. */}
        <TaskList
          key={active.value}
          section={active.value}
          params={active.params}
          onOpen={openTask}
          empty={EMPTY[active.value]}
        />
      </View>
    </View>
  );
}

export { MyTasksScreen };
