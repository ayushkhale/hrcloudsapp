// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/SalaryTab.jsx — My Pay › Salary.
//
// What you are paid, where it comes from, and every revision of it.
//
// ── TAKE-HOME IS NOT GROSS MINUS THE DEDUCTION LINES ────────────────────────
//
// Statutory deductions (PF, ESI, PT) live in their OWN table —
// `statutory_breakdown` — not in `components`, while `monthly_gross` already
// counts them. So take-home is gross minus the component deductions AND the
// statutory ones. `salaryBreakdown()` in payMeta.js does that sum, ported
// line for line from the web, because showing a take-home the person will
// never see in their bank is the worst thing this screen can do.
//
// ── ANNUAL CTC IS NOT A SALARY ──────────────────────────────────────────────
//
// It is the cost to the company, and people read it as what they get. The
// headline figure here is therefore TAKE-HOME; CTC is below it, with the ⓘ
// that already exists (`payroll.my_salary` / `annual_ctc`).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { fmtDate } from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { formatMoney } from '../../../lib/format';
import { toList } from '../../../lib/normalize';
import { color, elevate, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  EmptyState, ErrorState, FieldHelp, HeroCard, RecordSheet, SheetGrid, SheetSection, SheetStats, SheetTable,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { componentAmount, componentName, salaryBreakdown } from '../payMeta';

const COMPONENT_COLUMNS = [
  { header: 'Component', render: componentName, flex: 1.6 },
  { header: 'A month', align: 'right', render: (c) => formatMoney(componentAmount(c)) },
];

/* ─── One revision ───────────────────────────────────────────────────────── */

function RevisionSheet({ revision, onClose }) {
  const b = useMemo(() => salaryBreakdown(revision), [revision]);

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Salary revision"
      icon={icons.chart}
      title={formatMoney(revision.annual_ctc)}
      subtitle={`From ${fmtDate(revision.effective_from, 'N/A')}`}
    >
      <SheetStats
        items={[
          { icon: icons.rupee, label: 'Take-home a month', value: formatMoney(b.net) },
          { icon: icons.up, label: 'Gross a month', value: formatMoney(b.gross) },
        ]}
      />

      <SheetSection icon={icons.info} title="About this revision" collapsible={false}>
        <SheetGrid
          items={[
            ['Effective from', fmtDate(revision.effective_from, null)],
            ['Effective to', revision.effective_to ? fmtDate(revision.effective_to, null) : 'Present'],
            ['Version', revision.version != null ? `v${revision.version}` : null],
            ['Kind', humanize(revision.revision_type) || null],
          ]}
        />
      </SheetSection>

      <SheetSection icon={icons.up} title="What makes it up">
        <SheetTable
          columns={COMPONENT_COLUMNS}
          rows={b.earnings}
          empty="No earning components on this revision."
        />
      </SheetSection>

      {b.deductions.length > 0 ? (
        <SheetSection icon={icons.down} title="Taken off every month">
          <SheetTable columns={COMPONENT_COLUMNS} rows={b.deductions} empty="Nothing." />
        </SheetSection>
      ) : null}
    </RecordSheet>
  );
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function SalaryTab() {
  const [open, setOpen] = useState(null);

  const current = useResource(() => payrollAPI.getMyCurrentStructure());
  const history = useResource(() => payrollAPI.getMyStructureHistory(), {
    select: (data) => toList(data, ['history', 'revisions', 'records']),
    initial: [],
  });

  const structure = current.data?.structure || current.data;
  const b = useMemo(() => salaryBreakdown(structure), [structure]);

  // Newest first. `version` is authoritative and `effective_from` breaks a tie,
  // which is the web's order (MySalaryPage.jsx) — two revisions can share a day.
  const revisions = useMemo(() => [...(history.data || [])].sort(
    (a, z) => (z.version ?? 0) - (a.version ?? 0)
      || String(z.effective_from).localeCompare(String(a.effective_from)),
  ), [history.data]);

  if (current.error) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={current.error}
          domain="payroll"
          onRetry={current.reload}
          fallback="We couldn’t load your salary."
        />
      </View>
    );
  }

  if (current.loading && !current.data) return <CardsSkeleton rows={3} height={96} />;

  if (!structure) {
    return (
      <EmptyState
        icon={icons.chart}
        title="No salary structure yet"
        message="Your employer sets this up when your pay is first run. Your payslips will still appear under Payslips."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle}>
      {/* The headline is TAKE-HOME, because that is the number people mean
          when they say "my salary". INK on the soft hero (2026-10-20): it was
          purple-700 text on a purple-100 block, and the figure sank into its
          own background (user: "purple mixing with text"). */}
      <HeroCard
        icon={icons.rupee}
        eyebrow="Take-home a month"
        metric
        title={formatMoney(b.net)}
        caption={`Before tax at source · since ${fmtDate(structure.effective_from, 'N/A')}`}
      />

      {/* ONE ROW, ONE CARD (2026-10-20): three separate tiles with 9pt
          labels and 16pt figures made three numbers people compare read as
          three unrelated things. Side by side, divided, the figures bigger. */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: color.borderSubtle,
          paddingVertical: space[4],
          ...elevate('xs'),
        }}
      >
        {[
          { label: 'Annual CTC', value: structure.annual_ctc, help: true },
          { label: 'Gross a month', value: b.gross },
          { label: 'Deducted a month', value: b.deductionsTotal },
        ].map((f, i) => (
          <View
            key={f.label}
            style={{
              flex: 1,
              minWidth: 0,
              paddingHorizontal: space[3],
              gap: 4,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: color.borderSubtle,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text numberOfLines={1} style={[text.caption, { color: color.textSecondary, flexShrink: 1 }]}>{f.label}</Text>
              {f.help ? <FieldHelp surface="payroll.my_salary" field="annual_ctc" /> : null}
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[text.metric, { fontSize: 18, lineHeight: 23, color: color.ink }]}
            >
              {formatMoney(f.value)}
            </Text>
          </View>
        ))}
      </View>

      <RecordCard
        icon={icons.chart}
        tone="purple"
        title="What makes up your pay"
        subtitle={`${b.earnings.length} earning${b.earnings.length === 1 ? '' : 's'}`
          + `${b.deductions.length ? `, ${b.deductions.length} deduction${b.deductions.length === 1 ? '' : 's'}` : ''}`}
        onPress={() => setOpen(structure)}
        accessibilityLabel="Open the full salary breakdown."
      />

      {revisions.length > 1 ? (
        <>
          <Text style={[text.label, { marginTop: space[2] }]}>Earlier revisions</Text>
          {revisions
            .filter((r) => r.id !== structure.id)
            .map((r, i) => (
              <RecordCard
                key={String(r.id || i)}
                icon={icons.clock}
                tone="slate"
                title={formatMoney(r.annual_ctc)}
                subtitle={`${fmtDate(r.effective_from, 'N/A')} – ${r.effective_to ? fmtDate(r.effective_to, '') : 'Present'}`}
                value={humanize(r.revision_type) || null}
                onPress={() => setOpen(r)}
                accessibilityLabel={`Salary revision from ${fmtDate(r.effective_from, 'an earlier date')}. Open it.`}
              />
            ))}
        </>
      ) : null}

      {open ? <RevisionSheet revision={open} onClose={() => setOpen(null)} /> : null}
    </ScrollView>
  );
}

export default SalaryTab;
