// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/DayLogSheet.jsx — one day, in full.
//
// Spec: NativeRef/40-screens/02-home-and-punch.md § DayLog. Ported from the web
// DailyLogModal, which was already a DetailDialog — so this is a near-mechanical
// map onto RecordSheet.
//
// ── IT IS A SHEET, NOT A ROUTE ───────────────────────────────────────────────
//
// Opened by tapping a row or a bar — never a button in a row (§3). It is LOCAL
// STATE in whatever screen owns the list (Home, and later Time), so the list
// behind it stays mounted and the master–detail illusion holds. Routing it would
// unmount the list, which is the whole thing that makes a sheet feel like a
// sheet. Home and Time import THIS ONE FILE so the day looks identical from both.
//
// ── NO ACTIONS, AND THE SHEET SAYS SO (§6) ───────────────────────────────────
//
// A correction needs a reason and a date range — that is a form, not a record
// inspector. The footer note names where to go instead of growing a button.
//
// ── NEVER A DASH (§8) ────────────────────────────────────────────────────────
//
// An unmeasured break is 0m, an unknown work mode is N/A. Punch times are
// wall-clock — fmtClockTime, never a Date that shifts by timezone, so 9:14 in
// Chennai reads 9:14 to a payroll admin in another zone.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { attendanceAPI } from '../../../api';
import { unwrap } from '../../../lib/normalize';
import { fmtClockMinutes, fmtClockTime, fmtDate } from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { space } from '../../../theme/tokens';
import {
  EmptyState, ErrorState, RecordSheet, SheetFooterNote, SheetGrid, SheetSection,
  SheetStats, SheetTable, SheetText, StatusBadge,
} from '../../../ui';

/* Defensive readers — the daily-log shape is not pinned in NativeRef/10-api, so
   each value is read from the handful of spellings the gateway uses elsewhere,
   and absence stays absence (never 0, never a dash). */
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const first = (obj, ...keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined && v !== null) ?? null;

const workedMins = (d) => num(first(d, 'worked_minutes', 'effective_minutes'))
  ?? (num(first(d, 'worked_hours', 'effective_hours')) != null ? Math.round(num(first(d, 'worked_hours', 'effective_hours')) * 60) : null);
const breakMins = (d) => num(first(d, 'break_minutes', 'break_duration_minutes', 'total_break_minutes')) ?? 0;
const lateMins = (d) => num(first(d, 'late_minutes', 'late_by_minutes'));
const otMins = (d) => num(first(d, 'overtime_minutes')) ?? (num(first(d, 'overtime_hours')) != null ? Math.round(num(first(d, 'overtime_hours')) * 60) : null);

const punchesOf = (d) => (Array.isArray(d?.punches) ? d.punches : Array.isArray(d?.sessions) ? d.sessions : []);
const breaksOf = (d) => (Array.isArray(d?.breaks) ? d.breaks : []);

const whereOf = (p) => p?.location_name || p?.office_name || (p?.work_mode ? humanize(p.work_mode) : '') || '—';
const inOf = (p) => fmtClockTime(first(p, 'clock_in_time', 'in_time', 'start_time', 'punch_in'), '—');
const outOf = (p) => fmtClockTime(first(p, 'clock_out_time', 'out_time', 'end_time', 'punch_out'), '—');

export function DayLogSheet({ date, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, day: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, day: null });
    attendanceAPI.getDailyLog(date)
      .then((res) => { if (!cancelled) setState({ loading: false, error: null, day: unwrap(res) || null }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, error, day: null }); });
    return () => { cancelled = true; };
  }, [date]);

  const { loading, error, day } = state;
  const eyebrow = fmtDate(date, '');
  const statusLabel = day?.status ? humanize(day.status) : 'That day';

  // A record with an id (or any punch/figure) exists; otherwise the day is
  // genuinely empty — which reads differently from "couldn't load" (§5).
  const hasRecord = !!day && (day.id != null || punchesOf(day).length > 0 || workedMins(day) != null);

  const wm = day?.work_mode ? humanize(day.work_mode) : 'N/A';
  const breakList = breaksOf(day);

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={eyebrow}
      title={hasRecord ? statusLabel : 'That day'}
      badge={hasRecord && day?.status ? <StatusBadge kind="record" status={day.status} /> : null}
      loading={loading}
      footer={hasRecord ? (
        <SheetFooterNote>Something wrong with this day? Request a correction from My Time.</SheetFooterNote>
      ) : null}
    >
      {error ? (
        <ErrorState
          error={error}
          domain="attendance"
          onRetry={() => setState((s) => ({ ...s }))}
          fallback="We couldn’t load this day."
        />
      ) : !hasRecord ? (
        <EmptyState
          title="Nothing was recorded on this day"
          message="No punches, leave or holiday — there’s nothing to show here."
        />
      ) : (
        <>
          <SheetStats
            cols={2}
            items={[
              { label: 'Worked', value: fmtClockMinutes(workedMins(day), { short: true }, 'N/A') },
              { label: 'Break', value: fmtClockMinutes(breakMins(day), { short: true }, '0m') },
              { label: 'Late', value: lateMins(day) != null ? fmtClockMinutes(lateMins(day), { short: true }, '0m') : 'N/A' },
            ]}
          />

          <SheetSection title="Punches" collapsible={false} style={{ marginTop: space[4] }}>
            <SheetTable
              columns={[
                { header: 'In', render: (p) => inOf(p) },
                { header: 'Out', render: (p) => outOf(p) },
                { header: 'Where', render: (p) => whereOf(p), width: 140 },
              ]}
              rows={punchesOf(day)}
              empty="No punches recorded."
            />
          </SheetSection>

          <SheetSection
            title={breakList.length ? `Breaks · ${fmtClockMinutes(breakMins(day), { short: true }, '0m')}` : 'Breaks'}
            defaultOpen={breakList.length <= 2}
            style={{ marginTop: space[3] }}
          >
            <SheetTable
              columns={[
                { header: 'Start', render: (b) => fmtClockTime(first(b, 'start_time', 'break_start', 'started_at'), '—') },
                { header: 'End', render: (b) => fmtClockTime(first(b, 'end_time', 'break_end', 'ended_at'), '—') },
              ]}
              rows={breakList}
              empty="No breaks taken."
            />
          </SheetSection>

          <SheetSection title="How this day was counted" collapsible={false} style={{ marginTop: space[3] }}>
            <SheetGrid
              cols={2}
              items={[
                { label: 'Effective hours', value: fmtClockMinutes(workedMins(day), { short: true }, 'N/A') },
                { label: 'Overtime', value: otMins(day) != null ? fmtClockMinutes(otMins(day), { short: true }, '0m') : 'N/A' },
                { label: 'Status', value: day?.status ? humanize(day.status) : 'N/A' },
                { label: 'Work mode', value: wm },
              ]}
            />
          </SheetSection>

          {day?.status_note || day?.remarks || day?.note ? (
            <SheetSection title="Note" collapsible={false} style={{ marginTop: space[3] }}>
              <SheetText>{day.status_note || day.remarks || day.note}</SheetText>
            </SheetSection>
          ) : null}
        </>
      )}
    </RecordSheet>
  );
}

export default DayLogSheet;
