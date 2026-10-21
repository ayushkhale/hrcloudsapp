// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/FlagsTab.jsx — My Time › Flags.
//
// Things the system noticed about this person's attendance: a missing punch, a
// punch from outside a work location, a work-mode claim the contract doesn't
// allow. NOT ACCUSATIONS — things to explain or put right.
//
// ── T-T7 · THE WORD IS "FLAGS", AND EACH FLAG IS A SENTENCE ──────────────────
//
// Internally the API calls these anomalies. Nobody sees that word, and nobody
// sees `missing_punch_out` or "Anomaly #4" either: `anomalyLabel()` turns the
// code into English, and a code that isn't in the map is `humanize()`d rather
// than printed raw (§4).
//
// ── THIS ONE ENDPOINT DOES HONOUR ITS FILTER ─────────────────────────────────
//
// Unlike corrections (T-T3), `/attendance/anomalies/mine` takes
// `status=open|resolved|all` and applies it — so the filter is a REFETCH here
// and a client-side narrowing there. `filterKey` on usePagedList resets to
// page 1 whenever it changes, which is what stops page 3 of "All" being shown
// as page 3 of a one-page "Open".
//
// Records carry `is_resolved`, NOT a status string (contract §2 C16), so the
// badge reads through `anomalyStatusKey()` and never off `record.status`.
//
// ── AN OPEN FLAG LOOKS DIFFERENT (2026-10-17) ────────────────────────────────
//
// Open flags carry `highlight` — a tinted card rather than a white one. It is
// the one place in My Time a card changes colour, and it earns it: this is the
// only list whose rows are asking the person for something.
//
// ── THE EMPTY STATE IS THE GOOD NEWS ─────────────────────────────────────────
//
// "Nothing flagged. Your attendance looks clean." A blank list after a search
// for problems should say that it found none, not sit there looking broken.
//
// ── NO ACTION ON A CARD (§6) ─────────────────────────────────────────────────
//
// A flag is put right by requesting a correction, which the sheet's footer
// note says. If the server ever offers an acknowledge/explain action it goes
// in the sheet's footer, never on the card.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { FlatList, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { usePagedList } from '../../../hooks/usePagedList';
import { fmtDateShort, ymdOnly } from '../../../lib/dates';
import { ANOMALY_FILTERS, anomalyLabel, anomalyStatusKey, anomalyTypeLabel } from '../../../lib/enums';
import { space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  EmptyState, ErrorState, FieldHelp, FilterTabs, ListFooter, StatusBadge,
} from '../../../ui';
import { FlagSheet } from './SelfRecordSheets';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';

const flagDate = (a) => ymdOnly(a?.date || a?.record_date || a?.created_at);
const isOpen = (a) => anomalyStatusKey(a) === 'open';

export function FlagsTab() {
  // Open first: the ones that still want something are the reason to be here.
  const [status, setStatus] = useState('open');
  const [selected, setSelected] = useState(null);

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyAnomalies({ status, page, limit }),
    { limit: 20, keys: ['anomalies', 'records'], filterKey: status, accumulate: true },
  );

  const { refreshControl } = useListRefresh(list.reload, list.loading);

  /* ── NO "STILL OPEN / SORTED OUT" CARDS HERE (2026-10-18) ─────────────────
     There were two StatCards above the filter and they were wrong three ways
     at once, which is why the tab jumped every time somebody changed the
     filter (user report):

       1. they counted `list.items` — the LOADED PAGE OF THE CURRENT FILTER —
          so on "Open" the Sorted-out card read 0, and on "Sorted out" the
          Open card read 0. Never a total, always an artefact of the filter;
       2. they were hidden while the list was empty, so the filter strip slid
          up and back down on every change;
       3. the open count is ALREADY on the Flags tile as a badge, from
          `useOpenFlagCount()` — a real filter-independent read.

     A number that restates the filter you just set is not information. The
     header is the filter alone now, and it never moves. */
  const header = (
    <View style={{ paddingBottom: space[1] }}>
      {/* The ⓘ sits BESIDE the strip, never inside it: a tablist may not
          contain another interactive element (ui/FilterTabs.jsx rule 3).
          A flag TYPE qualifies for help because the set is ours — we invented
          it — which is not the "routine queue status" §10 rules out. */}
      <FilterTabs
        options={ANOMALY_FILTERS}
        value={status}
        onChange={setStatus}
        help={<FieldHelp surface="attendance.anomalies" field="type" />}
      />
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
          fallback="We couldn’t load your attendance flags."
        />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={list.items}
        keyExtractor={(a, i) => String(a.id || `${flagDate(a)}-${a.type}-${i}`)}
        ListHeaderComponent={header}
        renderItem={({ item: flag }) => (
          <RecordCard
            icon={icons.flag}
            tone={isOpen(flag) ? 'rose' : 'slate'}
            highlight={isOpen(flag)}
            onPress={() => setSelected(flag)}
            accessibilityLabel="this flag"
            title={anomalyTypeLabel(flag?.type)}
            // The flag itself, as a sentence (T-T7).
            subtitle={anomalyLabel(flag)}
            badge={<StatusBadge kind="anomaly" status={anomalyStatusKey(flag)} dense />}
            meta={[{ label: 'On', value: fmtDateShort(flagDate(flag), 'That day') }]}
          />
        )}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          list.loading ? (
            <CardsSkeleton rows={4} height={110} />
          ) : status === 'open' ? (
            <EmptyState
              icon={icons.ok}
              title="Nothing flagged"
              message="Your attendance looks clean."
            />
          ) : (
            <EmptyState
              filtered
              title={status === 'resolved' ? 'Nothing sorted out yet' : 'No flags'}
              message={
                status === 'resolved'
                  ? 'None of your flags have been closed off.'
                  : 'The system hasn’t flagged anything on your attendance.'
              }
              onClearFilter={status === 'all' ? undefined : () => setStatus('all')}
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
              noun="flag"
            />
          ) : null
        }
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />

      {selected ? <FlagSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default FlagsTab;
