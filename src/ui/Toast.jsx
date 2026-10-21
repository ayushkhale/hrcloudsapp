// ─────────────────────────────────────────────────────────────────────────────
// ui/Toast.jsx — the app's one transient message.
//
// Mount <ToastProvider> once, at the root, ABOVE the navigator. Then anywhere:
//
//   const { showToast } = useToast();
//   showToast('Correction request sent', 'success');
//
// ── DECISIONS WORTH KEEPING ──────────────────────────────────────────────────
//
// • TOP OF THE SCREEN, not the bottom. The bottom is where the tab bar, the
//   punch button and every sheet footer live; a toast there covers the control
//   somebody just pressed and gets dismissed by the next tap.
//
// • ERRORS GET LONGER (6s vs 4s). An error has to be read and understood; a
//   success only has to be noticed. The web app's 3s error toast was measurably
//   too short for a two-line message.
//
// • ONE AT A TIME. A new toast replaces the old one. A stack of three is
//   unreadable on a phone and buries the most recent — which is the only one
//   anybody cares about.
//
// • A TOAST IS NOT ERROR HANDLING. A failed read belongs in ErrorState, where
//   it can offer Try again and stay on screen. A toast is for a WRITE that
//   succeeded or failed — something that happened because of a press, where
//   the screen itself already shows the result.
//
// • A TOAST MUST REACH ABOVE A SHEET (2026-10-21: "if the bottom sheet is open
//   the toast doesn't show up"). Every sheet, form and prompt is its own native
//   <Modal> — a separate window drawn ABOVE the app's root view, where this
//   provider renders. So a toast fired from inside a sheet (a failed save, a
//   copied link) was drawn underneath it, invisible. Each modal now mounts a
//   <ToastLayer /> inside its own window; the provider keeps them as a stack
//   and only the TOPMOST draws the toast. A new modal you add must mount one
//   too, or toasts vanish behind it again.
//
// • `accessibilityLiveRegion` is what makes TalkBack read it without the
//   person hunting for it. An error is assertive (it interrupts); a success is
//   polite (it waits its turn).
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { microTiming } from '../theme/motion';
import { icons } from '../theme/icons';
import { font, palette, radius, space } from '../theme/tokens';
import { haptic } from './haptics';

const DURATIONS = { success: 3500, info: 3500, error: 4500 };
const GLYPHS = { success: 'ok', error: 'warn', info: 'info' };
/* Purple for news, rose for an error — nothing else (2026-10-21). These were
   violet and fuchsia hex values typed out by hand; they come from the palette. */
const PURPLE_TOAST = {
  bg: palette.purple[50],
  border: palette.purple[200],
  iconBg: palette.purple[100],
  iconBorder: palette.purple[300],
  iconColor: palette.purple[600],
  textColor: palette.purple[900],
  shadow: palette.purple[600],
};
const TOAST_THEMES = {
  success: PURPLE_TOAST,
  info: PURPLE_TOAST,
  error: {
    bg: palette.rose[50],
    border: palette.rose[200],
    iconBg: palette.rose[100],
    iconBorder: palette.rose[200],
    iconColor: palette.rose[600],
    textColor: palette.rose[900],
    shadow: palette.rose[600],
  },
};

const ToastContext = createContext(null);

let globalToastRef = null;

export const Toast = {
  show: (message, kind = 'info') => {
    if (globalToastRef) {
      globalToastRef.showToast(message, kind);
    } else if (__DEV__) {
      console.warn('[Toast] Toast.show called before ToastProvider was mounted.');
    }
  },
  error: (message) => Toast.show(message, 'error'),
  success: (message) => Toast.show(message, 'success'),
  info: (message) => Toast.show(message, 'info'),
  hide: () => {
    globalToastRef?.hideToast();
  },
};

export const showToast = (message, kind = 'info') => Toast.show(message, kind);

/* The window stack. 'root' is the provider itself; each open modal pushes a
   layer and the last one pushed is the one that draws. */
