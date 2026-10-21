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
// the same `presentation: 'modal'` route.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { leaveAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { leaveErrorMessage } from '../../../lib/errors/leaveErrors';
import { fmtDateShort, isPastYMD, todayYMD, ymdOnly } from '../../../lib/dates';
import { LEAVE_FILTERS, normalizeStatusKey } from '../../../lib/enums';
import { formatDayCount } from '../../../lib/format';
import { entityId, num, toList } from '../../../lib/normalize';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, FilterTabs, SkeletonBlock, StatusBadge, showToast, useConfirm,
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

/* ─── One leave type's wallet ─────────────────────────────────────────────────
   Days left, big; given and used underneath, small. The leave type's CODE
   ("ECL_2026") is deliberately absent — it is HR's handle on a policy and
   means nothing to the person whose days these are (web audit E-20). */
function BalanceCard({ balance }) {
  const Icon = icons.leave;
  return (
    <View
      style={{
        width: 150,
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        padding: space[3],
        gap: space[2],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: radius.sm,
            backgroundColor: color.brandChipBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Icon ? <Icon size={14} color={color.brandChipFg} /> : null}
        </View>
        <Text numberOfLines={1} style={[text.caption, { flex: 1, minWidth: 0 }]}>
          {balance.name}
        </Text>
      </View>

      {/* "2d and 1/2 d" at 22pt is wider than the card (user, 2026-10-20). The
          words stay formatDayCount's — they must match the web exactly — but
          only the whole days are the big figure; the half rides on the small
          line with "left", so nothing can run out of the card. */}
      {(() => {
        const [big, ...rest] = String(balance.left).split(' and ');
        const tail = rest.length ? `and ${rest.join(' and ')} left` : 'left';
        return (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[text.metricLg, { fontSize: 24, lineHeight: 28, color: color.ink, flexShrink: 1 }]}
            >
              {big}
            </Text>
            <Text numberOfLines={1} style={[text.caption, { marginBottom: 4, flexShrink: 1 }]}>{tail}</Text>
          </View>
        );
      })()}

      <Text numberOfLines={1} style={[text.caption, { fontSize: 10, color: color.textMuted }]}>
        {`${balance.given} given · ${balance.used} used`}
      </Text>
    </View>
  );
}

export function LeaveTab({ onApply }) {
  const confirm = useConfirm();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const year = new Date().getFullYear();
  const balances = useResource(() => leaveAPI.getMyBalances(year), {
    select: (data) => toList(data, ['balances', 'leave_balances']),
    initial: [],
    deps: [year],
  });

  const requests = useResource(() => leaveAPI.getMyRequests(), {
    select: (data) => toList(data, ['requests', 'leave_requests', 'leaves']),
    initial: [],
  });

  /* The wallet, one tile per leave type, in whatever order the policy lists
     them. A type with no days configured at all is still shown: "0 left" is
     an answer, and its absence reads as a missing policy. */
  const wallet = useMemo(() => (balances.data || []).map((b, i) => ({
    key: String(b?.id || b?.leave_type_id || i),
    name: b?.leave_type?.name || b?.leave_type_name || 'Leave',
    left: formatDayCount(b?.current_balance, { fallback: '0d' }),
    given: formatDayCount(b?.total_accrued, { lower: true, fallback: '0d' }),
    used: formatDayCount(b?.total_used, { lower: true, fallback: '0d' }),
  })), [balances.data]);

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
      {/* The wallet scrolls sideways because the number of leave types is the
          organisation's decision, not ours — two on one policy, seven on
          another — and a wrapped grid of seven would push the requests off a
          phone entirely. */}
      {balances.loading && wallet.length === 0 ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <SkeletonBlock height={92} width={150} radius={radius.lg} />
          <SkeletonBlock height={92} width={150} radius={radius.lg} />
        </View>
      ) : wallet.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingRight: space[1] }}
        >
          {wallet.map((b) => <BalanceCard key={b.key} balance={b} />)}
        </ScrollView>
      ) : null}

      <Button title="Apply for leave" onPress={onApply} icon={icons.add} fullWidth />

      {rows.length > 0 ? (
        <FilterTabs options={options} value={filter} onChange={setFilter} />
      ) : null}
    </View>
  );

  if (requests.error && rows.length === 0) {
    return (
      <View style={{ padding: space[4], gap: space[3] }}>
        <ErrorState
          error={requests.error}
          domain="leave"
          onRetry={requests.reload}
          fallback="We couldn’t load your leave."
        />
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
        contentContainerStyle={cardListStyle}
      />

      {selected ? <LeaveSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default LeaveTab;
