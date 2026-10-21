// ─────────────────────────────────────────────────────────────────────────────
// ui/HeroCard.jsx — the state card at the top of a tab root.
//
// "Your tasks · 3 overdue", "Your documents · All caught up", "Reached your
// bank · ₹87,432", "Your file · 80%". One card, one shape, four screens.
//
// ── WHY IT EXISTS (2026-10-20) ──────────────────────────────────────────────
//
// Each of those screens drew its own flat violet-800 block, and the user
// called the result out on every one of them: "the 'you're all caught up' ui
// is looking weird on every screen". It was. A solid dark banner is a SHOUT,
// and the calm state — nothing needs you — was the loudest thing on the
// screen, with a sentence of grey-on-violet under it and nothing to do.
//
// The fix follows the reference shots: a SOFT gradient card (purple-100 into
// white) with dark text, a white icon tile on the left, and the state said in
// two short lines. When nothing needs the person (`calm`), the tile wears a
// check and the card stays quiet — it reassures instead of announcing.
//
// ── RULES ────────────────────────────────────────────────────────────────────
//
//  · ONE per screen, at the top. It is the answer to "anything for me here?".
//  · Pressable only when there is somewhere to go (`onPress`). A calm card has
//    no chevron and no press — a dead press is worse than none (ui/Row).
//  · Transform/opacity only for the press (theme/motion.js rule 2).
//  · The gradient is decoration: it never carries meaning, and the text on it
//    is `textPrimary`/`textSecondary`, which hold AA on every stop.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, elevate, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { pressStyle } from '../theme/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SkeletonBlock } from './Skeleton';
import { haptic } from './haptics';

/**
 * @param {object} props
 * @param {Function} [props.icon]     a glyph from theme/icons.js
 * @param {string} props.eyebrow      "Your tasks"
 * @param {string} props.title        "3 overdue" / "All caught up"
 * @param {string} [props.caption]    one line, what it means
 * @param {boolean} [props.metric]    draw the title as a big number (money, %)
 * @param {boolean} [props.big]       the bigger figure, for a hero that IS the number
 * @param {boolean} [props.calm]      nothing needs the person — check tile, no press
 * @param {number} [props.progress]   0–100, a bar under the text
 * @param {React.ReactNode} [props.right]  replaces the chevron (a ring, a stepper)
 * @param {Function} [props.onPress]
 * @param {boolean} [props.loading]
 * @param {string} [props.accessibilityLabel]
 */
export function HeroCard({
  icon: Icon,
  eyebrow,
  title,
  caption,
  metric = false,
  big = false,
  calm = false,
  progress,
  right,
  onPress,
  loading = false,
  accessibilityLabel,
  style,
}) {
  const reduced = useReducedMotion();
  const Chevron = icons.chevronRight;
  const Check = icons.check;
  const pressable = !!onPress && !loading;

  const body = (pressed) => (
    <LinearGradient
      colors={[color.heroSoftFrom, color.heroSoftVia, color.heroSoftTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.heroSoftBorder,
        padding: space[4],
        overflow: 'hidden',
      }, style]}
    >
      {/* Two soft discs behind the content — the reference shots' blobs. Pure
          decoration, hidden from the screen reader, never animated. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute', width: 160, height: 160, borderRadius: 80,
          right: -48, top: -64, backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute', width: 90, height: 90, borderRadius: 45,
          right: 40, bottom: -50, backgroundColor: 'rgba(233,213,255,0.45)',
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {/* No icon and nothing calm to say: no tile — the figure leads. */}
        {Icon || calm ? (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md + 2,
            backgroundColor: color.surface,
            alignItems: 'center',
            justifyContent: 'center',
            ...elevate('xs'),
          }}
        >
          {loading ? null : calm && Check ? (
            <View
              style={{
                width: 28, height: 28, borderRadius: 14, backgroundColor: color.success.chip,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Check size={iconSize.sm} color={color.success.fg} />
            </View>
          ) : Icon ? (
            <Icon size={iconSize.lg - 2} color={color.brand} />
          ) : null}
        </View>
        ) : null}

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {loading ? (
            <View style={{ gap: space[2] }}>
              <SkeletonBlock width={90} height={10} />
              <SkeletonBlock width={170} height={metric ? 28 : 20} />
            </View>
          ) : (
            <>
              {eyebrow ? (
                <Text numberOfLines={1} style={[text.caption, { color: color.brandSoftFg, fontSize: 12 }]}>
                  {eyebrow}
                </Text>
              ) : null}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={metric
                  ? [text.metricLg, { fontSize: big ? 40 : 30, lineHeight: big ? 48 : 36, color: color.ink }]
                  : [text.h2, { fontSize: 19, lineHeight: 25, color: color.ink }]}
              >
                {title}
              </Text>
              {caption ? (
                <Text numberOfLines={2} style={[text.small, { color: color.textSecondary }]}>{caption}</Text>
              ) : null}
            </>
          )}
        </View>

        {right || (pressable && Chevron ? (
          <View
            style={{
              width: 36, height: 36, borderRadius: 18, backgroundColor: pressed ? color.brandChipBg : color.surface,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Chevron size={iconSize.sm} color={color.ink} />
          </View>
        ) : null)}
      </View>

      {Number.isFinite(progress) && !loading ? (
        <View
          style={{
            marginTop: space[3], height: 8, borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.85)', overflow: 'hidden',
          }}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}
        >
          <View
            style={{
              width: `${Math.max(0, Math.min(100, progress))}%`, height: 8, borderRadius: 4,
              backgroundColor: color.brand,
            }}
          />
        </View>
      ) : null}
    </LinearGradient>
  );

  if (!pressable) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel || [eyebrow, title, caption].filter(Boolean).join('. ')}>
        {body(false)}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => { haptic('light'); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || [eyebrow, title].filter(Boolean).join('. ')}
      style={({ pressed }) => pressStyle(pressed, reduced)}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

export default HeroCard;
