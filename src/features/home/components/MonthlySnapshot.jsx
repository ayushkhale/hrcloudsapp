// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/MonthlySnapshot.jsx — the 2×2 month tiles on Home.
//
// Present · Unpaid days · Late · Worked, for one month, with a MonthStepper in
// the card header (forward disabled past this month — MonthStepper owns that).
//
// It is call #4 of the Home spec, and §5 says each of 4–7 fails INDEPENDENTLY:
// a dead getSummary hides THIS card and nothing else. So a load error returns
// null rather than a red block — the punch card above it is what matters, and
// the month is not worth a shout.
//
// The summary shape isn't pinned in NativeRef/10-api, so each number is read
// from the spellings the gateway uses elsewhere, and absence stays absence:
// a real 0 shows as "0", a missing field as "N/A" — never a dash (CLAUDE.md §5).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { unwrap } from '../../../lib/normalize';
import { fmtClockMinutes } from '../../../lib/dates';
import { color, radius, space, text } from '../../../theme/tokens';
import { Card, CardHeader, MonthStepper, Skeleton } from '../../../ui';

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const pick = (o, ...keys) => { for (const k of keys) { const v = num(o?.[k]); if (v != null) return v; } return null; };
const show = (v) => (v == null ? 'N/A' : String(v));

function workedLabel(summary) {
  const mins = pick(summary, 'worked_minutes', 'total_worked_minutes');
  if (mins != null) return fmtClockMinutes(mins, { short: true }, 'N/A');
  const hrs = pick(summary, 'worked_hours', 'total_worked_hours', 'total_hours');
  if (hrs != null) return fmtClockMinutes(Math.round(hrs * 60), { short: true }, 'N/A');
  return 'N/A';
}

function Tile({ label, value }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        backgroundColor: color.surfaceSubtle,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        padding: space[3],
        gap: 4,
      }}
    >
      <Text style={text.label}>{label}</Text>
      <Text style={[text.metric, { fontSize: 22, lineHeight: 26 }]}>{value}</Text>
    </View>
  );
}

export function MonthlySnapshot({ year, month, onChange, reloadKey }) {
  const [state, setState] = useState({ loading: true, failed: false, summary: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, failed: false }));
    attendanceAPI.getSummary(month, year)
      .then((res) => { if (!cancelled) setState({ loading: false, failed: false, summary: unwrap(res) || {} }); })
      .catch(() => { if (!cancelled) setState({ loading: false, failed: true, summary: null }); });
    return () => { cancelled = true; };
  }, [month, year, reloadKey]);

  const { loading, failed, summary } = state;

  const tiles = useMemo(() => ([
    { label: 'Present', value: show(pick(summary, 'present_days', 'present')) },
    { label: 'Unpaid days', value: show(pick(summary, 'unpaid_days', 'lop_days', 'loss_of_pay_days')) },
    { label: 'Late', value: show(pick(summary, 'late_days', 'late')) },
    { label: 'Worked', value: workedLabel(summary) },
  ]), [summary]);

  // Independent failure (§5): this card simply isn't there.
  if (failed) return null;

  return (
    <Card>
      <CardHeader right={<MonthStepper year={year} month={month} onChange={onChange} short />}>
        This month
      </CardHeader>
      {loading ? (
        <Skeleton type="tiles" />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} />)}
        </View>
      )}
    </Card>
  );
}

export default MonthlySnapshot;
