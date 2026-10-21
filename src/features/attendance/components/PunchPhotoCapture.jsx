// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/PunchPhotoCapture.jsx — the clock-in photo.
//
// "when user clock in camera opens, he has to send a picture of where he is
// right now… retry, accept, reject… then show current location written on
// that picture… the image map kinda thing." — user, 2026-10-18
//
// THE FLOW
//
//   1. The SYSTEM camera opens (react-native-image-picker `launchCamera`).
//      Android's own camera already does retake / ✓ / ✗ — that is the
//      "basic functionality inbuilt android" — so we do not rebuild it.
//      ✗ in the camera = the clock-in is abandoned, nothing is sent.
//   2. Our preview: the photo with a GPS-camera STAMP burned along its
//      bottom — a map-style tile with a pin, the coordinates, the accuracy,
//      the date and time, and the person's name. "Retake" goes back to the
//      camera; "Use photo" accepts.
//   3. Accept renders photo + stamp into ONE JPEG (react-native-view-shot),
//      so the location is IN the image and survives any copy of it.
//
// ── A REAL MAP AND A REAL ADDRESS, FROM THE WEB'S OWN PROVIDER (2026-10-20) ─
//
// "i see coordinates but not any textual address — we are using free api in
// hrcloudsweb, use the same api in our app too, and show location details,
// not coordinates." — user
//
// The address is OpenStreetMap's Nominatim, through lib/geocoding.js (ported
// from the web's shared/utils/geocoding.js), looked up ONCE when the camera
// opens. The map tile is OpenStreetMap's tile server — the one the web's
// GeofenceMapPicker draws. The stamp prints the PLACE (building / street, then
// locality, city, state, pincode), not numbers.
//
// Only if the address can't be found (offline, Nominatim down) does the stamp
// fall back to the coordinates — a photo with no location at all is worse
// evidence than one with numbers on it. The address also travels with the
// punch in `metadata.punch_photo.address`.
//
// ── IT TRAVELS WITH THE PUNCH, LIKE THE COORDINATES (user, 2026-10-18) ─────
//
// "send in same as we are sending location" — so the stamped JPEG goes IN the
// clock-in body, as a base64 data URI, beside latitude/longitude (see
// PunchCard `sendClockIn` and lib/punchPhoto.js). It is rendered SMALL on
// purpose — 720px wide at quality 0.6 (PHOTO_WIDTH / PHOTO_QUALITY), about
// 60–120 KB — because a
// JSON body has a size limit and a punch must never fail over a picture.
//
// ── NO FIX, STILL A PHOTO ───────────────────────────────────────────────────
//
// Location never blocks a punch (lib/location.js). Without a fix the stamp
// says "Location not available" in words — never blank, never a dash.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, StatusBar, Text, View, useWindowDimensions,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import ViewShot from 'react-native-view-shot';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtDate, fmtTime } from '../../../lib/dates';
import { WEEKDAYS_SHORT } from '../../../lib/format';
import { osmTiles, placeLines, reverseGeocode } from '../../../lib/geocoding';
import { icons } from '../../../theme/icons';
import { color, font, gutter, palette, radius, space, text } from '../../../theme/tokens';
import { Button } from '../../../ui';

const CAMERA_OPTIONS = {
  mediaType: 'photo',
  cameraType: 'back',
  quality: 0.85,
  maxWidth: 1600,
  maxHeight: 1600,
  saveToPhotos: false,
  includeBase64: false,
};

/** The size the photo travels at. Small enough for a JSON body; plenty to see where. */
export const PHOTO_WIDTH = 720;
export const PHOTO_QUALITY = 0.6;
/** Above this, the base64 is not sent (a fallback photo that skipped the resize). */
const MAX_BASE64_CHARS = 400000;

const readBase64 = async (uri) => {
  const b64 = await ReactNativeBlobUtil.fs.readFile(decodeURI(String(uri).replace('file://', '')), 'base64');
  return b64 && b64.length <= MAX_BASE64_CHARS ? b64 : null;
};

const coord = (n, pos, neg) => `${Math.abs(n).toFixed(5)}° ${n >= 0 ? pos : neg}`;

/**
 * What the stamp says, worked out once so the preview and the record agree.
 * The PLACE first; coordinates only when no address could be found.
 */
