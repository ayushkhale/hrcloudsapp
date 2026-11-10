// ─────────────────────────────────────────────────────────────────────────────
// theme/tokens.js — the ONLY file in the app that holds a colour, a size, a
// radius, a shadow or a type style.
//
// Values are the exact Tailwind 3.4 colours the web app renders (read out of
// node_modules/tailwindcss/colors), so the two products look identical side by
// side. PURPLE ONLY: violet = success, fuchsia = pending, indigo = info,
// purple = brand, rose = errors/destructive/lateness/deductions, slate =
// chrome. Never add a green, amber, orange or blue value here — the web app
// mapped every one of those away on purpose (CLAUDE.md §5).
//
// Dark mode is deliberately NOT supported in v1: the web app has no dark
// theme, and a half-themed native app is worse than a light-only one. iOS locks
// it with UIUserInterfaceStyle=Light, Android with forceDarkAllowed=false.
// When it is wanted, it is a change to the `color` roles in this file and
// nothing else — which is why no component may hold a hex value.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';

/* ─── Palette ─────────────────────────────────────────────────────────────── */

export const palette = {
  purple: {
    50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc',
    500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87',
    950: '#3b0764',
  },
  /* PURPLE, GREY, WHITE — and rose for errors. That is the whole palette
     (user, 2026-10-21: "too many colors on app, only keep purple, white,
     grey like hrclouds web, also keep lavender surfaces"). violet, fuchsia
     and indigo were removed from this object, not just from use, so a new
     screen can't reach for them. The ✚ Quick Actions sheet is the one
     deliberate exception and keeps its own colours (navigation/ActionSheet).
     Red stays ONLY for errors and destructive actions (same day, asked). */
  emerald: {
    50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399',
    500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b',
  },
  amber: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
    500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f',
  },
  rose: {
    50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185',
    500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337',
  },
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
    500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
  },
  sky: {
    50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8',
    500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e',
  },
  blue: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
    500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
  },
  indigo: {
    50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
    500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
  },
  white: '#ffffff',
};

/* ─── Semantic roles — use THESE, not the ramps ───────────────────────────── */

