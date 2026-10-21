// ─────────────────────────────────────────────────────────────────────────────
// features/org/components/OrgChartCanvas.jsx — the DRAWN org chart, like the web.
//
// The web draws the company at the top, people below as cards joined by
// reporting lines, with drag to pan and pinch to zoom (OrgChartCanvas.jsx). The
// user asked for that graph on the phone too — not an indented list. React
// Native is flexbox like the browser, so the layout is the web's: each person is
// a column of "their card" over "a centred row of their team", and the
// connectors are thin Views (a drop from the card, a horizontal bus across the
// team, a tick up to each child) rather than one measured SVG layer — which
// needs no post-layout measuring and still reads as a proper tree.
//
// • Pan + pinch: one Reanimated transform driven by composed gestures
//   (react-native-gesture-handler). +, − and Reset sit in a corner for anyone
//   who'd rather tap. The content is centred on first layout.
// • A team where everyone is a leaf and there are many of them is stacked
//   vertically (isStackedTeam) so one lead with 30 reports doesn't make the
//   chart thousands of points wide.
// • A card is tappable (opens the person); its fold pill is a separate tap. The
//   selected person and the line of managers above them are tinted — that
//   highlight is what "Find me" and search are for.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { Avatar } from '../../../ui';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  departmentKeyOf, isStackedTeam, roleLabel, roleToneOf,
} from '../orgMeta';

const CARD_W = 158;
const LINE = color.border;
const DROP = 20; // vertical drop from a card to the team bus
const TICK = 20; // vertical tick from the bus down to a child

/* ─── One card ───────────────────────────────────────────────────────────── */

