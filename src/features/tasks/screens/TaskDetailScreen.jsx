// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/screens/TaskDetailScreen.jsx — one task, in full (#250–#253).
//
// Ported from the web's TaskDetailDialog + its My Tasks footer. On the web this
// is a record-inspector dialog; here it is a PUSHED SCREEN, not a RecordSheet,
// and that is deliberate (MyTasksScreen header has the why): opening a task is a
// WRITE (#250 stamps the read receipt), and it is a workspace — read the brief,
// start work, hand it in, hold a discussion with the keyboard open — not a
// glance at a record. A keyboard inside a draggable bottom sheet is a fight
// (RecordSheet header), so the discussion lives on a real screen.
//
// Traps carried over from the web dialog:
//
// • OPENING IT IS THE READ, AND THE READ IS A WRITE. #250 stamps
//   `first_viewed_at` the first time — so nothing prefetches it, and the list
//   row only ever opens this; this does the read.
//
// • THE LIST ROW IS A PARTIAL TASK (#249 sends ~16 fields). So the screen opens
//   on the row, shows the rest as skeletons, and merges the full record over it
//   when it lands — never "N/A" over half the grid for a second.
//
// • A 412 IS NOT THE USER'S FAULT. Somebody else wrote to the task while it was
//   open; the action reloads the record, keeps the screen, and says so, rather
//   than throwing away a half-written submission.
//
// • EVERY ACTION EMITS `TASK` (§7). Handing work in adds an item to a reviewer's
//   inbox and changes this person's own counts; there is no query cache, so the
//   list and the hero only update if the emit happens.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Linking, Platform, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { tasksAPI } from '../../../api';
import { fmtDate, fmtDateTime, fmtTime } from '../../../lib/dates';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { statusMeta } from '../../../lib/enums';
import { isTaskStale, taskErrorMessage } from '../../../lib/errors/taskErrors';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, InlineAlert, Pill, Skeleton, StatusBadge, TabStrip,
  SheetGrid, SheetSection, SheetStats, SheetText, showToast,
} from '../../../ui';
import { KeyboardAwareScrollView, useKeyboardLift } from '../../../ui/KeyboardAware';
import { AttachedFileRow, LinksEditor } from '../components/TaskAttachments';
import { TaskDiscussion } from '../components/TaskDiscussion';
import { SubmitTaskSheet } from '../components/SubmitTaskSheet';
import {
  canChangeOwnStatus, canSubmitTask, hasExcessiveRework, isTaskOverdue, nextOwnStatus,
  personInSentence, personNameOrNA, taskCategoryLabel, taskPriorityLabel, wasTaskExtended,
} from '../taskMeta';

/* ─── The one-line why-no-actions note (web TaskFooterNote) ──────────────── */

function footerNote(task) {
  const status = String(task?.status || '').toLowerCase();
  const reviewer = personInSentence(task?.assigner, 'your reviewer');
  if (status === 'cancelled') return 'This task was called off, so nothing more can be done with it.';
  if (status === 'completed') return 'Your work was approved and this task is closed.';
  if (status === 'in_review') return `You’ve handed this in. ${reviewer} will approve it or send it back with notes.`;
  return null;
}

/* ─── A plain link row in the Files tab ──────────────────────────────────── */

