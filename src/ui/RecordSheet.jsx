// ─────────────────────────────────────────────────────────────────────────────
// ui/RecordSheet.jsx — THE HOUSE STANDARD FOR EVERY POPUP THAT SHOWS DATA.
//
// Web ancestor: shared/components/DetailDialog.jsx, the record inspector. The
// rule is unchanged and it is absolute (CLAUDE.md §3):
//
//   NEVER HAND-ROLL A MODAL FOR DATA. Compose from this and the parts in
//   SheetParts.jsx. Every role, every module, every popup showing a record.
//
// The pattern it completes is list → row → record inspector:
//   1. the LIST is scannable rows — who, when, how much, what state
//   2. the ROW opens this (ui/Row.jsx). No View button, ever
//   3. THIS holds everything else
//
// ── WHAT GOES WHERE ──────────────────────────────────────────────────────────
//
//   eyebrow   10px uppercase purple, above the title — which kind of record
//   icon      in a purple-50 rounded square
//   title     through displayValue() — "N/A", never a dash
//   subtitle  the one-line summary (a date, an amount, a period)
//   badge     a StatusBadge, top right
//   children  SheetStats · SheetSection · SheetGrid · SheetTable · SheetText
//   footer    ACTIONS LIVE HERE, NOT ON THE ROW. Pinned above the safe area
//
// And when there are no actions, say WHY with a SheetFooterNote rather than
// leaving an empty footer: "Approved leave can't be changed. Ask your manager
// to cancel it for you."
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
//
// Forms, confirms, reason prompts and pickers are NOT record inspectors and do
// not use this. A form is a FormSheet; a confirm is useConfirm(); a reason is
// ReasonPrompt. The web app states this exclusion explicitly and it matters:
// the moment a form grows out of a record sheet it inherits snap points and a
// drag gesture, and a keyboard plus a draggable container is a fight.
//
// ── IT IS A REAL BOTTOM SHEET (2026-10-17) ───────────────────────────────────
//
// It drags, it rubber-bands, it springs, and pulling down on a body already at
// scroll-top closes it — `@gorhom/bottom-sheet`, wired up in ui/SheetShell.jsx.
// Read that file's header before changing anything about the container: which
// component of the library we use, and why it sits inside our own <Modal>
// rather than portalling to an app-root provider, is the load-bearing decision
// and it is what keeps the stacking rules below true.
//
// ── IT FITS ITS CONTENT (2026-10-20) ─────────────────────────────────────────
//
// User: "the bottom sheets are opened to full screen and sometimes more than
// what content it has … fit to content, open till content only and some
// padding at bottom". A fixed 75% detent did both wrongs at once — a short
// record opened into a mostly empty panel, and a long one could push the
// footer's buttons out of view. Now the sheet is content-sized (SheetShell
// `fit`), capped at 75%, and only the BODY scrolls: header and footer are
// measured, the body gets what is left, so the footer always sits right under
// the content with the safe area and a little air below it. `height` is kept
// for old callers and no longer picks a detent.
//
// The body scroller is SheetShell's `SheetScrollView`, not the library's: the
// library's reports the body's height as the whole sheet's, and a record
// opened short and unscrollable (2026-10-21, SheetShell header).
//
// The body is the lavender CANVAS and every section is a white card on it
// (ui/SheetParts.jsx) — the reference "Request details" sheet.
//
// ── STACKING ─────────────────────────────────────────────────────────────────
//
//   RecordSheet 140 < AttachmentViewer 165 < ReasonPrompt 170 < Toast 200
//
// Render those as SIBLINGS of this, never as children — a child inherits this
// sheet's clipping and its backdrop, and ends up trapped behind it. The ⓘ and
// Maya portal out through a Modal for the same reason (ui/FieldHelp.jsx).
//
// Android back closes the TOPMOST sheet only, one press at a time. That falls
// out of each sheet owning its own Modal, so don't collapse them into one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayValue } from '../lib/format';
import {
  color, gutter, iconSize, radius, space, text,
} from '../theme/tokens';
import { icons } from '../theme/icons';
import { IconButton } from './Button';
import { Skeleton } from './Skeleton';
import { SheetScrollView, SheetShell } from './SheetShell';
import { RecordPage, useRecordPage } from './RecordPage';

/**
 * @param {object} props
 * @param {boolean} [props.visible]   defaults to true — mount it conditionally
 *   (`{selected && <RecordSheet …/>}`), which is also what resets its scroll
 * @param {Function} props.onClose
 * @param {string} [props.eyebrow]
 * @param {Function} [props.icon]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.badge]
 * @param {boolean} [props.loading]   keeps the header, skeletons the body
 * @param {React.ReactNode} [props.footer]
 * @param {'tall'|'short'} [props.height]
 */
export function RecordSheet(props) {
  // Inside a RecordPageScope the same record is drawn as a full page
  // (2026-10-22, ui/RecordPage.jsx). Two components, so neither runs the
  // other's hooks.
  const asPage = useRecordPage();
  return asPage ? <RecordPage {...props} /> : <RecordSheetPanel {...props} />;
}

