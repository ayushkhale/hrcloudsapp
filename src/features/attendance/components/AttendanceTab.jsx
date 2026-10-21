// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/AttendanceTab.jsx — My Time › Attendance.
//
// The month, day by day: what each day was counted as and what was worked.
// The default section, because it is the question people actually have.
//
// Web ancestor: EmployeeAttendancePage — four summary tiles over a table of
// days, each row opening the daily log.
//
// ── THE MONTH LIVES HERE NOW (2026-10-17) ────────────────────────────────────
//
// The stepper used to be pinned above the section strip. It is inside this
// section's HERO instead, for two reasons: this is the only section whose
// endpoints take a month (see TimeScreen's header), and a stepper pinned above
// a section that ignores it is a control that silently does nothing.
//
// The four flat stat tiles are gone with it. The hero says the one number
// somebody came for — hours worked this month — with present / late / unpaid
// as captions under it, which is three facts in the space four tiles took.
//
// ── INFINITE SCROLL, NOT NUMBERED PAGES (T-T1) ───────────────────────────────
//
// The web pages because a desktop table shows 20 rows at once. On a phone a
// numbered page is a 32pt "3" to tap, and the web's own rule says a stale
// page 5 of a one-page filter is a bug not to inherit. `usePagedList` takes
// `accumulate` for exactly this.
//
// ── THE FOOTER COUNTS DAYS, NOT RECORDS (T-T2) ───────────────────────────────
//
// /attendance/history PAGINATES OVER CALENDAR DAYS. A month is 28–31 rows
// whether or not anybody punched in it, so "20 of 31 records" is a lie about
// what the list contains. `ListFooter`'s `noun` prop exists for this one case.
//
// ── NO BUTTON IN A CARD (§6) ─────────────────────────────────────────────────
//
// The web row carries a "Correct" button. Here the whole card opens the day,
// and the day's sheet names the Corrections section. A correction needs a
// reason, so it is a form — and a card with a button in it stops being one tap
// target and becomes two the thumb has to choose between.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { FlatList, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { usePagedList } from '../../../hooks/usePagedList';
import { useResource } from '../../../hooks/useResource';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { fmtMinutes, monthLabel, monthRange, todayYMD, ymdOnly } from '../../../lib/dates';
import { num } from '../../../lib/normalize';
import { space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, ListFooter } from '../../../ui';
import { CardsSkeleton, cardListStyle } from '../../../ui/ListCards';
import { DayCard, MonthHero } from './TimeCards';

/* Summary may arrive flat or nested under `summary` — both shapes are live. */
const summaryOf = (data) => data?.summary ?? data ?? {};

/**
 * @param {object} props
 * @param {{year: number, month: number}} props.period
 * @param {Function} props.onChangePeriod
 * @param {Function} props.onDayPress  opens the DayLog sheet
 */
export function AttendanceTab({ period, onChangePeriod, onDayPress }) {
  const filterKey = `${period.year}-${period.month}`;
  const today = todayYMD();

  const history = usePagedList(
    ({ page, limit }) => attendanceAPI.getHistory({ ...monthRange(period.year, period.month), page, limit }),
    { limit: 20, keys: ['records'], filterKey, accumulate: true },
  );

  const summary = useResource(
    () => attendanceAPI.getSummary(period.month, period.year),
    { deps: [period.month, period.year] },
  );

  // A punch or an approved correction changes both the hero and the cards.
  const { reload: reloadSummary } = summary;
  const { reload: reloadHistory } = history;
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION],
    useCallback(() => { reloadSummary(); reloadHistory(); }, [reloadSummary, reloadHistory]),
  );

  const { refreshControl } = useListRefresh(
    useCallback(() => { reloadSummary(); reloadHistory(); }, [reloadSummary, reloadHistory]),
    summary.loading || history.loading,
  );

  const hero = useMemo(() => {
    const s = summaryOf(summary.data);
    // THE LIVE KEY IS `total_hours_worked` — decimal hours (10-api/03-payload-
    // shapes.md, "all 14 keys"). This read only minute keys the summary never
    // sends, so every month said "0m" over a list of 8-hour days (user,
    // 2026-10-20). Hours first; the minute spellings stay as fallbacks.
    const hoursToMin = (h) => (h != null && Number.isFinite(Number(h)) ? Math.round(Number(h) * 60) : null);
    const worked = hoursToMin(s.total_hours_worked)
      ?? s.total_worked_minutes ?? s.total_effective_minutes
      ?? hoursToMin(s.total_effective_hours);
    const avg = hoursToMin(s.average_hours_per_day);
    return {
      headline: fmtMinutes(worked, '0m'),
      caption: avg ? `avg ${fmtMinutes(avg, '0m')} a day` : null,
      facts: [
        { label: 'Present', value: String(num(s.present_days)) },
        { label: 'Late', value: String(num(s.late_days)) },
        // "Unpaid days", never "LOP" or "LWP" (§6).
        { label: 'Unpaid', value: String(num(s.lop_days ?? s.unpaid_days ?? s.absent_days)) },
      ],
    };
  }, [summary.data]);

  const header = (
    <View style={{ paddingBottom: space[1] }}>
      {summary.error ? (
        <ErrorState
          error={summary.error}
          domain="attendance"
          onRetry={summary.reload}
          fallback="We couldn’t load this month’s totals."
        />
      ) : (
        <MonthHero
          period={period}
          onChangePeriod={onChangePeriod}
          headline={hero.headline}
          caption={hero.caption}
          facts={hero.facts}
          loading={summary.loading && !summary.data}
        />
      )}
    </View>
  );

  if (history.error && history.items.length === 0) {
    return (
      // The hero stays: the summary is its own read and may well have landed
      // (§5 — one failed request never blanks a whole screen).
      <View style={{ padding: space[4], gap: space[3] }}>
        {header}
        <ErrorState
          error={history.error}
          domain="attendance"
          onRetry={history.reload}
          fallback="We couldn’t load your attendance."
        />
      </View>
    );
  }

  return (
    <FlatList
      data={history.items}
      keyExtractor={(record, i) => String(record.id || ymdOnly(record.date) || i)}
      ListHeaderComponent={header}
      renderItem={({ item: record }) => {
        const ymd = ymdOnly(record.date);
        return (
          <DayCard
            record={record}
            today={today}
            onPress={ymd ? () => onDayPress(ymd) : undefined}
          />
        );
      }}
      onEndReached={history.loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        history.loading ? (
          <CardsSkeleton rows={6} />
        ) : (
          <EmptyState
            icon={icons.calendar}
            title="Nothing recorded"
            message={`No attendance recorded for ${monthLabel(period.year, period.month)}.`}
          />
        )
      }
      ListFooterComponent={
        history.items.length > 0 ? (
          <ListFooter
            page={history.page}
            totalPages={history.totalPages}
            total={history.total}
            loading={history.loading}
            noun="day"
          />
        ) : null
      }
      contentContainerStyle={cardListStyle}
      refreshControl={refreshControl}
    />
  );
}

export default AttendanceTab;
