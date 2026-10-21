// ─────────────────────────────────────────────────────────────────────────────
// ui/SheetParts.jsx — the six things a RecordSheet is made of.
//
// Web ancestors, one for one: DetailStats · DetailSection · DetailGrid ·
// DetailTable · DetailText · DetailFooterNote.
//
// Reference implementation to copy the composition from: the salary history
// dialog in roles/hr/payroll/screens/EmployeeSalaryStructuresPage.jsx.
//
// ── THE PHONE CHANGES EXACTLY TWO NUMBERS ────────────────────────────────────
//
//   DetailGrid  max 4 columns → SheetGrid  MAX 2
//   DetailStats 4 across      → SheetStats 2 across
//
// Everything else is identical, deliberately: long or secondary sections start
// FOLDED with their total in the title, `collapsible={false}` pins one open,
// money splits Earnings / Deductions, and an empty value is "N/A" and never a
// dash.
//
// ── THE SHEET IS WHITE, THE BLOCKS ARE GREY (2026-10-18) ────────────────────
//
// User decision, on a screenshot of a DayLogSheet: "the ui of bottomsheets is
// weird somewhere white patches somewhere all grey either go for full grey or
// white". It was BOTH — a slate-50 panel between a white header and a white
// footer, with white cards floating in the grey middle, three tones in one
// sheet and no rule saying which meant what.
//
// There is a rule now, and it alternates exactly once:
//
//   the sheet panel        WHITE      (surface)      — header, body, footer
//   a block on it          GREY       (surfaceSubtle) + a `border` hairline
//   a block inside THAT    WHITE      (surface)      — table rows, SheetText
//
// So SheetStats tiles are grey, table rows are white, and a fourth tone — or
// a white block sitting directly on the panel — puts the patches back.
//
// ── A SECTION IS A LABEL, NOT A BOX (2026-10-18) ────────────────────────────
//
// Same user, same screenshot: a leave sheet where "Why you applied" was a
// bordered card and the four words inside it were a SECOND bordered card.
//
//   "why you applied and reason is again under a box, whyy, there are so much
//    things like this ... we dont have that much space in app, its not web"
//
// Correct. A phone is 360pt wide and a nested border costs 2pt of frame and
// 24pt of padding to say nothing. So:
//
//   • `SheetSection` draws NO box by default — a purple glyph, an 11px
//     uppercase label, the content. `boxed` brings the card back for the rare
//     block that genuinely is a container.
//   • `SheetText` draws no box at all, ever. It is the sentence.
//   • Nothing nests a bordered thing inside a bordered thing. If you want to
//     separate two blocks, use the gap — it is already there.
//
// ── WHERE THE ⓘ GOES IN HERE ────────────────────────────────────────────────
//
// Every part takes a `help` — `{ surface, field }` — and passes it to
// <FieldHelp>, which renders NOTHING when the config has no entry for this
// workspace. So you can pass it liberally; the config decides.
//
//   • SheetSection → in the header's right-hand area. NEVER on the fold
//     toggle: one tap would collapse the section and open the popover.
//   • SheetTable   → on the COLUMN HEADER, never per row. Twenty rows means
//     twenty identical ⓘs explaining the same column.
//   • SheetGrid / SheetStats → on the item's label.
// ── 2026-10-20: CARDS ON THE CANVAS, INFO ROWS, A TIMELINE ──────────────────
//
// User, on a correction sheet: "you have thrown data into text boxes, no ui
// nothing for bottomsheet … the ui is so text written on white screen". True:
// every section was an 11px grey label over a body sentence, so a record read
// as a column of captions. The reference "Request details" sheet is the shape
// now, and EVERY sheet gets it from here with no screen changing:
//
//   the sheet body          CANVAS     (color.bg)     — RecordSheet
//   a section               WHITE CARD (surface + hairline), a tinted icon chip
//                           and a sentence-case title — not an 11px caption
//   SheetGrid inside it     INFO ROWS: label left (muted), value right (bold),
//                           a hairline between rows; a long value stacks
//   SheetStats              white tiles, icon chip, an 18pt figure
//   SheetTimeline (new)     the review trail as check circles on a rail
//
// Still ONE level of enclosure: a section card never holds another card.
// SheetGrid / SheetStats / SheetText outside a section draw their own card;
// inside one they draw none (SectionContext says which). The 2026-10-18 rule
// below — "a section is a label, not a box" — was about nested boxes, and
// that stays true: card → rows, never card → card.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { displayValue } from '../lib/format';
import { icons } from '../theme/icons';
import { color, elevate, iconSize, radius, space, text, toneOf } from '../theme/tokens';
import { FieldHelp } from './FieldHelp';

/** True inside a SheetSection card, so its children draw no card of their own. */
const SectionContext = createContext(false);

