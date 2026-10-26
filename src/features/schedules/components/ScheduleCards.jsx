// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/components/ScheduleCards.jsx — the pieces My Schedules is
// built from. Every one is a house shape, so the tab reads like My Time:
//
//   ScheduleHero   the soft gradient card every tab root opens on (MonthHero's
//                  surface): the next day off, the next holiday, four figures
//   AgendaDayCard  one day, as a RecordCard — the correction card's structure
//                  (user, 2026-10-22) — with the day's due items in its body
//   DueItemRow     one thing falling due, as a 44pt row inside a day card
//   WeekdayOffRow  seven chips, Sun→Sat, the off ones filled — the web's
//                  weekday grid at phone width
//   GradingLadder  the hours bands a day is graded into
//   RuleCard       one published rule: label, figure, and what it means
//   LaneNotice     "couldn't load your tasks" / "showing the first 500" — the
//                  per-lane honesty the agenda contract exists for (guide §6)
//
// WHAT EACH ONE SAYS lives in ../scheduleMeta.js and lib/policyRules.js, both
// ported from the web (§10); this file only draws it. The hero's figures are
// `summaryTiles()` — four tiles, the same four the web shows, including the
// "Falling due" count this screen used to drop while printing weekly offs and
// holidays as two separate figures the web had deliberately merged.
//
// THE LADDER IS THE ONE DRAWN FIGURE HERE, for the web's reason: "4h half ·
// 8h full" is the line people misread on this screen, because it doesn't say
// what happens BELOW the first threshold. As bands it does. Everything else is
// a label and a number, which is what §1 asks for.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { fmtDateShort, fmtMinutes } from '../../../lib/dates';
import { fullDayMinutes, halfDayMinutes, graceMinutes } from '../../../lib/policyRules';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { InlineAlert, LinkButton, Pill, SkeletonBlock } from '../../../ui';
import { RecordCard } from '../../../ui/ListCards';
import { dayTitle, presentDay, presentItem, summaryTiles } from '../scheduleMeta';

/* ─── ScheduleHero ─────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {object|null} props.summary  `data.summary` from the agenda
 * @param {boolean} props.loading      first load only — a skeleton figure
 */
export function ScheduleHero({ summary, loading = false }) {
  const nextOff = summary?.next_day_off;
  const nextHoliday = summary?.next_holiday;
  // Four tiles even before the payload lands, so the row doesn't reflow.
  const facts = summary ? summaryTiles(summary) : summaryTiles({});

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
      <View style={{ gap: 2 }}>
        <Text style={[text.label, { color: color.brandSoftFg }]}>Your next day off</Text>
        {loading ? (
          <SkeletonBlock height={30} width="55%" />
        ) : (
          <Text numberOfLines={1} style={[text.metricLg, { fontSize: 28, lineHeight: 34, color: color.ink }]}>
            {nextOff ? fmtDateShort(nextOff, '') : 'None this week'}
          </Text>
        )}
        {nextHoliday?.name ? (
          <Text numberOfLines={1} style={text.small}>
            {`Next holiday · ${nextHoliday.name}, ${fmtDateShort(nextHoliday.date, '')}`}
          </Text>
        ) : null}
      </View>

      {/* Divided, not boxed — the same four-up row as My Time's hero. */}
      <View style={{ flexDirection: 'row', opacity: loading ? 0.5 : 1 }}>
        {facts.map((f, i) => (
          <React.Fragment key={f.key}>
            {i > 0 ? <View style={{ width: 1, backgroundColor: color.brandSoftBorder }} /> : null}
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }}>
              <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 14 }]}>{f.value}</Text>
              <Text numberOfLines={1} style={[text.label, { fontSize: 9, color: color.textMuted }]}>{f.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </LinearGradient>
  );
}

/* ─── DueItemRow ───────────────────────────────────────────────────────────── */

/**
 * One thing falling due. A row, not a card — it lives in a card's body.
 * @param {Function} [props.onOpen]  given the item's route key; absent = not pressable
 */
