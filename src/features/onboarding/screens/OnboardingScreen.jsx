// ─────────────────────────────────────────────────────────────────────────────
// features/onboarding/screens/OnboardingScreen.jsx — the first-run tour.
//
// Three slides, once per device. `useOnboarding` owns whether it is shown;
// this file owns only what it looks like.
//
// ── ONBOARDING ARTWORK ────────────────────────────────────────────────────────
//
// Each slide's illustration is loaded from src/assets/screens/onboarding/:
// onboarding1.png, onboarding2.png, onboarding3.png.
// All three share a 3:2 aspect ratio and are rendered inside a centered,
// fixed-height container so alignment and text baselines remain rock-steady
// during swipe transitions.
//
// ── THE ART IS INVISIBLE TO SCREEN READERS ───────────────────────────────────
//
// The illustrations are decorative; heading and body carry the full meaning,
// so the art block is hidden on both platforms.
//
// ── NO SWIPE-TO-DISMISS, NO BACK ─────────────────────────────────────────────
//
// The tour is three presses from the sign-in screen and `Skip` sits in the top
// right throughout. A gesture that half-dismissed it would leave somebody on a
// screen with no way forward.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { icons } from '../../../theme/icons';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import { AuthBackdrop, BrandMark } from '../../auth/components/AuthScreen';

const ArrowRight = icons.arrowRight;

// Onboarding illustrations for the three tour slides (all 3:2 ratio)
const ONBOARDING_1 = require('../../../assets/screens/onboarding/onboarding1.png');
const ONBOARDING_2 = require('../../../assets/screens/onboarding/onboarding2.png');
const ONBOARDING_3 = require('../../../assets/screens/onboarding/onboarding3.png');

/* ── The three slides ──────────────────────────────────────────────────────── */

const SLIDES = [
  {
    key: 'attendance',
    title: 'Your workday,\nin your pocket',
    body: 'Punch in from your phone, watch today’s hours add up, and see where every minute went.',
    image: ONBOARDING_1,
    art: (
      <Image
        source={ONBOARDING_1}
        style={{ width: '100%', height: 220 }}
        resizeMode="contain"
        // Bundled, so there is nothing to download — the wait was Android's
        // 300ms fade-in and decoding a 1536px PNG at full size (2026-10-22).
        fadeDuration={0}
        resizeMethod="resize"
      />
    ),
  },
  {
    key: 'leave',
    title: 'Leave, without\nthe paperwork',
    body: 'Check your balance before you ask, apply in a few taps, and follow the approval without chasing anyone.',
    image: ONBOARDING_2,
    art: (
      <Image
        source={ONBOARDING_2}
        style={{ width: '100%', height: 220 }}
        resizeMode="contain"
        // Bundled, so there is nothing to download — the wait was Android's
        // 300ms fade-in and decoding a 1536px PNG at full size (2026-10-22).
        fadeDuration={0}
        resizeMethod="resize"
      />
    ),
  },
  {
    key: 'pay',
    title: 'Payslips and\npapers, sorted',
    body: 'Every payslip, claim and document in one place — ready to download the moment you need it.',
    image: ONBOARDING_3,
    art: (
      <Image
        source={ONBOARDING_3}
        style={{ width: '100%', height: 220 }}
        resizeMode="contain"
        // Bundled, so there is nothing to download — the wait was Android's
        // 300ms fade-in and decoding a 1536px PNG at full size (2026-10-22).
        fadeDuration={0}
        resizeMethod="resize"
      />
    ),
  },
];

/* ── The dots ──────────────────────────────────────────────────────────────
   The active one is a pill, not a bigger circle — the same control the web's
   AuthLayout uses under its tagline. */
function Dots({ count, active }) {
  return (
    <View
      style={{ flexDirection: 'row', gap: space[1], alignItems: 'center' }}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${active + 1} of ${count}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 6,
            width: i === active ? 22 : 6,
            borderRadius: radius.full,
            backgroundColor: i === active ? color.brand : color.border,
          }}
        />
      ))}
    </View>
  );
}

export default function OnboardingScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);

  /* Finishing is TWO things, and both are needed.
     `onDone` (RootNavigator's markSeen) stops the tour coming back on the next
     launch — but it cannot move anyone off this screen, because the stack's
     `initialRouteName` is only read when the stack mounts. So the screen also
     navigates. `replace`, not `navigate`: the tour leaves the stack behind it,
     and the back gesture from Login never returns to it. */
  const finish = useCallback(() => {
    route?.params?.onDone?.();
    navigation?.replace?.('Login');
  }, [route, navigation]);

  const isLast = index === SLIDES.length - 1;

  const next = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    const to = index + 1;
    setIndex(to);
    listRef.current?.scrollToOffset({ offset: to * width, animated: true });
  }, [isLast, index, width, finish]);

  // The page is derived from the scroll position rather than from
  // onViewableItemsChanged: it is one number, it cannot disagree with what is
  // on screen, and it needs no config object that must stay referentially
  // stable between renders.
  const onScroll = useCallback(
    (e) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex((cur) => (page !== cur && page >= 0 && page < SLIDES.length ? page : cur));
    },
    [width],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AuthBackdrop />

      {/* Top bar: the wordmark on the left, Skip on the right. Skip is on
          every slide, including the last, so the way out never moves. */}
      <View
        style={{
          paddingTop: insets.top + space[2],
          paddingHorizontal: space[4],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <BrandMark width={64} />
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Skip the tour"
          hitSlop={12}
          style={({ pressed }) => ({
            paddingVertical: space[2],
            paddingHorizontal: space[3],
            borderRadius: radius.full,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={[text.bodyStrong, { color: color.textSecondary }]}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Every page is exactly the window wide, so the list never has to
        // measure one to know where it is.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: space[6], justifyContent: 'center', flex: 1 }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                height: 220,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: space[10],
              }}
            >
              {item.art}
            </View>

            <Text accessibilityRole="header" style={text.display}>
              {item.title}
            </Text>
            <Text
              style={[
                text.body,
                { color: color.textSecondary, marginTop: space[3], fontSize: 15, lineHeight: 22 },
              ]}
            >
              {item.body}
            </Text>
          </View>
        )}
      />

      {/* Footer: progress on the left, the way forward on the right. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space[6],
          paddingTop: space[4],
          paddingBottom: insets.bottom + space[5],
          gap: space[4],
        }}
      >
        <Dots count={SLIDES.length} active={index} />

        {isLast ? (
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Get started"
            style={({ pressed }) => ({
              height: 56,
              borderRadius: radius.full,
              paddingHorizontal: space[6],
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? color.brandPressed : color.brand,
              gap: space[2],
            })}
          >
            <Text style={[text.bodyStrong, { color: color.textOnBrand, fontSize: 16 }]}>
              Get started
            </Text>
            <ArrowRight size={iconSize.lg} color={color.textOnBrand} />
          </Pressable>
        ) : (
          <Pressable
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={({ pressed }) => ({
              width: 56,
              height: 56,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? color.brandPressed : color.brand,
            })}
          >
            <ArrowRight size={iconSize.lg} color={color.textOnBrand} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export { OnboardingScreen, SLIDES };
