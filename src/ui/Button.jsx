// ─────────────────────────────────────────────────────────────────────────────
// ui/Button.jsx — every button in the app.
//
// The seven variants below are lifted from the web `AttendanceCard` so the
// punch card reads identically on both. Don't add an eighth without deleting
// one: the web app's button styles were unified for exactly this reason.
//
// ── THREE RULES, ALL OF THEM EARNED ──────────────────────────────────────────
//
// 1. `loading` KEEPS THE LABEL. A button that swaps its text for a spinner
//    looks broken, and on a slow connection the person can no longer tell what
//    they pressed. Spinner to the left, label stays put.
//
// 2. DISABLED IS FOR WHAT THE PERSON CANNOT FIX BY PRESSING (CLAUDE.md §11):
//    a request already in flight, a cooldown, a feature that isn't deployed, a
//    lookup that wouldn't load. A MISSING ANSWER IS NOT ONE OF THEM. An
//    unfinished form keeps its button LIVE and validates on the press, because
//    a dead button cannot say which of twelve boxes it is waiting for. If you
//    pass `disabled`, pass `disabledReason` too — a dead button with no
//    explanation is the bug this rule exists to prevent.
//
// 3. 44pt MINIMUM TAP TARGET, always. `height` is the visual size; hitSlop
//    makes up the difference on the smaller variants. A 32pt button is a
//    design that fails on a phone in one hand on a train.
//
// ── THE 2026-10-20 LOOK: INK PILLS ───────────────────────────────────────────
//
// Every button is a PILL (radius.full). `primary` is solid INK — the near-
// black aubergine in tokens — because the main action has to out-weigh every
// purple chip on the screen, and a purple-600 fill did not. A FULL-WIDTH
// primary with no icon of its own carries a trailing arrow at its right edge,
// the "this takes you forward" cue from the reference shots; it is drawn here
// so no screen has to remember it. A press on primary / danger / onHero gives
// a light haptic (ui/haptics.js) — the commit, not every tap.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { pressStyle } from '../theme/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  HIT_SLOP, MIN_TAP, color, iconSize, palette, radius, space, text,
} from '../theme/tokens';
import { icons } from '../theme/icons';
import { haptic } from './haptics';

/** The variants whose press is a commitment, and so earns a haptic. */
const COMMITS = new Set(['primary', 'danger', 'onHero', 'breakEnd']);

const VARIANTS = {
  /** The ONE main action on a screen. PURPLE (2026-10-21) — it was ink, a
      near-black aubergine; the user asked for purple. The header's "ink, not
      purple" reasoning is superseded. */
  primary: { bg: color.brand, pressedBg: color.brandPressed, fg: color.textOnBrand, border: color.brand },
  /** Secondary. */
  soft: { bg: color.brandSoftBg, pressedBg: color.brandSoftBorder, fg: color.brandSoftFg, border: color.brandSoftBg },
  /** Tertiary. */
  outline: { bg: color.surface, pressedBg: color.brandSoftBg, fg: color.brandSoftFg, border: palette.purple[300] },
  /** Cancel, dismiss, "not now". */
  ghost: { bg: 'transparent', pressedBg: color.surfaceSubtle, fg: color.textSecondary, border: 'transparent' },
  /**
   * Destructive AND clock-out. Clock out is `danger` on purpose: it is the one
   * irreversible thing on the punch card, and the web card makes it rose for
   * the same reason. Rose is reserved — never use it for emphasis.
   */
  danger: { bg: palette.rose[500], pressedBg: palette.rose[600], fg: color.textOnBrand, border: palette.rose[500] },
  /** Start break — quiet, because it isn't the main action. */
  breakStart: { bg: color.surface, pressedBg: color.brandSoftBg, fg: color.brandSoftFg, border: color.brandSoftBorder },
  /** End break — the main action while on a break. */
  breakEnd: { bg: palette.purple[700], pressedBg: palette.purple[800], fg: color.textOnBrand, border: palette.purple[700] },

  /* ── The two that live ON the purple gradient ──────────────────────────────
     The punch card is a dark brand-gradient surface, and `primary` on it is
     purple-on-purple: the button edge disappears and the one control that
     matters stops looking pressable. White with purple text is the inversion
     the web card uses for the same situation, and the ghost is the quiet
     partner for breaks — a translucent white wash, never a second solid
     button competing with Check out. */
  onHero: { bg: palette.white, pressedBg: color.brandSoftBg, fg: color.brandSoftFg, border: palette.white },
  /*
   * A WHITE OUTLINE, not a translucent fill. The fill version sat at the same
   * lightness as the gradient under it, so on the darker end of the card the
   * break button all but disappeared — and where it did show, it read as a
   * second solid button competing with Check out. An outline is unmistakably
   * the quieter of the two and is still legible over every stop of the
   * gradient, because a 1.5pt white line has nothing behind it to wash out.
   * The pressed state is the only moment it fills.
   */
  onHeroGhost: {
    bg: 'transparent',
    pressedBg: 'rgba(255,255,255,0.18)',
    fg: color.textOnBrand,
    border: 'rgba(255,255,255,0.72)',
    borderWidth: 1.5,
  },
};

