// ─────────────────────────────────────────────────────────────────────────────
// features/devices/screens/RegisterDeviceScreen.jsx — "Register this phone".
//
// A MODAL ROUTE (a record being written is a page, CLAUDE.md §4), opened from
// My Registered Devices. Two steps on one form, because they are one act:
//
//   1. NAME   prefilled from the phone's make and model; "Send code" makes a
//             fresh Keystore key and opens enrollment — the server emails a
//             6-digit code (registration/start).
//   2. CODE   the person types it; "Register" sends the code and the public
//             key (registration/complete). Done.
//
// The mechanics — the key, the payloads, why no possession signature — live
// in features/devices/deviceKey.js. This file is only the conversation.
//
// ── THE CODE HAS A SHORT LIFE, AND IT IS THE CHALLENGE'S, NOT THE EMAIL'S ───
//
// The start response carries two clocks: `otp_expires_at` (minutes) and the
// challenge's `expires_at` (~180s). The challenge dies first, and a dead
// challenge fails the whole registration however right the code is. So the
// countdown shown is the CHALLENGE's, and at zero the step goes back to
// "Send a new code" rather than letting someone type into a form that can no
// longer succeed. A wrong code consumes the challenge too (guide §5 #4), so
// OTP_INVALID also starts over.
//
// ── AT THE CAP ──────────────────────────────────────────────────────────────
//
// 409 DEVICE_LIMIT_REACHED lists the person's devices (`details.devices`).
// They pick one to replace — an OptionSheet, not a second screen — and the
// start is re-sent with `replace_device_id`. The replaced device is shut off
// by the server when this one lands, and the sheet says so before they pick.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../../state/AuthContext';
import { useCountdown } from '../../../hooks/useCountdown';
import { attendanceErrorMessage } from '../../../lib/errors/attendanceErrors';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, Field, FormSheet, InlineAlert, OptionSheet, TextField, showToast,
} from '../../../ui';
import { beginRegistration, finishRegistration, suggestedDeviceName } from '../deviceKey';
import { platformLabel } from '../deviceMeta';

const NAME_MAX = 80;
const CODE_LENGTH = 6;

