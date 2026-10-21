// ─────────────────────────────────────────────────────────────────────────────
// features/settings/screens/SettingsScreen.jsx — Settings. HomeTab › Settings,
// reached from the drawer's Account section.
//
// ── A HUB THAT GROWS BY A ROW, NOT A REDESIGN (2026-10-20) ──────────────────
//
// It began as one screen for one setting (quick actions). More are coming
// (notifications, theme), so it is now grouped rows — the settings pattern both
// platforms use — and each new setting is a <SettingsRow> under a group
// (components/SettingsParts.jsx). A row that is itself a screen (Quick actions)
// is reached from here; a yes/no preference is a switch in place; a fact is a
// value on the right. Still "only kaam ki chize": no row for a setting that
// doesn't exist yet.
//
// Maya's group is absent when no assistant is configured (no DocMind key) —
// absent, not a dead switch (CLAUDE.md §2). Shake-to-open was removed at the
// user's request (2026-10-20); Maya opens from the floating button, the drawer
// and every ⓘ.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { color, gutter, iconSize, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { OptionSheet, showToast, useConfirm } from '../../../ui';
import { hapticsEnabled, onHapticsChange, setHapticsEnabled } from '../../../ui/haptics';
import { useAuth } from '../../../state/AuthContext';
import { ENV } from '../../../config/env';
import { mayaAvailable, openMaya } from '../../maya/mayaBridge';
import { useMayaPrefs } from '../../maya/mayaPrefs';
import { VOICE_LANGS, languageLabel } from '../../maya/mayaInstructions';
import { SettingsGroup, SettingsRow } from '../components/SettingsParts';
import { confirmIdentity, usePayPrivacy } from '../../../lib/payPrivacy';

export default function SettingsScreen({ navigation }) {
  const confirm = useConfirm();
  const { logout } = useAuth();
  const { prefs, setPref } = useMayaPrefs();
  const [langOpen, setLangOpen] = useState(false);
  // Per phone, not per account (ui/haptics.js rule 3). Subscribed, so the
  // switch shows the saved value once the start-up read lands.
  const [haptics, setHaptics] = useState(hapticsEnabled);
  useEffect(() => onHapticsChange(setHaptics), []);

  /* My Pay's lock (lib/payPrivacy.js). Switching it OFF asks the phone first:
     otherwise whoever is holding it turns the lock off and reads the pay,
     which makes the lock decoration. Switching it ON needs nothing. */
  const payPrivacy = usePayPrivacy();
  const setHidePay = async (on) => {
    if (on) { payPrivacy.setHideEnabled(true); return; }
    const result = await confirmIdentity();
    if (result === 'ok') payPrivacy.setHideEnabled(false);
    else if (result === 'locked_out') showToast('Too many tries. Unlock your phone, then try again.', 'error');
    else if (result === 'failed') showToast('We couldn’t confirm it’s you.', 'error');
  };

  const signOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You’ll need to sign in again to clock in or see your pay.',
      confirmText: 'Sign out',
      destructive: true,
      icon: icons.logout,
    });
    if (!ok) return;
    logout();
    showToast('Signed out', 'info');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: gutter, gap: space[5], paddingBottom: space[10] }}>
      {mayaAvailable() ? (
        <SettingsGroup title="Assistant">
          <SettingsRow
            icon={icons.maya}
            label="Ask Maya"
            caption="Questions about leave, pay, documents and more."
            onPress={openMaya}
          />
          <SettingsRow
            icon={icons.globe}
            label="Maya’s language"
            value={languageLabel(prefs.lang)}
            onPress={() => setLangOpen(true)}
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Personalise">
        <SettingsRow
          icon={icons.dashboard}
          label="Quick actions"
          caption="The six actions behind the ✚ button."
          onPress={() => navigation.navigate('QuickActions')}
        />
        <SettingsRow
          icon={icons.device}
          label="Vibrate on tap"
          caption="A light tick when you choose, punch or save."
          toggle={{ value: haptics, onChange: setHapticsEnabled }}
        />
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <SettingsRow
          icon={icons.fingerprint || icons.locked}
          label="Hide my pay"
          caption="Amounts on My Pay stay as dots until you confirm it’s you."
          toggle={{ value: payPrivacy.hideEnabled, onChange: setHidePay }}
        />
      </SettingsGroup>

      <SettingsGroup title="About">
        <SettingsRow icon={icons.info} label="Version" value={ENV.APP_VERSION} tone="slate" />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon={icons.logout} label="Sign out" destructive onPress={signOut} />
      </SettingsGroup>

      <OptionSheet
        visible={langOpen}
        title="Maya’s language"
        onClose={() => setLangOpen(false)}
        data={VOICE_LANGS}
        keyOf={(l) => l.value}
        renderRow={(l) => {
          const here = l.value === prefs.lang;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: here }}
              onPress={() => { setPref('lang', l.value); setLangOpen(false); }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingHorizontal: gutter,
                paddingVertical: space[3],
                minHeight: 56,
                backgroundColor: pressed ? color.pressTint : 'transparent',
              })}
            >
              <Text style={[text.body, { flex: 1 }]}>{l.label}</Text>
              {here && icons.check ? <icons.check size={iconSize.md} color={color.brand} /> : null}
            </Pressable>
          );
        }}
      />
    </ScrollView>
  );
}

export { SettingsScreen };