export function DueItemRow({ item, onOpen }) {
  const p = presentItem(item);
  const t = toneOf(p.tone);
  const Icon = p.icon;
  const Chevron = icons.chevronRight;
  const pressable = !!(onOpen && p.route);

  const body = (pressed) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 44,
        paddingVertical: space[1],
        borderRadius: radius.md,
        backgroundColor: pressed ? color.brandSoftBg : 'transparent',
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.full,
          backgroundColor: t.chip,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? <Icon size={15} color={t.fg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.smallStrong}>{p.title}</Text>
        {p.when ? (
          <Text numberOfLines={1} style={[text.caption, p.overdue ? { color: color.danger.fg } : null]}>
            {p.when}
          </Text>
        ) : null}
      </View>
      {pressable && Chevron ? <Chevron size={16} color={color.textMuted} /> : null}
    </View>
  );

  if (!pressable) return body(false);
  return (
    <Pressable
      onPress={() => onOpen(p.route, item)}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}. ${p.when}`}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/* ─── AgendaDayCard ────────────────────────────────────────────────────────── */

/**
 * One day of the agenda.
 * @param {object} props.day     a `days[]` entry
 * @param {string} props.today   YYYY-MM-DD
 * @param {Function} [props.onOpenItem]
 */
export function AgendaDayCard({ day, today, onOpenItem }) {
  const p = presentDay(day);
  const items = Array.isArray(day?.items) ? day.items : [];

  return (
    <RecordCard
      icon={p.icon}
      tone={p.tone}
      title={dayTitle(day.date, today)}
      subtitle={p.subtitle ? `${p.title} · ${p.subtitle}` : p.title}
      // A word, not a status colour: these are kinds of day, not decisions.
      // An ordinary working day gets NO badge — badging every one of them is
      // what makes the exceptions invisible (scheduleMeta DAY_KINDS).
      badge={p.badge ? <Pill variant={p.off ? 'muted' : 'soft'}>{p.badge}</Pill> : null}
      meta={p.meta}
      accessibilityLabel={`${dayTitle(day.date, today)}, ${p.title}`}
    >
      {items.length ? (
        <View style={{ gap: 2 }}>
          {items.map((item, i) => (
            <DueItemRow key={`${item.kind}:${item.id || i}`} item={item} onOpen={onOpenItem} />
          ))}
        </View>
      ) : null}
    </RecordCard>
  );
}

/* ─── WeekdayOffRow ────────────────────────────────────────────────────────── */

/**
 * The week as seven chips, the days off filled. The web draws a 7-column grid
 * with "Off"/"In" under each name; at 360pt the word doesn't fit under a chip,
 * so the fill carries it and the phrase above the row says it in words — the
 * figure is never read by colour alone either way.
 * @param {{key: string, short: string, off: boolean}[]} props.days
 */
export function WeekdayOffRow({ days }) {
  const t = toneOf('purple');
  return (
    <View style={{ flexDirection: 'row', gap: space[1] }}>
      {days.map((d) => (
        <View
          key={d.key}
          accessibilityLabel={`${d.short}, ${d.off ? 'day off' : 'working'}`}
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: space[2],
            borderRadius: radius.md,
            alignItems: 'center',
            // Fill or border, not both (§5) — the off chips are the tint, the
            // working ones the plain surface behind them.
            backgroundColor: d.off ? t.chip : color.surfaceSubtle,
          }}
        >
          <Text
            numberOfLines={1}
            style={[text.label, { fontSize: 10, color: d.off ? t.fg : color.textMuted }]}
          >
            {d.short}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ─── GradingLadder ────────────────────────────────────────────────────────── */

/**
 * Minimal, clutter-free visual grading ladder for work hours.
 * Proportional 3-tier track with clean labels inspired by Attendance tabs.
 */
export function GradingLadder({ policy }) {
  const half = halfDayMinutes(policy);
  const full = fullDayMinutes(policy);
  if (half === null && full === null) return null;

  const t = toneOf('purple');
  const tiers = [];
  if (half !== null) {
    tiers.push({
      key: 'none',
      label: 'None',
      sub: `< ${fmtMinutes(half)}`,
      color: color.borderSubtle,
    });
    tiers.push({
      key: 'half',
      label: 'Half Day',
      sub: full !== null ? `${fmtMinutes(half)} – ${fmtMinutes(full)}` : `≥ ${fmtMinutes(half)}`,
      color: t.chip,
    });
  }
  if (full !== null) {
    tiers.push({
      key: 'full',
      label: 'Full Day',
      sub: `≥ ${fmtMinutes(full)}`,
      color: color.brand,
    });
  }

  return (
    <View style={{ gap: space[2] }}>
      {/* Sleek proportional visual track */}
      <View
        style={{
          flexDirection: 'row',
          height: 6,
          borderRadius: radius.full,
          overflow: 'hidden',
          backgroundColor: color.surfaceSubtle,
          gap: 3,
        }}
      >
        {tiers.map((tier) => (
          <View
            key={tier.key}
            style={{
              flex: 1,
              backgroundColor: tier.color,
              borderRadius: radius.full,
            }}
          />
        ))}
      </View>

      {/* Tier labels strip */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {tiers.map((tier, idx) => (
          <View
            key={tier.key}
            style={{
              flex: 1,
              alignItems: idx === 0 ? 'flex-start' : idx === tiers.length - 1 ? 'flex-end' : 'center',
            }}
          >
            <Text style={[text.label, { fontSize: 10, color: color.ink, fontWeight: '700' }]}>
              {tier.label}
            </Text>
            <Text style={[text.caption, { fontSize: 10, color: color.textMuted, marginTop: 1 }]}>
              {tier.sub}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── PolicyHeroCard ──────────────────────────────────────────────────────── */

/**
 * Attendance-style hero card for How days count.
 * Minimal, divided metrics inspired by MonthHero in Attendance tab.
 */
export function PolicyHeroCard({ policy, targeting, ladderShown }) {
  const half = halfDayMinutes(policy);
  const full = fullDayMinutes(policy);
  const grace = graceMinutes(policy);

  const facts = [
    { label: 'FULL DAY', value: full !== null ? fmtMinutes(full) : '—' },
    { label: 'HALF DAY', value: half !== null ? fmtMinutes(half) : '—' },
    { label: 'GRACE TIME', value: grace !== null ? (grace === 0 ? '0m' : fmtMinutes(grace)) : '—' },
  ];

  const headline = full !== null ? `${fmtMinutes(full)} Full Day` : (policy.name || 'Attendance Policy');
  const caption = half !== null
    ? `Half day at ${fmtMinutes(half)}${grace ? ` · ${fmtMinutes(grace)} grace` : ''}`
    : (targeting || (policy.is_default ? 'Organisation standard rules' : 'Assigned rule set'));

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
        <Text style={[text.label, { color: color.brandSoftFg }]}>
          {policy.name ? policy.name.toUpperCase() : 'ATTENDANCE POLICY'}
        </Text>
        <Pill variant="soft" tone="purple">
          {policy.is_default ? 'Standard' : 'Assigned'}
        </Pill>
      </View>

      <View style={{ gap: space[3.5] }}>
        {/* Divided, not boxed — matching MonthHero in Attendance tab */}
        <View style={{ flexDirection: 'row', paddingTop: space[1] }}>
          {facts.map((f, i) => (
            <React.Fragment key={f.label}>
              {i > 0 ? <View style={{ width: 1, backgroundColor: color.brandSoftBorder }} /> : null}
              <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }}>
                <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 16, color: color.ink }]}>
                  {f.value}
                </Text>
                <Text numberOfLines={1} style={[text.label, { fontSize: 9.5, color: color.textMuted }]}>
                  {f.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {ladderShown ? (
          <View style={{ paddingTop: space[1] }}>
            <GradingLadder policy={policy} />
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

/* ─── RuleCard ─────────────────────────────────────────────────────────────── */

const RULE_CONFIGS = {
  grace_minutes: {
    icon: icons.clock,
    tone: 'amber',
  },
  full_day_min_hours: {
    icon: icons.rules,
    tone: 'purple',
  },
  max_break_duration_minutes: {
    icon: icons.pause,
    tone: 'blue',
  },
  regularization_window_days: {
    icon: icons.clipboardCheck,
    tone: 'indigo',
  },
  overtime_enabled: {
    icon: icons.overtime,
    tone: 'purple',
  },
  auto_clock_out_enabled: {
    icon: icons.clockOut,
    tone: 'rose',
  },
};

/**
 * One published rule: rendered as a minimal, clutter-free RecordCard matching DayCard in Attendance tab.
 */
export function RuleCard({ rule }) {
  const config = RULE_CONFIGS[rule.key] || {
    icon: icons.info,
    tone: 'purple',
  };
  const Icon = config.icon;

  return (
    <RecordCard
      icon={Icon}
      tone={config.tone || 'purple'}
      title={rule.label}
      subtitle={rule.note}
      badge={(
        <Pill variant="soft" tone={config.tone || 'purple'}>
          {rule.value}
        </Pill>
      )}
      accessibilityLabel={`${rule.label}. ${rule.value}`}
    />
  );
}

/* ─── LaneNotice ───────────────────────────────────────────────────────────── */

export function LaneNotice({ failed = [], capped = [], onRetry }) {
  if (!failed.length && !capped.length) return null;

  const list = (ls) => ls.join(', ').replace(/, ([^,]*)$/, ' and $1');

  return (
    <View style={{ gap: space[2] }}>
      {failed.length ? (
        <View style={{ gap: space[1] }}>
          <InlineAlert tone="rose">
            {`We couldn’t load your ${list(failed)}, so some due items may be missing.`}
          </InlineAlert>
          {onRetry ? <LinkButton title="Try again" onPress={onRetry} align="left" /> : null}
        </View>
      ) : null}
      {capped.length ? (
        <InlineAlert tone="indigo">
          {`Showing the first 500 ${list(capped)}, so a few may be missing.`}
        </InlineAlert>
      ) : null}
    </View>
  );
}

export default {
  ScheduleHero, AgendaDayCard, DueItemRow, WeekdayOffRow, GradingLadder, PolicyHeroCard, RuleCard, LaneNotice,
};
