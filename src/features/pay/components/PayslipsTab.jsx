// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/PayslipsTab.jsx — My Pay › Payslips.
//
// Every finalised month, newest first, and the annual statement behind a
// switch. Draft runs never arrive here: the endpoint only returns approved or
// paid ones (#55), which is why there is no "draft" state to render.
//
// ── THE LIST ROW DOES NOT KNOW WHAT WAS DEDUCTED ────────────────────────────
//
// #55 gives gross and net; `total_deductions` is on the DETAIL (#56), under
// `figures`. The web printed "Deductions N/A" on every card for a while
// (employee audit E-15) before working that out. A meta row that only ever
// says nothing is worse than no meta row, so `slipDeductions` returns null and
// the row is dropped — the figure is one tap away in the sheet.
//
// ── A GAP IN THE MONTHS IS NOT A STORY ──────────────────────────────────────
//
// A held or reversed run is indistinguishable from one that was never created.
// So there is no "held" chip and no explanation of a missing month: the list
// shows what exists. Inventing a reason would be inventing a fact.
//
// ── THE PDF IS THE DOCUMENT, NOT A REDRAW ───────────────────────────────────
//
// `payrollFiles.myPayslipPdf()` through `downloadFile` — binary NEVER goes
// through `request()`, which would try to parse a PDF as JSON (00-plan/07 §6).
// What opens is the same file HR released, so the figures cannot disagree with
// the sheet above it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI, payrollFiles } from '../../../api';
import { downloadFile } from '../../../api/files';
import { useResource } from '../../../hooks/useResource';
import { fmtDate } from '../../../lib/dates';
import { formatPeriod, formatDayCount } from '../../../lib/format';
import { formatPay } from '../../../lib/payPrivacy';
import { toList } from '../../../lib/normalize';
import { errorMessage } from '../../../lib/errors';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, FilterTabs, RecordSheet, SheetGrid, SheetSection,
  SheetStats, SheetTable, showToast,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import {
  componentName, currentFinancialYear, isDeduction, isEarning, slipDeductions,
  slipGross, slipNet, slipPaidOn, slipPeriod, slipRunId, statementMonths, statementTotals,
} from '../payMeta';

const VIEWS = [
  { value: 'months', label: 'Months' },
  { value: 'year', label: 'This year' },
];

/* ─── One payslip, in full ───────────────────────────────────────────────── */

export function PayslipSheet({ runId, period, onClose }) {
  const [saving, setSaving] = useState(false);

  const slip = useResource(() => payrollAPI.getMyPayslip(runId), {
    deps: [runId],
    select: (data) => data,
  });

  const d = slip.data || {};
  const item = d.item || d;
  const figures = d.figures || item;
  // Three spellings, because three shapes of this payload exist in the wild
  // and the web reads all three (MyPayslipsPage.jsx).
  const lines = d.components || item.components || d.snapshot?.lines || [];
  const earnings = lines.filter(isEarning);
  const deductions = lines.filter(isDeduction);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await downloadFile(payrollFiles.myPayslipPdf(runId), {
        filename: `payslip-${period || runId}.pdf`,
      });
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'We couldn’t open this payslip.'), 'error');
    } finally {
      setSaving(false);
    }
  }, [runId, period]);

  const amountColumns = [
    { header: 'Item', render: (l) => componentName(l), flex: 1.6 },
    {
      header: 'Amount',
      align: 'right',
      render: (l) => formatPay(l.amount ?? l.calculated_amount),
    },
  ];

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Payslip"
      icon={icons.rupee}
      title={formatPeriod(period)}
      loading={slip.loading && !slip.data}
      footer={
        <Button
          title={saving ? 'Opening…' : 'Open the PDF'}
          icon={icons.download}
          onPress={save}
          loading={saving}
          fullWidth
        />
      }
    >
      {slip.error ? (
        <ErrorState
          error={slip.error}
          domain="payroll"
          onRetry={slip.reload}
          fallback="We couldn’t open this payslip."
        />
      ) : (
        <>
          <SheetStats
            items={[
              { icon: icons.rupee, label: 'Reached your bank', value: formatPay(figures.net_pay) },
              { icon: icons.up, label: 'Earned', value: formatPay(figures.gross_earnings ?? figures.gross_pay) },
              { icon: icons.down, label: 'Deducted', value: formatPay(figures.total_deductions) },
              {
                icon: icons.calendar,
                label: 'Paid days',
                value: formatDayCount(figures.payable_days),
                help: { surface: 'payroll.payslip', field: 'payable_days', label: 'paid days' },
              },
            ]}
          />

          <SheetSection icon={icons.up} title="What you earned">
            <SheetTable columns={amountColumns} rows={earnings} empty="No earning lines on this payslip." />
          </SheetSection>

          <SheetSection icon={icons.down} title="What was deducted">
            <SheetTable columns={amountColumns} rows={deductions} empty="Nothing was deducted this month." />
          </SheetSection>

          {d.statutory_note ? (
            <SheetSection icon={icons.info} title="About the statutory lines" defaultOpen={false}>
              <Text style={text.body}>{d.statutory_note}</Text>
            </SheetSection>
          ) : null}
        </>
      )}
    </RecordSheet>
  );
}

