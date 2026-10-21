// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/ExtrasTab.jsx — My Pay › Extras.
//
// Bonuses and one-off adjustments: everything that reached a payslip without
// being part of the monthly salary.
//
// ── "EXTRAS", NOT "VARIABLE PAY" ────────────────────────────────────────────
//
// The web calls this Variable Pay, which names the ledger the money came out
// of rather than the thing itself. Nobody says "I got some variable pay".
// 30-domain/01-wording.md §2.
//
// ── TWO ENDPOINTS, ONE LIST ─────────────────────────────────────────────────
//
// `/me/bonuses` and `/me/adjustments` are separate reads that answer the same
// question. Two tabs for them would make the person check both to find one
// payment, so they are merged and sorted by period, newest first, with the
// kind on the card. Each read has its OWN error state: one failing must not
// blank the other (CLAUDE.md §6).
//
// ── AN ADJUSTMENT CAN BE A DEDUCTION ────────────────────────────────────────
//
// A bonus is always money in. An adjustment is either way — a recovery, a
// correction of an overpayment. The sign is carried by the WORD ("Taken off"
// vs "Added"), never by a minus in front of the amount, because a negative in
// a list of positives reads as a typo.
//
// ── LEAVE PAYOUTS LIVE HERE TOO (2026-10-20) ────────────────────────────────
//
// `/me/encashments` (#218) is leave turned into money, paid with a payroll —
// the same question again ("what reached my payslip outside my salary"). The
// web keeps it under Loans & Advances; here it is a third read in the same
// list, with its own failure line, named by `TERMS.ENCASHMENT` ("Leave
// Payout", never "encashment" — wording §2).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { TERMS } from '../../../config/dictionary';
import { useResource } from '../../../hooks/useResource';
import { humanize } from '../../../lib/enums';
import { formatDayCount, formatPeriod } from '../../../lib/format';
import { formatPay } from '../../../lib/payPrivacy';
import { toList } from '../../../lib/normalize';
import { space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, InlineAlert, StatusBadge } from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { encashSourceLabel, extraAmount, extraTitle, isExtraDeduction } from '../payMeta';

const periodOf = (x) => x?.period_month || x?.applies_to_period || '';

export function ExtrasTab() {
  const bonuses = useResource(() => payrollAPI.getMyBonuses(), {
    select: (data) => toList(data, ['bonuses', 'records']),
    initial: [],
  });
  const adjustments = useResource(() => payrollAPI.getMyAdjustments(), {
    select: (data) => toList(data, ['adjustments', 'records']),
    initial: [],
  });

  const payouts = useResource(() => payrollAPI.getMyEncashments(), {
    select: (data) => toList(data, ['encashments', 'records']),
    initial: [],
  });

  const rows = useMemo(() => {
    const all = [
      ...(bonuses.data || []).map((b) => ({ raw: b, kind: 'bonus' })),
      ...(adjustments.data || []).map((a) => ({ raw: a, kind: 'adjustment' })),
      ...(payouts.data || []).map((p) => ({ raw: p, kind: 'payout' })),
    ];
    // Newest period first; no period sorts last rather than first, because an
    // undated row at the top reads as the most recent one.
    return all.sort((a, z) => String(periodOf(z.raw)).localeCompare(String(periodOf(a.raw))));
  }, [bonuses.data, adjustments.data, payouts.data]);

  const loading = (bonuses.loading && !bonuses.data?.length)
    || (adjustments.loading && !adjustments.data?.length)
    || (payouts.loading && !payouts.data?.length);

  const { refreshControl } = useListRefresh(
    () => { bonuses.reload(); adjustments.reload(); payouts.reload(); },
    bonuses.loading || adjustments.loading || payouts.loading,
  );

  // All failed: there is nothing to show, so the failure IS the content.
  if (bonuses.error && adjustments.error && payouts.error) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={bonuses.error}
          domain="payroll"
          onRetry={() => { bonuses.reload(); adjustments.reload(); payouts.reload(); }}
          fallback="We couldn’t load your bonuses and adjustments."
        />
      </View>
    );
  }

  if (loading && rows.length === 0) return <CardsSkeleton rows={3} height={84} />;

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      {/* One side failed. The other side's rows are real and stay on screen;
          the gap is named rather than hidden. */}
      {bonuses.error && !adjustments.error ? (
        <InlineAlert tone="amber">We couldn’t load your bonuses. Adjustments are shown.</InlineAlert>
      ) : null}
      {adjustments.error && !bonuses.error ? (
        <InlineAlert tone="amber">We couldn’t load your adjustments. Bonuses are shown.</InlineAlert>
      ) : null}
      {payouts.error && !(bonuses.error && adjustments.error) ? (
        <InlineAlert tone="amber">{`We couldn’t load your ${TERMS.ENCASHMENT.toLowerCase()}s. The rest are shown.`}</InlineAlert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={icons.up}
          title="Nothing extra yet"
          message={`Bonuses, one-off adjustments and ${TERMS.ENCASHMENT.toLowerCase()}s appear here once your employer has added them.`}
        />
      ) : (
        rows.map(({ raw, kind }, i) => {
          if (kind === 'payout') {
            return (
              <RecordCard
                key={`payout-${raw.id || i}`}
                icon={icons.switch}
                tone="purple"
                title={TERMS.ENCASHMENT}
                subtitle={encashSourceLabel(raw, TERMS.COMP_OFF)}
                value={formatPay(raw.amount)}
                badge={<StatusBadge kind="extra" status={raw.status} />}
                meta={[
                  { label: 'Leave', value: formatDayCount(raw.days) },
                  raw.per_day_amount != null ? { label: 'Per day', value: formatPay(raw.per_day_amount) } : null,
                  periodOf(raw) ? { label: 'With', value: formatPeriod(periodOf(raw)) } : null,
                ].filter(Boolean)}
              />
            );
          }
          const off = kind === 'adjustment' && isExtraDeduction(raw);
          return (
            <RecordCard
              key={`${kind}-${raw.id || i}`}
              icon={off ? icons.down : icons.up}
              tone={off ? 'rose' : 'emerald'}
              title={extraTitle(raw)}
              subtitle={off ? 'Taken off your pay' : kind === 'bonus' ? 'Bonus' : 'Added to your pay'}
              value={formatPay(extraAmount(raw))}
              badge={<StatusBadge kind="extra" status={raw.status} />}
              meta={[
                periodOf(raw) ? { label: 'With', value: formatPeriod(periodOf(raw)) } : null,
                raw.category ? { label: 'Kind', value: humanize(raw.category) } : null,
              ].filter(Boolean)}
            />
          );
        })
      )}
    </ScrollView>
  );
}

export default ExtrasTab;