export const color = {
  /* ── THE CANVAS (2026-10-20 UI pass) ─────────────────────────────────────
     The background used to be slate-50 — a cold grey that made every white
     card look like a form on a desk. It is now a lavender wash: still almost
     white, never pure white, but warm enough that the white cards on it read
     as soft objects rather than boxes. `canvasTop` is the faint purple glow a
     tab root fades in from (ui/Screen's `CanvasGlow`). Purple only — the
     reference shots were yellow; the brand is not. */
  bg: '#F7F5FC', // the app background. Never pure white
  // The background at zero opacity — the END of an edge fade. A fade to
  // transparent slate-50 left a grey band on the lavender (2026-10-21).
  bgClear: 'rgba(247,245,252,0)',
  canvasTop: '#EFE7FD', // purple-100 at ~70%, the glow at the top of a root
  surface: palette.white,
  surfaceSubtle: '#F8F6FC', // section headers, read-only fields, chips
  border: '#E6E1F0', // a lavender slate-200: the input and divider edge
  borderSubtle: '#EFEBF6', // the card hairline
  backdrop: 'rgba(24,14,44,0.45)', // sheet / modal scrim, an aubergine dim

  /* ── INK — the primary action (2026-10-20) ───────────────────────────────
     A near-black aubergine. The one main action on a screen is a solid INK
     pill, which reads as THE button on any surface — white, lavender, or the
     soft hero gradient — where a purple-600 fill sat at the same weight as
     every purple chip around it. It is still the brand: a purple so dark it
     is read as black, the same move the reference shots make with theirs. */
  /* INK IS GREY NOW (2026-10-21). It was a near-black aubergine used as the
     primary button fill; the user asked for purple there. Every FILL that
     used ink (Button primary, the selected FilterTabs chip, the ✚ centre
     button) now uses `brand`, and `ink` survives only as heading text —
     slate-900, the web's heading colour. */
  ink: palette.slate[900],
  inkPressed: palette.slate[800],
  inkSoft: 'rgba(15,23,42,0.06)',

  // text
  textPrimary: palette.slate[900],
  textBody: palette.slate[800],
  textSecondary: palette.slate[500],
  // 2.9:1 on white — MUTED TEXT ONLY ("N/A", placeholders, captions), never
  // for anything load-bearing. See 20-design/06-accessibility.md.
  textMuted: palette.slate[400],
  textLabel: palette.slate[600], // 7:1 — the 11px uppercase field labels
  textOnBrand: palette.white,

  // palette shortcuts (safeguard)
  slate: palette.slate,
  emerald: palette.emerald,
  amber: palette.amber,
  purple: palette.purple,
  rose: palette.rose,

  // brand
  brand: palette.purple[600],
  brandPressed: palette.purple[700],
  brandSoftBg: palette.purple[50],
  brandSoftFg: palette.purple[700],
  brandSoftBorder: palette.purple[200],
  /* An ICON CHIP at rest (2026-10-18). `brandSoftBg` is purple-50 — at 40pt
     on a slate-50 background it is indistinguishable from white, which is why
     the section strip and the tile grids read as grey boxes with grey glyphs
     however purple the palette is. A chip needs purple-100 behind a
     purple-600 glyph to be seen as purple at arm's length. The SELECTED chip
     is solid `brand` with a white glyph — the one place in a list where a
     filled purple square is allowed, because exactly one is ever filled. */
  brandChipBg: palette.purple[100],
  brandChipFg: palette.purple[600],
  // the press feedback that replaces web's hover:bg-purple-50/40
  pressTint: 'rgba(250,245,255,0.6)',

  // the hero gradient — exact web values from PageHeader.jsx
  heroFrom: palette.purple[700],
  heroVia: palette.purple[600],
  heroTo: palette.purple[800],
  heroSubtitle: palette.purple[100],
  heroBadgeIcon: palette.purple[200],
  heroBadgeBg: 'rgba(255,255,255,0.10)',
  heroBadgeBorder: 'rgba(255,255,255,0.20)',

  /* The SOFT hero — the state card at the top of a tab root (ui/HeroCard).
     Light, not dark: the dark violet block above a list read as a banner ad,
     and its "All caught up" was a shout about nothing. Three stops, top-left
     to bottom-right, purple-100 into white. Dark text sits on it. */
  heroSoftFrom: '#EADDFE',
  heroSoftVia: '#F3ECFE',
  heroSoftTo: '#FBF9FF',
  heroSoftBorder: '#E4D6FB',

  /* Semantic tones — bg / fg / border for a badge, plus the dot.

     `chip` (2026-10-18) is the SAME tone one step stronger, for a 38-42pt
     icon square. The 50 shade is correct behind 10px badge text and invisible
     behind an icon at that size, which is how a palette this purple ended up
     looking grey. Use `bg` for a badge or a block, `chip` for an icon tile. */
  /* Purple steps, told apart by depth rather than hue: done is the deepest
     ink, waiting is a lighter one, information sits between. */
  success: { bg: palette.purple[50], chip: palette.purple[100], fg: palette.purple[800], border: palette.purple[200], dot: palette.purple[700] },
  pending: { bg: palette.purple[50], chip: palette.purple[100], fg: palette.purple[600], border: palette.purple[200], dot: palette.purple[400] },
  info: { bg: palette.purple[50], chip: palette.purple[100], fg: palette.purple[700], border: palette.purple[200], dot: palette.purple[500] },
  brandTone: { bg: palette.purple[50], chip: palette.purple[100], fg: palette.purple[700], border: palette.purple[200], dot: palette.purple[500] },
  danger: { bg: palette.rose[50], chip: palette.rose[100], fg: palette.rose[700], border: palette.rose[200], dot: palette.rose[500] },
  neutral: { bg: palette.slate[50], chip: palette.slate[100], fg: palette.slate[600], border: palette.slate[200], dot: palette.slate[300] },
};

/* ─── Tone keys ───────────────────────────────────────────────────────────────
   The web app's semantic tone names, kept EXACTLY as they are so a tone map
   ported from a web file keeps working. They are historic colour names that
   now render purple — every one of them is a purple step (2026-10-21), and
   only `rose` is still red. Don't rename them. (CLAUDE.md §5) */