export function stampLines(fix, at, who, place) {
  const c = fix?.coords;
  const when = `${WEEKDAYS_SHORT[at.getDay()]}, ${fmtDate(at)} · ${fmtTime(at.toISOString())}`;
  const accuracy = Number.isFinite(c?.accuracy) ? `Within ${Math.round(c.accuracy)} m` : null;
  if (!c || !Number.isFinite(c.latitude)) {
    return { title: 'Location not available', detail: 'Location was off or couldn’t be found', accuracy: null, when, who, address: null };
  }
  const lines = placeLines(place);
  if (lines) {
    return { title: lines.line1, detail: lines.line2, accuracy, when, who, address: place.address || [lines.line1, lines.line2].filter(Boolean).join(', ') };
  }
  return {
    title: 'Address not found',
    detail: `${coord(c.latitude, 'N', 'S')}, ${coord(c.longitude, 'E', 'W')}`,
    accuracy,
    when,
    who,
    address: null,
  };
}

/* A real OpenStreetMap window centred on the fix, with a pin. Without a fix, a
   plain tile with a grey pin — never an empty square. */
function MapTile({ size = 80, coords }) {
  const Pin = icons.location;
  const located = coords && Number.isFinite(coords.latitude);
  const map = located ? osmTiles(coords.latitude, coords.longitude, 16) : null;
  const T = size * 1.6; // one tile drawn at this size — z16, slightly zoomed out
  return (
    <View
      style={{
        width: size, height: size, borderRadius: radius.md, overflow: 'hidden',
        backgroundColor: palette.slate[100], borderWidth: 2, borderColor: palette.white,
      }}
    >
      {map ? map.tiles.map((t) => (
        <Image
          key={t.uri}
          source={{ uri: t.uri, headers: { 'User-Agent': 'HRClouds-Employee-App/1.0 (hrclouds)' } }}
          style={{
            position: 'absolute',
            width: T,
            height: T,
            left: size / 2 - map.fx * T + t.col * T,
            top: size / 2 - map.fy * T + t.row * T,
          }}
        />
      )) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {/* The pin's POINT sits on the location, so it is lifted by half. */}
        <View style={{ marginTop: -size * 0.2 }}>
          {Pin ? <Pin size={size * 0.4} color={located ? palette.rose[500] : palette.slate[400]} /> : null}
        </View>
      </View>
      {/* OSM's licence asks for attribution wherever its tiles are shown. */}
      {map ? (
        <Text style={{ position: 'absolute', right: 2, bottom: 1, fontSize: 6, color: palette.slate[600] }}>© OSM</Text>
      ) : null}
    </View>
  );
}

/* The strip burned into the photo. Dark glass, white type: legible on any photo. */
function Stamp({ lines, coords, looking }) {
  return (
    <View
      style={{
        position: 'absolute', left: 10, right: 10, bottom: 10,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 8, borderRadius: radius.md, backgroundColor: 'rgba(15,23,42,0.74)',
      }}
    >
      <MapTile coords={coords} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 13, lineHeight: 16, color: palette.white }}>
          {looking ? 'Finding your address…' : lines.title}
        </Text>
        {!looking && lines.detail ? (
          <Text numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: palette.slate[100] }}>{lines.detail}</Text>
        ) : null}
        <Text numberOfLines={1} style={{ fontSize: 10, color: palette.slate[300] }}>
          {[lines.when, lines.accuracy].filter(Boolean).join(' · ')}
        </Text>
        {lines.who ? <Text numberOfLines={1} style={{ fontSize: 10, color: palette.slate[300] }}>{lines.who}</Text> : null}
      </View>
    </View>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {object} [props.fix]       the location fix taken just before
 * @param {string} [props.who]       the person's name, for the stamp
 * @param {(photo: {uri, width, height, captured_at, stamp}) => void} props.onDone
 * @param {() => void} props.onCancel  the person backed out — no clock-in
 * @param {(message: string) => void} props.onUnavailable  no camera on this phone
 */
