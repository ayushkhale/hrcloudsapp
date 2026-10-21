// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/TimeCards.jsx — the two shapes that are ONLY
// about attendance. The generic card kit (CategoryStrip, CardShell,
// RecordCard, StatCards, CardsSkeleton, cardListStyle) moved to
// `ui/ListCards.jsx` on 2026-10-18 when My Pay needed every one of them; its
// header says why.
//
// ── WHY THIS EXISTS (2026-10-17) ─────────────────────────────────────────────
//
// My Time was five flat lists of `ui/Row` separated by hairlines, under a strip
// of text tabs. That is a web table with the chrome taken off: every row the
// same height, the same weight and the same shape, so a month of attendance
// scrolled past as one grey block and nothing — not a flagged day, not a
// pending request — stood out from anything else.
//
// What a phone wants instead is OBJECTS: a card per record, with a tinted
// identity on the left, the fact in the middle and the number on the right.
// This file holds the two that know what a working day is:
//
//   MonthHero  the month's headline, with the stepper inside it
//   DayCard    one day of attendance — its punches, its chip, its hours
//
// ── THE COLOURS ARE THE DAY CHIPS, NOT NEW ONES ──────────────────────────────
//
// A day's tint comes from `dayChipKey` → `DAY_CHIPS[key].tone` → `toneOf`, the
// same chain the calendar grid, the status badges and (since today) the Home
// chart use. Nine states, one source. Do not introduce a tenth here.
//
// ── CARDS HERE, FLAT ON HOME ─────────────────────────────────────────────────
//
// Home is white and flat by decision (see HomeScreen's header): it has no list,
// so card edges there were three frames around nothing. My Time is nothing BUT
// lists, so its rows need edges to be objects — and they sit on `color.bg`
// (slate-50), which is what white cards need underneath them. What must never
// happen is both treatments on the same screen.
//
// ── NO CORRECTION BUTTON ON THE CARD (user, 2026-10-22) ─────────────────────
//
// It had a "Request a correction" button for one day, and the user took it
// back off: "I don't want request a correction on attendance screen, just
// when user opens that day". The way in is the day page (DayLogScreen).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { DAY_CHIPS, dayChipKey } from '../../../lib/dayStatus';
import {
  fmtMinutes, fmtTime, monthLabel, parseYMDLocal, ymdOnly,
} from '../../../lib/dates';
import { WEEKDAYS_SHORT } from '../../../lib/format';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { MonthStepper, SkeletonBlock, StatusBadge } from '../../../ui';
import { CardShell } from '../../../ui/ListCards';

/* ─── MonthHero ───────────────────────────────────────────────────────────────
   The one thing somebody opening My Time wants: how this month is going. The
   stepper lives INSIDE it rather than above the tabs, which is also the honest
   place for it — only this section has a month (see TimeScreen's header).

   Soft purple rather than the dark hero gradient, so the MonthStepper's own
   dark chevrons and label stay legible without an on-dark variant of a shared
   component. It is the same block as the day sheet's hero, on purpose. */

