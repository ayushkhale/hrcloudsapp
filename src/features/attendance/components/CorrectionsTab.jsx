// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/CorrectionsTab.jsx — My Time › Corrections.
//
// "That day is recorded wrongly — here's what actually happened." The requests
// this person has raised, their state, and the way to raise a new one.
//
// ── THE WORD IS "CORRECTION", NEVER "REGULARIZATION" ─────────────────────────
//
// The API says `regularization` and the person never sees that word. It
// survives in the function names and the event kind, which is where it
// belongs: in the wire, not on the screen.
//
// ── T-T3 · THE SERVER VALIDATES `status` AND THEN IGNORES IT ─────────────────
//
// Contract §4.4 / §8.4. Passing it gets the FULL list back and a filter that
// looks broken. So the list is fetched unfiltered and the filter narrows what
// has loaded — and the empty state says so when there is more than one page,
// because "Nothing waiting" is a different claim from "nothing waiting on this
// page".
//
// ── CANCEL IS UNDER A DIVIDER, NOT ON THE CARD ───────────────────────────────
//
// §3's rule is "keep real actions, drop View". Cancel is a real action — and
// the only one in this whole screen — so it stays. On a CARD it goes in the
// footer strip under a hairline (RecordCard's `action`), which is what keeps
// the card itself one tap target: the body opens the request, the button
// withdraws it, and the thumb can tell them apart. Only while the request is
// still pending; an approved or declined one has nothing to do.
//
// ── T-T4 · NEVER THE REQUEST ID ──────────────────────────────────────────────
//
// Not on the card, not in the sheet, not in the cancel toast. The date and the
// reason identify it to a human.
//
// ── WHY CANCEL ASKS A QUESTION AND NOT A REASON ──────────────────────────────
//
// 03-time.md §6 specifies a `ReasonPrompt` with a required reason. The
// endpoint TAKES NO BODY (`POST /attendance/regularizations/:id/cancel`, see
// api/attendance.api.js), so a reason typed here would be collected, sent
// nowhere and discarded — which is worse than not asking, because the person
// believes their manager will read it. It is a `useConfirm` until the backend
// accepts one; the moment it does, this becomes a ReasonPrompt and the only
// change is which component is mounted.
//
// ── "REQUEST A CORRECTION" FLOATS (user, 2026-10-21) ────────────────────────
//
// It was a full-width button at the top of the list; it is a FloatingAction
// at the bottom, where a thumb is. And the list now hears its own form: the
// form emits REGULARIZATION on submit, but nothing here listened, so a new
// request did not appear until the section was reopened. It also reloads
// on pull and on return (hooks/useListRefresh.js).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { usePagedList } from '../../../hooks/usePagedList';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from '../../../lib/events';
import { attendanceErrorMessage } from '../../../lib/errors/attendanceErrors';
import { fmtDate, fmtDateShort, fmtTime, ymdOnly } from '../../../lib/dates';
import { REGULARIZATION_FILTERS } from '../../../lib/enums';
import { entityId } from '../../../lib/normalize';
import { space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, FLOATING_CLEARANCE, FilterTabs, FloatingAction, ListFooter, StatusBadge,
  showToast, useConfirm,
} from '../../../ui';
import { CorrectionSheet } from './SelfRecordSheets';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';

const statusOf = (req) => String(req?.status || 'pending').toLowerCase();
const canCancel = (req) => statusOf(req) === 'pending' && !!entityId(req);

/* The times ASKED FOR — one side only is a valid request (the schema is
   `.or(requested_clock_in, requested_clock_out)`). */
const askedIn = (req) => fmtTime(req?.requested_clock_in, '');
const askedOut = (req) => fmtTime(req?.requested_clock_out, '');

