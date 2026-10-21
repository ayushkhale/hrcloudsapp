// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/EarnedLeaveTab.jsx — My Time › Earned Leave.
//
// Days earned by working when this person didn't have to — a holiday, a weekly
// off — and how long they have to use them before they lapse.
//
// ── THE TERM COMES FROM THE DICTIONARY ───────────────────────────────────────
//
// `TERMS.COMP_OFF` → "Earned Leave". Never "comp-off", "compensatory off" or
// "comp off" on screen; the API's word stays on the wire. It is READ from
// config/dictionary.js rather than typed, so one change moves every screen.
//
// ── THE "EXPIRING SOON" FIGURE IS WHY THIS SECTION IS WORTH OPENING ─────────
//
// It is surfaced with the date, IN WORDS — "Use by 4 Jan", not a countdown —
// and in fuchsia, never amber and never rose (§5): an expiring day is a
// warning, not an error, and this palette has no amber.
//
// ── T-T8 · THE RECORD SHAPE IS NOT DOCUMENTED (audit C11) ────────────────────
//
// The worked date arrives as `earned_date`, `worked_date`, `date` OR
// `work_date` depending on which view the backend is reusing. One accessor per
// field, used everywhere — the web file's accessors, ported verbatim.
//
// ── T-T9 · A DAY IS WHOLE OR HALF ────────────────────────────────────────────
//
// `formatDayCount()` only, in the figures, the cards and the sheet. Eight
// hand-rolled copies of that logic once disagreed with each other (§6).
//
// ── THE SUMMARY ENDPOINT RETURNS COUNTS BY STATUS, NOT A BALANCE ─────────────
//
// /comp-offs/mine/summary is marked "not exhaustively verified" in the
// contract, and the live payload is { earned, approved, used, expired,
// cancelled, redeemable, total }. The web page read available_balance /
// used_days / expired_days and showed 0 in every card while the history below
// listed an approved day. `earned` here means WAITING FOR APPROVAL, which is
// what the figure says. The old keys stay as fallbacks.
//
// ── THERE IS NO "USE AN EARNED DAY" BUTTON ───────────────────────────────────
//
// 03-time.md §6 specifies one, opening an `EarnedLeaveForm` that creates a
// leave request. THERE IS NO REDEEM ENDPOINT — not here, not in the web app —
// and the web's own page says so in an alert: approved days go onto the leave
// balance and are applied for from My Leaves. So this section carries the same
// sentence and `EarnedLeaveForm` stays unbuilt until there is something for it
// to call. A button that opens a form that cannot submit is worse than no
// button (§2: a capability we lack is absent, not broken).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { FlatList, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { usePagedList } from '../../../hooks/usePagedList';
import { useResource } from '../../../hooks/useResource';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { addDaysYMD, fmtDate, fmtDateShort, todayYMD, ymdOnly } from '../../../lib/dates';
import { COMP_OFF_FILTERS } from '../../../lib/enums';
import { formatDayCount } from '../../../lib/format';
import { num } from '../../../lib/normalize';
import { TERMS } from '../../../config/dictionary';
import { radius, space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  EmptyState, ErrorState, FieldHelp, FilterTabs, InlineAlert, ListFooter,
  SkeletonBlock, StatusBadge,
} from '../../../ui';
import { CardsSkeleton, RecordCard, StatCards, cardListStyle } from '../../../ui/ListCards';

const TERM = TERMS.COMP_OFF;

/* T-T8 — one accessor per field, every spelling the backend reuses. */
const workedDate = (r) => ymdOnly(r?.earned_date || r?.worked_date || r?.date || r?.work_date);
const creditDays = (r) => r?.days_earned ?? r?.credit_days ?? r?.days ?? r?.comp_off_days ?? null;
const expiryDate = (r) => ymdOnly(r?.expiry_date || r?.expires_on || r?.expires_at || r?.valid_until);

/** Approved, not yet expired, and gone within a fortnight. */
const isExpiringSoon = (r, today) => {
  const expiry = expiryDate(r);
  return !!expiry
    && String(r?.status || '').toLowerCase() === 'approved'
    && expiry >= today
    && expiry <= addDaysYMD(today, 14);
};