const codeOf = (err) => err?.data?.code || err?.data?.errorCode || null;
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function RegisterDeviceScreen({ navigation }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [name, setName] = useState(() => suggestedDeviceName());
  const [code, setCode] = useState('');
  const [started, setStarted] = useState(null); // the start response + publicKey
  const [replaceId, setReplaceId] = useState(null);
  const [atCap, setAtCap] = useState(null); // devices to choose a replacement from
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState('');

  const deadline = useMemo(() => {
    const t = started?.expires_at ? Date.parse(started.expires_at) : NaN;
    return Number.isFinite(t) ? t : null;
  }, [started]);
  const left = useCountdown(deadline);
  const expired = !!started && deadline != null && left <= 0;

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const nameProblem = !trimmed ? 'Give this phone a name you’ll recognise.' : '';
  const codeProblem = code.length !== CODE_LENGTH ? `Type the ${CODE_LENGTH}-digit code from the email.` : '';

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const send = useCallback(async (replaceDeviceId = replaceId) => {
    setTried(true);
    if (nameProblem || busy) return;
    setBusy(true);
    setFailure('');
    try {
      const s = await beginRegistration({ userId, deviceName: trimmed, replaceDeviceId });
      setStarted(s);
      setCode('');
      setTried(false);
    } catch (err) {
      if (codeOf(err) === 'DEVICE_LIMIT_REACHED') {
        const devices = err?.data?.details?.devices || err?.data?.data?.devices || [];
        if (devices.length) { setAtCap(devices); return; }
      }
      showToast(attendanceErrorMessage(err, 'We couldn’t send the code. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [replaceId, nameProblem, busy, userId, trimmed]);

  const register = useCallback(async () => {
    setTried(true);
    if (codeProblem || busy || !started) return;
    setBusy(true);
    setFailure('');
    try {
      const device = await finishRegistration({
        userId, started, otp: code, deviceName: trimmed, replaceDeviceId: replaceId,
      });
      emitAttendanceChanged(ATTENDANCE_EVENTS.DEVICE, { entity: 'trusted_device', action: 'register' });
      showToast(device?.status === 'pending'
        ? 'Registered. HR has to approve it before you can clock in with it.'
        : 'This phone is registered. You can clock in with it now.', 'success');
      navigation.goBack();
    } catch (err) {
      const c = codeOf(err);
      // Both consume the challenge: the only way on is a new code.
      if (c === 'OTP_INVALID' || c === 'OTP_EXPIRED' || c === 'DEVICE_CHALLENGE_INVALID') {
        setStarted(null);
        setCode('');
        setTried(false);
        setFailure(c === 'OTP_INVALID'
          ? 'That code wasn’t right, and it can’t be used again. Send a new code.'
          : 'That code timed out. Send a new one — it works for three minutes.');
        return;
      }
      showToast(attendanceErrorMessage(err, 'We couldn’t register this phone. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [codeProblem, busy, started, userId, code, trimmed, replaceId, navigation]);

  const onCode = started && !expired;

  return (
    <>
      <FormSheet
        title="Register this phone"
        subtitle="Your organisation checks that attendance comes from your own phone."
        onClose={close}
        footer={(
          <>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="outline" onPress={close} disabled={busy} fullWidth />
            </View>
            <View style={{ flex: 1.3 }}>
              {onCode ? (
                <Button title="Register" icon={icons.check} onPress={register} loading={busy} fullWidth />
              ) : (
                <Button title={started ? 'Send a new code' : 'Send code'} icon={icons.mail} onPress={() => send()} loading={busy} fullWidth />
              )}
            </View>
          </>
        )}
      >
        {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

        <Field
          label="Name for this phone"
          required
          error={tried && !onCode ? nameProblem : ''}
          hint="You and HR see it in the device list."
        >
          <TextField
            kind="name"
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            placeholder="My phone"
            editable={!onCode && !busy}
          />
        </Field>

        {onCode ? (
          <Field
            label="Code from your email"
            required
            error={tried ? codeProblem : ''}
            hint={started.otp_sent_to
              ? `Sent to ${started.otp_sent_to}. It works for ${mmss(left)} more.`
              : `It works for ${mmss(left)} more.`}
          >
            <TextField
              kind="integer"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              maxLength={CODE_LENGTH}
              placeholder="6 digits"
              autoFocus
            />
          </Field>
        ) : null}

        {expired ? (
          <InlineAlert tone="amber">The code timed out. Send a new one — it works for three minutes.</InlineAlert>
        ) : null}

        <Text style={text.caption}>
          Each time you clock in, your phone asks for your fingerprint or screen lock. The key that proves it’s you never leaves this phone.
        </Text>
      </FormSheet>

      {/* At the cap: which one does this phone take the place of? */}
      <OptionSheet
        visible={!!atCap}
        title="Replace which device?"
        onClose={() => setAtCap(null)}
        data={atCap || []}
        keyOf={(d) => String(d.id)}
        rowHeight={64}
        header={(
          <Text style={[text.small, { paddingHorizontal: gutter, paddingTop: space[3] }]}>
            You’ve registered as many devices as your organisation allows. The one you pick stops working for clocking in once this phone is registered.
          </Text>
        )}
        renderRow={(d) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAtCap(null);
              setReplaceId(d.id);
              send(d.id);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60,
              paddingHorizontal: gutter, paddingVertical: space[3],
              backgroundColor: pressed ? color.pressTint : 'transparent',
            })}
          >
            <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
              {icons.device ? <icons.device size={19} color={color.brandChipFg} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={text.bodyStrong}>{d.device_name || 'A device'}</Text>
              <Text numberOfLines={1} style={text.caption}>{platformLabel(d.platform)}</Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

export { RegisterDeviceScreen };