/** @param {{ onNewRequest: Function }} props */
export function CorrectionsTab({ onNewRequest }) {
  const confirm = useConfirm();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  // The id of the row being withdrawn — every Cancel button is blocked while
  // one is in flight, so a second tap can't race the first.
  const [cancelling, setCancelling] = useState(null);

  // Unfiltered on purpose — see T-T3 in the header.
  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyRegularizations({ page, limit }),
    { limit: 20, keys: ['requests'], accumulate: true },
  );

  const visible = useMemo(
    () => (filter === 'all' ? list.items : list.items.filter((r) => statusOf(r) === filter)),
    [list.items, filter],
  );

  // Counts go in the labels — the house pattern, and the only place they can
  // go without making the strip taller (ui/FilterTabs.jsx rule 1).
  const options = useMemo(() => REGULARIZATION_FILTERS.map((f) => ({
    ...f,
    count: f.value === 'all' ? list.items.length : list.items.filter((r) => statusOf(r) === f.value).length,
  })), [list.items]);

  const { reload } = list;
  useAttendanceChanged([ATTENDANCE_EVENTS.REGULARIZATION], reload);
  const { refreshControl } = useListRefresh(reload, list.loading);

  const cancelRequest = useCallback(async (req) => {
    const id = entityId(req);
    if (!id || cancelling) return;
    const day = fmtDate(ymdOnly(req.date), 'that day');

    const ok = await confirm({
      title: 'Cancel this correction request?',
      message: `Your manager won’t see your request for ${day} any more. You can ask again later.`,
      confirmText: 'Withdraw it',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;

    setCancelling(id);
    try {
      await attendanceAPI.cancelRegularization(id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.REGULARIZATION, { action: 'cancel' });
      // The day identifies it, never the id (T-T4).
      showToast(`Withdrew your correction for ${day}.`, 'success');
    } catch (err) {
      showToast(attendanceErrorMessage(err, 'We couldn’t withdraw the request.'), 'error');
    } finally {
      setCancelling(null);
      // Reload either way: an ALREADY_PROCESSED failure means somebody decided
      // it while this was open, and the card on screen is now wrong.
      reload();
    }
  }, [cancelling, confirm, reload]);

  const filterLabel = (REGULARIZATION_FILTERS.find((f) => f.value === filter)?.label || filter).toLowerCase();

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[1] }}>
      <FilterTabs options={options} value={filter} onChange={setFilter} />
    </View>
  );

  const fab = (
    <FloatingAction title="Request a correction" icon={icons.add} onPress={() => onNewRequest?.()} />
  );

  if (list.error && list.items.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: space[4], gap: space[3] }}>
          {header}
          <ErrorState
            error={list.error}
            domain="attendance"
            onRetry={list.reload}
            fallback="We couldn’t load your corrections."
          />
        </View>
        {fab}
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={visible}
        keyExtractor={(req, i) => String(entityId(req) || `${req.date}-${req.created_at}` || i)}
        ListHeaderComponent={header}
        renderItem={({ item: req }) => {
          const inAt = askedIn(req);
          const outAt = askedOut(req);
          return (
            <RecordCard
              icon={icons.edit}
              tone="purple"
              onPress={() => setSelected(req)}
              accessibilityLabel="this correction"
              title={fmtDateShort(ymdOnly(req.date), 'That day')}
              // The reason, not the times: "Marked absent — I was working
              // remote" is what tells somebody which request this is.
              subtitle={req.reason || null}
              badge={<StatusBadge kind="regularization" status={req.status || 'pending'} dense />}
              meta={[
                inAt ? { label: 'Clock in', value: inAt } : null,
                outAt ? { label: 'Clock out', value: outAt } : null,
              ].filter(Boolean)}
              action={canCancel(req) ? (
                <Button
                  title="Withdraw"
                  size="sm"
                  variant="ghost"
                  onPress={() => cancelRequest(req)}
                  loading={cancelling === entityId(req)}
                  // Disabled only for what a press cannot fix: another
                  // withdrawal is already in flight (Button rule 2).
                  disabled={!!cancelling && cancelling !== entityId(req)}
                  disabledReason="Finishing the other withdrawal first."
                />
              ) : null}
            />
          );
        }}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          list.loading ? (
            <CardsSkeleton rows={4} height={96} />
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={icons.edit}
              title="No corrections yet"
              message="If a day is recorded wrongly, request a correction and your manager reviews it."
            />
          ) : (
            // A DIFFERENT message, with the filter still on screen so the
            // person can see why the list is empty (ui/EmptyState.jsx rule 2).
            <EmptyState
              filtered
              title={`Nothing ${filterLabel}`}
              message={
                list.page < list.totalPages
                  ? `No ${filterLabel} requests in what has loaded so far. Scroll down to load more.`
                  : `None of your requests are ${filterLabel}.`
              }
              onClearFilter={() => setFilter('all')}
            />
          )
        }
        ListFooterComponent={
          visible.length > 0 ? (
            <ListFooter
              page={list.page}
              totalPages={list.totalPages}
              total={filter === 'all' ? list.total : visible.length}
              loading={list.loading}
              noun="request"
            />
          ) : null
        }
        contentContainerStyle={[cardListStyle, { paddingBottom: FLOATING_CLEARANCE }]}
        refreshControl={refreshControl}
      />

      {fab}

      {selected ? <CorrectionSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default CorrectionsTab;
