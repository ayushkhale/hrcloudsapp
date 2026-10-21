// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/OvertimeTab.jsx — My Time › Overtime.
//
// Extra hours worked beyond the shift: what was recorded, what is approved,
// and what it came to this month.
//
// ── T-T5 · MINUTES ARE THE CANONICAL UNIT ────────────────────────────────────
//
// The response shape is undocumented (audit C14) and the same entity is read
// by the employee, manager and HR views under different spellings. So there
// is ONE accessor — `overtimeMinutes()` — and everything reads through it. A
// payload that hands back hours as a decimal (`1.5`) is converted here; it is
// never printed as "1.5", and never as a day count either (`formatDayCount`
// is for days).
//
// ── THERE IS NO "CLAIM OVERTIME" BUTTON, AND THAT IS NOT AN OMISSION ─────────
//
// 03-time.md §6 allows one "if the org allows self-claims", gated on what the
// server returns rather than on the spec. THERE IS NO CLAIM ENDPOINT — not in
// api/attendance.api.js, not in the web app's own api module. Overtime is
// DERIVED from punches and the shift; the only overtime routes that exist are
// the manager's approve/reject. So the section states that plainly in the
// empty state and in the record sheet, and `OvertimeForm` stays unbuilt.
//
// ── THE WHOLE SECTION DISAPPEARS WHEN THE ORG DOESN'T HAVE IT ───────────────
//
// Handled one level up, in TimeScreen's `useTimeSections`: a 404 or a disabled
// feature removes it from the strip entirely. A capability a role or an org
// lacks is ABSENT, not a section that explains it is unavailable (§2).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { FlatList, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { usePagedList } from '../../../hooks/usePagedList';
import { fmtDateShort, fmtMinutes, fmtTime, monthLabel, monthRange, ymdOnly } from '../../../lib/dates';
import { space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, ListFooter, StatusBadge } from '../../../ui';
import { OvertimeSheet } from './SelfRecordSheets';
import { CardsSkeleton, RecordCard, StatCards, cardListStyle } from '../../../ui/ListCards';

/** The one accessor. Minutes, whatever the row called them (T-T5, T-T6). */
export function overtimeMinutes(record) {
  if (record?.overtime_minutes != null) return Number(record.overtime_minutes);
  if (record?.minutes != null) return Number(record.minutes);
  if (record?.requested_minutes != null) return Number(record.requested_minutes);
  if (record?.hours != null) return Math.round(Number(record.hours) * 60);
  if (record?.overtime_hours != null) return Math.round(Number(record.overtime_hours) * 60);
  return null;
}

const overtimeDate = (r) => ymdOnly(r?.date || r?.record_date || r?.attendance_record?.date);
const statusOf = (r) => String(r?.status || 'pending').toLowerCase();

/**
 * @param {object} props
 * @param {{year: number, month: number}} props.period  for the two figures only
 */
export function OvertimeTab({ period }) {
  const [selected, setSelected] = useState(null);

  // `page`/`limit` only — this endpoint has no date or status filter, so the
  // list is everything and the FIGURES do the month, in memory, below.
  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyOvertime({ page, limit }),
    { limit: 20, keys: ['overtime', 'requests', 'records'], accumulate: true },
  );

  const { refreshControl } = useListRefresh(list.reload, list.loading);

  const stats = useMemo(() => {
    const { from, to } = monthRange(period.year, period.month);
    const thisMonth = list.items.filter((r) => {
      const d = overtimeDate(r);
      return !!d && d >= from && d <= to;
    });
    const sum = (rows) => rows.reduce((total, r) => total + (overtimeMinutes(r) || 0), 0);

    return [
      {
        icon: icons.ok,
        tone: 'emerald',
        label: `Approved · ${monthLabel(period.year, period.month).split(' ')[0]}`,
        value: fmtMinutes(sum(thisMonth.filter((r) => statusOf(r) === 'approved')), '0m'),
      },
      {
        icon: icons.clock,
        tone: 'amber',
        label: 'Waiting',
        value: fmtMinutes(sum(list.items.filter((r) => statusOf(r) === 'pending')), '0m'),
      },
    ];
  }, [list.items, period.year, period.month]);

  if (list.error && list.items.length === 0) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={list.error}
          domain="attendance"
          onRetry={list.reload}
          fallback="We couldn’t load your overtime."
        />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={list.items}
        keyExtractor={(r, i) => String(r.id || `${overtimeDate(r)}-${i}`)}
        // Counted from what has LOADED, which is why the label names a month
        // and not a total: the figure grows as more pages arrive, and claiming
        // a total that is still filling in would be the lie.
        ListHeaderComponent={list.items.length > 0 ? <StatCards items={stats} /> : null}
        // The correction card's shape (user, 2026-10-22): the date as the
        // title, the status top right, the figures in the strip — the extra
        // time and the punches it came from. The sentence "Worked out from
        // your punches" was on every card; it lives in the sheet now.
        renderItem={({ item: record }) => {
          const day = record?.record || record?.attendance_record || null;
          const inAt = fmtTime(day?.clock_in_time, '');
          const outAt = fmtTime(day?.clock_out_time, '');
          return (
            <RecordCard
              icon={icons.overtime}
              tone="indigo"
              onPress={() => setSelected(record)}
              accessibilityLabel="this overtime entry"
              title={fmtDateShort(overtimeDate(record), 'That day')}
              subtitle={record?.reason || null}
              badge={<StatusBadge kind="overtime" status={record.status || 'pending'} dense />}
              meta={[
                { label: 'Extra time', value: fmtMinutes(overtimeMinutes(record), '0m') },
                inAt ? { label: 'Clock in', value: inAt } : null,
                outAt ? { label: 'Clock out', value: outAt } : null,
              ].filter(Boolean)}
            />
          );
        }}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          list.loading ? (
            <CardsSkeleton rows={5} height={110} />
          ) : (
            <EmptyState
              icon={icons.overtime}
              title="No overtime yet"
              message="Overtime shows up here when you work beyond your shift and your attendance policy tracks it. It is worked out from your punches — there is nothing to apply for."
            />
          )
        }
        ListFooterComponent={
          list.items.length > 0 ? (
            <ListFooter
              page={list.page}
              totalPages={list.totalPages}
              total={list.total}
              loading={list.loading}
              noun="record"
            />
          ) : null
        }
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />

      {selected ? (
        <OvertimeSheet
          item={selected}
          minutes={overtimeMinutes(selected)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

export default OvertimeTab;
