// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/components/TaskList.jsx — one section of My Tasks: a paged
// list of task cards.
//
// Each section of the strip mounts one of these with its own `params` (a status
// filter, or `is_overdue`). The list is the web's TaskTable boiled down to what
// a phone reads at a glance (CLAUDE.md §1): the title, where it stands, the
// deadline and the priority — a card, never a row of columns. The rest is in
// the task screen the card opens.
//
// A FlatList, not a ScrollView of maps: a work queue grows, and #249 is paged.
// onEndReached walks the pages; pull-to-refresh goes back to page 1. First load
// is a card-shaped skeleton (CLAUDE.md §2), a refresh keeps the rows and spins
// the pull control — never grey blocks over data already on screen.
//
// OVERDUE IS THE ONE RED THING (taskMeta header). A missed deadline is the
// module's only genuine error state, so it wears a rose chip; everything else
// is the purple StatusBadge. The card itself stays neutral so the chip is the
// thing the eye lands on.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { tasksAPI } from '../../../api';
import { usePagedList } from '../../../hooks/usePagedList';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { fmtDateShort } from '../../../lib/dates';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, StatusBadge } from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { isTaskOverdue, personNameOrNA, taskPriorityLabel } from '../taskMeta';

/** The rose "Overdue" chip — the only non-purple thing on these screens. */
function OverdueChip() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-end',
        paddingHorizontal: space[2],
        paddingVertical: 2,
        borderRadius: radius.full,
        backgroundColor: color.danger.bg,
        borderWidth: 1,
        borderColor: color.danger.border,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color.danger.fg }} />
      <Text style={[text.badge, { color: color.danger.fg, fontSize: 10 }]}>Overdue</Text>
    </View>
  );
}

function TaskCard({ task, onOpen }) {
  const overdue = isTaskOverdue(task);
  const brief = String(task?.description || '').trim();
  const subtitle = brief || `Given by ${personNameOrNA(task?.assigner)}`;

  return (
    <RecordCard
      icon={icons.clipboardCheck}
      tone="purple"
      title={task?.title || 'Task'}
      subtitle={subtitle}
      badge={(
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {overdue ? <OverdueChip /> : null}
          <StatusBadge kind="task" status={task?.status} />
        </View>
      )}
      meta={[
        { label: 'Due', value: fmtDateShort(task?.due_date, 'No deadline') },
        { label: 'Priority', value: taskPriorityLabel(task?.priority) },
      ]}
      onPress={() => onOpen(task)}
      accessibilityLabel={`${task?.title || 'Task'}. Open it.`}
    />
  );
}

/**
 * @param {object} props
 * @param {string} props.section    the strip value — only used in the filter key
 * @param {object} props.params     the #249 query for this section
 * @param {(task) => void} props.onOpen
 * @param {{icon: Function, title: string, message: string}} props.empty
 */
export function TaskList({ section, params, onOpen, empty }) {
  const list = usePagedList(
    ({ page, limit }) => tasksAPI.getMyTasks({ ...params, page, limit }),
    { limit: 20, keys: ['tasks'], filterKey: section, accumulate: true },
  );

  // Handing a task in, or one being reassigned to me, changes this list — and
  // the detail screen emits TASK on its way back (CLAUDE.md §7).
  useAttendanceChanged([ATTENDANCE_EVENTS.TASK], list.reload);

  const renderItem = useCallback(({ item }) => <TaskCard task={item} onOpen={onOpen} />, [onOpen]);

  const first = list.loading && list.items.length === 0;

  return (
    <FlatList
      data={list.items}
      keyExtractor={(item, i) => String(item?.id || i)}
      renderItem={renderItem}
      contentContainerStyle={[cardListStyle, list.items.length === 0 && { flexGrow: 1 }]}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={(
        <RefreshControl
          refreshing={list.loading && list.items.length > 0 && list.page === 1}
          onRefresh={list.reload}
          tintColor={color.brand}
          colors={[color.brand]}
        />
      )}
      ListEmptyComponent={
        first ? (
          <CardsSkeleton rows={4} height={104} />
        ) : list.error ? (
          <ErrorState
            error={list.error}
            domain="tasks"
            onRetry={list.reload}
            fallback="Couldn’t load your tasks."
          />
        ) : (
          <EmptyState icon={empty?.icon || icons.clipboardCheck} title={empty?.title} message={empty?.message} />
        )
      }
      ListFooterComponent={
        // A spinner only while a FURTHER page is loading (page > 1). A first
        // load is the skeleton above; a pull-to-refresh is the RefreshControl.
        list.loading && list.page > 1
          ? <View style={{ paddingVertical: space[4] }}><ActivityIndicator size="small" color={color.brand} /></View>
          : null
      }
    />
  );
}

export default TaskList;