function Card({ node, ctx }) {
  const t = toneOf(roleToneOf(node.role));
  const selected = node.id === ctx.selectedId;
  const onPath = !selected && ctx.pathIds.has(node.id);
  const dimmed = !!ctx.deptFilter && departmentKeyOf(node) !== ctx.deptFilter;
  const isMe = node.id === ctx.myId;
  const hasKids = node.children.length > 0;
  const open = hasKids && ctx.expanded.has(node.id);
  const Chevron = open ? icons.chevronUp : icons.chevronDown;

  return (
    <View style={{ alignItems: 'center', width: CARD_W, opacity: dimmed ? 0.3 : 1 }}>
      <Pressable
        onPress={() => ctx.onOpen(node.id)}
        accessibilityRole="button"
        accessibilityLabel={`${node.name}${node.designation ? `, ${node.designation}` : ''}${isMe ? ' (you)' : ''}. Open details.`}
        style={{
          width: CARD_W,
          alignItems: 'center',
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? color.brand : onPath ? color.brandSoftBorder : color.borderSubtle,
          paddingTop: space[2],
          paddingBottom: space[3],
          paddingHorizontal: space[2],
        }}
      >
        <View style={{ borderWidth: 2, borderColor: t.border, borderRadius: 24, padding: 1 }}>
          <Avatar person={node} size={40} />
        </View>
        <Text numberOfLines={1} style={[text.smallStrong, { marginTop: space[1], textAlign: 'center' }]}>{node.name}</Text>
        <Text numberOfLines={1} style={[text.caption, { textAlign: 'center' }]}>{node.designation || roleLabel(node.role)}</Text>
        {isMe ? (
          <View style={{ marginTop: 4, paddingHorizontal: space[2], paddingVertical: 1, borderRadius: radius.full, backgroundColor: color.brand }}>
            <Text style={[text.badge, { color: color.textOnBrand, fontSize: 9 }]}>You</Text>
          </View>
        ) : null}
      </Pressable>

      {hasKids ? (
        <Pressable
          onPress={() => ctx.onToggle(node.id)}
          accessibilityRole="button"
          accessibilityLabel={open ? `Collapse ${node.name}’s team` : `Show ${node.name}’s team of ${node.teamSize}`}
          hitSlop={8}
          style={{ marginTop: -10, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space[2], paddingVertical: 3, borderRadius: radius.full, backgroundColor: color.brandChipBg, borderWidth: 2, borderColor: color.surface }}
        >
          <Text style={[text.badge, { color: color.brandChipFg, fontSize: 10 }]}>{node.teamSize}</Text>
          {Chevron ? <Chevron size={11} color={color.brandChipFg} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/* ─── Connectors ─────────────────────────────────────────────────────────── */

const vline = (h) => <View style={{ width: 2, height: h, backgroundColor: LINE }} />;

/** The top connector for one child cell: the bus piece + the tick down to it. */
function ChildConnector({ first, last, single }) {
  return (
    <View style={{ height: TICK, width: '100%' }}>
      {!single ? (
        <View style={{ position: 'absolute', top: 0, height: 2, backgroundColor: LINE, left: first ? '50%' : 0, right: last ? '50%' : 0 }} />
      ) : null}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', marginLeft: -1, width: 2, backgroundColor: LINE }} />
    </View>
  );
}

/* ─── A subtree ──────────────────────────────────────────────────────────── */

function Subtree({ node, ctx }) {
  const open = node.children.length > 0 && ctx.expanded.has(node.id);
  const stacked = open && isStackedTeam(node);

  return (
    <View style={{ alignItems: 'center' }}>
      <Card node={node} ctx={ctx} />

      {open ? (
        <>
          {vline(DROP)}
          {stacked ? (
            // A long flat team: a vertical rail with each member hanging off it.
            <View style={{ alignItems: 'flex-start' }}>
              {node.children.map((c) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 18, height: 2, backgroundColor: LINE }} />
                  <View style={{ marginVertical: space[1] }}>
                    <Card node={c} ctx={ctx} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {node.children.map((c, i) => (
                <View key={c.id} style={{ alignItems: 'center', paddingHorizontal: space[2] }}>
                  <ChildConnector first={i === 0} last={i === node.children.length - 1} single={node.children.length === 1} />
                  <Subtree node={c} ctx={ctx} />
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

/* ─── The canvas ─────────────────────────────────────────────────────────── */

function ZoomButton({ icon: Icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.md, backgroundColor: pressed ? color.surfaceSubtle : color.surface, borderWidth: 1, borderColor: color.borderSubtle, alignItems: 'center', justifyContent: 'center' })}
    >
      {Icon ? <Icon size={18} color={color.textSecondary} /> : null}
    </Pressable>
  );
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
// A WORKLET: the pinch calls it on the UI thread. As a plain function it threw
// "Tried to synchronously call function … from a different thread" once per
// gesture frame — a burst of red boxes on every two-finger move (2026-10-21).
const clamp = (v, lo, hi) => {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
};

export function OrgChartCanvas({ index, ctx, companyName }) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Built once: a gesture object recreated on every render re-attaches the
  // handlers mid-drag.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .averageTouches(true)
      .onStart(() => { startX.value = tx.value; startY.value = ty.value; })
      .onUpdate((e) => { tx.value = startX.value + e.translationX; ty.value = startY.value + e.translationY; });
    const pinch = Gesture.Pinch()
      .onStart(() => { startScale.value = scale.value; })
      .onUpdate((e) => { scale.value = clamp(startScale.value * e.scale, MIN_SCALE, MAX_SCALE); });
    return Gesture.Simultaneous(pan, pinch);
  }, [scale, startScale, tx, ty, startX, startY]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const zoom = (factor) => { scale.value = withTiming(clamp(scale.value * factor, MIN_SCALE, MAX_SCALE)); };
  const reset = () => { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); };

  // A synthetic company node sits above the roots, exactly like the web.
  const roots = index?.roots || [];

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: color.bg }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: space[6] }, contentStyle]}>
          <View style={{ alignItems: 'center' }}>
            {/* Company root */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: color.heroFrom, borderRadius: radius.lg, paddingHorizontal: space[4], paddingVertical: space[3] }}>
              {icons.office ? <icons.office size={18} color={color.textOnBrand} /> : null}
              <Text style={[text.bodyStrong, { color: color.textOnBrand, maxWidth: 200 }]} numberOfLines={1}>
                {companyName || 'Organisation'}
              </Text>
            </View>

            {roots.length ? (
              <>
                {vline(DROP)}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {roots.map((r, i) => (
                    <View key={r.id} style={{ alignItems: 'center', paddingHorizontal: space[2] }}>
                      <ChildConnector first={i === 0} last={i === roots.length - 1} single={roots.length === 1} />
                      <Subtree node={r} ctx={ctx} />
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Zoom controls */}
      <View style={{ position: 'absolute', right: space[3], bottom: space[3], gap: space[2] }}>
        <ZoomButton icon={icons.add} label="Zoom in" onPress={() => zoom(1.25)} />
        <ZoomButton icon={icons.minus} label="Zoom out" onPress={() => zoom(0.8)} />
        <ZoomButton icon={icons.refresh} label="Reset the view" onPress={reset} />
      </View>
    </View>
  );
}

export default OrgChartCanvas;
