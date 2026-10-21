// ─────────────────────────────────────────────────────────────────────────────
// ui/SheetShell.jsx — the bottom-sheet CONTAINER. Nothing else owns one.
//
// This is machinery, not a component you reach for. It is NOT in ui/index.js
// and screens never import it. Exactly three things use it, and they are the
// three top-rounded panels in the app:
//
//   ui/RecordSheet.jsx   the record inspector        (75% / 62%)
//   ui/Select.jsx        OptionSheet, every picker   (75%)
//   ui/TimeField.jsx     the iOS date/time picker    (hugs its content)
//
// If you are adding a fourth, read CLAUDE.md §3 first — the odds are you want
// a RecordSheet or a FormSheet, not a new kind of sheet.
//
// ── WHY A LIBRARY, AFTER AVOIDING ONE FOR SO LONG (2026-10-17) ───────────────
//
// Every sheet used to be a bare React Native <Modal animationType="slide">.
// That gets you a panel that appears. It does not get you a panel you can
// TOUCH: no drag to dismiss, no rubber-banding at the top, no spring, and no
// handoff between the sheet and the list inside it — the one gesture everybody
// tries first, pulling down on the content, did nothing at all.
//
// `@gorhom/bottom-sheet` is the same call as react-navigation: a solved
// problem with a maintained solution. It needs no native linking here, because
// its two peers were already in the tree for other reasons —
// react-native-gesture-handler and react-native-reanimated — and App.jsx has
// always wrapped the tree in GestureHandlerRootView with flex:1.
//
// ── WHY `BottomSheet` INSIDE OUR OWN <Modal>, AND NOT `BottomSheetModal` ─────
//
// THIS IS THE LOAD-BEARING DECISION IN THIS FILE. Do not "simplify" it.
//
// The library's `BottomSheetModal` is the obvious choice and it is the wrong
// one HERE. A BottomSheetModal does not open a native window; it PORTALS into
// a single `BottomSheetModalProvider` mounted once at the app root. Everything
// below that root is then a sibling in one React Native view tree — and a
// native <Modal> is NOT in that tree. It is a separate platform window, drawn
// above the whole thing.
//
// So the moment a Select opened from inside a FormSheet (which stays a native
// Modal on purpose — a keyboard and a drag gesture fight each other, see
// ui/FormSheet.jsx), the picker would portal to the app root and be drawn
// BEHIND the form that asked for it. Invisible. Not clipped, not dim: gone,
// with the form still accepting taps on top of it.
//
// Keeping one native Modal per sheet keeps four things that are house rules:
//
//   1. LAYERING. RecordSheet 140 < AttachmentViewer 165 < ReasonPrompt 170
//      < Toast 200 (theme/tokens.js `layer`). Native windows stack in mount
//      order, so a ReasonPrompt opened over a RecordSheet is simply above it.
//   2. SIBLINGS, NEVER NESTED. A sheet rendered as a CHILD of another sheet
//      inherits its clipping and its backdrop and is trapped behind it. Each
//      owning its own window is what makes `{a && <X/>}{b && <Y/>}` work.
//   3. ANDROID BACK closes the TOPMOST sheet only, one press at a time. That
//      falls out of per-Modal `onRequestClose` and nothing else.
//   4. A sheet can open over a form, and a form over a sheet, in any order,
//      without a provider in the tree having to be above both.
//
// `BottomSheetModal` buys us dismiss-by-ref and a modal stack. We have both
// already, in thirty lines, without giving up any of the four.
//
// ── THE TWO-LAYER BACKGROUND, AND THE SQUARE CORNER ─────────────────────────
//
// The library draws its background as an ABSOLUTELY POSITIONED sibling behind
// the content, which is what lets the shadow escape. Our content cannot just
// sit on it: the header has its own `color.surface` fill, and a full-width
// header against a rounded background pokes two small square nubs out past
// the curve — the very artifact that started this (see `elevateSheet()`).
//
// So there are two layers and each does one job:
//
//   backgroundComponent   top radii + the iOS lift. NO overflow clipping, or
//                         iOS `masksToBounds` would clip the shadow away.
//   the children wrapper  top radii + `overflow: 'hidden'`, which is what
//                         actually clips the header's corners.
//
// `handleComponent={null}` is deliberate too. The library's handle is its own
// absolutely-positioned row ABOVE the content, so a wrapper under it would
// round its corners in the wrong place — 12px down, mid-sheet. Our handle goes
// inside the wrapper instead, as its first child, exactly where it used to be.
// We lose nothing: `enableContentPanningGesture` makes the whole panel
// draggable, so the handle, the header and a list already at scroll-top all
// pull the sheet down.
//
// ── A FITTED SHEET HAS TWO HEIGHT REPORTERS, AND ONE OF THEM LIES ───────────
// (2026-10-21: "single overtime record, single day, single correction — they
// don't open fully and won't scroll up")
//
// In the content-sized case the library learns the sheet's height from
// `animatedLayoutState.contentHeight`, and TWO components write it:
//
//   BottomSheetView        onLayout  → the whole panel: grab + header + body + footer
//   BottomSheetScrollView  onContentSizeChange → ONLY the body's inner content
//
// Last writer wins. When the scroll view reported last, a record whose body
// was 300pt tall gave the sheet a 300pt detent for ~470pt of panel: it opened
// short, the mask clipped the footer and the bottom of the body, and the body
// — exactly as tall as its content — had nothing to scroll. Worse, once the
// body hit its maxHeight cap the BottomSheetView's height stopped changing, so
// its correct value was never written again.
//
// So a fitted sheet remembers the panel's measured height (`FitContext`) and
// `SheetScrollView` writes it back straight after the library's own write.
// Inside a fitted sheet, use `SheetScrollView`, never a bare
// BottomSheetScrollView — RecordSheet is the one call site.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReduceMotion } from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
  useBottomSheet,
  useBottomSheetInternal,
  useBottomSheetSpringConfigs,
} from '@gorhom/bottom-sheet';
import { color, elevateSheet, radius, space } from '../theme/tokens';
import { SPRING } from '../theme/motion';
import { ToastLayer } from './Toast';

