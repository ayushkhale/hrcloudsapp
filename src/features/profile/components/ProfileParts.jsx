// ─────────────────────────────────────────────────────────────────────────────
// features/profile/components/ProfileParts.jsx — the shapes My Profile is
// built from: the identity block at the top, and the grouped fact sections
// under it.
//
// ── WHAT THE WEB PAGE IS, AND WHY IT CANNOT COME ACROSS AS-IS ───────────────
//
// MyProfilePage.jsx is a two-column layout: a sticky 320pt identity card on
// the left, and on the right a header with Edit/Save, then three cards each
// holding a THREE-COLUMN GRID of label-above-value fields. A phone has one
// column, so a 3-column grid becomes a vertical list of twenty-odd stacked
// label/value pairs — about four screens of scrolling with no landmarks, and
// every field looking exactly as important as every other.
//
// ── SO EACH FACT IS A ROW, NOT A STACKED PAIR ───────────────────────────────
//
// Label LEFT, value RIGHT, on one line, with a small tinted icon anchoring
// the left edge. It halves the vertical space, and — the real reason — it
// gives the eye a column to run down: you find "Blood group" by scanning
// labels, not by reading every value on the way past.
//
// A long value (an address) can't do that, so `multiline` fields break the
// rule deliberately and put the value on its own line underneath. They are
// the only ones that do.
//
// ── THE SECTION NOTE IS WHERE "YOU CAN'T EDIT THIS" LIVES ───────────────────
//
// Every section closes with one quiet ⓘ line under a hairline. That is where
// Employment information says HR keeps it — instead of six disabled rows with
// six little padlocks, which is six times the noise for one fact that applies
// to all of them. A section with nothing editable simply has no Edit control,
// and the note explains the absence.
//
// ── NO CAMERA BADGE ON THE AVATAR ───────────────────────────────────────────
//
// The web has a hover overlay and a camera button that open an upload dialog.
// This app has no image picker in package.json, so step one of the three-step
// upload does not exist. The photo is shown and not touchable. An affordance
// that cannot do anything is worse than no affordance (§2).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  card, color, elevate, font, iconSize, radius, space, text, toneOf,
} from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { roleLabel } from '../../../state/session';
import { Avatar } from '../../../ui';
import { displayName, shownValue } from '../profileFields';

/* ─── The identity block ─────────────────────────────────────────────────────
   An elegant, elevated white card with refined typography and neutral status
   chips. No heavy purple gradients — clean, professional, and accessible. */

/**
 * @param {Function} [props.onChangePhoto]  shows the camera badge; omitted = read-only photo
 * @param {boolean} [props.uploading]       a new photo is on its way up
 */
export function IdentityCard({ profile, onPhotoError, onChangePhoto, uploading = false }) {
  const Shield = icons.secure;
  const name = displayName(profile) || profile?.email?.split('@')[0] || 'Your profile';
  const code = profile?.employee_code;
  const role = profile?.role;

  return (
    <View
      style={[
        card,
        {
          padding: space[5],
          alignItems: 'center',
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.borderSubtle,
        },
        elevate('xs'),
      ]}
    >
      {/* Avatar with an elegant soft ring and subtle shadow */}
      <View
        style={{
          padding: 4,
          borderRadius: radius.full,
          backgroundColor: color.surface,
          borderWidth: 1.5,
          borderColor: color.borderSubtle,
          shadowColor: color.textPrimary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 3,
        }}
      >
        <Avatar person={profile} size={82} onPhotoError={onPhotoError} />

        {/* THE CAMERA BADGE (2026-10-21). The one filled purple thing on this
            card. 32pt to look at, 44pt to hit (hitSlop) — it sits on the
            avatar's edge, where a thumb lands without aiming. */}
        {onChangePhoto ? (
          <Pressable
            onPress={onChangePhoto}
            disabled={uploading}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={uploading ? 'Saving your new photo' : 'Change your photo'}
            style={({ pressed }) => ({
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 32,
              height: 32,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: color.surface,
              backgroundColor: pressed ? color.brandSoftFg : color.brand,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            {uploading
              ? <ActivityIndicator size="small" color={color.textOnBrand} />
              : icons.camera ? <icons.camera size={16} color={color.textOnBrand} /> : null}
          </Pressable>
        ) : null}
      </View>

      <Text
        style={[
          text.h1,
          {
            fontSize: 22,
            lineHeight: 28,
            marginTop: space[3],
            textAlign: 'center',
            color: color.textPrimary,
          },
        ]}
        numberOfLines={2}
      >
        {name}
      </Text>

      {code ? (
        <Text
          style={[
            text.caption,
            {
              color: color.textSecondary,
              fontFamily: font.mono,
              marginTop: 2,
              letterSpacing: 0.5,
            },
          ]}
        >
          {code}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: space[3],
          paddingHorizontal: space[3],
          paddingVertical: 5,
          borderRadius: radius.full,
          backgroundColor: color.surfaceSubtle,
          borderWidth: 1,
          borderColor: color.borderSubtle,
        }}
      >
        <Shield size={14} color={color.textSecondary} />
        <Text style={[text.caption, { color: color.textPrimary, fontFamily: font.semiBold, fontSize: 12 }]}>
          {roleLabel(role) || 'Employee'}
        </Text>
      </View>

      <PlacementStrip profile={profile} />
    </View>
  );
}

/** Department and designation, side by side — where this person sits. */
function PlacementStrip({ profile }) {
  const dept = shownValue(profile, { key: 'department' });
  const role = shownValue(profile, { key: 'designation' });

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space[3],
        alignSelf: 'stretch',
        marginTop: space[4],
        paddingTop: space[4],
        borderTopWidth: 1,
        borderTopColor: color.borderSubtle,
      }}
    >
      <Placement label="Department" value={dept} />
      <Placement label="Designation" value={role} />
    </View>
  );
}

