// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/LeaveTab.jsx — My Time › Leave.
//
// Web ancestor: roles/employee/screens/LeaveDashboard.jsx, the sidebar's
// MY TIME → "My Leaves". Balances, the requests, and the way to apply.
//
// ── IT IS A SECTION, NOT A PUSHED SCREEN (2026-10-18) ───────────────────────
//
// Leave used to be the one tile on the strip that navigated away: tap it and
// a native header appeared, the strip vanished, and getting back to
// Corrections took two taps. Every other tile swapped the body in place.
//
// A tile that behaves differently from the seven beside it is a tile people
// stop trusting — and "am I on leave or did my correction land?" is exactly
// the comparison the strip exists to make cheap. So Leave renders here, in
// the body, like everything else. Applying is still a page (see below).
//
// ── THE LIST IS NOT PAGED, AND THAT IS THE API ──────────────────────────────
//
// `/leaves/my-requests` is UNPAGINATED (api/leave.api.js): it returns the
// caller's whole history, newest first, and a `page` param is silently
// dropped. So there is no `usePagedList` here and no ListFooter page count —
// a windowed FlatList over the whole array, which is what that endpoint's own
// docstring asks for. The filter is therefore honest in a way Corrections'
// cannot be (T-T3): every request IS loaded, so a count is a true count.
//
// ── CANCELLING DEPENDS ON THE DATE, NOT THE STATUS ──────────────────────────
//
// `POST /leaves/requests/:id/cancel` takes no body and decides for itself:
//
//   • leave entirely in the future → cancelled now, balance refunded
//   • leave that has started       → `cancellation_pending`, a manager decides
//
// Nothing in the request says which, so the CONFIRM has to say it beforehand
// (wrong wording here is a person believing their leave is cancelled when it
// is still booked) and the toast reads `response.message` afterwards. Both
// branches are spelled out below.
//
// `cancellation_pending` is NOT cancellable again — the backend 400s — so the
// button is gone on those rows, which is §2's rule, not a convenience.
//
// ── APPLYING IS A PAGE (§3) ─────────────────────────────────────────────────
//
// A record being READ is a sheet; a record being WRITTEN is a page. The apply
// form is a type picker, two dates, a half-day switch, a reason and an
// attachment, with a pinned submit — the same shape as CorrectionForm, and
// the same `presentation: 'modal'` route. The way IN floats at the bottom
// (user, 2026-10-21: "put the apply for leave in bottom most as floating btn")
// — it was a full-width button under the wallet, at the top of the screen.
//
// ── THE BALANCE IS A SHEET, AND IT HAS A YEAR (user, 2026-10-21) ───────────
//
// "Year is not coming on leaves page… show the leave balance under bottom
// sheet." The web picks the balance year (this year and the two before —
// LeaveDashboard's YEAR_OPTIONS, ported here); this section only ever asked
// for the current one. The sideways row of wallet cards also took the top
// third of the screen above the requests. Now one summary card — days left
// in total, for the year being looked at — opens a sheet with the year
// chips and a row per leave type.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { leaveAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { leaveErrorMessage } from '../../../lib/errors/leaveErrors';
import { fmtDateShort, isPastYMD, todayYMD, ymdOnly } from '../../../lib/dates';
import { LEAVE_FILTERS, normalizeStatusKey } from '../../../lib/enums';
import { formatDayCount } from '../../../lib/format';
import { entityId, num, toList } from '../../../lib/normalize';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, FLOATING_CLEARANCE, ErrorState, FilterTabs, FloatingAction, RecordSheet, SkeletonBlock,
  StatusBadge, showToast, useConfirm,
} from '../../../ui';
import { LeaveSheet } from './SelfRecordSheets';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';

const statusOf = (req) => normalizeStatusKey(req?.status) || 'pending';

/* Only `pending` and `approved` can be withdrawn. A `cancellation_pending`
   one is already in front of a manager and cancelling it again 400s. */
const CANCELLABLE = new Set(['pending', 'approved']);
const canCancel = (req) => CANCELLABLE.has(statusOf(req)) && !!entityId(req);

const typeName = (req) =>
  req?.leave_type?.name || req?.leave_type_name || req?.type_name || 'Leave';