/* The fitted panel's last measured height, or null outside a fitted sheet. */
const FitContext = createContext(null);

/**
 * BottomSheetScrollView for a fitted sheet. Same props, same gesture handoff;
 * the only difference is that it puts the PANEL's height back after the
 * library overwrites it with the body's. See the header.
 */
export function SheetScrollView({ onContentSizeChange, ...props }) {
  const fit = useContext(FitContext);
  const { animatedLayoutState } = useBottomSheetInternal();
  const handleContentSize = useCallback((w, h) => {
    onContentSizeChange?.(w, h);
    const panel = fit?.current;
    // Not measured yet: the panel's own onLayout is still to come and will
    // write the right value itself.
    if (!panel) return;
    animatedLayoutState.modify((state) => {
      'worklet';
      state.contentHeight = panel;
      return state;
    });
  }, [onContentSizeChange, fit, animatedLayoutState]);
  return <BottomSheetScrollView {...props} onContentSizeChange={handleContentSize} />;
}

/** The grab handle: 36×4, slate, decorative. */
function GrabHandle() {
  return (
    <View
      // The backdrop and the close button are the real affordances, and
      // announcing a handle helps nobody.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ alignItems: 'center', paddingTop: space[2] }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.border }} />
    </View>
  );
}

/**
 * Hands `close` down to the content.
 *
 * It has to be its own component: `useBottomSheet()` only works BELOW the
 * sheet's provider, and a hook called in RecordSheet runs above it however
 * deep the JSX ends up nesting. A fragment, so the flex column outside is
 * untouched.
 *
 * Why it matters: a close BUTTON that calls `onClose` straight through unmounts
 * the sheet on the spot, with no animation, while a drag or a backdrop press
 * glides away. Side by side that reads as a bug. `close()` sends every route
 * through the same spring.
 */
function SheetContent({ children }) {
  const { close } = useBottomSheet();
  return typeof children === 'function' ? children({ close }) : children;
}

/**
 * @param {object} props
 * @param {boolean} [props.visible]  defaults true, for the mount-conditionally
 *   pattern (`{selected && <RecordSheet …/>}`). Flipping it false animates the
 *   sheet down and only then tears the native window down.
 * @param {Function} props.onClose   called when the SHEET closed itself — a
 *   drag, a backdrop press, the Android back button. Not called when `visible`
 *   went false, because whoever did that already knows.
 * @param {string} [props.snap]      the single detent, never above '75%'. Omit for
 *   a sheet that hugs its content.
 * @param {string} [props.background]  the panel fill. WHITE unless you have a
 *   reason — a sheet is ONE surface, not a page with bands (2026-10-18).
 * @param {boolean} [props.grab]     show the handle. Default true.
 * @param {React.ReactNode|Function} props.children  a node, or
 *   `({ close }) => node` when the content has its own close control and should
 *   animate out rather than vanish. See SheetContent above.
 *
 * A caller that ignores `onClose` keeps a closed sheet closed: the window is
 * gone and only `visible` going false and true again brings it back. All three
 * call sites flip their own state in `onClose`, which is the contract.
 */
