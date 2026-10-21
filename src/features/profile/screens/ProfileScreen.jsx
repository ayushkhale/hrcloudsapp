// ─────────────────────────────────────────────────────────────────────────────
// features/profile/screens/ProfileScreen.jsx — My Profile.
//
// Web ancestor: shared/screens/MyProfilePage.jsx. Same endpoint, same
// whitelist, same display-name asymmetry — all of it in profileFields.js,
// which is where the knowledge that cost the web team a field-by-field probe
// of the API now lives.
//
// ── THE SHAPE ────────────────────────────────────────────────────────────────
//
//   identity          who this is — photo, name, code, role, where they sit
//   Personal          the fields they own
//   Employment        the fields HR owns. No Edit control at all
//   Address           the fields payroll needs
//   Sign out
//
// Edit is per section and opens a FormSheet of just that section's fields.
// The reasoning is in EditProfileSheet.jsx.
//
// ── WHAT A SAVE HAS TO TOUCH ─────────────────────────────────────────────────
//
// Three things, and missing any one of them shows somebody a stale name:
//
//   1. this screen's copy of the profile — merged from the PAYLOAD, not from
//      the PATCH response, which is an envelope and would inject `success`
//      and `message` into the record
//   2. `name`, when `display_name` was in the payload — the endpoint reads it
//      back under the other key and never returns `display_name`
//   3. the SESSION's user, through `refreshProfile()` — otherwise the Home
//      greeting and the drawer keep the old name until the app restarts
//
// Then a silent re-read, for whatever the server normalised on the way in.
//
// ── NO TOP SAFE-AREA INSET ON THIS SCREEN (2026-10-18) ───────────────────────
//
// `ui/Screen` defaults to `edges={['top','bottom']}`, which is right for a
// screen that is its own tab root. THIS screen is PUSHED, so the native
// header has already consumed the status bar — and the inset then added a
// second status bar's worth of page background between the header and the
// hero. That is the white band above the purple, and the reason the gradient
// looked like it had been sliced off its own header.
//
// Every `<Screen>` below therefore passes `edges={['bottom']}`. Keep them in
// step: the loading skeleton and the error state sit in the same place as the
// loaded screen, or the page jumps as it resolves.
//
// ── THE PHOTO CAN BE CHANGED (2026-10-21) ────────────────────────────────────
//
// This used to say the photo was read-only because there was no image picker.
// react-native-image-picker has since arrived (the clock-in camera), so the
// camera badge on the avatar is live: camera or gallery → shrunk to 512px by
// the picker → the web's three-step handshake (avatarUpload.js) → the
// profile the confirm returns. A failed step is a toast that names the step
// (CLAUDE.md §3: a failed write is a toast); the old photo stays.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { organizationAPI } from '../../../api';
import { useAuth } from '../../../state/AuthContext';
import { useResource } from '../../../hooks/useResource';
import { color, radius, space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, ErrorState, OptionSheet, Row, Screen, Skeleton, SkeletonBlock, useConfirm, showToast,
} from '../../../ui';
import { SECTIONS } from '../profileFields';
import { IdentityCard, InfoSection } from '../components/ProfileParts';
import { EditProfileSheet } from '../components/EditProfileSheet';
import {
  PICK_OPTIONS, avatarFileProblem, avatarUploadMessage, uploadAvatar,
} from '../avatarUpload';

const PHOTO_SOURCES = [
  { value: 'camera', label: 'Take a photo', icon: icons.camera },
  { value: 'library', label: 'Choose from gallery', icon: icons.photo },
];