export const tone = {
  emerald: { bg: palette.emerald[50], chip: palette.emerald[100], fg: palette.emerald[700], border: palette.emerald[200], dot: palette.emerald[500] },
  amber: { bg: palette.amber[50], chip: palette.amber[100], fg: palette.amber[700], border: palette.amber[200], dot: palette.amber[500] },
  blue: { bg: palette.blue[50], chip: palette.blue[100], fg: palette.blue[700], border: palette.blue[200], dot: palette.blue[500] },
  sky: { bg: palette.sky[50], chip: palette.sky[100], fg: palette.sky[700], border: palette.sky[200], dot: palette.sky[500] },
  purple: color.brandTone,
  rose: color.danger,
  slate: color.neutral,
  indigo: { bg: palette.indigo[50], chip: palette.indigo[100], fg: palette.indigo[700], border: palette.indigo[200], dot: palette.indigo[500] },
  orange: { bg: palette.amber[50], chip: palette.amber[100], fg: palette.amber[800], border: palette.amber[200], dot: palette.amber[600] },
};

export const toneOf = (key) => tone[key] || tone.slate;

/* ─── Charts ──────────────────────────────────────────────────────────────────
   Validated as a SET: lightness band, chroma floor, and colour-blind
   separation between neighbouring pairs. Do not add a fifth slice —
   `late_days` overlaps `present_days` and must never appear in a total-days
   chart. */

export const chart = {
  mix: [
    // Purple by depth; absent stays rose — it is the one bad answer here.
    { key: 'present', label: 'Present', field: 'present_days', color: palette.purple[700] },
    { key: 'half', label: 'Half day', field: 'half_days', color: palette.purple[400] },
    { key: 'leave', label: 'On leave', field: 'on_leave_days', color: palette.purple[200] },
    { key: 'absent', label: 'Absent', field: 'absent_days', color: palette.rose[600] },
  ],
  hoursBar: palette.purple[600],
  trend: { present: palette.purple[600], on_leave: palette.purple[300], absent: palette.rose[500] },

  /* One fill per day chip (lib/dayStatus.js `DAY_CHIPS`), for the daily bars
     on Home's "My month".

     WHY THIS EXISTS AND `calendarHeat` DOESN'T COVER IT: the heat ramp is for
     a filled calendar CELL with text on top, so it is dark and high-contrast.
     A 11pt bar on a white plot needs the opposite — mid-weight fills that can
     sit beside each other and still be told apart at thumbnail size. Same nine
     keys, so a day can never be one colour in the chart and another in a grid.

     `edge` is the bar's 1px outline: the pale ones (holiday, weekly off, no
     data) are invisible on white without it. */
  day: {
    present: { fill: palette.purple[600], edge: palette.purple[700] },
    late: { fill: palette.purple[400], edge: palette.purple[500] },
    half_day: { fill: palette.purple[300], edge: palette.purple[400] },
    on_leave: { fill: palette.purple[200], edge: palette.purple[300] },
    absent: { fill: palette.rose[400], edge: palette.rose[500] },
    holiday: { fill: palette.purple[100], edge: palette.purple[300] },
    weekly_off: { fill: '#cbd5e1', edge: '#94a3b8' }, // slate-300 / 400
    no_data: { fill: '#e2e8f0', edge: '#cbd5e1' }, // slate-200 / 300
    upcoming: { fill: '#f1f5f9', edge: '#e2e8f0' }, // slate-100 / 200
  },
  grid: palette.slate[100],
  axisTick: { color: palette.slate[400], fontSize: 10, fontWeight: '600' },
};

/* ─── Calendar heat ───────────────────────────────────────────────────────────
   The attendance calendar's cell fill, one per day chip (lib/dayStatus.js's
   DAY_CHIPS keys). A nine-step purple ramp with slate for the non-working
   states — the one place in the app that needs this many steps, which is why
   it lives here and not in `tone`. Ported from the web `heat` classes. */

