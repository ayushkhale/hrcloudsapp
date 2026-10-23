// ─────────────────────────────────────────────────────────────────────────────
// ui/KeyboardAware.jsx — the keyboard, in ONE place, for the whole app.
//
// User, 2026-10-23: "at many places on screens — where i have to enter an
// input, keyboard hides the bottom things and doesnt even scrolls up, so if im
// entering input the screen should scroll up so i can see what im entering
// (this is in whole app)".
//
// ── WHY IT BROKE EVERYWHERE AT ONCE, AND WHY IT WASN'T A PER-SCREEN BUG ──────
//
// THIS IS THE LOAD-BEARING FACT IN THIS FILE. Don't undo it.
//
// `android/app/src/main/AndroidManifest.xml` sets
// `android:windowSoftInputMode="adjustResize"`, and half the comments in this
// repo relied on it — ui/Screen.jsx, ui/FormSheet.jsx and ui/ReasonPrompt.jsx
// all said some version of "iOS needs the padding; Android's adjustResize
// already handles it, and doing both double-shifts". That WAS true. It stopped
// being true the moment `edgeToEdgeEnabled=true` went into
// android/gradle.properties (RN 0.87's default):
//
//   WITH EDGE-TO-EDGE, ANDROID NO LONGER RESIZES THE WINDOW FOR THE KEYBOARD.
//
// The app draws behind the system bars, so the window keeps its full height and
// the keyboard arrives as an INSET over the top of it. `adjustResize` is inert.
// Nothing resized, nothing scrolled, and every field in the bottom half of
// every screen went under the keyboard — which is exactly the report, and
// exactly why it was "in whole app" rather than on one screen.
//
// So Android needs real avoidance now, the same as iOS. Rather than turn
// `KeyboardAvoidingView` on per screen (it measures its own frame, and inside a
// native Modal with `statusBarTranslucent` that measurement is the thing that
// goes wrong), the app reads the keyboard's height itself and does two things
// with it. Both live here, so there is one mechanism on both platforms:
//
//   1. ROOM TO SCROLL INTO. The scroller's content gets `keyboardInset` of
//      extra bottom padding, so the last field can actually reach the middle
//      of the screen. Padding alone fixes nothing if nobody scrolls, but
//      without it there is nowhere to scroll TO.
//   2. THE FOCUSED FIELD IS SCROLLED ABOVE THE KEYBOARD. Measured in window
//      coordinates against the keyboard's top edge, on focus AND on the
//      keyboard appearing — because at the moment a field takes focus the
//      keyboard has no height yet, and at the moment the keyboard reports its
//      height the focused field may have changed.
//
// ── WHO USES THIS, AND WHO SHOULD NOT ───────────────────────────────────────
//
// Screens do NOT import this. Two shells do, and between them they are every
// form in the app:
//
//   ui/Screen.jsx     every scrolling screen, auth included (AuthScreen wraps
//                     Screen), and the pinned `footer`
//   ui/FormSheet.jsx  all seven form screens plus RenameDeviceSheet,
//                     EditProfileSheet and SubmitTaskSheet
//
// Plus the three surfaces that own a raw Modal because a keyboard and a
// draggable sheet fight each other: ui/ReasonPrompt.jsx, features/maya/
// MayaSheet.jsx and the task composer.
//
// If you are reaching for this in a screen, the screen is probably missing its
// shell. Check that first.
//
// ── THE SAFE-AREA TRAP ───────────────────────────────────────────────────────
//
// An open keyboard covers the navigation bar, so `insets.bottom` is already
// inside `keyboardInset`. A footer that pads by BOTH floats a nav-bar's worth
// of white above the keys. `useKeyboardLift()` returns the two together,
// already reconciled — use it rather than adding the numbers yourself.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle,
  useMemo, useRef, useState,
} from 'react';
import {
  Keyboard, Platform, ScrollView, TextInput, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../theme/tokens';

/** Breathing room between the field being typed in and the top of the keys. */
const GAP = 24;
/** Extra scrollable room under the last field, so it can reach mid-screen. */
const TAIL = space[6];
/**
 * The focused field is measured a beat AFTER the event, not during it: on both
 * platforms the keyboard's frame and the scroller's new content height land in
 * the frame after the notification, and measuring too early scrolls to where
 * the field used to be.
 */
const SETTLE_MS = 60;

/* ─── The keyboard's height ───────────────────────────────────────────────── */

/**
 * How much of the window's bottom edge the keyboard covers right now, in dp.
 * `0` when it is closed.
 *
 * iOS uses the WILL events — they carry the animation, so the layout moves
 * with the keyboard instead of snapping after it. Android only ever fires the
 * DID events, and firing on `keyboardDidShow` there is right anyway: its
 * reported height is only final once the keyboard is up.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e) => {
      const h = e?.endCoordinates?.height;
      setInset(Number.isFinite(h) ? Math.round(h) : 0);
    };
    // Android also fires keyboardDidChangeFrame-ish updates as the keyboard
    // swaps (emoji, a different IME); re-reading on show covers those.
    const show = Keyboard.addListener(showEvent, onShow);
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    // iOS's WILL events don't fire for an interactive dismiss that is then
    // released, so the DID events are kept as the authority on "closed".
    const shown = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidShow', onShow) : null;

    return () => { show.remove(); hide.remove(); shown?.remove(); };
  }, []);

  return inset;
}

/**
 * What a BOTTOM-PINNED element (a form's footer, a composer) must add to clear
 * the keyboard, with the safe-area inset already reconciled — see the header's
 * safe-area trap.
 *
 * @returns {{ lift: number, safeBottom: number, keyboard: number }}
 *   `lift` is the margin to put below the element. `safeBottom` is what to pad
 *   INSIDE it (zero while the keyboard is up, because the keys cover the nav
 *   bar and padding for it twice leaves a white band).
 */
export function useKeyboardLift() {
  const keyboard = useKeyboardInset();
  const insets = useSafeAreaInsets();
  return useMemo(() => ({
    keyboard,
    lift: keyboard,
    safeBottom: keyboard > 0 ? 0 : insets.bottom,
  }), [keyboard, insets.bottom]);
}

/* ─── Revealing the focused field ─────────────────────────────────────────── */

/**
 * A `(node) => void` that brings a just-focused input above the keyboard.
 * `ui/TextField.jsx` calls it from `onFocus`; `null` outside a keyboard-aware
 * scroller, which is why TextField has to treat it as optional.
 */
const RevealContext = createContext(null);

/** @returns {((node: any) => void)|null} */
export function useReveal() {
  return useContext(RevealContext);
}

/**
 * Scroll `scrollRef` so `node` sits clear of the keyboard.
 *
 * Measured in WINDOW coordinates, not relative to the scroller: a form's
 * fields sit inside nested Views (FormGrid, Field, a sheet's body) and
 * `measureLayout` against the scroll node is only as reliable as that nesting.
 * Window coordinates versus the keyboard's top edge is the same question with
 * no layout tree in the answer.
 */
function revealNode(node, scrollRef, scrollY, windowHeight, keyboardInset) {
  const scroller = scrollRef?.current;
  if (!node || !scroller?.scrollTo || typeof node.measureInWindow !== 'function') return;

  node.measureInWindow((x, y, width, height) => {
    if (!Number.isFinite(y) || !Number.isFinite(height)) return;
    // No keyboard yet (focus arrived first): the keyboardDidShow pass will
    // re-run this with a real height. Scrolling on a guessed one overshoots.
    if (keyboardInset <= 0) return;

    const keyboardTop = windowHeight - keyboardInset;
    const overlap = (y + height + GAP) - keyboardTop;
    if (overlap <= 1) return;

    scroller.scrollTo({ y: Math.max(0, scrollY.current + overlap), animated: true });
  });
}

/* ─── The scroller ────────────────────────────────────────────────────────── */

/**
 * A ScrollView that gets out of the keyboard's way: it keeps `keyboardInset` of
 * scrollable room at the bottom and scrolls the focused field above the keys.
 *
 * Takes everything ScrollView takes. The ref it forwards IS the ScrollView's,
 * so `useFormFocus`'s `scrollTo` and §11's travel-to-the-first-problem keep
 * working through it unchanged — which is the point of forwarding it rather
 * than hiding it behind a wrapper.
 */
export const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  { contentContainerStyle, onScroll, scrollEventThrottle = 16, children, ...rest },
  ref,
) {
  const inner = useRef(null);
  useImperativeHandle(ref, () => inner.current, []);

  const keyboardInset = useKeyboardInset();
  const { height: windowHeight } = useWindowDimensions();

  // Where the scroller is RIGHT NOW. A ref, not state: it changes on every
  // frame of a drag and re-rendering a form per frame is a janky form.
  const scrollY = useRef(0);
  const handleScroll = useCallback((e) => {
    const y = e?.nativeEvent?.contentOffset?.y;
    if (Number.isFinite(y)) scrollY.current = y;
    onScroll?.(e);
  }, [onScroll]);

  /* The field waiting to be revealed. Held in a ref so the keyboardDidShow
     listener below can reveal whatever took focus a moment earlier without
     re-subscribing on every focus change. */
  const pending = useRef(null);
  const timer = useRef(null);

  // The LIVE values, for the listener. Reading `keyboardInset` out of the
  // closure would give the listener the height from the render it was created
  // in — which, the first time the keyboard opens, is zero.
  const live = useRef({ keyboardInset, windowHeight });
  live.current = { keyboardInset, windowHeight };

  const run = useCallback(() => {
    const node = pending.current || TextInput.State.currentlyFocusedInput?.();
    const { keyboardInset: kb, windowHeight: wh } = live.current;
    revealNode(node, inner, scrollY, wh, kb);
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, SETTLE_MS);
  }, [run]);

  /** Given to TextField via context. */
  const reveal = useCallback((node) => {
    pending.current = node || null;
    schedule();
  }, [schedule]);

  // The keyboard appearing is the OTHER half: on the first focus of a screen
  // the field is measured before the keyboard has a height, so the reveal has
  // to run again once it does.
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardDidShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, schedule);
    const hidden = Keyboard.addListener('keyboardDidHide', () => { pending.current = null; });
    return () => {
      sub.remove();
      hidden.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={inner}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle}
        contentContainerStyle={[
          contentContainerStyle,
          // AFTER the caller's style, so it wins: a screen's own
          // `paddingBottom` must not cancel the room the keyboard needs.
          keyboardInset > 0 ? { paddingBottom: keyboardInset + TAIL } : null,
        ]}
        // A tap on a button while the keyboard is up must press the BUTTON,
        // not just dismiss the keyboard and make the person tap twice.
        keyboardShouldPersistTaps="handled"
        // Dragging the content away dismisses the keyboard, which is how
        // people expect to get back to a pinned footer.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        {...rest}
      >
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
});

/**
 * The same reveal behaviour for a scroller this file does NOT own — a
 * BottomSheetScrollView, a FlatList, the Maya transcript. Give it the ref and
 * spread the returned props on your own scroller.
 *
 * @param {object} scrollRef  a ref to something with scrollTo()
 */
export function useKeyboardAware(scrollRef) {
  const keyboardInset = useKeyboardInset();
  const { height: windowHeight } = useWindowDimensions();
  const scrollY = useRef(0);
  const timer = useRef(null);

  const live = useRef({ keyboardInset, windowHeight });
  live.current = { keyboardInset, windowHeight };

  const onScroll = useCallback((e) => {
    const y = e?.nativeEvent?.contentOffset?.y;
    if (Number.isFinite(y)) scrollY.current = y;
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const node = TextInput.State.currentlyFocusedInput?.();
      const { keyboardInset: kb, windowHeight: wh } = live.current;
      revealNode(node, scrollRef, scrollY, wh, kb);
    }, SETTLE_MS);
  }, [scrollRef]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', schedule);
    return () => { sub.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [schedule]);

  return { keyboardInset, onScroll, scrollEventThrottle: 16, revealFocused: schedule };
}

export default KeyboardAwareScrollView;