function RecordSheetPanel({
  visible = true,
  onClose,
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  badge,
  loading = false,
  footer,
  height: _height = 'tall', // kept for old callers — see the header
  children,
}) {
  const insets = useSafeAreaInsets();
  const Close = icons.close;
  const { height: windowHeight } = useWindowDimensions();
  const [chrome, setChrome] = useState({ header: 96, footer: 0 });
  // 75% IS THE CEILING FOR EVERY SHEET (user decision, 2026-10-17); the body
  // gets whatever the header, the footer and the grab handle leave of it.
  const bodyMax = Math.max(
    160,
    Math.round(windowHeight * 0.75) - chrome.header - chrome.footer - 16,
  );
  const measure = (key) => (e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setChrome((c) => (c[key] === h ? c : { ...c, [key]: h }));
  };

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      fit
      /* ONE SURFACE, TOP TO BOTTOM (user decision, 2026-10-18: "either go for
         full grey or white"). This was `color.bg` — slate-50 — under a white
         header and a white footer, so a sheet read as three slabs: a white
         band, a grey middle, a white band, with white cards floating in the
         grey. The panel is now white like `Select` and `TimeField` already
         were, and the BLOCKS inside it went grey instead (SheetParts.jsx).
         White page → grey block → white rows, one alternation, no patches. */
      background={color.bg}
    >
      {/* `close` springs the panel down and THEN reports back, so the X button
          leaves the same way a drag does. Wiring the button to `onClose`
          directly would tear the sheet off the screen mid-air, which next to a
          dragged dismissal reads as a glitch. */}
      {({ close }) => (
        <>
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View
            onLayout={measure('header')}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space[3],
              paddingHorizontal: gutter,
              paddingTop: space[3],
              paddingBottom: space[3],
            }}
          >
            {Icon ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  // The CHIP shade, at the reference size (2026-10-20): a
                  // purple-50 tile behind a 20pt glyph was invisible (§1).
                  width: 48,
                  height: 48,
                  borderRadius: radius.md + 2,
                  backgroundColor: color.brandChipBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={iconSize.lg - 2} color={color.brandChipFg} />
              </View>
            ) : null}

            <View style={{ flex: 1, gap: 2 }}>
              {eyebrow ? (
                <Text style={[text.badge, { color: color.brand, letterSpacing: 0.6, textTransform: 'uppercase' }]}>
                  {eyebrow}
                </Text>
              ) : null}
              <Text accessibilityRole="header" style={[text.h2, { color: color.ink }]}>{displayValue(title)}</Text>
              {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
            </View>

            <View style={{ alignItems: 'flex-end', gap: space[2] }}>
              <IconButton round icon={Close} size={iconSize.sm} accessibilityLabel="Close" onPress={close} />
              {badge}
            </View>
          </View>

          {/* ── Body ───────────────────────────────────────────────────── */}
          {/* ── THE SKELETON LIVES INSIDE THE SCROLL VIEW (2026-10-22) ─────
              "Payslip bottom sheet isn't scrollable." `loading` used to swap
              the WHOLE body: a plain View with the skeleton, then — once the
              record landed — a scroll view mounted for the first time inside
              a sheet that had already measured and fitted itself around the
              skeleton. Every sheet that opens on `loading` (payslip, claim,
              org person) came up sized for the skeleton with a body that would
              not scroll. Sheets whose content merely GROWS inside an already
              mounted scroll view were fine. So the scroll view is always
              there, and the skeleton is its first content. */}
          {(
            // SheetScrollView (a BottomSheetScrollView), NOT ScrollView. It hands the
            // gesture back to the sheet: at scroll-top a downward pull drags
            // the panel instead of fighting the list, which is the whole point
            // of the library. A plain ScrollView swallows the pan and the sheet
            // becomes undraggable over most of its surface.
            // The SheetShell wrapper, not the library one: the library one tells
            // a fitted sheet the BODY is the whole panel (SheetShell header).
            <SheetScrollView
              // NO flex: the body is as tall as its content, up to what the
              // ceiling leaves. That is what lets the sheet fit its content.
              style={{ maxHeight: bodyMax }}
              contentContainerStyle={{
                paddingHorizontal: gutter,
                paddingTop: space[1],
                paddingBottom: space[4],
                // space[4] between unboxed sections is a canyon. The sections
                // carry no border now (SheetParts.jsx), so the gap is the only
                // separator and it only needs to be legible, not grand.
                gap: space[4],
              }}
              // A sheet's own scroll must not bounce on Android, where the glow
              // against the sheet's rounded top looks like a clipping bug.
              overScrollMode="never"
            >
              {loading ? (
                <View style={{ height: Math.min(320, bodyMax) }}>
                  <Skeleton type="sheet" />
                </View>
              ) : children}
            </SheetScrollView>
          )}

          {/* ── Footer: ACTIONS, or the note saying why there are none ─── */}
          {footer ? (
            <View
              onLayout={measure('footer')}
              style={{
                paddingHorizontal: gutter,
                paddingTop: space[3],
                paddingBottom: space[4] + insets.bottom,
                borderTopWidth: 1,
                borderTopColor: color.borderSubtle,
                backgroundColor: color.bg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[2],
              }}
            >
              {footer}
            </View>
          ) : (
            <View onLayout={measure('footer')} style={{ height: insets.bottom + space[3] }} />
          )}
        </>
      )}
    </SheetShell>
  );
}

export * from './SheetParts';
export default RecordSheet;
