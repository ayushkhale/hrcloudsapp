// ─────────────────────────────────────────────────────────────────────────────
// features/devices/screens/DevicesScreen.jsx — "My Registered Devices".
//
// Ported from the web's shared/screens/MyDevicesPage. A PUSHED STACK SCREEN, not
// a tab and not a section of another screen (user, 2026-10-20): it opens from
// the drawer, shows this device and the rest, and the native header's back
// chevron returns to whatever tab you came from. No AppTopBar — the stack header
// is the chrome here.
//
// ── IT REGISTERS THIS PHONE (2026-10-21) ────────────────────────────────────
//
// This used to say registration was a browser-only WebAuthn ceremony and draw
// no button. The backend has a native credential for exactly this —
// `device_key`, a Keystore key — and the app now has the module for it
// (features/devices/deviceKey.js). So "Register this phone" opens the
// RegisterDevice form whenever: the org asks for devices (mode is not off),
// it allows phone keys (`allow_mobile_key`), this phone can hold one (a
// fingerprint or screen lock is set up; Android only for now), and this phone
// isn't already registered. Otherwise the button is absent, not disabled
// (CLAUDE.md §6) — with one sentence when the fix is the person's own (set up
// a screen lock).
//
// "This device" is no longer a guess when the phone registered itself: the
// id it was given is remembered on the phone, and THAT row is this device.
// The old inference (inferThisDevice) stays for devices registered elsewhere.
//
// ── THE QUESTIONS, IN THE ORDER PEOPLE ASK THEM (web header) ────────────────
//  1. "Do I have to do anything?" → the requirement panel (what's asked, and —
//     in watch-only — the date it starts biting).
//  2. "Is anything wrong?" → the call-outs: no working device while one is
//     required, or one still waiting for HR. Both refuse the next punch.
//  3. "Which ones are mine?" → this device first (inferred), then the rest. A
//     row opens the inspector for everything else (CLAUDE.md §3).
//
// CONTRACT TRAPS (web MyDevicesPage header):
//  · Self-revoke takes NO reason (the server writes `user_revoked`), so it is a
//    useConfirm, not a ReasonPrompt — asking for words the server throws away is
//    theatre. It is idempotent and IRREVERSIBLE.
//  · A `pending` device can't clock in yet; it reads differently from `active`.
//  · Shut-off devices are kept on the list for the record, sorted to the bottom
//    and muted — never removed.
//  · The context read degrades to "off" (an old server, the feature switched
//    off); the screen then reads "not required" rather than breaking (§7).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../../state/AuthContext';
import { attendanceAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from '../../../lib/events';
import { fmtDate, fmtDateTime } from '../../../lib/dates';
import { listFrom } from '../../../lib/normalize';
import { errorMessage } from '../../../lib/errors';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, FieldHelp, FilterTabs, InlineAlert, RecordSheet, SheetGrid, SheetSection,
  SheetFooterNote, SkeletonBlock, StatusBadge, showToast, useConfirm,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { RenameDeviceSheet } from '../components/RenameDeviceSheet';
import { deviceKeyAvailable, deviceKeySupported, forgetThisDevice, getThisDeviceRecord } from '../deviceKey';
import {
  DEVICE_MODES, atDeviceCap, deviceStatusNote, effectiveModeOf, enforceFromUpcoming,
  inferThisDevice, isDeviceUsable, modeViewOf, platformLabel, revokeReasonText, sortDevices,
} from '../deviceMeta';

const platformIcon = (platform) => (String(platform || '').toLowerCase() === 'web' ? icons.computer : icons.device);

/* ─── What the organisation asks for, right now ──────────────────────────── */

function RequirementPanel({ ctx, used, max }) {
  const view = modeViewOf(ctx);
  const mode = effectiveModeOf(ctx);
  const enforceFrom = enforceFromUpcoming(ctx);
  const t = toneOf(view.tone);
  const Icon = view.icon;

  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle, padding: space[3], gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          {Icon ? <Icon size={20} color={t.fg} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={text.bodyStrong}>{view.headline}</Text>
          <Text style={[text.caption, { color: t.fg }]}>{view.pill}</Text>
        </View>
        <FieldHelp surface="attendance.my_devices" field="effective_mode" />
      </View>

      {mode === DEVICE_MODES.MONITOR && enforceFrom ? (
        <Text style={text.small}>
          {`We’re recording which punches come from a registered device. From ${fmtDate(enforceFrom)} it becomes compulsory, so register one before then.`}
        </Text>
      ) : null}

      {mode !== DEVICE_MODES.OFF && max > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[text.caption, { color: color.textSecondary }]}>
            {`${used} of ${max} ${max === 1 ? 'device' : 'devices'} in use`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {Array.from({ length: Math.max(max, used) }).map((_, i) => (
              <View key={i} style={{ height: 5, flex: 1, borderRadius: 3, backgroundColor: i < used ? color.brand : color.borderSubtle }} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ─── One device, in full ────────────────────────────────────────────────── */

function DeviceSheet({ device, busy, onClose, onRename, onRevoke }) {
  const dead = device.status === 'revoked';
  const note = deviceStatusNote(device.status);

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Attendance device"
      icon={platformIcon(device.platform)}
      title={device.device_name || 'This device'}
      subtitle={platformLabel(device.platform)}
      badge={<StatusBadge kind="device" status={device.status} />}
      height="short"
      footer={dead ? (
        <SheetFooterNote>This device is shut off for good, so there’s nothing left to change on it.</SheetFooterNote>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            <Button title="Rename" variant="outline" icon={icons.edit} onPress={onRename} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Shut off" variant="danger" icon={icons.delete} onPress={onRevoke} loading={busy} fullWidth />
          </View>
        </>
      )}
    >
      {note ? (
        <InlineAlert tone={device.status === 'active' ? 'emerald' : dead ? 'rose' : 'amber'}>{note}</InlineAlert>
      ) : null}

      <SheetSection icon={icons.device} title="This device" collapsible={false}>
        <SheetGrid
          items={[
            ['Kind', platformLabel(device.platform)],
            ['Registered', device.registered_at || device.created_at ? fmtDateTime(device.registered_at || device.created_at) : null],
            ['Approved', device.approved_at ? fmtDateTime(device.approved_at) : 'Not needed'],
            ['Last used', device.last_used_at ? fmtDateTime(device.last_used_at) : 'Not yet used'],
            ['Last seen from', device.last_ip || null],
          ]}
        />
      </SheetSection>

      {dead && device.revoke_reason ? (
        <SheetSection icon={icons.info} title="Why it was shut off" collapsible={false}>
          <Text style={text.body}>{revokeReasonText(device.revoke_reason)}</Text>
        </SheetSection>
      ) : null}
    </RecordSheet>
  );
}

/* ─── A row ───────────────────────────────────────────────────────────────── */

function DeviceCard({ device, thisDevice, onOpen }) {
  const dead = device.status === 'revoked';
  return (
    <RecordCard
      icon={platformIcon(device.platform)}
      tone={dead ? 'slate' : 'purple'}
      title={device.device_name || 'This device'}
      subtitle={platformLabel(device.platform)}
      badge={(
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {thisDevice ? (
            <View style={{ paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: color.brandChipBg }}>
              <Text style={[text.badge, { color: color.brandChipFg, fontSize: 10 }]}>This device</Text>
            </View>
          ) : null}
          <StatusBadge kind="device" status={device.status} />
        </View>
      )}
      meta={[
        { label: 'Last used', value: device.last_used_at ? fmtDate(device.last_used_at) : 'Not yet used' },
        { label: 'Registered', value: fmtDate(device.registered_at || device.created_at, 'N/A') },
      ]}
      onPress={() => onOpen(device)}
      accessibilityLabel={`${device.device_name || 'This device'}. Open its details.`}
    />
  );
}

/* ─── The screen ──────────────────────────────────────────────────────────── */

/* ── TWO VIEWS, LIKE THE WEB (2026-10-20) ─────────────────────────────────
   The web's "My Registered Devices" is a group with two entries — This
   device · All my devices — over one page. This screen had collapsed them
   into one list under a drawer row with the SAME name as its group (user:
   "my registered device has same named tab, why? and web has two"). Now the
   drawer has the web's two rows, each deep-links a `view`, and the screen
   switches between them with the same segmented control. Applied once and
   cleared, or it is sticky (CLAUDE.md §6). */
const VIEWS = [
  { value: 'this', label: 'This device' },
  { value: 'all', label: 'All my devices' },
];

/** This phone's own registration, and whether it could hold a key at all. */
function useThisPhone(userId) {
  const [state, setState] = useState({ ready: false, record: null, support: { supported: false } });
  const load = useCallback(async () => {
    const [record, support] = await Promise.all([getThisDeviceRecord(userId), deviceKeySupported()]);
    setState({ ready: true, record, support });
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export default function DevicesScreen({ navigation, route }) {
  const confirm = useConfirm();
  const { user } = useAuth();
  const userId = user?.id;
  const phone = useThisPhone(userId);
  const [view, setView] = useState('this');
  const requested = route?.params?.view;
  useEffect(() => {
    if (!requested) return;
    if (VIEWS.some((v) => v.value === requested)) setView(requested);
    navigation?.setParams?.({ view: undefined });
  }, [requested, navigation]);
  const [selected, setSelected] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // The context read degrades to "off" — a 404/disabled feature is not an error
  // here, so onError swallows it and ctx stays null (reads as "not required").
  const context = useResource(() => attendanceAPI.getDeviceTrustContext(), { onError: () => {} });
  const devicesRes = useResource(() => attendanceAPI.getMyTrustedDevices(), {
    select: (data) => listFrom(data, ['devices']),
    initial: [],
  });

  const ctx = context.data;
  const devices = useMemo(() => devicesRes.data || [], [devicesRes.data]);
  const rows = useMemo(() => sortDevices(devices), [devices]);
  const active = useMemo(() => devices.filter((d) => d.status === 'active'), [devices]);
  const pending = useMemo(() => devices.filter((d) => d.status === 'pending'), [devices]);
  // The id this phone was given beats any guess about which row it is.
  const thisDevice = useMemo(() => {
    const own = phone.record ? devices.find((d) => d.id === phone.record.deviceId) : null;
    return own || inferThisDevice(devices);
  }, [devices, phone.record]);

  const mode = effectiveModeOf(ctx);
  const max = Number(ctx?.max_active_devices) || 0;
  const used = devices.length ? active.length : Number(ctx?.my_active_device_count) || 0;
  const blocked = mode === DEVICE_MODES.ENFORCE && !devicesRes.loading && active.length === 0;

  const reload = devicesRes.reload;
  const { reload: reloadPhone } = phone;
  const { reload: reloadContext } = context;

  // Back from RegisterDevice (a modal route): everything on this screen moved.
  useAttendanceChanged([ATTENDANCE_EVENTS.DEVICE], useCallback(() => {
    reload(); reloadPhone(); reloadContext();
  }, [reload, reloadPhone, reloadContext]));

  const registeredHere = !!phone.record && devices.some((d) => (
    d.id === phone.record.deviceId && (d.status === 'active' || d.status === 'pending')
  ));
  const offered = deviceKeyAvailable() && phone.ready && mode !== DEVICE_MODES.OFF
    && ctx?.allow_mobile_key !== false && !registeredHere && !devicesRes.loading;
  const canRegister = offered && phone.support.supported;
  const register = useCallback(() => navigation.navigate('RegisterDevice'), [navigation]);

  const revoke = useCallback(async (device) => {
    const last = active.length === 1 && device.status === 'active';
    const consequence = last && mode === DEVICE_MODES.ENFORCE
      ? ' It’s your only working device, so you won’t be able to clock in until another one is registered.'
      : '';
    const ok = await confirm({
      title: `Shut off “${device.device_name || 'this device'}”?`,
      message: `You won’t be able to clock in from it again, and the same screen lock can’t be registered a second time.${consequence}`,
      confirmText: 'Shut it off',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(device.id);
    try {
      await attendanceAPI.revokeMyTrustedDevice(device.id);
      // Shutting off THIS phone also drops its key: it can never sign again.
      if (phone.record?.deviceId === device.id) await forgetThisDevice(userId);
      // A device of the person's own that was waiting for approval has just left
      // HR's queue, so a badge elsewhere clears without a reload (CLAUDE.md §7).
      emitAttendanceChanged(ATTENDANCE_EVENTS.DEVICE, { entity: 'trusted_device', action: 'revoke' });
      showToast('Device shut off. It can’t be used to clock in.', 'success');
      setSelected(null);
      reload();
    } catch (err) {
      showToast(errorMessage(err, 'attendance', 'Couldn’t shut off this device.'), 'error');
    } finally {
      setBusyId(null);
    }
  }, [active.length, mode, confirm, reload, phone.record, userId]);

  const rename = useCallback(async (name) => {
    const device = renaming;
    if (!device) return;
    setBusyId(device.id);
    try {
      await attendanceAPI.renameTrustedDevice(device.id, { device_name: name });
      showToast('Name saved.', 'success');
      setRenaming(null);
      setSelected((s) => (s && s.id === device.id ? { ...s, device_name: name } : s));
      reload();
    } catch (err) {
      showToast(errorMessage(err, 'attendance', 'Couldn’t save the new name.'), 'error');
    } finally {
      setBusyId(null);
    }
  }, [renaming, reload]);


  if (devicesRes.error && devices.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <ErrorState
          error={devicesRes.error}
          domain="attendance"
          onRetry={devicesRes.reload}
          fallback="Couldn’t load your devices."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={cardListStyle}>
        <FilterTabs
          options={VIEWS.map((v) => (v.value === 'all' && devices.length ? { ...v, count: devices.length } : v))}
          value={view}
          onChange={setView}
        />

        {view === 'this' ? (context.loading && !ctx ? (
          <SkeletonBlock height={92} radius={radius.lg} />
        ) : (
          <RequirementPanel ctx={ctx} used={used} max={max} />
        )) : null}

        {blocked ? (
          <InlineAlert tone="amber">
            {canRegister
              ? 'You haven’t got a working device, so your next clock-in will be refused. Register this phone below.'
              : 'You haven’t got a working device, so your next clock-in will be refused. Register one from a computer, or ask HR to register this phone for you.'}
          </InlineAlert>
        ) : null}

        {canRegister ? (
          <Button title="Register this phone" icon={icons.device} onPress={register} fullWidth />
        ) : offered && phone.support.reason === 'NONE_ENROLLED' ? (
          <Text style={[text.small, { color: color.textSecondary }]}>
            To register this phone, set up a fingerprint or screen lock in its Settings first.
          </Text>
        ) : null}

        {pending.length > 0 ? (
          <InlineAlert tone="amber">
            {pending.length === 1
              ? 'One device is waiting for HR to approve it. You can’t clock in from it until they do — nothing more is needed from you.'
              : `${pending.length} devices are waiting for HR to approve them. You can’t clock in from them until they do.`}
          </InlineAlert>
        ) : null}

        {devicesRes.loading && devices.length === 0 ? (
          <CardsSkeleton rows={3} height={92} />
        ) : devices.length === 0 ? (
          <EmptyState
            icon={icons.device}
            title="No devices registered"
            message={mode === DEVICE_MODES.OFF
              ? 'Your organisation doesn’t ask for a registered device, so there’s nothing to set up here.'
              : canRegister
                ? 'Register this phone with the button above, or a computer from its browser.'
                : 'Register the device you clock in from, from a computer or browser — or ask HR to register this phone for you.'}
          />
        ) : view === 'this' ? (
          thisDevice ? (
            <DeviceCard device={thisDevice} thisDevice onOpen={setSelected} />
          ) : (
            <EmptyState
              icon={icons.device}
              title="This phone isn’t registered"
              message="None of your registered devices looks like this one. Your other devices are under All my devices."
              action={<Button title="See all my devices" variant="outline" size="sm" onPress={() => setView('all')} />}
            />
          )
        ) : (
          <>
            {rows.map((device) => (
              <DeviceCard
                key={String(device.id)}
                device={device}
                thisDevice={!!thisDevice && device.id === thisDevice.id}
                onOpen={setSelected}
              />
            ))}

            <Text style={[text.caption, { color: color.textMuted, marginTop: space[1] }]}>
              Devices you’ve shut off stay here as a record. They can’t be used to clock in, and the same screen lock can’t be registered again.
            </Text>
          </>
        )}
      </ScrollView>

      {selected ? (
        <DeviceSheet
          device={selected}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          // Close the inspector before the rename form opens — one modal at a
          // time reads cleaner on a phone than a form stacked over a sheet.
          onRename={() => { setRenaming(selected); setSelected(null); }}
          onRevoke={() => revoke(selected)}
        />
      ) : null}

      {renaming ? (
        <RenameDeviceSheet
          device={renaming}
          busy={busyId === renaming.id}
          onSubmit={rename}
          onClose={() => setRenaming(null)}
        />
      ) : null}
    </View>
  );
}

export { DevicesScreen };
