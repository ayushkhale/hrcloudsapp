// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/TaxTab.jsx — My Pay › Tax.
//
// The year's income tax: which regime you are on, what has already been
// deducted, what is still coming, and what you have declared.
//
// ── THREE INDEPENDENT READS, THREE ERROR STATES ─────────────────────────────
//
// Summary, projection and declaration are separate endpoints that fail
// separately. One `Promise.all` would mean a 404 on the projection blanks the
// regime switch, which is the one control on this screen that does something.
// So each has its own `useResource` and its own in-place failure.
//
// ── THE PAYLOADS ARE NESTED, AND THE FLAT KEYS ARE A LIE ────────────────────
//
// `/me/tax/projection` nests its figures under `annual_projected`,
// `projected_monthly`, `tax` and `tds`. The web read flat keys for a while
// (`projected_gross`, `total_tax`) and every tile said ₹0. Both spellings are
// read here, nested first — the live API beats the spec (CLAUDE.md §9).
//
// ── INCOME TAX CAN BE SWITCHED OFF ENTIRELY ─────────────────────────────────
//
// `income_tax_enabled: false` means the organisation does not deduct it in
// payroll. Then the tax figures are not zero, they are NOT APPLICABLE, and
// showing ₹0 would tell somebody they owe nothing. The section says so in a
// sentence and drops the tax tiles.
//
// ── SWITCHING REGIME IS A REAL DECISION, SO IT CONFIRMS ─────────────────────
//
// It changes what is deducted from the next payslip. `useConfirm()`, never
// `Alert.alert` (CLAUDE.md §4).
//
// ── PROOFS ARE WRITTEN IN THE FORM (2026-10-20) ─────────────────────────────
//
// They used to be "add them on the web": there was no file picker. There is
// now (ui/AttachmentPicker), so DeclarationFormScreen writes the lines, the
// proof references and the proof files, and this section only reads.
//
// ── MONTH BY MONTH AND FORM 16 (web MonthlyTab / Form16Tab) ─────────────────
//
// `/me/tax/monthly` has no documented shape — an array under a known key, or a
// map keyed by month. `monthlyTaxRows` reads both, exactly as the web does, and
// anything else is "nothing yet" rather than a crash.
//
// Form 16 exists only after HR closes the year; until then the read 404s with
// FORM16_NOT_FINALIZED, which is a state ("not published yet"), not an error.
// The web dumps the JSON; this shows Part A (an attachment) and the PDF.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI, payrollFiles } from '../../../api';
import { downloadFile } from '../../../api/files';
import { useResource } from '../../../hooks/useResource';
import { humanize } from '../../../lib/enums';
import { errorMessage } from '../../../lib/errors';
import { payrollErrorCode } from '../../../lib/errors/payrollErrors';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { normalizeAttachment } from '../../../lib/attachments';
import { formatPeriod } from '../../../lib/format';
import { formatPay } from '../../../lib/payPrivacy';
import { toList } from '../../../lib/normalize';
import { openPayrollAttachment } from '../../../ui/AttachmentPicker';
import { color, elevate, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, FieldHelp, FilterTabs, HeroCard, InlineAlert, StatusBadge, showToast, useConfirm,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { currentFinancialYear, num } from '../payMeta';

const VIEWS = [
  { value: 'year', label: 'This year' },
  { value: 'monthly', label: 'Month by month' },
  { value: 'regime', label: 'Regime' },
  { value: 'declared', label: 'Declared' },
  { value: 'form16', label: 'Form 16' },
];

/* `/me/tax/monthly` has no documented shape (web `monthlyTaxRows`, verbatim):
   an array under a known key, or a map keyed by month ({ "2026-04": {...} }).
   Anything else is no rows, never a crash. */
function monthlyTaxRows(raw) {
  const list = toList(raw, ['months', 'monthly', 'breakdown', 'records']);
  if (list.length) return list;
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw.months || raw.monthly || raw) : null;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  return Object.entries(map)
    .filter(([key, value]) => /^\d{4}-\d{2}/.test(key) && value && typeof value === 'object')
    .map(([key, value]) => ({ period_month: key, ...value }));
}