const LayerContext = createContext(null);
const ROOT = 'root';
let layerSeq = 0;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, kind, id }
  const timer = useRef(null);
  const counter = useRef(0);
  const [layers, setLayers] = useState([ROOT]);
  const top = layers[layers.length - 1];
  const register = useCallback((id) => setLayers((l) => [...l, id]), []);
  const unregister = useCallback((id) => setLayers((l) => l.filter((x) => x !== id)), []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const triggerToast = useCallback((message, kind = 'info') => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    const safeKind = GLYPHS[kind] ? kind : 'info';
    // Every write in the app reports its outcome here, so this one line is
    // the success / failure haptic for all of them (ui/haptics.js). An info
    // toast is not an outcome and stays silent.
    if (safeKind === 'success') haptic('success');
    else if (safeKind === 'error') haptic('error');
    setToast({ message: String(message), kind: safeKind, id: counter.current });
    timer.current = setTimeout(() => setToast(null), DURATIONS[safeKind] || DURATIONS.info);
  }, []);

  useEffect(() => {
    globalToastRef = { showToast: triggerToast, hideToast: hide };
    return () => {
      if (globalToastRef?.showToast === triggerToast) {
        globalToastRef = null;
      }
    };
  }, [triggerToast, hide]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const layerValue = React.useMemo(
    () => ({ toast, hide, top, register, unregister }),
    [toast, hide, top, register, unregister],
  );

  return (
    <ToastContext.Provider value={{ showToast: triggerToast, hideToast: hide }}>
      <LayerContext.Provider value={layerValue}>
        {children}
        {toast && top === ROOT ? <ToastView key={toast.id} toast={toast} onPress={hide} /> : null}
      </LayerContext.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Mount INSIDE every native Modal (sheet, form, prompt, viewer), as its last
 * child. While that modal is the topmost window, the toast is drawn here —
 * above the modal — instead of in the root view underneath it. See the header.
 */
export function ToastLayer() {
  const ctx = useContext(LayerContext);
  const id = useRef(null);
  if (id.current == null) { layerSeq += 1; id.current = `layer-${layerSeq}`; }
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  useEffect(() => {
    if (!register) return undefined;
    const mine = id.current;
    register(mine);
    return () => unregister(mine);
  }, [register, unregister]);
  if (!ctx?.toast || ctx.top !== id.current) return null;
  return <ToastView key={ctx.toast.id} toast={ctx.toast} onPress={ctx.hide} />;
}

function ToastView({ toast, onPress }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const y = useSharedValue(16);
  const opacity = useSharedValue(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    y.value = withTiming(0, microTiming(reduced));
    opacity.value = withTiming(1, microTiming(reduced));
  }, [reduced, y, opacity]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  const Glyph = icons[GLYPHS[toast.kind]];
  const theme = TOAST_THEMES[toast.kind] || TOAST_THEMES.info;
  const isError = toast.kind === 'error';

  const bottomPosition = keyboardHeight > 0
    ? keyboardHeight + space[3]
    : Math.max(insets.bottom + space[6], space[8]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          bottom: bottomPosition,
          left: 0,
          right: 0,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        },
        animated,
      ]}
    >
      <Pressable
        accessibilityRole={isError ? 'alert' : undefined}
        accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
        accessibilityLabel={toast.message}
        accessibilityHint="Tap to dismiss"
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2] + 2,
          paddingLeft: space[3],
          paddingRight: space[4],
          paddingVertical: space[2] + 2,
          borderRadius: radius.full,
          backgroundColor: theme.bg,
          borderWidth: 1.5,
          borderColor: theme.border,
          maxWidth: '92%',
          shadowColor: theme.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 14,
          elevation: 8,
        }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: theme.iconBg,
            borderWidth: 1,
            borderColor: theme.iconBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Glyph ? <Glyph size={14} color={theme.iconColor} /> : null}
        </View>
        <Text
          style={{
            fontFamily: font.semibold,
            fontSize: 13.5,
            lineHeight: 18,
            color: theme.textColor,
            flexShrink: 1,
          }}
          numberOfLines={3}
        >
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    if (__DEV__) console.warn('[Toast] useToast() outside <ToastProvider> — fallback to global Toast.');
    return {
      showToast: (msg, kind) => Toast.show(msg, kind),
      hideToast: () => Toast.hide(),
    };
  }
  return ctx;
}

export default ToastProvider;
