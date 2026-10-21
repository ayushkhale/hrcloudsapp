// ─────────────────────────────────────────────────────────────────────────────
// features/profile/components/EditProfileSheet.jsx — editing ONE section of
// the profile.
//
// ── WHY A SECTION AT A TIME, AND NOT THE WHOLE PAGE ─────────────────────────
//
// The web turns the entire page into inputs at once: Edit Details swaps about
// twenty fields, and Save sends whichever of them changed. On a phone that is
// four screens of text inputs with the Save button somewhere off the bottom,
// and the thing you came to change — your blood group, say — is three
// scrolls down among eighteen fields you did not come to touch.
//
// So the Edit control lives on the SECTION, and opens that section's fields
// and nothing else. Six fields, one screen, a pinned Save. The payload is
// still a diff of only what changed, so this is the same request the web
// sends — just arrived at without making somebody scroll past their own
// address to correct their last name.
//
// ── IT IS A FormSheet, NOT A RecordSheet (§3) ───────────────────────────────
//
// A record being READ is a RecordSheet; a record being WRITTEN is a FormSheet,
// which is a full page with a pinned footer and no drag gesture. A keyboard
// and a draggable container fight each other.
//
// ── §11 · THE BUTTON STAYS LIVE, THE PRESS DOES THE CHECKING ────────────────
//
// Save is never greyed out for an empty field. It is pressed, the problems
// are revealed, and `focusFirstProblem` jumps to the first one. The only
// thing that disables it is a request already in flight (`submitState`), the
// one state a second press cannot fix.
//
// ── A SAVE THAT CHANGED NOTHING IS NOT AN ERROR ─────────────────────────────
//
// Open the sheet, change your mind, press Save: the diff is empty, so there
// is nothing to send. It closes. It does not say "no changes" — the person
// knows what they did and did not type.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { organizationAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { revealer, submitState } from '../../../lib/formGuard';
import { NAME_MAX } from '../../../lib/validation';
import { todayYMD } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import {
  Button, DateField, Field, FormSheet, InlineAlert, Select, TextField, showToast,
} from '../../../ui';
import {
  BLOOD_GROUPS, changedFields, seedFrom, validateProfile,
} from '../profileFields';

const BLOOD_OPTIONS = BLOOD_GROUPS.map((group) => ({ value: group, label: group }));

/**
 * @param {object} props
 * @param {string} props.title      the section's own title, so the sheet is
 *   named the same as the control that opened it
 * @param {Array} props.fields      that section's fields, locked ones included
 * @param {object} props.profile    the record being edited
 * @param {Function} props.onSaved  (payload) => void — merge it into the screen
 * @param {Function} props.onClose
 */
export function EditProfileSheet({ title, fields, profile, onSaved, onClose }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);

  const editable = useMemo(() => fields.filter((f) => !f.locked), [fields]);
  const [form, setForm] = useState(() => seedFrom(profile, fields));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    // A failure belongs to the request that was sent, not the one being typed.
    setFailure('');
  }, []);

  const problems = useMemo(() => validateProfile(form), [form]);
  const show = revealer(attempted);
  const { disabled, disabledReason } = submitState({ busy });

  const close = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const save = useCallback(async () => {
    if (busy) return;
    if (focus.focusFirstProblem(problems)) {
      setAttempted(true);
      return;
    }

    const payload = changedFields(profile, form);
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setFailure('');
    try {
      await organizationAPI.updateMyProfile(payload);
      onSaved(payload);
      showToast('Profile updated.', 'success');
      onClose();
    } catch (err) {
      setFailure(errorMessage(err, 'organization', 'We couldn’t save your changes.'));
    } finally {
      setBusy(false);
    }
  }, [busy, focus, problems, profile, form, onSaved, onClose]);

  return (
    <FormSheet
      title={title}
      subtitle="Only the fields you change are sent."
      onClose={close}
      scrollRef={scroller}
      footer={(
        <>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="outline" onPress={close} disabled={busy} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Save"
              onPress={save}
              loading={busy}
              disabled={disabled}
              disabledReason={disabledReason}
              fullWidth
            />
          </View>
        </>
      )}
    >
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

      {editable.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          required={field.required}
          hint={field.hint}
          error={show(problems[field.key])}
          register={focus.register(field.key)}
        >
          <Control field={field} value={form[field.key]} onChange={(v) => set(field.key, v)} />
        </Field>
      ))}
    </FormSheet>
  );
}

/** One input, chosen by the field's `kind`. */
function Control({ field, value, onChange }) {
  if (field.kind === 'date') {
    // Nobody's date of birth is in the future, and the picker should open on
    // a plausible year rather than today.
    return <DateField value={value} onChange={onChange} max={todayYMD()} />;
  }

  if (field.kind === 'blood') {
    return (
      <Select
        options={BLOOD_OPTIONS}
        value={value}
        onChange={onChange}
        title="Blood group"
        placeholder="Not set"
      />
    );
  }

  if (field.kind === 'multiline') {
    return (
      <TextField
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={500}
        placeholder="House, street, area"
      />
    );
  }

  if (field.kind === 'email') {
    return <TextField value={value} onChangeText={onChange} kind="email" placeholder="you@example.com" />;
  }

  if (field.kind === 'pincode') {
    return <TextField value={value} onChangeText={onChange} kind="integer" maxLength={6} placeholder="6 digits" />;
  }

  return <TextField value={value} onChangeText={onChange} maxLength={NAME_MAX} />;
}

export default EditProfileSheet;