const REGIMES = [
  {
    code: 'new',
    title: 'New regime',
    blurb: 'Lower rates, almost no exemptions. The default, and simpler if you don’t invest for tax.',
  },
  {
    code: 'old',
    title: 'Old regime',
    blurb: 'Higher rates, but 80C, HRA and the rest count. Worth it if you claim a lot.',
  },
];

/* The summary's regime arrives as a code ("new") OR as the regime record
   ({ id, code, name }). Both, exactly as the web reads them. */
function regimeCodeOf(data) {
  const raw = data?.regime_code ?? data?.regime;
  const code = raw && typeof raw === 'object' ? raw.code ?? raw.regime_code : raw;
  return code ? String(code).toLowerCase() : '';
}

/* ─── This year ──────────────────────────────────────────────────────────── */

/* ONE HEADLINE, THEN GROUPED LISTS (2026-10-20). This was five rows of
   identical little stat boxes — "Taxable pay", "PF this year", "Prof. tax",
   "PF so far", "ESI so far" — each its own card, so nothing grouped and
   nothing led ("blunt, hideous" — user). Now: the year's tax as the one
   headline with a deducted-so-far bar, then the deductions as two labelled
   lists, "For the year" and "So far", each line an icon, a label and its
   amount on the right — read top to bottom like a statement. */