const startOf = (req) => ymdOnly(req?.start_date || req?.from_date);
const endOf = (req) => ymdOnly(req?.end_date || req?.to_date) || startOf(req);

/** "12 Oct" for one day, "12 Oct – 16 Oct" for a span. */
function spanLabel(req) {
  const from = startOf(req);
  const to = endOf(req);
  if (!from) return 'Leave';
  if (!to || to === from) return fmtDateShort(from, 'Leave');
  return `${fmtDateShort(from, '')} – ${fmtDateShort(to, '')}`;
}

/* Has it started? The same question the BACKEND asks when it decides whether
   cancelling is instant or needs approval — today counts as started. */
const hasStarted = (req) => {
  const from = startOf(req);
  return !!from && (from === todayYMD() || isPastYMD(from));
};

/* ─── The balance year ────────────────────────────────────────────────────────
   Ported from the web LeaveDashboard (`YEAR_OPTIONS`): this year and the two
   before it. A future year has no balance to read yet. */
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

/* "2d and 1/2 d" at a headline size runs out of room (user, 2026-10-20). The
   words stay formatDayCount's — they must match the web exactly — but only
   the whole days are the big figure; the half rides on the small line. */
function splitDays(label, suffix) {
  const [big, ...rest] = String(label).split(' and ');
  return { big, tail: rest.length ? `and ${rest.join(' and ')} ${suffix}` : suffix };
}

/* ─── The summary card ────────────────────────────────────────────────────────
   What is left, in total, for the year being looked at — the one number
   somebody opens Leave to check — and the way into the full balance. */