export function SheetShell({
  visible = true,
  onClose,
  snap,
  fit = false,
  background = color.surface,
  grab = true,
  children,
}) {
  const sheetRef = useRef(null);
  // FIT (2026-10-20): the sheet is as tall as its content and no taller,
  // capped at the 75% ceiling. A fixed 75% detent opened a three-line record
  // into a mostly empty panel, and pushed a long one's footer out of reach.
  const { height: windowHeight } = useWindowDimensions();
  const fitting = fit && !snap;
  const maxContent = Math.round(windowHeight * 0.75);

  // Keeps the native window alive while the sheet animates down. Without it
  // `visible: false` yanks the window and the close animation never plays.
  const [rendered, setRendered] = useState(visible);

  // Read inside handleClosed, which must not re-create itself per render.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (visible) setRendered(true);
    else sheetRef.current?.close();
  }, [visible]);

  const handleClosed = useCallback(() => {
    setRendered(false);
    // Still `visible` means the sheet closed ITSELF — tell the owner. Already
    // false means the owner closed it and calling back would double-fire.
    if (visibleRef.current) onClose?.();
  }, [onClose]);

  const snapPoints = useMemo(() => (snap ? [snap] : undefined), [snap]);

  // A FRESH, UNFROZEN COPY, and `reduceMotion` deliberately left off.
  //
  // The library's `animate()` does `configs.reduceMotion = overrideReduceMotion`
  // — it MUTATES the config object, on the UI thread. `SPRING` is
  // `Object.freeze`d (theme/motion.js), so handing it over directly is a write
  // to a frozen object inside a worklet: a throw, or a silent no-op, depending
  // on the runtime. Neither is a thing to debug later. The numbers are the
  // house spring; `overrideReduceMotion` below owns the motion flag.
  const animationConfigs = useBottomSheetSpringConfigs(useMemo(() => ({
    damping: SPRING.damping,
    stiffness: SPRING.stiffness,
    mass: SPRING.mass,
  }), []));

  const renderBackdrop = useCallback((props) => (
    <BottomSheetBackdrop
      {...props}
      // The library's defaults are `appearsOnIndex: 1` / `disappearsOnIndex: 0`
      // — written for a sheet with a collapsed detent. Ours have ONE detent, so
      // on the defaults the scrim would never be drawn at all.
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      // 1, so `color.backdrop`'s own alpha is the scrim and the token stays the
      // single source of it. The library's 0.5 would halve it to 0.2.
      opacity={1}
      pressBehavior="close"
      accessibilityLabel="Close"
      accessibilityHint="Closes this panel"
      style={{ backgroundColor: color.backdrop }}
    />
  ), []);

  const renderBackground = useCallback(({ style }) => (
    <View
      // NO overflow:'hidden' here. See the header: it would clip the iOS
      // shadow this view exists to cast.
      style={[style, {
        backgroundColor: background,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
      }, elevateSheet()]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  ), [background]);

  const Wrapper = snap ? View : BottomSheetView;
  const panelHeight = useRef(null);
  const rememberPanel = useCallback((e) => {
    panelHeight.current = Math.round(e.nativeEvent.layout.height);
  }, []);

  if (!rendered) return null;

  return (
    <Modal
      visible
      transparent
      // The library animates the panel and fades the scrim. A Modal animation
      // on top of that would slide the backdrop too, and they would disagree.
      animationType="none"
      onRequestClose={() => sheetRef.current?.close()}
      statusBarTranslucent
    >
      {/* Android drops every pan inside a native Modal unless the Modal's own
          content is a gesture root. On iOS this is a plain flex:1 View. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          // With a detent given, dynamic sizing would fight it. Without one
          // (the iOS picker host) it is exactly what we want.
          enableDynamicSizing={!snap}
          maxDynamicContentSize={fitting ? maxContent : undefined}
          enablePanDownToClose
          onClose={handleClosed}
          animationConfigs={animationConfigs}
          // Sheets are the ONE motion exception (theme/motion.js): they keep
          // their slide under reduce-motion, because a panel that materialises
          // reads as a glitch and the slide is what says where it came from.
          overrideReduceMotion={ReduceMotion.Never}
          backdropComponent={renderBackdrop}
          backgroundComponent={renderBackground}
          handleComponent={null}
          // The library wraps the content in one accessible node labelled
          // "Bottom Sheet", which would collapse the whole record into a single
          // TalkBack stop. The content announces itself.
          accessible={false}
          accessibilityLabel={null}
          accessibilityRole={null}
          accessibilityHint={null}
        >
          {/* THE CLIPPER. This is what rounds the header's top corners.
              `BottomSheetView` ONLY in the content-sized case: it is the thing
              that reports its height back so the sheet can size to it, and a
              plain View reports nothing (the sheet then has no detent at all
              and never appears). In the fixed-detent case it would also claim
              the scrollable slot and fight the BottomSheetScrollView /
              BottomSheetFlatList inside, so there it stays a plain View. */}
          <Wrapper
            onLayout={snap ? undefined : rememberPanel}
            style={{
              // flex only when the height is fixed — a content-sized sheet has
              // no height to fill and flex:1 would collapse it to nothing.
              flex: snap ? 1 : undefined,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              overflow: 'hidden',
            }}
          >
            {grab ? <GrabHandle /> : null}
            <FitContext.Provider value={snap ? null : panelHeight}>
              <SheetContent>{children}</SheetContent>
            </FitContext.Provider>
          </Wrapper>
        </BottomSheet>
        {/* Toasts draw ABOVE this window while it is the top one (ui/Toast.jsx). */}
        <ToastLayer />
      </GestureHandlerRootView>
    </Modal>
  );
}

export default SheetShell;
