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
//   DayCard    one day of attendance, as the house RecordCard (2026-10-22)
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
  fmtDateShort, fmtMinutes, fmtTime, monthLabel, todayYMD, ymdOnly,
} from '../../../lib/dates';
import { humanize, normalizeStatusKey } from '../../../lib/enums';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { MonthStepper, SkeletonBlock, StatusBadge } from '../../../ui';
import { RecordCard } from '../../../ui/ListCards';

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

/* ─── DayCard ─────────────────────────────────────────────────────────────────
   One day of attendance, as a RecordCard — the same card as a correction
   (user, 2026-10-22: "show attendance cards, overtime, every row like the
   correction cards — they look better"). It used to be its own shape: a
   calendar-style date block on the left, the punch line in the middle, hours
   and a badge stacked on the right. Now it is the house card:

     icon + tint   what the day WAS (DAY_CHIPS → tone), so a month of cards
                   still skims by colour before a word is read
     title         the date, "Tue, 14 Oct" — a correction's title too
     subtitle      the one thing worth saying: late by how much, the work
                   mode, or for a day with no punches what it was ("Weekly off")
     badge         the record's status
     meta strip    Clock in · Clock out · Worked, under a hairline */


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

  const inAt = fmtTime(record?.clock_in_time, '');
  const outAt = fmtTime(record?.clock_out_time, '');
  const punched = !!(inAt || outAt);
  const isToday = ymd === (today || todayYMD());

  const subtitle = late > 0 ? `${fmtMinutes(late)} late`
    : record?.work_mode ? humanize(record.work_mode)
    : !punched ? chip?.label
    : null;

  // Never a dash (§5): a side that didn't happen says so in words. Today's
  // open day is "Still open"; an old one missing its clock-out is "Not
  // recorded" — the thing a correction is for.
  const meta = punched ? [
    { label: 'Clock in', value: inAt || 'Not recorded' },
    { label: 'Clock out', value: outAt || (isToday ? 'Still open' : 'Not recorded') },
    worked != null ? { label: 'Worked', value: fmtMinutes(worked, '0m') } : null,
  ].filter(Boolean) : [];

  const status = (() => {
    const raw = normalizeStatusKey(record?.status);
    if (raw === 'in_progress') return 'in_progress';
    if (isToday && inAt && !outAt && raw !== 'absent' && raw !== 'on_leave') return 'in_progress';
    if (raw && raw !== 'not_marked') return raw;
    if (chipKey && chipKey !== 'no_data') return chipKey;
    return raw || 'not_marked';
  })();

  return (
    <RecordCard
      icon={icons.calendar}
      tone="purple"
      onPress={onPress}
      accessibilityLabel={`${fmtDateShort(ymd, 'This day')}, ${chip?.label || ''}. Open this day.`}
      title={fmtDateShort(ymd, 'That day')}
      subtitle={subtitle}
      badge={<StatusBadge kind="record" status={status} dense />}
      meta={meta}
    />
  );
}

export default { MonthHero, DayCard };