export function PunchPhotoCapture({ visible, fix, who, onDone, onCancel, onUnavailable }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const shot = useRef(null);
  const [photo, setPhoto] = useState(null); // { uri, width, height, at }
  const [saving, setSaving] = useState(false);
  // undefined = still looking, null = not found, object = the place.
  const [place, setPlace] = useState(undefined);

  useEffect(() => {
    if (!visible) return undefined;
    const c = fix?.coords;
    if (!c || !Number.isFinite(c.latitude)) {
      setPlace(null);
      return undefined;
    }
    let cancelled = false;
    setPlace(undefined);
    reverseGeocode(c.latitude, c.longitude).then((p) => { if (!cancelled) setPlace(p); });
    return () => { cancelled = true; };
  }, [visible, fix]);

  const shoot = useCallback(async () => {
    setPhoto(null);
    let res;
    try {
      res = await launchCamera(CAMERA_OPTIONS);
    } catch (err) {
      onUnavailable?.(err?.message || 'The camera couldn’t be opened.');
      return;
    }
    if (res?.didCancel) {
      onCancel?.();
      return;
    }
    if (res?.errorCode) {
      onUnavailable?.(res.errorCode === 'camera_unavailable'
        ? 'This phone has no camera available.'
        : res.errorCode === 'permission'
          ? 'The app isn’t allowed to use the camera. Allow it in Settings.'
          : res.errorMessage || 'The camera couldn’t be opened.');
      return;
    }
    const a = res?.assets?.[0];
    if (!a?.uri) {
      onCancel?.();
      return;
    }
    setPhoto({ uri: a.uri, width: a.width || 3, height: a.height || 4, at: new Date() });
  }, [onCancel, onUnavailable]);

  // Opening the modal IS opening the camera.
  useEffect(() => {
    if (visible) shoot();
    else setPhoto(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const accept = useCallback(async () => {
    if (!photo || saving) return;
    setSaving(true);
    try {
      const uri = await shot.current.capture();
      onDone?.({
        uri,
        base64: await readBase64(uri),
        width: photo.width,
        height: photo.height,
        captured_at: photo.at.toISOString(),
        stamp: stampLines(fix, photo.at, who, place),
      });
    } catch {
      // The stamping failed, not the photo: send the plain photo rather than
      // stop somebody clocking in over a rendering problem.
      let base64 = null;
      try { base64 = await readBase64(photo.uri); } catch { base64 = null; }
      onDone?.({ uri: photo.uri, base64, width: photo.width, height: photo.height, captured_at: photo.at.toISOString(), stamp: null });
    } finally {
      setSaving(false);
    }
  }, [photo, saving, fix, who, place, onDone]);

  // Fit the photo into the space above the buttons, keeping its shape.
  const maxW = screenW;
  const maxH = screenH - insets.top - insets.bottom - 150;
  const ratio = photo ? photo.width / photo.height : 3 / 4;
  const w = Math.min(maxW, maxH * ratio);
  const h = w / ratio;
  const lines = photo ? stampLines(fix, photo.at, who, place) : null;
  const looking = place === undefined && !!fix?.coords;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: palette.slate[900], paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: gutter, paddingVertical: space[3] }}>
          <Text style={[text.h3, { color: palette.white }]}>Your clock-in photo</Text>
          <Text style={[text.caption, { color: palette.slate[300] }]}>
            The location and time are printed on it and sent with your clock-in.
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {photo ? (
            <ViewShot
              ref={shot}
              // Rendered at PHOTO_WIDTH whatever the screen: the stored image
              // is the same size on every phone, and small enough to travel.
              options={{ format: 'jpg', quality: PHOTO_QUALITY, result: 'tmpfile', width: PHOTO_WIDTH, height: Math.round(PHOTO_WIDTH / ratio) }}
              style={{ width: w, height: h }}
            >
              <Image source={{ uri: photo.uri }} style={{ width: w, height: h }} resizeMode="cover" />
              <Stamp lines={lines} coords={fix?.coords} looking={looking} />
            </ViewShot>
          ) : (
            <ActivityIndicator color={palette.white} />
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: gutter, paddingTop: space[3], paddingBottom: space[3] }}>
          <View style={{ flex: 1 }}>
            <Button title="Retake" variant="onHeroGhost" icon={icons.refresh} onPress={shoot} disabled={saving || !photo} fullWidth />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button title={looking ? 'Finding address…' : 'Use photo'} icon={icons.check} onPress={accept} loading={saving} disabled={!photo || looking} fullWidth />
          </View>
        </View>
        <Text
          onPress={saving ? undefined : onCancel}
          style={[text.smallStrong, { color: palette.slate[300], textAlign: 'center', paddingVertical: space[2], marginBottom: insets.bottom + space[1] }]}
        >
          Don’t clock in
        </Text>
      </View>
    </Modal>
  );
}

export default PunchPhotoCapture;
