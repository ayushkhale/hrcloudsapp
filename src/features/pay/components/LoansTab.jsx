// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/LoansTab.jsx — My Pay › Loans.
//
// Company loans and salary advances, and what is left to repay on each.
//
// ── "STILL TO REPAY" IS THE HEADLINE, NOT "BORROWED" ────────────────────────
//
// Nobody opens this to be reminded what they borrowed. The card's value is the
// outstanding balance and the meta line is the monthly repayment — "how much
// longer, and how much a month". The principal is in the sheet.
//
// `outstanding()` reads three spellings of the same field, exactly as the web
// does (MyLoansAndAdvancesPage.jsx), because this payload has carried all
// three.
//
// ── THE SCHEDULE IS FETCHED WHEN THE SHEET OPENS, NOT PER ROW ───────────────
//
// One request per loan row would be N requests for a list nobody has opened.
// The sheet opens immediately with what the row already knows and fills the
// schedule underneath it — a skeleton inside an open sheet, never a spinner
// between the tap and the sheet.
//
// ── A PENDING LOAN HAS NO SCHEDULE, AND THAT IS NOT AN ERROR ────────────────
//
// It is created on approval. The empty state says so rather than reading as a
// failed load.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { humanize, normalizeStatusKey } from '../../../lib/enums';
import { formatMoney, formatPeriod } from '../../../lib/format';
import { toList } from '../../../lib/normalize';
import { space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  EmptyState, ErrorState, RecordSheet, SheetGrid, SheetSection, SheetStats, SheetTable,
  StatusBadge,
} from '../../../ui';
import { CardsSkeleton, RecordCard, StatCards, cardListStyle } from '../../../ui/ListCards';
import { loanTitle, num, outstanding } from '../payMeta';

const INTEREST_METHOD = {
  flat: 'A flat rate on what you borrowed',
  reducing: 'On what is still owed, so it falls each month',
  none: 'Interest free',
};

/* ─── One loan ───────────────────────────────────────────────────────────── */

function LoanSheet({ loan, onClose }) {
  const [schedule, setSchedule] = useState({ rows: [], loading: true, failed: false });

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getMyLoanInstallments(loan.id)
      .then((res) => {
        if (!cancelled) setSchedule({ rows: toList(res?.data ?? res, ['installments', 'records']), loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setSchedule({ rows: [], loading: false, failed: true });
      });
    return () => { cancelled = true; };
  }, [loan.id]);

  const pending = normalizeStatusKey(loan.status) === 'pending';

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Loan"
      icon={icons.cash}
      title={loanTitle(loan)}
      subtitle={`First payment ${formatPeriod(loan.start_period_month)} · ${loan.tenure_months ?? 0} months`}
      badge={<StatusBadge kind="loan" status={loan.status} />}
    >
      <SheetStats
        items={[
          { icon: icons.down, label: 'Still to repay', value: formatMoney(outstanding(loan)) },
          { icon: icons.calendar, label: 'Every month', value: formatMoney(loan.emi_amount) },
          { icon: icons.cash, label: 'Borrowed', value: formatMoney(loan.principal_amount) },
          { icon: icons.check, label: 'Repaid so far', value: formatMoney(loan.recovered_amount ?? loan.total_recovered) },
        ]}
      />

      <SheetSection icon={icons.info} title="The terms" collapsible={false}>
        <SheetGrid
          items={[
            ['Interest', num(loan.interest_rate) ? `${num(loan.interest_rate)}% a year` : 'Interest free'],
            {
              label: 'How interest is worked out',
              value: INTEREST_METHOD[loan.interest_method] || humanize(loan.interest_method) || null,
              wide: true,
              help: { surface: 'payroll.loans', field: 'interest_method', label: 'how interest is worked out' },
            },
            ['Over', loan.tenure_months ? `${loan.tenure_months} months` : null],
            ['First payment', formatPeriod(loan.start_period_month)],
            ['Next payment', loan.next_due_period_month ? formatPeriod(loan.next_due_period_month) : null],
          ]}
        />
      </SheetSection>

      <SheetSection
        icon={icons.calendar}
        title={schedule.loading ? 'Repayment schedule' : `Repayment schedule (${schedule.rows.length})`}
      >
        {schedule.loading ? (
          <CardsSkeleton rows={3} height={32} />
        ) : (
          <SheetTable
            columns={[
              { header: '#', render: (r) => String(r.installment_number ?? ''), flex: 0.4 },
              { header: 'Month', render: (r) => formatPeriod(r.period_month) },
              { header: 'Payment', align: 'right', render: (r) => formatMoney(r.total_amount ?? r.amount) },
            ]}
            rows={schedule.rows}
            empty={
              schedule.failed
                ? 'We couldn’t load the schedule. Close this and open the loan again.'
                : pending
                  ? 'The schedule is created once the loan is approved.'
                  : 'No payments scheduled.'
            }
          />
        )}
      </SheetSection>

      {loan.reason ? (
        <SheetSection icon={icons.document} title="Why it was taken">
          <Text style={text.body}>{loan.reason}</Text>
        </SheetSection>
      ) : null}
    </RecordSheet>
  );
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function LoansTab() {
  const [open, setOpen] = useState(null);

  const loans = useResource(() => payrollAPI.getMyLoans(), {
    select: (data) => toList(data, ['loans', 'records']),
    initial: [],
  });

  const rows = useMemo(() => loans.data || [], [loans.data]);
  const live = useMemo(() => rows.filter((l) => normalizeStatusKey(l.status) === 'active'), [rows]);

  const owed = useMemo(
    () => live.reduce((t, l) => t + num(outstanding(l)), 0),
    [live],
  );
  const monthly = useMemo(
    () => live.reduce((t, l) => t + num(l.emi_amount), 0),
    [live],
  );

  if (loans.error && rows.length === 0) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={loans.error}
          domain="payroll"
          onRetry={loans.reload}
          fallback="We couldn’t load your loans."
        />
      </View>
    );
  }

  if (loans.loading && rows.length === 0) return <CardsSkeleton rows={3} height={96} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={icons.cash}
        title="No loans or advances"
        message="Nothing is being recovered from your salary. Your HR team sets a company loan up for you."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle}>
      {live.length > 0 ? (
        <StatCards
          items={[
            { icon: icons.down, tone: 'purple', label: 'Still to repay', value: formatMoney(owed) },
            { icon: icons.calendar, tone: 'indigo', label: 'Every month', value: formatMoney(monthly) },
          ]}
        />
      ) : null}

      {rows.map((loan, i) => (
        <RecordCard
          key={String(loan.id || i)}
          icon={icons.cash}
          tone={normalizeStatusKey(loan.status) === 'active' ? 'purple' : 'slate'}
          title={loanTitle(loan)}
          subtitle={`${loan.tenure_months ?? 0} months from ${formatPeriod(loan.start_period_month)}`}
          value={formatMoney(outstanding(loan))}
          badge={<StatusBadge kind="loan" status={loan.status} />}
          onPress={() => setOpen(loan)}
          accessibilityLabel={`${loanTitle(loan)}. Open it.`}
          meta={[
            { label: 'Every month', value: formatMoney(loan.emi_amount) },
            loan.next_due_period_month
              ? { label: 'Next', value: formatPeriod(loan.next_due_period_month) }
              : null,
          ].filter(Boolean)}
        />
      ))}

      {open ? <LoanSheet loan={open} onClose={() => setOpen(null)} /> : null}
    </ScrollView>
  );
}

export default LoansTab;