export const calendarHeat = {
  present: { bg: palette.purple[700], border: palette.purple[700], fg: palette.white },
  late: { bg: palette.purple[400], border: palette.purple[400], fg: palette.white },
  half_day: { bg: palette.purple[300], border: palette.purple[300], fg: palette.purple[950] },
  on_leave: { bg: palette.purple[200], border: palette.purple[300], fg: palette.purple[900] },
  absent: { bg: palette.purple[950], border: palette.purple[950], fg: palette.white },
  holiday: { bg: palette.purple[100], border: palette.purple[300], fg: palette.purple[700] },
  weekly_off: { bg: palette.slate[200], border: palette.slate[200], fg: palette.slate[600] },
  no_data: { bg: palette.slate[700], border: palette.slate[700], fg: palette.slate[100] },
  upcoming: { bg: palette.slate[50], border: palette.slate[200], fg: palette.slate[400] },
};

export const heatOf = (chipKey) => calendarHeat[chipKey] || calendarHeat.upcoming;

/** The bar fill + outline for a day chip — `chart.day`, never undefined. */
export const dayBarOf = (chipKey) => chart.day[chipKey] || chart.day.no_data;

/* ─── Type ────────────────────────────────────────────────────────────────────
   PostScript names, not file names. Verify these on a device before building
   on them — a wrong family name renders in the system font with no error.
   ALWAYS set fontFamily; fontWeight alone falls back to Roboto on Android. */

export const font = {
  regular: 'Manrope-Regular',
  medium: 'Manrope-Medium',
  semibold: 'Manrope-SemiBold',
  bold: 'Manrope-Bold',
  extrabold: 'Manrope-ExtraBold',
};

const TABULAR = ['tabular-nums'];

export const text = {
  // The hero line — sign-in and onboarding, and nothing inside the signed-in
  // app. ExtraBold at 30 is the one place Manrope's heaviest cut is used; it
  // is what makes a first-run screen look designed rather than rendered.
  display: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 37, letterSpacing: -0.5, color: color.textPrimary },

  h1: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, color: color.textPrimary },
  h2: { fontFamily: font.bold, fontSize: 18, lineHeight: 24, color: color.textPrimary },
  h3: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.textBody },

  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.textBody },
  bodyStrong: { fontFamily: font.bold, fontSize: 14, lineHeight: 20, color: color.textPrimary },

  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.textSecondary },
  smallStrong: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.textBody },

  // The app's signature. 11px uppercase bold with letter spacing, on every
  // field label, every tile caption, every table header.
  label: {
    fontFamily: font.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.textLabel,
  },

  caption: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: color.textMuted },
  badge: { fontFamily: font.bold, fontSize: 10, lineHeight: 12, letterSpacing: 0.3 },

  // tabular-nums on every number that CHANGES, or the digits jitter as it ticks
  metric: { fontFamily: font.extrabold, fontSize: 22, lineHeight: 26, fontVariant: TABULAR, color: color.textPrimary },
  metricLg: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 36, fontVariant: TABULAR, color: color.textPrimary },
  mono: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, fontVariant: TABULAR, color: color.textBody },
};

/* ─── Space · radius · hit area ───────────────────────────────────────────── */

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

export const gutter = space[4]; // 16 — the screen side gutter, everywhere

export const radius = {
  sm: 8, // pills, small chips           (web rounded-lg)
  md: 12, // inputs, read-only fields     (web rounded-xl)
  // 18 / 26 since the 2026-10-20 UI pass: a card on a phone reads softer one
  // step rounder than the web's rounded-2xl, and it matches the pills.
  lg: 18, // cards, sections, sheets
  xl: 26, // hero cards, big cards
  full: 999,
};

export const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };
export const MIN_TAP = 44;

/**
 * Icon sizes. The web app draws every `react-icons/hi` glyph at one of three
 * sizes; these are those three plus the two a phone needs. Pass `iconSize.md`
 * to a glyph from theme/icons.js — never a literal in a screen, or the set
 * drifts a pixel at a time.
 *
 * `info` is the ⓘ and is deliberately the SMALLEST: field help sits beside a
 * label and must not out-weigh it (see ui/FieldHelp.jsx).
 */
