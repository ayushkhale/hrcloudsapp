// ─────────────────────────────────────────────────────────────────────────────
// ui/ConfirmProvider.jsx — the AWAITABLE confirm.
//
// This is the native answer to one of the web app's worst bugs. `window.confirm`
// there is overridden by GlobalAlertProvider to return a PROMISE, and about
// twenty call sites did:
//
//     if (!window.confirm('Cancel this leave?')) return;   // WRONG
//
// A Promise is always truthy, so every one of those fired its API call BEFORE
// the person pressed anything. Somebody's leave was cancelled by a dialog they
// then dismissed.
//
// There is no `window.confirm` on native, which is the good news: the only way
// to confirm is this hook, and it cannot be used wrong by accident because it
// returns a Promise and nothing else.
//
//     const confirm = useConfirm();
//     if (!(await confirm({
//       title: 'Cancel this leave?',
//       message: 'Your balance will be given back.',
//       confirmText: 'Cancel leave',
//       destructive: true,
//     }))) return;
//
// ── RULES ────────────────────────────────────────────────────────────────────
//
// • EVERY DESTRUCTIVE ACTION AWAITS THIS. Cancelling a request, deleting a
//   document, withdrawing a correction, clocking out. No exceptions.
//
// • THE MESSAGE SAYS THE CONSEQUENCE, not the mechanism (CLAUDE.md §6).
//   "Your balance will be given back", not "triggers a balance reversal".
//
// • THE CONFIRM BUTTON SAYS WHAT HAPPENS. "Cancel leave", not "OK" — and never
//   "Yes"/"No" on a question whose wording makes "yes" ambiguous ("Cancel this
//   leave?" / "Cancel" is genuinely unanswerable).
//
// • IT IS NOT A FORM. One question, up to two buttons. A confirm that collects
//   a reason is ReasonPrompt; a confirm that collects three fields is a
//   FormSheet (CLAUDE.md §3).
//
// ── WHY THIS IS NOT THE PLATFORM Alert ANY MORE ──────────────────────────────
//
// It used to call `Alert.alert`, on the reasoning that people know what a
// system dialog means. In an app that is otherwise entirely its own purple,
// the OS dialog is the one surface that is not: grey, square-cornered, with
// a blue "Sign out" on iOS and an ALL-CAPS one on Android, and no way to make
// any of it match. It read as something the phone was asking, not the app.
//
// So the dialog is ours. What the platform gave for free is kept by hand and
// is the reason for most of the code below:
//
//   • `accessibilityViewIsModal` + `accessibilityRole="alert"` — the screen
//     reader moves into the dialog and cannot wander behind it.
//   • `onRequestClose` — Android's hardware back resolves it as a NO. Without
//     this the promise hangs forever and the caller is wedged.
//   • A scrim press is also a NO, for the same reason `style: 'cancel'` was.
//   • `autoFocus` on nothing: a confirm with a pre-focused destructive button
//     is how a double-tap deletes something.
//
// The one thing deliberately NOT kept is the platform's button ORDER. Ours is
// always "go back" then the action, left to right, on both platforms, because
// the app's own FormSheet footers are already that way round and a dialog that
// swaps them on one OS is how people press the wrong one.
//
// ── THE LOOK (2026-10-20) ────────────────────────────────────────────────────
//
// The reference confirm: a card anchored LOW, in the thumb zone, with a tinted
// icon tile (rose for destructive, purple otherwise), a centred title and
// consequence, and two FULL-WIDTH pills STACKED — the action on top, "go
// back" under it. Stacked, there is no left/right order for the platforms to
// disagree about, so the rule above still holds by construction. Opening a
// destructive confirm gives a warning haptic; it is the moment to look twice.
// All four corners stay rounded — a floating card, not a sheet — so Android's
// one-radius shadow outline is correct (tokens.js `elevateSheet`).
//
// Messages that are not questions do NOT come here. A result, a confirmation,
// a failure — those are a toast (ui/Toast.jsx). This is only for the moment
// something needs an answer before it happens.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, elevate, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { Button } from './Button';
import { haptic } from './haptics';
import { ToastLayer } from './Toast';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  // The pending promise's resolve. A ref, not state: it must survive the
  // re-render that opens the dialog, and it is never rendered.
  const resolver = useRef(null);

  /* WHAT THE DIALOG DRAWS WHILE IT FADES OUT (2026-10-21). Answering sets
     `opts` to null, but the Modal keeps fading for ~300ms after — and it used
     to fade with `opts?.title` gone: an EMPTY white card with two blank
     buttons. Every confirm did it; on Sign out it was the "UI breaks in
     between", because the app shell was being swapped for Login under it at
     the same moment. The last question stays drawn until the fade ends. */
  const lastOpts = useRef(null);
  if (opts) lastOpts.current = opts;
  const shown = opts || lastOpts.current;
  const insets = useSafeAreaInsets();

  /** Answer once, then forget — a second press can't resolve a dead promise. */
  const settle = useCallback((answer) => {
    const resolve = resolver.current;
    resolver.current = null;
    setOpts(null);
    resolve?.(answer);
  }, []);

  /**
   * @param {object} o
   * @param {string} o.title
   * @param {string} [o.message]       the CONSEQUENCE, in plain words
   * @param {string} [o.confirmText]   what will happen — not "OK"
   * @param {string} [o.cancelText]
   * @param {boolean} [o.destructive]  the confirm button turns rose
   * @param {Function} [o.icon]         a glyph for the tile; a sensible default otherwise
   * @returns {Promise<boolean>}
   */
  const confirm = useCallback((o = {}) => new Promise((resolve) => {
    // A second confirm while one is open would strand the first promise, and
    // its caller would wait forever. The newcomer loses; the open question is
    // the one the person is looking at.
    if (resolver.current) { resolve(false); return; }
    resolver.current = resolve;
    if (o.destructive) haptic('warning');
    setOpts({
      title: 'Are you sure?',
      confirmText: 'Continue',
      cancelText: 'Go back',
      destructive: false,
      ...o,
    });
  }), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Modal
        visible={!!opts}
        transparent
        animationType="fade"
        statusBarTranslucent
        // Android's hardware back. Without it the promise never settles.
        onRequestClose={() => settle(false)}
      >
        <Pressable
          // The scrim. A press outside is a NO, exactly as dismissing the
          // platform dialog was.
          onPress={() => settle(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{
            flex: 1,
            backgroundColor: color.backdrop,
            alignItems: 'center',
            // Low on the screen: the question sits where the thumb already is.
            justifyContent: 'flex-end',
            paddingHorizontal: space[3],
            paddingBottom: insets.bottom + space[3],
          }}
        >
          {/* A Pressable with no handler swallows the press so a tap on the
              card itself doesn't travel to the scrim and answer "no". */}
          <Pressable
            accessibilityViewIsModal
            accessibilityRole="alert"
            onPress={() => {}}
            style={[
              {
                width: '100%',
                maxWidth: 420,
                backgroundColor: color.surface,
                borderRadius: radius.xl + 2,
                paddingHorizontal: space[5],
                paddingTop: space[6],
                paddingBottom: space[5],
                gap: space[2],
                alignItems: 'center',
              },
              elevate('md'),
            ]}
          >
            <ConfirmIcon destructive={shown?.destructive} icon={shown?.icon} />

            <Text accessibilityRole="header" style={[text.h2, { textAlign: 'center', color: color.ink }]}>
              {shown?.title}
            </Text>

            {shown?.message ? (
              <Text style={[text.body, { color: color.textSecondary, textAlign: 'center', maxWidth: 340 }]}>
                {shown.message}
              </Text>
            ) : null}

            <View style={{ alignSelf: 'stretch', gap: space[2], marginTop: space[4] }}>
              <Button
                title={shown?.confirmText}
                variant={shown?.destructive ? 'danger' : 'primary'}
                onPress={() => settle(true)}
                fullWidth
              />
              <Button
                title={shown?.cancelText}
                variant="outline"
                onPress={() => settle(false)}
                fullWidth
              />
            </View>
          </Pressable>
        </Pressable>
        {/* Toasts draw ABOVE this window while it is the top one (ui/Toast.jsx). */}
        <ToastLayer />
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** The tinted tile at the top of the card. Rose only when it destroys. */
function ConfirmIcon({ destructive, icon }) {
  const Glyph = icon || (destructive ? icons.delete : icons.info);
  const tone = destructive ? color.danger : color.brandTone;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 64,
        height: 64,
        borderRadius: radius.lg,
        backgroundColor: tone.chip,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space[2],
      }}
    >
      {Glyph ? <Glyph size={iconSize.xl - 2} color={tone.fg} /> : null}
    </View>
  );
}

/**
 * @returns {(opts: object) => Promise<boolean>}
 *
 * Throws without a provider — unlike useToast, which degrades. A confirm that
 * silently resolved `true` would delete things nobody agreed to, and one that
 * silently resolved `false` would make every action appear broken. Neither is
 * survivable, so this fails loudly at the top of the tree instead.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export default ConfirmProvider;
