// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/ProgressRing.jsx — the 96pt ring on the punch
// card.
//
// It is `worked / shift length`, clamped to [0, 1] — a 10-hour day on an 8-hour
// shift reads as a full ring, not an overflowing one, because a ring that wraps
// past 360° is unreadable and the overtime is stated in words elsewhere.
//
// Drawn with react-native-svg (already in the binary), not a chart library: it
// is one arc, and a dependency for one arc is a dependency too many. The track
// is the full circle; the progress arc starts at 12 o'clock and sweeps
// clockwise, which is the one orientation everybody reads as "elapsed".
//
// It draws ONLY the ring. The clock text and the caption are its `children`,
// centred by this component, so the card owns what the numbers say and the ring
// owns only how full it is.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color } from '../../../theme/tokens';

/**
 * @param {object} props
 * @param {number} [props.progress]  0..1; clamped. Omit/NaN → an empty track.
 * @param {number} [props.size]      outer diameter in pt
 * @param {number} [props.stroke]    ring thickness
 * @param {string} [props.tint]      the progress arc colour
 * @param {string} [props.track]     the unfilled track colour
 * @param {React.ReactNode} [props.children]  centred inside the ring
 */
export function ProgressRing({
  progress = 0,
  size = 96,
  stroke = 8,
  tint = color.brand,
  track = color.borderSubtle,
  children,
}) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={size}
        height={size}
        // Rotate the whole ring so 0% begins at the top and fills clockwise.
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle cx={center} cy={center} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            // The gap is the unfilled remainder; a full ring has no gap.
            strokeDashoffset={c * (1 - p)}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

export default ProgressRing;