function Placement({ label, value }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.surfaceSubtle,
        borderRadius: radius.md,
        paddingVertical: space[3],
        paddingHorizontal: space[2],
        alignItems: 'center',
        borderWidth: 1,
        borderColor: color.borderSubtle,
      }}
    >
      <Text
        style={[
          text.caption,
          {
            fontSize: 10,
            letterSpacing: 0.8,
            color: color.textMuted,
            textTransform: 'uppercase',
            fontFamily: font.semiBold,
            marginBottom: 3,
          },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          text.bodyStrong,
          {
            fontSize: 13,
            lineHeight: 18,
            textAlign: 'center',
            color: color.textPrimary,
          },
        ]}
        numberOfLines={2}
      >
        {value || 'Not set'}
      </Text>
    </View>
  );
}

/* ─── A group of facts ───────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {string} props.title
 * @param {Array} props.fields      from profileFields.js
 * @param {object} props.profile
 * @param {string} [props.note]     the quiet ⓘ line that closes the section
 * @param {Function} [props.onEdit] omitted when nothing in here is editable
 */
export function InfoSection({ title, fields, profile, note, onEdit }) {
  const Info = icons.info;
  const Edit = icons.edit;

  return (
    <View style={[card, { padding: 0, overflow: 'hidden' }, elevate('xs')]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space[4],
          paddingTop: space[4],
          paddingBottom: space[2],
          gap: space[3],
        }}
      >
        <Text accessibilityRole="header" style={[text.h3, { flex: 1, color: color.textPrimary }]}>{title}</Text>

        {onEdit ? (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${title.toLowerCase()}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: space[3],
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: pressed ? color.surfaceSubtle : color.surface,
              borderWidth: 1,
              borderColor: color.borderSubtle,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Edit size={13} color={color.textSecondary} />
            <Text style={[text.caption, { color: color.textPrimary, fontFamily: font.semiBold }]}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
        {fields.map((field, i) => (
          <InfoRow key={field.key} field={field} profile={profile} first={i === 0} />
        ))}
      </View>

      {note ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[2],
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            borderTopWidth: 1,
            borderTopColor: color.borderSubtle,
            backgroundColor: color.bg,
          }}
        >
          <Info size={iconSize.info} color={color.textMuted} />
          <Text style={[text.caption, { flex: 1, lineHeight: 16 }]}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One fact. Label left, value right — unless it's too long to sit there. */
function InfoRow({ field, profile, first }) {
  const Icon = field.icon;
  const tint = toneOf('slate');
  const value = shownValue(profile, field);
  const stacked = field.kind === 'multiline';

  const valueStyle = [
    text.bodyStrong,
    !value && { fontFamily: text.body.fontFamily, color: color.textMuted },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: stacked ? 'flex-start' : 'center',
        gap: space[3],
        paddingVertical: space[3],
        borderTopWidth: first ? 0 : 1,
        borderTopColor: color.borderSubtle,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.sm,
          backgroundColor: tint.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={iconSize.sm} color={tint.fg} />
      </View>

      {stacked ? (
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={text.label}>{field.label}</Text>
          <Text style={valueStyle}>{value || 'Not set'}</Text>
        </View>
      ) : (
        <>
          <Text style={[text.small, { flex: 1 }]} numberOfLines={1}>{field.label}</Text>
          <Text style={[...valueStyle, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>
            {value || 'Not set'}
          </Text>
        </>
      )}
    </View>
  );
}

export default InfoSection;