function BalanceSummary({ year, total, types, loading, onOpen }) {
  const Icon = icons.leave;
  const Chevron = icons.chevronRight;
  const { big, tail } = splitDays(total, 'left');
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Leave balance for ${year}: ${total} left. Open the balance.`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[4],
        borderRadius: radius.xl,
        backgroundColor: pressed ? color.brandChipBg : color.brandSoftBg,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.full,
          backgroundColor: color.brandChipBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? <Icon size={22} color={color.brandChipFg} /> : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[text.label, { color: color.brandSoftFg }]}>{`Leave balance · ${year}`}</Text>
        {loading ? (
          <SkeletonBlock height={28} width="50%" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
            <Text style={[text.metricLg, { fontSize: 26, lineHeight: 30, color: color.brand }]}>{big}</Text>
            <Text numberOfLines={1} style={[text.caption, { marginBottom: 4, flexShrink: 1 }]}>
              {types > 0 ? `${tail} · ${types} ${types === 1 ? 'type' : 'types'}` : tail}
            </Text>
          </View>
        )}
      </View>

      {Chevron ? <Chevron size={18} color={color.brandSoftFg} /> : null}
    </Pressable>
  );
}

/* ─── One leave type, in the sheet ────────────────────────────────────────────
   Days left on the right, big and purple; given and used under the name. The
   leave type's CODE ("ECL_2026") is deliberately absent — it is HR's handle on
   a policy and means nothing to the person whose days these are (web audit
   E-20). */
function BalanceRow({ balance, last }) {
  const Icon = icons.leave;
  const { big, tail } = splitDays(balance.left, 'left');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: color.borderSubtle,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.full,
          backgroundColor: color.brandChipBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? <Icon size={18} color={color.brandChipFg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={text.bodyStrong}>{balance.name}</Text>
        <Text numberOfLines={1} style={text.caption}>{`${balance.given} given · ${balance.used} used`}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[text.h2, { color: color.brand, fontVariant: ['tabular-nums'] }]}>{big}</Text>
        <Text numberOfLines={1} style={[text.caption, { fontSize: 10 }]}>{tail}</Text>
      </View>
    </View>
  );
}

/* ─── The balance sheet ───────────────────────────────────────────────────────
   The year chips, then one row per leave type, in the policy's own order. A
   type with no days configured is still listed: "0d left" is an answer, and
   its absence reads as a missing policy. */
function BalanceSheet({ year, onYear, wallet, loading, error, onRetry, onClose }) {
  const years = YEAR_OPTIONS.map((y) => ({ value: y, label: String(y) }));
  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Leave balance"
      icon={icons.leave}
      title={`Your leave in ${year}`}
    >
      <View style={{ gap: space[3] }}>
        <FilterTabs options={years} value={year} onChange={onYear} />

        {error && wallet.length === 0 ? (
          <ErrorState error={error} domain="leave" onRetry={onRetry} fallback="We couldn’t load your leave balance." />
        ) : loading && wallet.length === 0 ? (
          <View style={{ gap: space[2] }}>
            <SkeletonBlock height={60} radius={radius.lg} />
            <SkeletonBlock height={60} radius={radius.lg} />
          </View>
        ) : wallet.length === 0 ? (
          <EmptyState
            icon={icons.leave}
            title="No leave balance"
            message={`Nothing was set up for you in ${year}.`}
          />
        ) : (
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: radius.lg,
              paddingHorizontal: space[4],
              opacity: loading ? 0.6 : 1,
            }}
          >
            {wallet.map((b, i) => <BalanceRow key={b.key} balance={b} last={i === wallet.length - 1} />)}
          </View>
        )}
      </View>
    </RecordSheet>
  );
}

export function LeaveTab({ onApply }) {
  const confirm = useConfirm();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [balanceOpen, setBalanceOpen] = useState(false);

  const balances = useResource(() => leaveAPI.getMyBalances(year), {
    select: (data) => toList(data, ['balances', 'leave_balances']),
    initial: [],
    deps: [year],
  });

  const requests = useResource(() => leaveAPI.getMyRequests(), {
    select: (data) => toList(data, ['requests', 'leave_requests', 'leaves']),
    initial: [],
  });

  /* The wallet, one row per leave type, in whatever order the policy lists
     them. */
  const wallet = useMemo(() => (balances.data || []).map((b, i) => ({
    key: String(b?.id || b?.leave_type_id || i),
    name: b?.leave_type?.name || b?.leave_type_name || 'Leave',
    left: formatDayCount(b?.current_balance, { fallback: '0d' }),
    given: formatDayCount(b?.total_accrued, { lower: true, fallback: '0d' }),
    used: formatDayCount(b?.total_used, { lower: true, fallback: '0d' }),
  })), [balances.data]);

  // Days left across every type — the summary card's one number.
  const totalLeft = useMemo(() => formatDayCount(
    (balances.data || []).reduce((t, b) => t + num(b?.current_balance, 0), 0),
    { fallback: '0d' },
  ), [balances.data]);

  // Its own memo: an inline `requests.data || []` is a new array on every
  // render, which makes the two memos below depend on something that always
  // changes and quietly stops them memoising anything.
  const rows = useMemo(() => requests.data || [], [requests.data]);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => statusOf(r) === filter)),
    [rows, filter],
  );

  // Counts in the labels — the house pattern, and here they are exact,
  // because the endpoint hands over the whole history at once.
  const options = useMemo(() => LEAVE_FILTERS.map((f) => ({
    ...f,
    count: f.value === 'all' ? rows.length : rows.filter((r) => statusOf(r) === f.value).length,
  })).filter((f) => f.value === 'all' || f.count > 0), [rows]);

  const { reload: reloadRequests } = requests;
  const { reload: reloadBalances } = balances;

  // Applying happens on a MODAL ROUTE over this list, so nothing here knows
  // it happened. The form emits, both reads run, and the wallet is right the
  // moment the form closes.
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.LEAVE, ATTENDANCE_EVENTS.COMPOFF],
    useCallback(() => { reloadRequests(); reloadBalances(); }, [reloadRequests, reloadBalances]),
  );
  const { refreshControl } = useListRefresh(
    useCallback(() => { reloadRequests(); reloadBalances(); }, [reloadRequests, reloadBalances]),
    requests.loading || balances.loading,
  );

  const cancelRequest = useCallback(async (req) => {
    const id = entityId(req);
    if (!id || cancelling) return;
    const when = spanLabel(req);
    const started = hasStarted(req);

    const ok = await confirm({
      title: started ? 'Ask to cancel this leave?' : 'Cancel this leave?',
      message: started
        ? `This leave has already started, so cancelling asks your manager to approve it. Your balance comes back only once they do.`
        : `Your leave for ${when} will be cancelled now and the days go back into your balance.`,
      confirmText: started ? 'Ask to cancel' : 'Cancel it',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;

    setCancelling(id);
    try {
      // THE SERVER DECIDED, NOT US. `message` is the only place it says which
      // of the two things happened, so the toast is read off the response
      // rather than off `started` — a leave that began an hour ago while this
      // list was open would otherwise be reported wrongly.
      const res = await leaveAPI.cancelRequest(id);
      const msg = String(res?.message || '');
      if (/pending/i.test(msg)) {
        showToast('Asked to cancel — your manager has to approve it.', 'info');
      } else {
        showToast(`Cancelled your leave for ${when}.`, 'success');
      }
    } catch (err) {
      showToast(leaveErrorMessage(err, 'We couldn’t cancel that leave.'), 'error');
    } finally {
      setCancelling(null);
      // Both ways: a refund changes the wallet, and a failure usually means
      // somebody decided it while this was open.
      reloadRequests();
      reloadBalances();
    }
  }, [cancelling, confirm, reloadRequests, reloadBalances]);

  const filterLabel = (LEAVE_FILTERS.find((f) => f.value === filter)?.label || filter).toLowerCase();

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[1] }}>
      <BalanceSummary
        year={year}
        total={totalLeft}
        types={wallet.length}
        loading={balances.loading && wallet.length === 0}
        onOpen={() => setBalanceOpen(true)}
      />

      {rows.length > 0 ? (
        <FilterTabs options={options} value={filter} onChange={setFilter} />
      ) : null}
    </View>
  );

  const fab = <FloatingAction title="Apply for leave" icon={icons.add} onPress={onApply} />;

  const sheet = balanceOpen ? (
    <BalanceSheet
      year={year}
      onYear={setYear}
      wallet={wallet}
      loading={balances.loading}
      error={balances.error}
      onRetry={reloadBalances}
      onClose={() => setBalanceOpen(false)}
    />
  ) : null;

  if (requests.error && rows.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: space[4], gap: space[3] }}>
          {header}
          <ErrorState
            error={requests.error}
            domain="leave"
            onRetry={requests.reload}
            fallback="We couldn’t load your leave."
          />
        </View>
        {fab}
        {sheet}
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={visible}
        keyExtractor={(req, i) => String(entityId(req) || `${startOf(req)}-${i}`)}
        ListHeaderComponent={header}
        renderItem={({ item: req }) => {
          const days = num(req?.total_days, 0);
          const unpaid = num(req?.unpaid_days, 0);
          return (
            <RecordCard
              icon={icons.leave}
              tone="purple"
              onPress={() => setSelected(req)}
              accessibilityLabel="this leave request"
              title={typeName(req)}
              // The dates, not the reason: "which leave was that?" is answered
              // by when it is, and the type is already the title.
              subtitle={spanLabel(req)}
              badge={<StatusBadge kind="leave" status={req?.status || 'pending'} dense />}
              meta={[
                days > 0 ? { label: 'Days', value: formatDayCount(days) } : null,
                // Only when there ARE unpaid days. A "0 unpaid" line on every
                // card is noise; on the one card it matters, it is the thing
                // somebody needs to see before payday, not after.
                unpaid > 0 ? { label: 'Unpaid', value: formatDayCount(unpaid) } : null,
              ].filter(Boolean)}
              action={canCancel(req) ? (
                <Button
                  title={hasStarted(req) ? 'Ask to cancel' : 'Cancel'}
                  size="sm"
                  variant="ghost"
                  onPress={() => cancelRequest(req)}
                  loading={cancelling === entityId(req)}
                  disabled={!!cancelling && cancelling !== entityId(req)}
                  disabledReason="Finishing the other one first."
                />
              ) : null}
            />
          );
        }}
        ListEmptyComponent={
          requests.loading ? (
            <CardsSkeleton rows={3} height={96} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={icons.leave}
              title="No leave yet"
              message="Apply for leave and it shows up here with your manager’s decision."
            />
          ) : (
            <EmptyState
              filtered
              title={`Nothing ${filterLabel}`}
              message={`None of your leave is ${filterLabel}.`}
              onClearFilter={() => setFilter('all')}
            />
          )
        }
        contentContainerStyle={[cardListStyle, { paddingBottom: FLOATING_CLEARANCE }]}
        refreshControl={refreshControl}
      />

      {fab}
      {sheet}
      {selected ? <LeaveSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default LeaveTab;