export default function ProfileScreen() {
  const { logout, refreshProfile } = useAuth();
  const confirm = useConfirm();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerTintColor: color.textPrimary,
    });
  }, [navigation]);

  // The screen holds its own copy so a save shows immediately, without
  // waiting for the re-read to come back.
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(null); // a SECTIONS entry
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Drawn at once from the last read this session, refreshed underneath (2026-10-22).
  const resource = useResource(() => organizationAPI.getMyProfile(), { cacheKey: 'my-profile' });
  const { data, loading, error, reload } = resource;

  // `useResource` unwraps the envelope; keep the newest of the two.
  const record = profile || data;

  const onSaved = useCallback((payload) => {
    setProfile((prev) => ({
      ...(prev || data),
      ...payload,
      // Written as `display_name`, read back as `name`. Mirror it locally or
      // the identity card keeps the old name until the next fetch lands.
      ...('display_name' in payload ? { name: payload.display_name } : {}),
    }));
    // The session's user, for the Home greeting and the drawer.
    refreshProfile?.();
    // And the canonical record, quietly, for anything the server normalised.
    reload();
  }, [data, refreshProfile, reload]);

  const changePhoto = useCallback(async (source) => {
    setChoosingPhoto(false);
    if (uploading) return;
    let res;
    try {
      res = source === 'camera'
        ? await launchCamera({ ...PICK_OPTIONS, cameraType: 'front' })
        : await launchImageLibrary(PICK_OPTIONS);
    } catch {
      showToast('Couldn’t open your photos. Try again.', 'error');
      return;
    }
    if (res?.didCancel) return;
    if (res?.errorCode) {
      showToast(res.errorCode === 'permission'
        ? 'The app isn’t allowed to use the camera. Allow it in Settings, or choose from your gallery.'
        : res.errorCode === 'camera_unavailable'
          ? 'This phone has no camera available. Choose from your gallery instead.'
          : 'That didn’t work. Try again.', 'error');
      return;
    }
    const a = res?.assets?.[0];
    const file = a?.uri ? { uri: a.uri, type: a.type, size: a.fileSize, name: a.fileName } : null;
    const problem = avatarFileProblem(file);
    if (problem) { showToast(problem, 'error'); return; }

    setUploading(true);
    try {
      const updated = await uploadAvatar(file);
      if (updated && typeof updated === 'object') setProfile((prev) => ({ ...(prev || data), ...updated }));
      showToast('Photo updated', 'success');
      // The drawer and the Home greeting show it too.
      refreshProfile?.();
      reload();
    } catch (err) {
      showToast(avatarUploadMessage(err), 'error');
    } finally {
      setUploading(false);
    }
  }, [uploading, data, refreshProfile, reload]);

  const signOut = useCallback(async () => {
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
  }, [confirm, logout]);

  if (loading && !record) {
    return (
      <Screen edges={['bottom']} gutters={false} contentStyle={{ paddingHorizontal: space[4], paddingTop: space[3], gap: space[4] }}>
        <SkeletonBlock height={220} radius={radius.xl} />
        <Skeleton type="rows" rows={6} />
      </Screen>
    );
  }

  if (error && !record) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          error={error}
          domain="organization"
          onRetry={reload}
          fallback="We couldn’t load your profile."
        />
      </Screen>
    );
  }

  return (
    <>
      <Screen
        refreshing={loading && !!record}
        onRefresh={reload}
        edges={['bottom']}
        gutters={false}
        contentStyle={{
          paddingHorizontal: space[4],
          paddingTop: space[3],
          paddingBottom: space[6],
          gap: space[4],
        }}
      >
        <IdentityCard
          profile={record}
          onPhotoError={reload}
          onChangePhoto={() => setChoosingPhoto(true)}
          uploading={uploading}
        />

        {SECTIONS.map((section) => {
          const canEdit = section.fields.some((f) => !f.locked);
          return (
            <InfoSection
              key={section.id}
              title={section.title}
              fields={section.fields}
              profile={record}
              note={section.note}
              onEdit={canEdit ? () => setEditing(section) : undefined}
            />
          );
        })}

        <View style={{ marginTop: space[2] }}>
          <Button
            title="Sign out"
            variant="outline"
            icon={icons.logout}
            onPress={signOut}
            fullWidth
          />
        </View>
      </Screen>

      <OptionSheet
        visible={choosingPhoto}
        title="Change your photo"
        onClose={() => setChoosingPhoto(false)}
        data={PHOTO_SOURCES}
        keyOf={(s) => s.value}
        rowHeight={60}
        renderRow={(s) => (
          <Row
            title={s.label}
            onPress={() => changePhoto(s.value)}
            chevron={false}
            left={(
              <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
                {s.icon ? <s.icon size={19} color={color.brandChipFg} /> : null}
              </View>
            )}
          />
        )}
      />

      {editing ? (
        <EditProfileSheet
          title={editing.title}
          fields={editing.fields}
          profile={record}
          onSaved={onSaved}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

export { ProfileScreen };
