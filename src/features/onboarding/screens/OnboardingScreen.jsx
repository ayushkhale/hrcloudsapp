// ─────────────────────────────────────────────────────────────────────────────
// features/onboarding/screens/OnboardingScreen.jsx — the first-run tour.
//
// Three slides, once per device. `useOnboarding` owns whether it is shown;
// this file owns only what it looks like.
//
// ── THE ART IS BUILT, NOT DRAWN ──────────────────────────────────────────────
//
// Each slide's illustration is a small mock of the screen it describes,
// assembled from the real design tokens rather than shipped as a PNG. Three
// reasons: it is sharp at every density, it weighs nothing, and — the one that
// matters — it cannot go stale the way a screenshot of a screen we have not
// built yet immediately would.
//
// They are placeholders for real artwork. To swap one, replace a SLIDE's `art`
// with <Image source={…} /> and delete nothing else; the layout already
// reserves the space and centres whatever it is given.
//
// ── THE ART IS INVISIBLE TO SCREEN READERS ───────────────────────────────────
//
// The mock cards contain words ("Checked in", "12 days remaining") that are
// decoration, not information — read aloud in sequence they are noise between
// the heading and the button. Each slide's heading and body carry the meaning,
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
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { icons } from '../../../theme/icons';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import { Button } from '../../../ui';
import { AuthBackdrop, BrandMark } from '../../auth/components/AuthScreen';

const Clock = icons.clock;
const Calendar = icons.calendar;
const Rupee = icons.rupee;
const Document = icons.document;
const Check = icons.check;
const ArrowRight = icons.arrowRight;

/* ── The pieces the mock cards are made of ─────────────────────────────────── */

function MockCard({ children, dark = false, style }) {
  return (
    <View
      style={[{
        backgroundColor: dark ? color.textPrimary : color.surface,
        borderRadius: radius.lg,
        paddingVertical: space[4],
        paddingHorizontal: space[4],
        borderWidth: dark ? 0 : 1,
        borderColor: color.border,
        // A soft lift, so the cards read as floating over the wash rather
        // than as boxes drawn on it.
        shadowColor: '#0f172a',
        shadowOpacity: dark ? 0.22 : 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: dark ? 6 : 2,
      }, style]}
    >
      {children}
    </View>
  );
}

function MockTile({ icon: Glyph, label }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        paddingVertical: space[3],
        alignItems: 'center',
        gap: space[1],
      }}
    >
      <Glyph size={iconSize.md} color={color.brand} />
      <Text style={text.caption}>{label}</Text>
    </View>
  );
}

/** The circular badge that fronts each mock card. */
function Badge({ icon: Glyph, on = 'brand' }) {
  const bg = on === 'brand' ? color.brand : color.brandSoftBg;
  const fg = on === 'brand' ? color.textOnBrand : color.brand;
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: radius.full,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Glyph size={iconSize.md} color={fg} />
    </View>
  );
}

/* ── The three slides ──────────────────────────────────────────────────────── */

const SLIDES = [
  {
    key: 'attendance',
    title: 'Your workday,\nin your pocket',
    body: 'Punch in from your phone, watch today’s hours add up, and see where every minute went.',
    art: (
      <View style={{ gap: space[3] }}>
        <MockCard dark>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Badge icon={Clock} />
            <View>
              <Text style={[text.caption, { color: color.surface, opacity: 0.7 }]}>
                Today’s attendance
              </Text>
              <Text style={[text.h2, { color: color.surface }]}>09:00 AM</Text>
            </View>
          </View>
        </MockCard>

        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <MockCard style={{ flex: 1 }}>
            <Text style={text.caption}>This week</Text>
            <Text style={text.h2}>38h 20m</Text>
          </MockCard>
          <MockCard style={{ flex: 1 }}>
            <Text style={text.caption}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              <Check size={iconSize.sm} color={color.brand} />
              <Text style={[text.h3, { color: color.brand }]}>Checked in</Text>
            </View>
          </MockCard>
        </View>
      </View>
    ),
  },
  {
    key: 'leave',
    title: 'Leave, without\nthe paperwork',
    body: 'Check your balance before you ask, apply in a few taps, and follow the approval without chasing anyone.',
    art: (
      <View style={{ gap: space[3] }}>
        <MockCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Badge icon={Calendar} on="soft" />
            <View style={{ flex: 1 }}>
              <Text style={text.caption}>Leave balance</Text>
              <Text style={text.h2}>12 days remaining</Text>
            </View>
          </View>
        </MockCard>

        <MockCard dark>
          <Text style={[text.caption, { color: color.surface, opacity: 0.7 }]}>
            Casual leave · 14–15 Mar
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[1],
              marginTop: space[1],
            }}
          >
            <Check size={iconSize.sm} color={color.surface} />
            <Text style={[text.h3, { color: color.surface }]}>Approved</Text>
          </View>
        </MockCard>
      </View>
    ),
  },
  {
    key: 'pay',
    title: 'Payslips and\npapers, sorted',
    body: 'Every payslip, claim and document in one place — ready to download the moment you need it.',
    art: (
      <View style={{ gap: space[3] }}>
        <MockCard dark>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Badge icon={Rupee} />
            <View style={{ flex: 1 }}>
              <Text style={[text.caption, { color: color.surface, opacity: 0.7 }]}>
                Payslip · March
              </Text>
              <Text style={[text.h2, { color: color.surface }]}>Ready to download</Text>
            </View>
          </View>
        </MockCard>

        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <MockTile icon={Document} label="Documents" />
          <MockTile icon={Rupee} label="Claims" />
          <MockTile icon={Calendar} label="Tax" />
        </View>
      </View>
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
        <BrandMark width={116} />
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
              style={{ marginBottom: space[10] }}
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
          <Button title="Get started" onPress={finish} size="lg" icon={ArrowRight} iconRight />
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