function LinkRow({ link }) {
  const External = icons.external;
  const onPress = () => {
    if (link?.url) Linking.openURL(link.url).catch(() => {});
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
        {External ? <External size={16} color={color.brandChipFg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.smallStrong}>{link?.label || link?.url}</Text>
        {link?.label ? <Text numberOfLines={1} style={text.caption}>{link?.url}</Text> : null}
      </View>
      <Button title="Open" size="sm" variant="outline" onPress={onPress} />
    </View>
  );
}

export default function TaskDetailScreen({ navigation, route }) {
  const initial = route?.params?.task || null;
  const taskId = initial?.id;

  const [task, setTask] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  // The action bar and the discussion composer both sit on the bottom edge.
  const { lift, safeBottom } = useKeyboardLift();
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!taskId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await tasksAPI.getMyTask(taskId);
      const full = res?.data ?? res;
      if (!mounted.current) return;
      setTask((cur) => ({ ...cur, ...(full && typeof full === 'object' ? full : {}) }));
      setError('');
    } catch (err) {
      if (!mounted.current) return;
      setError(taskErrorMessage(err, 'Couldn’t load the rest of this task.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const onActionError = useCallback((err, fallback) => {
    if (isTaskStale(err)) {
      load();
      return 'Somebody else changed this task while you had it open. It’s been refreshed — check it and try again.';
    }
    return taskErrorMessage(err, fallback);
  }, [load]);

  const toggleStatus = useCallback(async () => {
    const target = nextOwnStatus(task);
    if (!target) return;
    setBusy(true);
    try {
      const res = await tasksAPI.updateMyTaskStatus(task.id, target, task);
      const next = res?.data ?? res;
      setTask((cur) => ({ ...cur, ...(next && typeof next === 'object' ? next : {}) }));
      showToast(target === 'in_progress' ? 'Marked as being worked on.' : 'Put back to not started.', 'success');
      emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { id: task.id, action: 'status' });
    } catch (err) {
      showToast(onActionError(err, 'Couldn’t update this task.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [task, onActionError]);

  const handIn = useCallback(async (payload) => {
    try {
      await tasksAPI.submitMyTask(task.id, payload, task);
      showToast('Handed in. Your reviewer has been told.', 'success');
      emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { id: task.id, action: 'submit' });
      setSubmitting(false);
      load();
    } catch (err) {
      showToast(onActionError(err, 'Couldn’t hand this in.'), 'error');
      throw err; // keeps the form open to retry
    }
  }, [task, onActionError, load]);

  const overdue = isTaskOverdue(task);
  const meta = statusMeta('task', task?.status);
  const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
  const links = Array.isArray(task?.external_links) ? task.external_links : [];
  const rework = Number(task?.rework_count || 0);
  const status = String(task?.status || '').toLowerCase();
  const note = footerNote(task);
  const showActions = canChangeOwnStatus(task) || canSubmitTask(task);

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'discussion', label: 'Discussion' },
    { value: 'files', label: 'Files', count: attachments.length + links.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {/* A plain View: the keyboard is handled by the scroller below and by
          the action bar's own lift (ui/KeyboardAware.jsx). The
          KeyboardAvoidingView that was here needed a hand-tuned
          keyboardVerticalOffset and still did nothing on Android. */}
      <View style={{ flex: 1 }}>
        {/* ── Title block (2026-10-20) ───────────────────────────────────
            User: "task info screen … just text thrown, no structure". It was
            an 11px TASK, a title and a sentence on a white band. Now the
            reference "Request details" header: a soft card with the task's
            tile, its title, and the facts that classify it as PILLS — kind,
            priority, where it stands, overdue — read in one glance. */}
        <View style={{ paddingHorizontal: gutter, paddingTop: space[2], paddingBottom: space[2] }}>
          <LinearGradient
            colors={[color.heroSoftFrom, color.heroSoftVia, color.heroSoftTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: color.heroSoftBorder,
              padding: space[4],
              gap: space[3],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View
                style={{
                  width: 48, height: 48, borderRadius: radius.md + 2, backgroundColor: color.surface,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {icons.clipboardCheck ? <icons.clipboardCheck size={24} color={color.brand} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[text.caption, { color: color.brandSoftFg, fontSize: 12 }]}>{taskCategoryLabel(task?.category)}</Text>
                <Text style={[text.h2, { color: color.ink }]}>{task?.title || 'Task'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
              <StatusBadge kind="task" status={task?.status} long />
              <Pill variant="outline">{`${taskPriorityLabel(task?.priority)} priority`}</Pill>
              {task?.due_date ? <Pill variant="outline">{`Due ${fmtDate(task.due_date)}`}</Pill> : null}
              {overdue ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space[2], paddingVertical: 3, borderRadius: radius.full, backgroundColor: color.danger.bg }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.danger.dot }} />
                  <Text style={[text.badge, { color: color.danger.fg, fontSize: 11 }]}>Overdue</Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>
        </View>

        <TabStrip tabs={tabs} value={tab} onChange={setTab} />

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: gutter, paddingBottom: space[10], gap: space[4] }}
        >
          {error ? <InlineAlert tone="rose">{error}</InlineAlert> : null}

          {tab === 'overview' ? (
            loading && !task?.created_at ? (
              <Skeleton type="sheet" />
            ) : (
              <>
                <SheetSection icon={icons.edit} title="What needs to be done" collapsible={false}>
                  <SheetText empty="Nothing was written in the brief.">{task?.description}</SheetText>
                </SheetSection>

                <SheetStats
                  items={[
                    { label: 'Deadline', value: fmtDate(task?.due_date), icon: icons.calendar, caption: overdue ? 'already past' : fmtTime(task?.due_date, '') },
                    { label: 'Where it stands', value: meta.longLabel, icon: icons.clipboardCheck },
                    rework > 0 ? {
                      label: 'Times sent back',
                      value: String(rework),
                      icon: icons.refresh,
                      caption: hasExcessiveRework(task) ? 'worth talking the brief through' : undefined,
                    } : null,
                  ].filter(Boolean)}
                />

                <SheetSection icon={icons.people} title="Who and when">
                  <SheetGrid
                    items={[
                      ['Who it’s for', personNameOrNA(task?.assignee)],
                      ['Given by', personNameOrNA(task?.assigner)],
                      ['Given on', task?.created_at ? fmtDateTime(task.created_at) : null],
                      ['Kind of work', taskCategoryLabel(task?.category)],
                    ]}
                  />
                </SheetSection>

                <SheetSection icon={icons.refresh} title="How it’s going">
                  <SheetGrid
                    items={[
                      ['First opened', task?.is_viewed ? fmtDateTime(task?.first_viewed_at) : 'Not opened yet'],
                      ['Handed in', task?.submitted_at ? fmtDateTime(task.submitted_at) : 'Not handed in yet'],
                    ]}
                  />
                </SheetSection>

                {wasTaskExtended(task) ? (
                  <SheetSection icon={icons.calendar} title="The deadline has moved">
                    <SheetGrid
                      items={[
                        ['First set to', fmtDateTime(task.original_due_date)],
                        ['Now', fmtDateTime(task.due_date)],
                      ]}
                    />
                  </SheetSection>
                ) : null}

                {task?.cancellation_reason ? (
                  <SheetSection icon={icons.reject} title="Why it was called off">
                    <SheetText>{task.cancellation_reason}</SheetText>
                  </SheetSection>
                ) : null}

                {status === 'completed' ? (
                  <SheetSection icon={icons.ok} title="Signed off">
                    <SheetGrid
                      items={[
                        ['Approved on', task?.completed_at ? fmtDateTime(task.completed_at) : null],
                        ['On time', task?.is_completed_on_time == null ? 'N/A' : task.is_completed_on_time ? 'Yes' : 'No — after the deadline'],
                      ]}
                    />
                  </SheetSection>
                ) : null}
              </>
            )
          ) : tab === 'discussion' ? (
            <TaskDiscussion task={task} onPosted={load} />
          ) : (
            <View style={{ gap: space[4] }}>
              <SheetSection icon={icons.attachment} title={`Files${attachments.length ? ` (${attachments.length})` : ''}`} collapsible={false}>
                {attachments.length ? (
                  attachments.map((a) => <AttachedFileRow key={a.id} attachment={a} />)
                ) : (
                  <Text style={[text.small, { color: color.textMuted }]}>No files on this task.</Text>
                )}
              </SheetSection>
              <SheetSection icon={icons.external} title={`Reference links${links.length ? ` (${links.length})` : ''}`} collapsible={false}>
                {links.length ? (
                  links.map((l, i) => <LinkRow key={String(i)} link={l} />)
                ) : (
                  <Text style={[text.small, { color: color.textMuted }]}>No links on this task.</Text>
                )}
              </SheetSection>
            </View>
          )}
        </KeyboardAwareScrollView>

        {/* ── Actions, or the note saying why there are none. Overview only:
            the Discussion tab's composer is its own bottom bar. ─────────── */}
        {tab === 'overview' ? (
          <View
            style={{
              flexDirection: 'row',
              gap: space[2],
              paddingHorizontal: gutter,
              paddingTop: space[3],
              paddingBottom: space[3] + safeBottom,
              marginBottom: lift,
              backgroundColor: color.bg,
              borderTopWidth: 1,
              borderTopColor: color.borderSubtle,
              alignItems: 'center',
            }}
          >
            {showActions ? (
              <>
                {canChangeOwnStatus(task) ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      title={nextOwnStatus(task) === 'in_progress' ? 'Start work' : 'Put back'}
                      variant="outline"
                      icon={nextOwnStatus(task) === 'in_progress' ? icons.play : icons.pause}
                      onPress={toggleStatus}
                      loading={busy}
                      fullWidth
                    />
                  </View>
                ) : null}
                {canSubmitTask(task) ? (
                  <View style={{ flex: 1.3 }}>
                    <Button title="Hand in for review" icon={icons.upload} onPress={() => setSubmitting(true)} fullWidth />
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={[text.caption, { flex: 1, color: color.textSecondary }]}>
                {note || 'There’s nothing to do on this task right now.'}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      {submitting ? (
        <SubmitTaskSheet task={task} onSubmit={handIn} onClose={() => setSubmitting(false)} />
      ) : null}
    </View>
  );
}

export { TaskDetailScreen };