function FigureList({ title, rows }) {
  const shown = rows.filter(Boolean);
  if (!shown.length) return null;
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        paddingHorizontal: space[4],
        paddingTop: space[3],
        paddingBottom: space[1],
        ...elevate('xs'),
      }}
    >
      <Text style={[text.h3, { color: color.ink, marginBottom: space[1] }]}>{title}</Text>
      {shown.map((r, i) => {
        const t = toneOf(r.tone || 'purple');
        const Icon = r.icon;
        return (
          <View
            key={r.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              paddingVertical: space[3],
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: color.borderSubtle,
            }}
          >
            <View
              style={{
                width: 34, height: 34, borderRadius: radius.md, backgroundColor: t.chip,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {Icon ? <Icon size={17} color={t.fg} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[text.body, { color: color.textPrimary }]}>{r.label}</Text>
              {r.caption ? <Text numberOfLines={1} style={text.caption}>{r.caption}</Text> : null}
            </View>
            <Text style={[text.bodyStrong, { fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] }]}>
              {r.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ThisYear({ fy, summary, projection }) {
  const s = summary.data || {};
  const ytd = s.ytd || s.actuals || {};

  const p = projection.data || {};
  const tax = p.tax || {};
  const tds = p.tds || {};
  const annual = p.annual_projected || {};
  const taxOn = p.income_tax_enabled !== false && tax.enabled !== false;

  const notes = Array.isArray(p.notes) ? p.notes.filter((n) => typeof n === 'string') : [];
  const limitations = Array.isArray(p.limitations)
    ? p.limitations.filter((l) => typeof l === 'string')
    : [];

  if ((summary.loading && !summary.data) || (projection.loading && !projection.data)) {
    return <CardsSkeleton rows={3} height={96} />;
  }

  if (summary.error && projection.error) {
    return (
      <ErrorState
        error={summary.error}
        domain="payroll"
        onRetry={() => { summary.reload(); projection.reload(); }}
        fallback="We couldn’t load your tax for this year."
      />
    );
  }

  const yearTax = num(s.projected_annual_tax ?? s.projected_liability ?? tax.total_liability ?? tax.annual_liability);
  const deducted = num(ytd.tds ?? ytd.income_tax);
  const remaining = s.remaining_tds ?? s.balance_tds;
  const pct = yearTax > 0 ? Math.min(100, Math.round((deducted / yearTax) * 100)) : 0;

  return (
    <>
      {!taxOn ? (
        <InlineAlert tone="blue">
          Your organisation hasn’t switched on income tax deduction in payroll, so none is
          taken from your pay. The figures below are what your pay is expected to be for the year.
        </InlineAlert>
      ) : (
        <HeroCard
          icon={icons.tax}
          eyebrow={`Income tax · FY ${fy}`}
          metric
          title={formatPay(yearTax)}
          caption={`${formatPay(deducted)} deducted so far · ${formatPay(remaining)} to go`}
          progress={pct}
          right={<FieldHelp surface="payroll.tax_summary" field="remaining_tds" label="income tax still to deduct" />}
        />
      )}

      <FigureList
        title="For the year"
        rows={[
          { icon: icons.rupee, tone: 'indigo', label: 'Taxable pay', value: formatPay(annual.gross_taxable ?? p.projected_gross ?? p.annual_gross) },
          taxOn ? { icon: icons.calendar, tone: 'purple', label: 'Tax this month', caption: 'Taken from this month’s pay', value: formatPay(tds.this_month ?? tds.monthly_tds ?? tds.amount ?? p.monthly_tds) } : null,
          { icon: icons.bank, tone: 'emerald', label: 'Provident fund (PF)', value: formatPay(annual.epf) },
          { icon: icons.office, tone: 'slate', label: 'Professional tax', value: formatPay(annual.professional_tax) },
        ]}
      />

      <FigureList
        title="Deducted so far"
        rows={[
          { icon: icons.bank, tone: 'emerald', label: 'Provident fund (PF)', value: formatPay(ytd.pf) },
          { icon: icons.heart, tone: 'rose', label: 'Health insurance (ESI)', value: formatPay(ytd.esi) },
          { icon: icons.office, tone: 'slate', label: 'Professional tax', value: formatPay(ytd.pt ?? ytd.professional_tax) },
        ]}
      />

      {notes.length > 0 ? (
        <InlineAlert tone="blue">{notes.join(' ')}</InlineAlert>
      ) : null}

      {/* What the estimate leaves out. Worth saying, not worth 40% of the
          screen — it is the last thing, in the quietest type on the section. */}
      {limitations.length > 0 ? (
        <View style={{ gap: space[1] }}>
          <Text style={text.label}>What this estimate leaves out</Text>
          {limitations.map((l) => (
            <Text key={l} style={[text.caption, { color: color.textMuted }]}>{`• ${l}`}</Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

/* ─── Regime ─────────────────────────────────────────────────────────────── */

function Regime({ fy, summary }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const current = regimeCodeOf(summary.data);

  const switchTo = useCallback(async (code, title) => {
    const ok = await confirm({
      title: `Move to the ${title.toLowerCase()}?`,
      message: 'What is deducted from your next payslip changes straight away.',
      confirmText: 'Move',
    });
    if (!ok) return;
    setBusy(code);
    try {
      await payrollAPI.switchMyRegime({ regime_code: code }, { financial_year: fy });
      showToast(`You’re on the ${title.toLowerCase()} now.`, 'success');
      summary.reload();
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'We couldn’t change your tax regime.'), 'error');
    } finally {
      setBusy('');
    }
  }, [confirm, fy, summary]);

  if (summary.loading && !summary.data) return <CardsSkeleton rows={2} height={140} />;

  return (
    <>
      {REGIMES.map((r) => {
        const on = current === r.code;
        return (
          <View
            key={r.code}
            style={{
              backgroundColor: on ? color.brandChipBg : color.surface,
              borderRadius: radius.lg,
              borderWidth: on ? 0 : 1,
              borderColor: color.borderSubtle,
              padding: space[4],
              gap: space[2],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Text style={[text.h3, on ? { color: color.brandSoftFg } : null]}>{r.title}</Text>
              {on ? <StatusBadge kind="claim" status="approved" label="You’re on this" /> : null}
            </View>
            <Text style={[text.small, on ? { color: color.brandSoftFg } : null]}>{r.blurb}</Text>
            {!on ? (
              <Button
                title={`Move to the ${r.title.toLowerCase()}`}
                variant="outline"
                onPress={() => switchTo(r.code, r.title)}
                loading={busy === r.code}
                fullWidth
              />
            ) : null}
          </View>
        );
      })}

      <Text style={text.caption}>
        You can change this during the year. Your employer recalculates what is deducted from
        the next payslip onwards — what has already gone is not refunded here.
      </Text>
    </>
  );
}

/* ─── Declared ───────────────────────────────────────────────────────────── */

function Declared({ fy, declaration, onEdit }) {
  const d = declaration.data || {};
  const items = toList(d, ['items', 'declaration_items']);
  const total = useMemo(
    () => items.reduce((t, it) => t + num(it.declared_amount ?? it.amount), 0),
    [items],
  );

  if (declaration.loading && !declaration.data) return <CardsSkeleton rows={3} height={80} />;

  if (declaration.error) {
    return (
      <ErrorState
        error={declaration.error}
        domain="payroll"
        onRetry={declaration.reload}
        fallback="We couldn’t load your declaration."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={icons.document}
        title="Nothing declared yet"
        message={`Declare what you invest and your employer deducts less tax over FY ${fy}. Only the old regime counts them.`}
        action={<Button title="Declare an investment" icon={icons.add} onPress={onEdit} />}
      />
    );
  }

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text style={[text.caption, { flex: 1 }]}>{`FY ${fy} · ${formatPay(total)} declared`}</Text>
        {d.status ? <StatusBadge kind="declaration" status={d.status} /> : null}
      </View>

      {items.map((it, i) => (
        <RecordCard
          key={String(it.id || i)}
          icon={icons.document}
          tone="purple"
          title={it.section || '80C'}
          subtitle={it.sub_category || humanize(it.category) || null}
          value={formatPay(it.declared_amount ?? it.amount)}
          meta={it.approved_amount != null
            ? [{ label: 'Accepted', value: formatPay(it.approved_amount) }]
            : []}
        />
      ))}

      <Button
        title={String(d.status || 'draft').toLowerCase() === 'draft' ? 'Change what you declared' : 'Add proofs'}
        variant="outline"
        icon={String(d.status || 'draft').toLowerCase() === 'draft' ? icons.edit : icons.attachment}
        onPress={onEdit}
        fullWidth
      />
    </>
  );
}

/* ─── Month by month ─────────────────────────────────────────────────────── */

function Monthly({ fy, monthly }) {
  const rows = useMemo(() => monthlyTaxRows(monthly.data), [monthly.data]);

  if (monthly.loading && !monthly.data) return <CardsSkeleton rows={4} height={84} />;

  if (monthly.error) {
    return (
      <ErrorState
        error={monthly.error}
        domain="payroll"
        onRetry={monthly.reload}
        fallback="We couldn’t load your tax month by month."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={icons.calendar}
        title="Nothing deducted yet"
        message={`Each month’s income tax, PF, ESI and professional tax shows here once pay is run for FY ${fy}.`}
      />
    );
  }

  return rows.map((m, i) => {
    const period = m.period_month || m.month;
    return (
      <RecordCard
        key={String(period || i)}
        icon={icons.calendar}
        tone="purple"
        title={formatPeriod(period)}
        subtitle="Income tax deducted"
        value={formatPay(m.tds ?? m.income_tax)}
        meta={[
          { label: 'PF', value: formatPay(m.pf) },
          { label: 'ESI', value: formatPay(m.esi) },
          { label: 'Prof. tax', value: formatPay(m.pt ?? m.professional_tax) },
        ]}
      />
    );
  });
}

/* ─── Form 16 ────────────────────────────────────────────────────────────── */

function Form16({ fy }) {
  const [saving, setSaving] = useState(false);
  const form = useResource(() => payrollAPI.getMyForm16(fy), { deps: [fy] });

  const notYet = form.error && (form.error.status === 404 || payrollErrorCode(form.error) === 'FORM16_NOT_FINALIZED');
  const partA = normalizeAttachment(form.data?.part_a_attachment);

  const open = useCallback(async () => {
    setSaving(true);
    try {
      await downloadFile(payrollFiles.myForm16Pdf(fy), { filename: `form16-${fy}.pdf` });
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'We couldn’t open your Form 16.'), 'error');
    } finally {
      setSaving(false);
    }
  }, [fy]);

  if (form.loading && !form.data) return <CardsSkeleton rows={2} height={96} />;

  if (notYet) {
    return (
      <EmptyState
        icon={icons.report}
        title="Not published yet"
        message={`Your Form 16 for FY ${fy} appears here once HR closes the year. A provisional one is never issued.`}
      />
    );
  }

  if (form.error) {
    return (
      <ErrorState
        error={form.error}
        domain="payroll"
        onRetry={form.reload}
        fallback="We couldn’t load your Form 16."
      />
    );
  }

  return (
    <>
      <RecordCard
        icon={icons.report}
        tone="purple"
        title={`Form 16 · FY ${fy}`}
        subtitle="Part B — how your tax was worked out"
        badge={<HelpBadge />}
        action={(
          <Button
            title={saving ? 'Opening…' : 'Open PDF'}
            size="sm"
            icon={icons.download}
            onPress={open}
            loading={saving}
          />
        )}
      />
      {partA ? (
        <RecordCard
          icon={icons.document}
          tone="indigo"
          title="Part A"
          subtitle="The tax deposited for you"
          onPress={() => openPayrollAttachment(partA)}
          accessibilityLabel="Form 16 Part A"
        />
      ) : null}
    </>
  );
}

function HelpBadge() {
  return <FieldHelp surface="payroll.form16" field="form16" label="Form 16" />;
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function TaxTab({ onDeclare }) {
  const fy = currentFinancialYear();
  const [view, setView] = useState('year');

  const summary = useResource(() => payrollAPI.getMyTaxSummary({ financial_year: fy }), {
    deps: [fy],
  });
  const projection = useResource(() => payrollAPI.getMyTaxProjection({ financial_year: fy }), {
    deps: [fy],
  });
  const declaration = useResource(() => payrollAPI.getMyDeclaration({ financial_year: fy }), {
    deps: [fy],
    select: (data) => data?.declaration || data,
  });
  // Only read once somebody opens the view — most people never do.
  const monthly = useResource(() => payrollAPI.getMyMonthlyTax({ financial_year: fy }), {
    deps: [fy],
    enabled: view === 'monthly',
  });

  // The declaration form is a modal over this list; its save clears here
  // without a pull (CLAUDE.md §7).
  const reloadDeclaration = declaration.reload;
  const reloadSummary = summary.reload;
  useAttendanceChanged([ATTENDANCE_EVENTS.TAX_DECLARATION], useCallback(() => {
    reloadDeclaration();
    reloadSummary();
  }, [reloadDeclaration, reloadSummary]));

  const { refreshControl } = useListRefresh(
    () => { summary.reload(); projection.reload(); declaration.reload(); if (view === 'monthly') monthly.reload(); },
    summary.loading || projection.loading || declaration.loading,
  );

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <FilterTabs options={VIEWS} value={view} onChange={setView} />

      {view === 'year' ? (
        <ThisYear fy={fy} summary={summary} projection={projection} />
      ) : view === 'monthly' ? (
        <Monthly fy={fy} monthly={monthly} />
      ) : view === 'regime' ? (
        <Regime fy={fy} summary={summary} />
      ) : view === 'form16' ? (
        <Form16 fy={fy} />
      ) : (
        <Declared fy={fy} declaration={declaration} onEdit={onDeclare} />
      )}
    </ScrollView>
  );
}

export default TaxTab;