/* ─── The financial year, month by month ─────────────────────────────────── */

function AnnualStatement() {
  const fy = currentFinancialYear();
  const [saving, setSaving] = useState(false);

  const statement = useResource(() => payrollAPI.getMyAnnualStatement({ financial_year: fy }), {
    deps: [fy],
    select: (data) => data,
  });

  const months = useMemo(() => statementMonths(statement.data), [statement.data]);
  const totals = useMemo(() => statementTotals(statement.data), [statement.data]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await downloadFile(payrollFiles.myAnnualStatementPdf(), {
        params: { financial_year: fy },
        filename: `annual-statement-${fy}.pdf`,
      });
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'We couldn’t open your annual statement.'), 'error');
    } finally {
      setSaving(false);
    }
  }, [fy]);

  if (statement.error) {
    return (
      <ErrorState
        error={statement.error}
        domain="payroll"
        onRetry={statement.reload}
        fallback="We couldn’t load your annual statement."
      />
    );
  }

  if (statement.loading && !statement.data) return <CardsSkeleton rows={3} height={84} />;

  return (
    <>
      <Text style={text.caption}>
        {`FY ${fy} · a month-by-month summary of your pay — often what a bank or an embassy asks for.`}
      </Text>

      {totals ? (
        <View
          style={{
            backgroundColor: color.brandChipBg,
            borderRadius: 16,
            padding: space[3],
            gap: space[2],
          }}
        >
          <Text style={[text.label, { color: color.brandSoftFg }]}>So far this year</Text>
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            {[
              ['Earned', totals.gross_earnings],
              ['Deducted', totals.total_deductions],
              ['Reached your bank', totals.net_pay],
            ].map(([label, value]) => (
              <View key={label} style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} style={[text.label, { fontSize: 9 }]}>{label}</Text>
                <Text
                  numberOfLines={1}
                  style={[text.smallStrong, { fontSize: 15, color: color.brandSoftFg, fontVariant: ['tabular-nums'] }]}
                >
                  {formatPay(value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {months.length === 0 ? (
        <EmptyState
          icon={icons.report}
          title="Nothing recorded yet"
          message={`No pay has been run for FY ${fy} so far.`}
        />
      ) : (
        months.map((m) => (
          <RecordCard
            key={m.key}
            icon={icons.calendar}
            tone={m.empty ? 'slate' : 'purple'}
            title={formatPeriod(m.period)}
            subtitle={m.empty ? 'No pay run this month' : null}
            value={m.empty ? null : formatPay(m.net_pay)}
            meta={m.empty ? [] : [
              { label: 'Earned', value: formatPay(m.gross_earnings) },
              { label: 'Deducted', value: formatPay(m.total_deductions) },
            ]}
          />
        ))
      )}

      <Button
        title={saving ? 'Opening…' : 'Open the statement'}
        variant="outline"
        icon={icons.download}
        onPress={save}
        loading={saving}
        fullWidth
      />
    </>
  );
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function PayslipsTab({ payslips }) {
  const [view, setView] = useState('months');
  // A payslip is a PAGE now, not a sheet (2026-10-22) — screens/PayRecordScreens.jsx.
  const navigation = useNavigation();
  const setOpen = (x) => navigation.navigate('PayslipDetail', x);

  const { refreshControl } = useListRefresh(payslips.reload, payslips.loading);

  const slips = payslips.data || [];

  if (payslips.error && slips.length === 0) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={payslips.error}
          domain="payroll"
          onRetry={payslips.reload}
          fallback="We couldn’t load your payslips."
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <FilterTabs options={VIEWS} value={view} onChange={setView} />

      {view === 'year' ? (
        <AnnualStatement />
      ) : payslips.loading && slips.length === 0 ? (
        <CardsSkeleton rows={4} height={84} />
      ) : slips.length === 0 ? (
        <EmptyState
          icon={icons.rupee}
          title="No payslips yet"
          message="A payslip appears here once your employer has released that month’s pay."
        />
      ) : (
        slips.map((slip, i) => {
          const runId = slipRunId(slip);
          const period = slipPeriod(slip);
          const deducted = slipDeductions(slip);
          const paidOn = slipPaidOn(slip);
          return (
            <RecordCard
              key={String(runId || i)}
              icon={icons.rupee}
              tone="purple"
              title={formatPeriod(period)}
              subtitle={paidOn ? `Paid ${fmtDate(paidOn, '')}` : null}
              value={formatPay(slipNet(slip))}
              onPress={runId ? () => setOpen({ runId, period }) : undefined}
              accessibilityLabel={`Payslip for ${formatPeriod(period)}. Open it.`}
              meta={[
                { label: 'Earned', value: formatPay(slipGross(slip)) },
                // Dropped, not "N/A" — the list endpoint simply doesn't carry it.
                deducted != null ? { label: 'Deducted', value: formatPay(deducted) } : null,
              ].filter(Boolean)}
            />
          );
        })
      )}

    </ScrollView>
  );
}

/* The hero's data, fetched ONCE by PayScreen and handed to this section —
   `useResource`'s select already receives the unwrapped body. One read, two
   readers: the hero is the newest row of this very list. */
export const selectPayslips = (data) => toList(data, ['payslips', 'records']);

export default PayslipsTab;