export function EarnedLeaveTab() {
  const [status, setStatus] = useState('');
  // An earned day is a PAGE now, not a sheet (2026-10-22) — screens/EarnedLeaveDayScreen.jsx.
  const navigation = useNavigation();
  const setSelected = (p) => navigation.navigate('EarnedLeaveDay', p);
  const today = todayYMD();

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyCompOffs({ status: status || undefined, page, limit }),
    { limit: 20, keys: ['comp_offs', 'compOffs', 'records'], filterKey: status, accumulate: true },
  );

  const summary = useResource(() => attendanceAPI.getMyCompOffSummary());

  const { reload: reloadSummary } = summary;
  const { reload: reloadList } = list;
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.COMPOFF, ATTENDANCE_EVENTS.PUNCH],
    useCallback(() => { reloadSummary(); reloadList(); }, [reloadSummary, reloadList]),
  );

  const { refreshControl } = useListRefresh(
    useCallback(() => { reloadSummary(); reloadList(); }, [reloadSummary, reloadList]),
    summary.loading || list.loading,
  );

  // Counted from the rows, not the summary: the summary has no expiry in it,
  // and this is the one figure the section exists for.
  const nextToLapse = useMemo(
    () => list.items.filter((r) => isExpiringSoon(r, today)).map(expiryDate).sort()[0],
    [list.items, today],
  );

  const stats = useMemo(() => {
    const s = summary.data || {};
    return [
      {
        icon: icons.earnedLeave,
        tone: 'purple',
        label: 'Available',
        value: formatDayCount(num(s.redeemable ?? s.available_balance), { lower: true }),
        help: <FieldHelp surface="attendance.comp_off" field="available_days" />,
      },
      {
        icon: icons.clock,
        tone: 'amber',
        label: 'Waiting',
        value: formatDayCount(num(s.earned ?? s.pending), { lower: true }),
      },
      {
        icon: icons.warn,
        tone: nextToLapse ? 'amber' : 'slate',
        label: 'Expiring',
        // The DATE, in words — not a countdown (§4). "None" is an answer.
        value: nextToLapse ? `Use by ${fmtDate(nextToLapse, '')}` : 'None',
        help: <FieldHelp surface="attendance.comp_off" field="expires_on" />,
      },
    ];
  }, [summary.data, nextToLapse]);

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[1] }}>
      {summary.error ? (
        <ErrorState
          error={summary.error}
          domain="attendance"
          onRetry={summary.reload}
          fallback="We couldn’t load your balance."
        />
      ) : (
        /* A SKELETON, not a dimmed copy of the real thing (2026-10-17).
           `opacity: 0.5` over `StatCards` showed figures that were still
           zero as though they were the answer, and on Android the opacity
           layer turned those elevated cards' shadows into grey blocks
           (CLAUDE.md §4). Two cards, one row, same height — nothing moves
           when the numbers land. */
        summary.loading && !summary.data ? (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {/* Wrapped, because SkeletonBlock's own width is '100%' — two of
                those in a row overflow instead of sharing it. */}
            <View style={{ flex: 1 }}><SkeletonBlock height={74} radius={radius.lg} /></View>
            <View style={{ flex: 1 }}><SkeletonBlock height={74} radius={radius.lg} /></View>
          </View>
        ) : (
          <StatCards items={stats} />
        )
      )}

      <InlineAlert tone="indigo">
        {`Approved ${TERM.toLowerCase()} days go onto your leave balance. Apply for them from your leave — there is nothing to claim here.`}
      </InlineAlert>

      <FilterTabs options={COMP_OFF_FILTERS} value={status} onChange={setStatus} />
    </View>
  );

  if (list.error && list.items.length === 0) {
    return (
      <View style={{ padding: space[4], gap: space[3] }}>
        {header}
        <ErrorState
          error={list.error}
          domain="attendance"
          onRetry={list.reload}
          fallback={`We couldn’t load your ${TERM.toLowerCase()} days.`}
        />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={list.items}
        keyExtractor={(r, i) => String(r.id || `${workedDate(r)}-${i}`)}
        ListHeaderComponent={header}
        renderItem={({ item: record }) => {
          const expiry = expiryDate(record);
          const soon = isExpiringSoon(record, today);
          const credit = creditDays(record);
          return (
            <RecordCard
              icon={icons.earnedLeave}
              tone={soon ? 'amber' : 'purple'}
              // Fuchsia on the one card that is about to lapse. Never rose.
              highlight={soon}
              onPress={() => setSelected({ record, workedOn: workedDate(record), credit, expiry, soon })}
              accessibilityLabel={`this ${TERM.toLowerCase()} day`}
              title={`Worked ${fmtDateShort(workedDate(record), 'an off day')}`}
              subtitle={soon ? 'Expiring soon — use it before it lapses.' : null}
              badge={<StatusBadge kind="compoff" status={record.status || 'earned'} dense />}
              // The figures in the strip, the correction card's way (2026-10-22).
              meta={[
                credit != null ? { label: 'Earned', value: `+${formatDayCount(credit, { lower: true })}` } : null,
                expiry ? { label: 'Use by', value: fmtDate(expiry, '') } : null,
              ].filter(Boolean)}
            />
          );
        }}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          list.loading ? (
            <CardsSkeleton rows={4} height={110} />
          ) : status ? (
            <EmptyState
              filtered
              title="Nothing with this status"
              message={`None of your ${TERM.toLowerCase()} days are in this state.`}
              onClearFilter={() => setStatus('')}
            />
          ) : (
            <EmptyState
              icon={icons.earnedLeave}
              title={`No ${TERM.toLowerCase()} yet`}
              message="Work on a holiday or a weekly off to earn a day, if your organisation's policy allows it."
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
              noun="day"
            />
          ) : null
        }
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />

    </>
  );
}

export default EarnedLeaveTab;