/** The white card every sheet block sits in. One level, never nested. */
const cardStyle = {
  backgroundColor: color.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: color.borderSubtle,
  ...elevate('xs'),
};

function Card({ children, style }) {
  const inSection = useContext(SectionContext);
  if (inSection) return <View style={style}>{children}</View>;
  return <View style={[cardStyle, { paddingHorizontal: space[4], paddingVertical: space[2] }, style]}>{children}</View>;
}

/** A tinted icon chip — the thing that says which block you are reading. */
function Chip({ icon: Icon, tone = 'purple', size = 30 }) {
  if (!Icon) return null;
  const t = toneOf(tone);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size, height: size, borderRadius: size / 3,
        backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.55)} color={t.fg} />
    </View>
  );
}

/* ─── SheetStats ──────────────────────────────────────────────────────────────
   The headline numbers, read before anything else. TWO ACROSS on a phone. */

/**
 * @param {object} props
 * @param {Array<{label: string, value: any, caption?: string, icon?: Function,
 *   help?: {surface: string, field: string}, tone?: string}>} props.items
 */
export function SheetStats({ items = [], cols = 2, style }) {
  const inSection = useContext(SectionContext);
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }, style]}>
      {items.filter(Boolean).map((item, i) => {
        const t = toneOf(item.tone || 'purple');
        return (
          <View
            key={item.label || i}
            style={[
              {
                flexGrow: 1,
                flexBasis: cols === 1 ? '100%' : '45%',
                paddingHorizontal: space[3],
                paddingVertical: space[3],
                gap: 6,
              },
              // A tile is a card on the canvas; inside a section card it is a
              // tinted block instead, so it is never a card in a card.
              inSection
                ? { backgroundColor: color.surfaceSubtle, borderRadius: radius.md }
                : { ...cardStyle, borderRadius: radius.md + 2 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              {item.icon ? <Chip icon={item.icon} tone={item.tone} size={24} /> : (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot }} />
              )}
              <Text numberOfLines={2} style={[text.small, { flexShrink: 1, color: color.textSecondary }]}>
                {item.label}
              </Text>
              {item.help ? <FieldHelp {...item.help} /> : null}
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[text.metric, { fontSize: 19, lineHeight: 24, color: color.ink }]}
            >
              {displayValue(item.value)}
            </Text>
            {/* A caption is for a qualifier ("left", "paid", "this month") — NOT
                a unit. formatDayCount() already carries its own unit. */}
            {item.caption ? <Text style={text.caption}>{item.caption}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/* ─── SheetSection ───────────────────────────────────────────────────────── */

/**
 * A titled WHITE CARD that folds.
 *
 * @param {object} props
 * @param {string} props.title  PUT THE TOTAL IN IT when the section is folded
 *   — "Deductions (₹17,568)".
 * @param {boolean} [props.defaultOpen]  `false` for long or secondary sections
 * @param {boolean} [props.collapsible]  `false` pins it open
 * @param {boolean} [props.boxed]  kept for old callers; every section is a card now
 * @param {string} [props.tone]   the icon chip's tone
 * @param {{surface: string, field: string}} [props.help]
 */
export function SheetSection({
  title,
  subtitle,
  icon,
  tone = 'purple',
  defaultOpen = true,
  collapsible = true,
  help,
  right,
  children,
  style,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? icons.chevronUp : icons.chevronDown;
  const shown = collapsible ? open : true;

  return (
    <View style={[cardStyle, { overflow: 'hidden' }, style]}>
      <Pressable
        accessibilityRole={collapsible ? 'button' : 'header'}
        accessibilityState={collapsible ? { expanded: open } : undefined}
        accessibilityHint={collapsible ? (open ? 'Collapses this section' : 'Expands this section') : undefined}
        disabled={!collapsible}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingHorizontal: space[4],
          paddingTop: space[3],
          paddingBottom: shown ? space[2] : space[3],
          minHeight: 48,
          backgroundColor: pressed && collapsible ? color.surfaceSubtle : 'transparent',
        })}
      >
        <Chip icon={icon} tone={tone} />
        <View style={{ flex: 1 }}>
          <Text style={[text.h3, { color: color.ink }]}>{title}</Text>
          {subtitle ? <Text style={text.caption}>{subtitle}</Text> : null}
        </View>
        {/* The ⓘ must not collapse the section — it stops its own press. */}
        {help ? <FieldHelp {...help} /> : null}
        {right}
        {collapsible && Chevron ? <Chevron size={iconSize.sm} color={color.textMuted} /> : null}
      </Pressable>

      {shown ? (
        <SectionContext.Provider value>
          <View style={{ paddingHorizontal: space[4], paddingBottom: space[3], gap: space[2] }}>
            {children}
          </View>
        </SectionContext.Provider>
      ) : null}
    </View>
  );
}

/* ─── SheetGrid ───────────────────────────────────────────────────────────── */

const normalizeItem = (item) => (Array.isArray(item)
  ? { label: item[0], value: item[1] }
  : item);

/**
 * INFO ROWS — label on the left, the value on the right in bold, a hairline
 * between rows. The reference "Request information" list. A `wide` item, or a
 * value too long for the right half, stacks under its label instead.
 *
 * `cols` is accepted for old callers and ignored: a two-column grid of labels
 * over values is exactly the "text thrown on a screen" this replaced.
 *
 * @param {object} props
 * @param {Array<[string, any]|{label: string, value: any, help?: object,
 *   wide?: boolean, icon?: Function}>} props.items
 */
export function SheetGrid({ items = [], style }) {
  const rows = items.filter(Boolean).map(normalizeItem);
  if (!rows.length) return null;
  return (
    <Card style={style}>
      {rows.map((item, i) => {
        const value = displayValue(item.value);
        const isText = typeof value === 'string' || typeof value === 'number';
        const stack = item.wide || (isText && String(value).length > 26);
        const Icon = item.icon;
        return (
          <View
            key={item.label || i}
            style={{
              flexDirection: stack ? 'column' : 'row',
              alignItems: stack ? 'stretch' : 'center',
              justifyContent: 'space-between',
              gap: stack ? 3 : space[3],
              paddingVertical: space[2] + 2,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: color.borderSubtle,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1 }}>
              {Icon ? <Icon size={iconSize.sm} color={color.textMuted} /> : null}
              <Text style={[text.small, { color: color.textSecondary, flexShrink: 1 }]}>{item.label}</Text>
              {item.help ? <FieldHelp {...item.help} /> : null}
            </View>
            {/* displayValue keeps a real 0 and turns absence into "N/A". */}
            {isText ? (
              <Text
                style={[
                  text.bodyStrong,
                  {
                    color: value === 'N/A' ? color.textMuted : color.ink,
                    textAlign: stack ? 'left' : 'right',
                    flexShrink: 1,
                    fontVariant: ['tabular-nums'],
                  },
                ]}
              >
                {value}
              </Text>
            ) : value}
          </View>
        );
      })}
    </Card>
  );
}

/* ─── SheetTimeline ──────────────────────────────────────────────────────────
   A record's trail — submitted, reviewed, decided — as check circles on a
   rail, the reference "Status update". `state`: 'done' (a filled check),
   'current' (a ring — waiting on somebody), 'rejected' (rose), 'upcoming'
   (a muted dot). */

const STEP_STYLE = {
  done: { bg: color.success.dot, fg: color.textOnBrand, glyph: 'check' },
  current: { bg: color.pending.chip, fg: color.pending.fg, glyph: 'clock' },
  rejected: { bg: color.danger.dot, fg: color.textOnBrand, glyph: 'close' },
  upcoming: { bg: color.neutral.chip, fg: color.textMuted, glyph: null },
};

/**
 * @param {object} props
 * @param {Array<{title: string, when?: string, note?: string,
 *   state?: 'done'|'current'|'rejected'|'upcoming'}>} props.steps
 */
export function SheetTimeline({ steps = [], style }) {
  const list = steps.filter(Boolean);
  if (!list.length) return null;
  return (
    <Card style={[{ paddingVertical: space[3] }, style]}>
      {list.map((s, i) => {
        const st = STEP_STYLE[s.state || 'done'] || STEP_STYLE.done;
        const Glyph = st.glyph ? icons[st.glyph] : null;
        const last = i === list.length - 1;
        return (
          <View key={`${s.title}-${i}`} style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ alignItems: 'center', width: 26 }}>
              <View
                style={{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: st.bg,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {Glyph ? <Glyph size={14} color={st.fg} /> : null}
              </View>
              {!last ? (
                <View style={{ flex: 1, width: 2, minHeight: 14, backgroundColor: color.border, marginVertical: 2 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : space[4], gap: 2, paddingTop: 3 }}>
              <Text style={[text.bodyStrong, { color: color.ink }]}>{s.title}</Text>
              {s.when ? <Text style={text.caption}>{s.when}</Text> : null}
              {s.note ? (
                <Text style={[text.small, { color: color.textBody, marginTop: 2 }]}>{s.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/* ─── SheetTable ─────────────────────────────────────────────────────────── */

/**
 * Line items: payslip components, loan instalments, punches, breaks.
 *
 * `fit` — the columns FLEX to the width of the sheet (≤ 3 columns, no fixed
 * widths). `scroll` — fixed-width columns in a horizontal scroller, for the
 * money tables where a squeezed column wraps "₹1,23,456". `auto` picks.
 *
 * @param {object} props
 * @param {Array<{header: string, render: Function, align?: 'left'|'right',
 *   width?: number, flex?: number, help?: object}>} props.columns
 * @param {Array<object>} props.rows
 * @param {string} [props.empty]  what "no rows" means, in words
 * @param {'auto'|'fit'|'scroll'} [props.layout]
 */
export function SheetTable({
  columns = [], rows = [], empty = 'Nothing to show.', layout = 'auto', style,
}) {
  const inSection = useContext(SectionContext);
  const anyFixedWidth = columns.some((c) => c?.width);
  const mode = layout === 'auto'
    ? (columns.length <= 3 && !anyFixedWidth ? 'fit' : 'scroll')
    : layout;

  if (!rows.length) {
    return <Text style={[text.small, { color: color.textMuted }]}>{empty}</Text>;
  }

  const cellWidth = (col) => (mode === 'fit'
    ? { flex: col?.flex || 1, minWidth: 0 }
    : { width: col?.width || 120 });

  const body = (
    <View style={mode === 'fit' ? { width: '100%' } : null}>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: color.brandSoftBg,
          borderBottomWidth: 1,
          borderBottomColor: color.borderSubtle,
        }}
      >
        {columns.map((col, c) => (
          <View
            key={col.header || c}
            style={{
              ...cellWidth(col),
              paddingHorizontal: space[3],
              paddingVertical: space[2],
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
              gap: 2,
            }}
          >
            <Text style={[text.small, { color: color.brandSoftFg, fontFamily: text.bodyStrong.fontFamily }]}>
              {col.header}
            </Text>
            {col.help ? <FieldHelp {...col.help} /> : null}
          </View>
        ))}
      </View>

      {rows.map((row, r) => (
        <View
          key={row?.id || r}
          style={{
            flexDirection: 'row',
            borderBottomWidth: r === rows.length - 1 ? 0 : 1,
            borderBottomColor: color.borderSubtle,
            backgroundColor: color.surface,
          }}
        >
          {columns.map((col, c) => {
            const content = col.render ? col.render(row, r) : null;
            return (
              <View
                key={c}
                style={{
                  ...cellWidth(col),
                  paddingHorizontal: space[3],
                  paddingVertical: space[2] + 2,
                  alignItems: col.align === 'right' ? 'flex-end' : 'flex-start',
                }}
              >
                {typeof content === 'string' || typeof content === 'number' ? (
                  <Text style={[text.small, { color: color.textPrimary, fontVariant: ['tabular-nums'] }]}>
                    {displayValue(content)}
                  </Text>
                ) : content ?? (
                  <Text style={[text.small, { color: color.textMuted }]}>N/A</Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View
      style={[{
        borderWidth: 1,
        borderColor: color.borderSubtle,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: color.surface,
      }, !inSection ? elevate('xs') : null, style]}
    >
      {mode === 'fit' ? body : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {body}
        </ScrollView>
      )}
    </View>
  );
}

/* ─── SheetText ──────────────────────────────────────────────────────────── */

/**
 * A reason or a note, as the person typed it. Inside a section it is the
 * section's sentence; on its own it sits in a card, so it never floats as
 * bare text on the canvas.
 */
export function SheetText({ children, empty = 'No reason given.', style }) {
  const value = typeof children === 'string' ? children.trim() : children;
  const inSection = useContext(SectionContext);
  const node = value
    ? <Text style={[text.body, { color: color.textPrimary, lineHeight: 21 }, style]}>{value}</Text>
    : <Text style={[text.small, { color: color.textMuted }]}>{empty}</Text>;
  if (inSection) return node;
  return <View style={[cardStyle, { padding: space[4] }]}>{node}</View>;
}

/* ─── SheetFooterNote ───────────────────────────────────────────────────── */

/**
 * SAYS WHY THERE ARE NO ACTIONS — the difference between a sheet that looks
 * finished and one that looks broken. Pass it as RecordSheet's `footer`.
 */
export function SheetFooterNote({ children, style }) {
  const Info = icons.info;
  return (
    <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }, style]}>
      {Info ? <Info size={iconSize.info} color={color.textMuted} style={{ marginTop: 1 }} /> : null}
      <Text style={[text.caption, { flex: 1, color: color.textSecondary, lineHeight: 16 }]}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Money, split the house way: Earnings on the left, Deductions on the right,
 * each with its own total in the heading.
 */
export function SheetMoneySplit({ earnings, deductions, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: space[3] }, style]}>
      <View style={{ flex: 1 }}>{earnings}</View>
      <View style={{ flex: 1 }}>{deductions}</View>
    </View>
  );
}
