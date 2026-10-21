// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/BenefitsTab.jsx — My Pay › Benefits.
//
// Insurance and perks the company enrols you in: what you are covered for,
// what it costs you a month, and what the company pays.
//
// ── READ ONLY, AND THAT IS THE WHOLE SECTION ────────────────────────────────
//
// There is no employee-facing enrol or opt-out endpoint — HR runs enrolment.
// So there is no button here. A capability the API lacks is ABSENT, not
// broken (CLAUDE.md §2); a button that 403s is worse than no button.
//
// ── THE TWO THINGS PEOPLE GET WRONG, SAID WHERE THEY MATTER ─────────────────
//
// D-37: a benefit premium has NO income-tax effect — it does not count toward
// 80D on its own, and a company-paid perk is not taxed here.
// D-36: a month is charged in full if cover is active on any day of it.
//
// Both are footnotes on the section rather than an ⓘ per card, because they
// are true of every plan and an ⓘ on each of six cards is wallpaper
// (CLAUDE.md §7).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { fmtDate } from '../../../lib/dates';
import { normalizeStatusKey } from '../../../lib/enums';
import { formatMoney } from '../../../lib/format';
import { toList } from '../../../lib/normalize';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState, StatusBadge } from '../../../ui';
import { CardsSkeleton, RecordCard, StatCards, cardListStyle } from '../../../ui/ListCards';
import { benefitTypeLabel, num, NO_PRORATION_NOTE, NO_TAX_EFFECT_NOTE } from '../payMeta';

const planOf = (e) => e?.benefit_plan || e?.plan || e;
const planName = (e) => planOf(e)?.name || benefitTypeLabel(planOf(e)?.benefit_type);
const employeeShare = (e) => e?.employee_contribution ?? planOf(e)?.employee_contribution ?? 0;
const employerShare = (e) => e?.employer_contribution ?? planOf(e)?.employer_contribution ?? 0;

export function BenefitsTab() {
  const benefits = useResource(() => payrollAPI.getMyBenefits(), {
    select: (data) => toList(data, ['enrollments', 'benefits', 'records']),
    initial: [],
  });

  const rows = useMemo(() => benefits.data || [], [benefits.data]);
  const active = useMemo(
    () => rows.filter((e) => normalizeStatusKey(e.status) === 'active'),
    [rows],
  );

  const yours = useMemo(
    () => active.reduce((t, e) => t + num(employeeShare(e)), 0),
    [active],
  );
  const theirs = useMemo(
    () => active.reduce((t, e) => t + num(employerShare(e)), 0),
    [active],
  );

  const { refreshControl } = useListRefresh(benefits.reload, benefits.loading);

  if (benefits.error && rows.length === 0) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={benefits.error}
          domain="payroll"
          onRetry={benefits.reload}
          fallback="We couldn’t load your benefits."
        />
      </View>
    );
  }

  if (benefits.loading && rows.length === 0) return <CardsSkeleton rows={3} height={92} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={icons.heart}
        title="No benefits yet"
        message="Insurance and other plans appear here once your employer enrols you."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      {active.length > 0 ? (
        <StatCards
          items={[
            { icon: icons.heart, tone: 'purple', label: 'Covered by', value: String(active.length) },
            { icon: icons.down, tone: 'indigo', label: 'Costs you', value: formatMoney(yours) },
            { icon: icons.ok, tone: 'emerald', label: 'Company pays', value: formatMoney(theirs) },
          ]}
        />
      ) : null}

      {rows.map((e, i) => {
        const live = normalizeStatusKey(e.status) === 'active';
        return (
          <RecordCard
            key={String(e.id || i)}
            icon={icons.heart}
            tone={live ? 'purple' : 'slate'}
            title={planName(e)}
            subtitle={benefitTypeLabel(planOf(e)?.benefit_type)}
            value={num(employeeShare(e)) ? formatMoney(employeeShare(e)) : 'Free to you'}
            badge={<StatusBadge kind="enrolment" status={e.status} />}
            meta={[
              { label: 'Company pays', value: formatMoney(employerShare(e)) },
              e.start_date ? { label: 'Cover from', value: fmtDate(e.start_date, '') } : null,
              e.end_date ? { label: 'Until', value: fmtDate(e.end_date, '') } : null,
            ].filter(Boolean)}
          />
        );
      })}

      <View
        style={{
          backgroundColor: color.surfaceSubtle,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.border,
          padding: space[3],
          gap: space[2],
        }}
      >
        <Text style={[text.small, { color: color.textSecondary }]}>{NO_TAX_EFFECT_NOTE}</Text>
        <Text style={[text.small, { color: color.textSecondary }]}>{NO_PRORATION_NOTE}</Text>
      </View>
    </ScrollView>
  );
}

export default BenefitsTab;
