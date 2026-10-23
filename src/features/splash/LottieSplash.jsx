// ─────────────────────────────────────────────────────────────────────────────
// features/splash/LottieSplash.jsx — the animated launch screen.
//
// THE ONLY SPLASH IN THE APP (user, 2026-10-23: "remove default splash screen,
// we are using a custom one with lotte json"). There used to be two in a row —
// the native launch window with the static HR Clouds logo, then this. The
// native window survives, because Android 12+ always draws one, but it is now
// blank: just #F7F5FC, the canvas below. src/assets/bootsplash/README.md says
// which two files keep it that way, and warns off the regenerator that would
// put the logo back.
//
// So: the OS shows a bare canvas before JS is running, React mounts, and THIS
// takes over on the same colour — the brand animation plays over the real UI
// while it settles, then fades out. One cover, start to interactive.
//
// It never traps the app behind itself: `onAnimationFinish` ends it, and a hard
// ceiling ends it anyway if the animation is long or the callback never fires.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import { color } from '../../theme/tokens';

const SOURCE = require('../../assets/hr_clouds_splash.json');
// FULL SCREEN, AND LONG ENOUGH TO SEE (user, 2026-10-20). The file is a
// 720×1280 portrait composition — a full screen — but it was drawn into a
// square 70% of the width with `contain`, so it rendered tiny; and it is
// 1.5 s long, and the splash closed the instant it finished, so the app
// "opened instantly". Now it fills the screen (`cover`), plays a touch slower,
// and the splash holds on the final frame until MIN_MS has passed.
const SPEED = 0.8; // 1.5 s → ~1.9 s
const MIN_MS = 3000; // the splash is on screen at least this long
const MAX_MS = 5500; // never cover the app longer than this, whatever the file does

export function LottieSplash({ onDone }) {
  const fade = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);
  const ended = useRef(false);
  const endRef = useRef(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const end = () => {
      if (ended.current) return;
      ended.current = true;
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
        setGone(true);
        onDone?.();
      });
    };
    // The animation finishing asks to end; the end waits out MIN_MS first.
    let hold = null;
    endRef.current = () => {
      const left = MIN_MS - (Date.now() - startedAt.current);
      if (left > 0) hold = setTimeout(end, left);
      else end();
    };
    const timer = setTimeout(end, MAX_MS);
    return () => { clearTimeout(timer); if (hold) clearTimeout(hold); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.bg, opacity: fade, alignItems: 'center', justifyContent: 'center', zIndex: 9999 }]}>
      <LottieView
        source={SOURCE}
        autoPlay
        loop={false}
        speed={SPEED}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        onAnimationFinish={() => endRef.current?.()}
      />
    </Animated.View>
  );
}

export default LottieSplash;
