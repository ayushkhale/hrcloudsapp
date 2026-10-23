// ─────────────────────────────────────────────────────────────────────────────
// ui/FormSheet.jsx — a form is a FULL-SCREEN MODAL, not a half-sheet.
//
// Web ancestor: the Create Attendance Policy dialog — `max-w-5xl`,
// `max-h-[92vh]`, uppercase 11px labels, pinned footer. That shape is the house
// standard for a big form, and this is its native translation.
//
// ── WHY FULL SCREEN AND NOT A BOTTOM SHEET ───────────────────────────────────
//
// A keyboard plus a draggable container is a fight. The sheet wants to be
// dragged, the keyboard wants to push it up, and the drag gesture competes with
// a scrolling body — so a half-sheet form ends up dismissing itself while
// somebody is typing in it. A full-screen modal has none of that.
//
// This is also why a RecordSheet is NOT a FormSheet: the web app's §3 lists
// forms, confirms, reason prompts and pickers as explicitly EXCLUDED from the
// record-inspector pattern. A form is not a record inspector.
//
// ── THE FOOTER IS PINNED, ALWAYS VISIBLE ─────────────────────────────────────
//
//   A FORM MUST NOT MAKE THE USER SCROLL TO FIND THE SUBMIT BUTTON.
//
// The body scrolls under the footer. On the web this was fixed on salary
// adjustments, leave payouts, exits, document requests and attendance
// corrections, all the same way.
//
// ── …WHICH MEANS IT HAS TO CLEAR THE KEYBOARD (2026-10-23) ───────────────────
//
// The pinned footer was pinned to the bottom of the WINDOW, and since
// `edgeToEdgeEnabled=true` (android/gradle.properties) Android stopped
// resizing that window for the keyboard — so on every one of these forms the
// Submit button sat underneath the keys, and the fields near it did too, with
// nothing scrolling. The KeyboardAvoidingView that used to wrap this is gone;
// ui/KeyboardAware.jsx reads the keyboard's height and this file spends it
// twice: as scrollable room in the body, and as a margin under the footer.
//
// ── AND FOUR OR MORE FIELDS MEANS GRIDDED ────────────────────────────────────
//
// Use <FormGrid> (ui/Field.jsx) and let the short fields pair up two across;
// long ones (a reason box, a person picker) take `wide`. A tall single column
// of twelve boxes is the thing `max-w-md` was on the web — a bug, not a style.
//
// ── IT PASSES ITS SCROLLER TO THE FORM GUARD ─────────────────────────────────
//
// `children` is called with the scroll ref, so §11's "travel to the first
// problem" works without the screen plumbing a ref through:
//
//   <FormSheet …>
//     {(scrollRef) => {
//       const focus = useFormFocus(scrollRef);   // in the screen, not here
//       …
//     }}
//   </FormSheet>
//
// In practice the screen usually owns the ref and passes `scrollRef` in — both
// are supported, and `scrollRef` wins when given.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, useKeyboardLift } from './KeyboardAware';
import { icons } from '../theme/icons';
import { color, gutter, space, text } from '../theme/tokens';
import { IconButton } from './Button';
import { ToastLayer } from './Toast';

/**
 * @param {object} props
 * @param {boolean} [props.visible]
 * @param {string} props.title    the same words as the button that opened it
 * @param {string} [props.subtitle] what this form is for, in one line
 * @param {React.ReactNode} props.footer  pinned. Cancel left, the action right
 * @param {Function} props.onClose
 * @param {object} [props.scrollRef]  the screen's own ref, for the form guard
 */
export function FormSheet({
  visible = true,
  title,
  subtitle,
  footer,
  onClose,
  scrollRef,
  children,
}) {
  const insets = useSafeAreaInsets();
  const { lift, safeBottom } = useKeyboardLift();
  const ownRef = useRef(null);
  const ref = scrollRef || ownRef;
  const Close = icons.close;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // A form is presented as a page, not as something floating over the
      // screen — and `pageSheet` on iOS gives the native swipe-to-dismiss that
      // people expect from a modal page.
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <View
        // THE CANVAS, not white (2026-10-20). A form is a PAGE, and the
        // reference forms are white field slabs on the app's wash — which is
        // what makes each field read as a thing to fill rather than a line on
        // a sheet. The header and the pinned footer sit on the same wash. A
        // record being READ (RecordSheet) stays white; this is not one.
        //
        // A plain View, NOT a KeyboardAvoidingView: it measures its own frame,
        // and inside a native Modal with a translucent status bar that
        // measurement is wrong by the top inset. The body and the footer each
        // handle the keyboard themselves below.
        style={{ flex: 1, backgroundColor: color.bg }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[2],
            paddingHorizontal: gutter,
            paddingTop: Platform.OS === 'ios' ? space[3] : insets.top + space[3],
            paddingBottom: space[2],
            backgroundColor: color.bg,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={[text.h2, { fontSize: 20, lineHeight: 26, color: color.ink }]}>{title}</Text>
            {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
          </View>
          <IconButton round tone="ink" icon={Close} accessibilityLabel="Close without saving" onPress={onClose} />
        </View>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {/* The ref forwarded here is the ScrollView's own, so §11's
            travel-to-the-first-problem (hooks/useFormFocus.js) still scrolls
            this body exactly as it did. keyboardShouldPersistTaps and
            keyboardDismissMode are set inside KeyboardAwareScrollView. */}
        <KeyboardAwareScrollView
          ref={ref}
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingTop: space[4],
            paddingBottom: space[6],
            gap: space[4],
          }}
        >
          {typeof children === 'function' ? children(ref) : children}
        </KeyboardAwareScrollView>

        {/* ── Footer: PINNED. Never scrolled away from. ─────────────────── */}
        {footer ? (
          <View
            style={{
              flexDirection: 'row',
              gap: space[2],
              paddingHorizontal: gutter,
              paddingTop: space[3],
              // safeBottom is 0 while the keyboard is up — the keys cover the
              // navigation bar, and padding for both leaves a white band.
              paddingBottom: space[3] + safeBottom,
              // MARGIN, so the bar itself keeps its height and simply sits on
              // top of the keyboard.
              marginBottom: lift,
              backgroundColor: color.bg,
              borderTopWidth: 1,
              borderTopColor: color.borderSubtle,
            }}
          >
            {footer}
          </View>
        ) : null}
      </View>
      {/* Toasts draw ABOVE this window while it is the top one (ui/Toast.jsx). */}
      <ToastLayer />
    </Modal>
  );
}

/**
 * A step/section inside a long form. Same look as SheetSection but it does NOT
 * fold by default — a folded form hides the box that is stopping the submit,
 * which is the exact problem §11's "travel to the first problem" exists for.
 *
 * Fold a form section only when it is genuinely optional, and then never the
 * one holding a required field.
 */
export function FormSection({ title, caption, children, style }) {
  return (
    <View style={[{ gap: space[3] }, style]}>
      <View style={{ gap: 2 }}>
        <Text style={text.h3}>{title}</Text>
        {caption ? <Text style={text.small}>{caption}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default FormSheet;
