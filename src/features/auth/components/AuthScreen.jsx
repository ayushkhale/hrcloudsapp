// ─────────────────────────────────────────────────────────────────────────────
// features/auth/components/AuthScreen.jsx — the chrome every auth screen wears.
//
// WHY A WRAPPER RATHER THAN REPEATING THE HEADER FOUR TIMES:
//
// The four auth screens are the only screens in the app a signed-OUT person
// sees, so they are the only place the product gets to look like a product
// rather than a form. That look is one logo, one backdrop and one heading
// block — and four copies of it would drift apart by the second edit.
//
// ── WHY NOT JUST PASS `background` TO <Screen> ───────────────────────────────
//
// Screen puts its children in a ScrollView. An absolutely-positioned blob
// inside it scrolls away with the content, which is exactly wrong for a
// backdrop. So the decoration is a SIBLING of Screen, underneath it, and
// Screen itself runs transparent. Screen keeps owning safe areas, the
// keyboard and scrolling; this file only owns what is painted behind.
//
// ── THE BACKDROP IS DECORATION, SO IT IS INVISIBLE TO SCREEN READERS ─────────
//
// `accessibilityElementsHidden` + `importantForAccessibility="no-hide-
// descendants"` + pointerEvents="none": it must never take a tap meant for a
// field behind it, and never be announced.
//
// Mirrors the web's AuthLayout (src/auth/AuthLayout.jsx): purple brand panel,
// white form panel, legal footer. On a phone there is no room for two panels
// side by side, so the panel becomes a wash behind the form.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, RadialGradient, Stop } from 'react-native-svg';
import { icons } from '../../../theme/icons';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import { Screen } from '../../../ui';

// The colour wordmark from hrclouds.in. 1024×343 ≈ 2.986:1 — every BrandMark
// box keeps that ratio so the letterhead never stretches.
const LOGO = require('../../../assets/brand/logocolored.png');
const LOGO_RATIO = 1024 / 343;

/* ── The wash ──────────────────────────────────────────────────────────────
   Three purple blobs under a Gaussian blur — the frosted-glass look the web
   layout gets from `backdrop-filter`. React Native has no CSS blur, but
   react-native-svg (already a dependency, already in the binary) renders a real
   <FeGaussianBlur> on both platforms through its Fabric views, so this is a
   true blur, not a faked gradient.

   Each blob is a radial fill that already fades to transparent; the blur melts
   the last hard edge and kills any banding, so the three read as one soft glow
   rather than three circles. Positions and radii are fractions of the screen,
   so the composition holds on any size and after a rotation.

   It is pure decoration: the wrapping View is pointerEvents="none" and hidden
   from screen readers, so it can never eat a tap meant for a field, and is
   never announced. */
const BLOBS = [
  { key: 'a', tint: '#9333ea', opacity: 0.34, cx: 1.02, cy: 0.02, r: 0.64 }, // top-right, brand purple
  { key: 'b', tint: '#7c3aed', opacity: 0.24, cx: -0.06, cy: 0.44, r: 0.56 }, // mid-left, violet
  { key: 'c', tint: '#c026d3', opacity: 0.20, cx: 0.92, cy: 1.02, r: 0.6 }, // bottom-right, fuchsia
];

export function AuthBackdrop() {
  const { width, height } = useWindowDimensions();
  // Scaled to the screen, but capped: Android's blur clamps around a radius of
  // 25, and past that a bigger number only costs time without softening more.
  const blur = Math.min(24, Math.round(width * 0.06));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* The region is padded well past each blob's box so the blurred halo
              is never clipped to the circle's bounds — the usual cause of a
              hard ring around an SVG blur. */}
          <Filter id="frost" x="-60%" y="-60%" width="220%" height="220%">
            <FeGaussianBlur stdDeviation={blur} />
          </Filter>
          {BLOBS.map((b) => (
            <RadialGradient key={b.key} id={`blob-${b.key}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b.tint} stopOpacity={b.opacity} />
              <Stop offset="0.6" stopColor={b.tint} stopOpacity={b.opacity * 0.35} />
              <Stop offset="1" stopColor={b.tint} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {BLOBS.map((b) => (
          <Circle
            key={b.key}
            cx={b.cx * width}
            cy={b.cy * height}
            r={b.r * width}
            fill={`url(#blob-${b.key})`}
            filter="url(#frost)"
          />
        ))}
      </Svg>
    </View>
  );
}

/** The brand wordmark at a fixed aspect ratio so it never stretches — shared by
    the auth header and the onboarding top bar, so there is one logo in one
    place. */
export function BrandMark({ width = 150, style }) {
  return (
    <Image
      source={LOGO}
      resizeMode="contain"
      style={[{ width, height: Math.round(width / LOGO_RATIO) }, style]}
      accessibilityRole="image"
      accessibilityLabel="HR Clouds"
    />
  );
}

/* ── The back chevron ─────────────────────────────────────────────────────
   A circular button, as in the reference composition. It is NOT the header
   bar: AuthStack runs `headerShown: false`, because a native header on a
   sign-in screen puts a grey strip over the backdrop. */
function BackButton({ onPress }) {
  const Chevron = icons.chevronLeft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={12}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.surfaceSubtle : color.surface,
        borderWidth: 1,
        borderColor: color.border,
      })}
    >
      <Chevron size={iconSize.md} color={color.textPrimary} />
    </Pressable>
  );
}

/**
 * @param {object}   props
 * @param {string}   props.title     — the big line. Required; every auth screen has one.
 * @param {string}  [props.subtitle]
 * @param {Function}[props.onBack]   — renders the circular chevron when given.
 * @param {boolean} [props.logo]     — show the wordmark above the title.
 * @param {React.ReactNode} [props.footer]  — pinned, e.g. a submit button.
 * @param {React.ReactNode} [props.legal]   — the fine print under the content.
 */
export function AuthScreen({
  title,
  subtitle,
  onBack,
  logo = true,
  footer,
  legal,
  scroll = true,
  children,
}) {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AuthBackdrop />

      <Screen
        scroll={scroll}
        keyboard
        background="transparent"
        footer={footer}
        contentStyle={{ paddingBottom: space[10] }}
      >
        {onBack ? (
          <View style={{ marginTop: space[2], marginBottom: space[4] }}>
            <BackButton onPress={onBack} />
          </View>
        ) : null}

        {logo ? (
          // Left-aligned, not centred: it reads as a letterhead rather than a
          // splash, and it lines up with the heading under it.
          <BrandMark width={150} style={{ marginTop: onBack ? 0 : space[6] }} />
        ) : null}

        <Text
          accessibilityRole="header"
          style={[text.display, { marginTop: space[6] }]}
        >
          {title}
        </Text>

        {subtitle ? (
          <Text style={[text.body, { color: color.textSecondary, marginTop: space[2] }]}>
            {subtitle}
          </Text>
        ) : null}

        <View style={{ marginTop: space[6] }}>{children}</View>

        {legal ? <View style={{ marginTop: space[6] }}>{legal}</View> : null}
      </Screen>
    </View>
  );
}

/** The terms line the web shows under every auth form. */
export function AuthLegal() {
  return (
    <Text style={[text.caption, { textAlign: 'center', color: color.textMuted, lineHeight: 17 }]}>
      By continuing you agree to <Text style={{ color: color.textPrimary }}>Terms of Service</Text> and <Text style={{ color: color.textPrimary }}>Privacy Policy</Text>.
    </Text>
  );
}

export default AuthScreen;