export function MonthHero({ period, onChangePeriod, headline, caption, facts = [], loading = false }) {
  // The soft hero gradient (2026-10-20) — the same surface as ui/HeroCard, so
  // every tab root opens on one kind of card.
  return (
    <LinearGradient
      colors={[color.heroSoftFrom, color.heroSoftVia, color.heroSoftTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.heroSoftBorder,
        padding: space[4],
        gap: space[4],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Text style={[text.label, { color: color.brandSoftFg }]}>This month</Text>
        <MonthStepper year={period.year} month={period.month} onChange={onChangePeriod} short />
      </View>

      <View style={{ opacity: loading ? 0.5 : 1, gap: space[4] }}>
        <View>
          {loading ? (
            <SkeletonBlock height={34} width="45%" />
          ) : (
            <Text style={[text.metricLg, { fontSize: 34, lineHeight: 38, color: color.ink }]}>{headline}</Text>
          )}
          <Text style={[text.small, { marginTop: 2 }]}>
            {`worked in ${monthLabel(period.year, period.month)}${caption ? ` · ${caption}` : ''}`}
          </Text>
        </View>

        {/* Divided, not boxed: tiles inside a tinted block is a frame inside a
            frame, and these three are captions to the number above them. */}
        <View style={{ flexDirection: 'row' }}>
          {facts.map((f, i) => (
            <React.Fragment key={f.label}>
              {i > 0 ? <View style={{ width: 1, backgroundColor: color.brandSoftBorder }} /> : null}
              <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }}>
                <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 16 }]}>{f.value}</Text>
                <Text numberOfLines={1} style={[text.label, { fontSize: 9, color: color.textMuted }]}>
                  {f.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

/* ─── DateBlock ───────────────────────────────────────────────────────────────
   The card's identity: the day number over its weekday, tinted by what the day
   WAS. A Sunday reads slate, leave reads purple, an absence reads rose — so a
   month of cards can be skimmed by colour before a word is read. */

function DateBlock({ ymd, chipKey }) {
  const t = toneOf(DAY_CHIPS[chipKey]?.tone || 'slate');
  const d = parseYMDLocal(ymd);

  return (
    <View
      style={{
        width: 46,
        paddingVertical: space[2],
        borderRadius: radius.md,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: 'center',
      }}
    >
      <Text style={[text.bodyStrong, { fontSize: 17, lineHeight: 21, color: t.fg, fontVariant: ['tabular-nums'] }]}>
        {d ? d.getDate() : '—'}
      </Text>
      <Text style={[text.label, { fontSize: 9, color: t.fg, opacity: 0.8 }]}>
        {d ? WEEKDAYS_SHORT[d.getDay()] : ''}
      </Text>
    </View>
  );
}

/** "9:14 am → 6:42 pm", and just the one side when the day is still open. */
function punchLine(record) {
  const inAt = fmtTime(record?.clock_in_time, '');
  const outAt = fmtTime(record?.clock_out_time, '');
  if (!inAt && !outAt) return null;
  return `${inAt || 'Not recorded'} → ${outAt || 'still open'}`;
}

/**
 * One day of attendance.
 *
 * @param {object} props
 * @param {object} props.record  a dense `/attendance/history` row
 * @param {string} [props.today] injectable for tests
 * @param {Function} [props.onPress]
 */
export function DayCard({ record, today, onPress }) {
  const ymd = ymdOnly(record?.date);
  const chipKey = dayChipKey({ ...record, date: ymd }, today);
  const chip = DAY_CHIPS[chipKey];

  const worked = record?.worked_minutes ?? record?.effective_minutes
    ?? (record?.effective_hours != null ? Math.round(Number(record.effective_hours) * 60) : null);
  const late = Number(record?.late_minutes) > 0 ? Number(record.late_minutes) : 0;

  const punches = punchLine(record);
  // A day with no punches says what it WAS instead of showing an empty line —
  // "Weekly off" is more use than a blank row with a badge on it.
  const line = punches || chip.label;
  const note = late > 0 ? `${fmtMinutes(late)} late`
    : record?.work_mode ? String(record.work_mode).replace(/_/g, ' ')
    : null;

  return (
    <CardShell onPress={onPress} accessibilityLabel={`${line}. Open this day.`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <DateBlock ymd={ymd} chipKey={chipKey} />

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={text.bodyStrong}>{line}</Text>
          {note ? (
            <Text
              numberOfLines={1}
              style={[text.caption, late > 0 ? { color: color.danger.fg } : null]}
            >
              {note}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {worked != null ? (
            <Text style={[text.smallStrong, { fontSize: 14, fontVariant: ['tabular-nums'] }]}>
              {fmtMinutes(worked, '0m')}
            </Text>
          ) : null}
          <StatusBadge kind="record" status={record?.status || 'not_marked'} dense />
        </View>
      </View>

    </CardShell>
  );
}


export default { MonthHero, DayCard };