const SIZES = {
  /** A screen's primary action, and the punch buttons. */
  lg: { height: 52, paddingHorizontal: space[6], fontSize: 15 },
  /** The default — sheet footers, inline actions. */
  md: { height: 48, paddingHorizontal: space[5], fontSize: 14 },
  /** Inside a row or a dense header. Needs the hitSlop to reach 44. */
  sm: { height: 36, paddingHorizontal: space[3], fontSize: 13 },
};

/**
 * @param {object} props
 * @param {string} props.title           the label. Never an icon alone — see IconButton
 * @param {Function} props.onPress
 * @param {keyof VARIANTS} [props.variant]
 * @param {keyof SIZES} [props.size]
 * @param {boolean} [props.loading]      shows a spinner, keeps the label, blocks the press
 * @param {boolean} [props.disabled]     ONLY for what a press can't fix — see rule 2
 * @param {string} [props.disabledReason] announced to a screen reader, and the
 *                                        thing you should also be showing on screen
 * @param {Function} [props.icon]        a component from theme/icons.js
 * @param {boolean} [props.fullWidth]
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  disabledReason,
  icon: Icon,
  iconRight = false,
  fullWidth = false,
  style,
  textStyle,
  ...rest
}) {
  const reduced = useReducedMotion();
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  // `loading` blocks the press without reading as disabled: the request is in
  // flight, which is the one case where a dead button is honest.
  const blocked = disabled || loading;
  // The forward arrow: a full-width primary with no glyph of its own.
  const Arrow = icons.arrowRight;
  const arrow = variant === 'primary' && fullWidth && !Icon && !loading && size !== 'sm' && Arrow;

  const handlePress = (e) => {
    if (COMMITS.has(variant)) haptic('light');
    onPress?.(e);
  };

  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} style={{ marginRight: space[2] }} />
      ) : null}
      {Icon && !iconRight && !loading ? <Icon size={iconSize.md} color={v.fg} /> : null}
      <Text
        numberOfLines={1}
        style={[text.bodyStrong, { color: v.fg, fontSize: s.fontSize, letterSpacing: 0.1 }, textStyle]}
      >
        {title}
      </Text>
      {Icon && iconRight ? <Icon size={iconSize.md} color={v.fg} /> : null}
      {arrow ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: space[5], top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <Arrow size={iconSize.md} color={v.fg} />
        </View>
      ) : null}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      // The reason is read out, so a screen-reader user isn't left guessing at
      // a button that won't respond. It is NOT a substitute for saying it on
      // screen as well.
      accessibilityHint={disabled && disabledReason ? disabledReason : undefined}
      hitSlop={size === 'sm' ? HIT_SLOP : undefined}
      disabled={blocked}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          minHeight: Math.max(s.height, size === 'sm' ? s.height : MIN_TAP),
          height: s.height,
          paddingHorizontal: arrow ? space[10] : s.paddingHorizontal,
          borderRadius: radius.full,
          borderWidth: v.borderWidth || 1,
          borderColor: v.border,
          backgroundColor: pressed && !blocked ? v.pressedBg : v.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          opacity: disabled ? 0.6 : 1,
        },
        fullWidth && { alignSelf: 'stretch', width: '100%' },
        pressStyle(pressed && !blocked, reduced),
        style,
      ]}
      {...rest}
    >
      {content}
    </Pressable>
  );
}

/**
 * An icon with no label. ONLY for the universally understood ones — close,
 * back, refresh, the ⓘ — and it still needs an `accessibilityLabel`, which is
 * why that prop is required rather than optional.
 *
 * Anything a person might have to guess at gets a Button with a word in it.
 */
export function IconButton({
  icon: Icon, accessibilityLabel, onPress, tone = 'slate', size = iconSize.md, round = false, style, ...rest
}) {
  const fg = tone === 'onDark' ? color.textOnBrand : tone === 'brand' ? color.brand : tone === 'ink' ? color.ink : color.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        {
          // `round`: the white disc the reference headers put every control in
          // — back, close, the ⋯ menu. A bare glyph floating on the canvas
          // reads as decoration; a disc reads as a button.
          width: round ? 40 : 36,
          height: round ? 40 : 36,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed
            ? (round ? color.brandSoftBg : color.surfaceSubtle)
            : (round ? color.surface : 'transparent'),
          ...(round ? { borderWidth: 1, borderColor: color.borderSubtle } : null),
        },
        style,
      ]}
      {...rest}
    >
      {Icon ? <Icon size={size} color={fg} /> : null}
    </Pressable>
  );
}

/**
 * A text-only action inside a sentence or a card header ("See all", "Change").
 * NOT for anything destructive and NOT for a form's submit — both need a real
 * button with a real target.
 */
export function LinkButton({ title, onPress, align = 'center', style, textStyle, ...rest }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        {
          // THE BOX IS THE TARGET, not the glyph-height text inside it.
          // smallStrong is a 13pt line, so hitSlop alone gave a ~37pt strip
          // and "Forgot password?" only answered a press on the exact word.
          // Padding to MIN_TAP makes the whole area live, and hitSlop is then
          // margin on top of that rather than the entire target.
          minHeight: MIN_TAP,
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          alignSelf: align === 'center' ? 'center' : 'flex-start',
          paddingHorizontal: space[2],
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <Text style={[text.smallStrong, { color: color.brand }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

/** A footer's two-button row: ghost Cancel on the left, the real action right. */
export function ButtonRow({ children, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: space[2], alignItems: 'center' }, style]}>
      {children}
    </View>
  );
}

export default Button;