export const iconSize = {
  info: 14, // the ⓘ, inline notes
  sm: 16, // inside a chip, a pill, a dense row
  md: 20, // the default — rows, buttons, section headers (web's 20×20)
  lg: 24, // tab bar, empty states
  xl: 32, // the punch button, a hero tile
};

/* ─── Elevation ───────────────────────────────────────────────────────────────
   The web app's shadows are extremely soft (shadow-xs / shadow-2xs). Resist
   making them heavier on native. Android needs a backgroundColor on the SAME
   view as `elevation`, or nothing renders — always set both. */

const shadow = {
  xs: {
    ios: { shadowColor: palette.purple[950], shadowOpacity: 0.045, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 1 },
  },
  // Wider and fainter, tinted aubergine rather than slate: the lift of a
  // soft object, not the drop shadow of a box (2026-10-20).
  sm: {
    ios: { shadowColor: palette.purple[950], shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
  },
  md: {
    ios: { shadowColor: palette.purple[900], shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 5 },
  },
  lg: {
    ios: { shadowColor: palette.slate[900], shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: -4 } },
    android: { elevation: 16 },
  },
};

export const elevate = (key = 'sm') => Platform.select(shadow[key] || shadow.sm);

/* ─── The lift under a bottom sheet — NOT `elevate('lg')` (2026-10-17) ────────
   ANDROID CANNOT ROUND TWO CORNERS AND CAST A SHADOW AT THE SAME TIME, and
   that is still the whole reason this exists.

   A sheet is `borderTopLeftRadius` + `borderTopRightRadius` and square at the
   bottom, where it runs off the screen. Android builds a shadow from the
   view's OUTLINE, and `ViewOutlineProvider` only understands ONE radius for
   all four corners — so a view with mixed radii falls back to a RECTANGULAR
   outline. The sheet is then clipped round while its elevation shadow is
   drawn square, and the square corners show through the backdrop as a hard
   edge sitting just outside the rounded ones. That is the "extra unrounded
   corner": not a missing radius, a shadow that didn't get the memo.

   So the shadow is iOS-only, where it follows the rounded path correctly. On
   Android a sheet needs no lift anyway: it sits on a dimmed backdrop, which
   separates it from the screen far more strongly than 16dp of elevation.

   MOVING TO @gorhom/bottom-sheet DID NOT RETIRE THIS. The library ships no
   shadow of its own — its default background is a background colour and a
   radius, nothing else — so the lift is still ours to supply, and supplying
   it with `elevate('lg')` would bring the square corners straight back.

   ONE CALL SITE NOW: ui/SheetShell.jsx, on the library's `backgroundComponent`
   — the absolutely-positioned layer behind the content, which is the only one
   that can cast a shadow at all. The clipping layer above it sets
   `overflow: 'hidden'`, and on iOS that is `masksToBounds`, which would eat
   the shadow. Two layers, one each.

   Use this for ANY panel with a rounded top and a square bottom. `elevate()`
   stays correct for cards, which are rounded on all four corners. */
export const elevateSheet = () => Platform.select({ ios: shadow.lg.ios, default: null });

/* ─── Layering ────────────────────────────────────────────────────────────────
   Mirrors the web z-scale so the rules in CLAUDE.md §3 still read true.
   Relative order matters more than the numbers. */

export const layer = {
  base: 0,
  sticky: 10,
  header: 20,
  sheet: 140,
  fieldHelp: 155,
  maya: 160,
  attachmentViewer: 165,
  reasonPrompt: 170,
  toast: 200,
};

/** The layer an ⓘ popover (or Maya) should use above a given host. */
export const popoverLayerFor = (hostLayer = 0) =>
  hostLayer > 150 ? hostLayer + 15 : layer.fieldHelp;

/* ─── Common composites ───────────────────────────────────────────────────── */

export const card = {
  backgroundColor: color.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: color.borderSubtle,
  ...elevate('sm'),
};

export const readOnlyField = {
  minHeight: 40,
  justifyContent: 'center',
  backgroundColor: color.surfaceSubtle,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: 14,
  paddingVertical: 8,
};

export default { palette, color, tone, toneOf, chart, font, text, space, gutter, radius, elevate, layer, card };
