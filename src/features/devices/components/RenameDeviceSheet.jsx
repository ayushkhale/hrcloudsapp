// ─────────────────────────────────────────────────────────────────────────────
// features/devices/components/RenameDeviceSheet.jsx — rename one device.
//
// Ported from the web's RenameDeviceDialog. One field, so on the web it stays a
// narrow dialog; here it is a FormSheet, because a form is a FormSheet and a
// record being READ is a RecordSheet (CLAUDE.md §4). Only the name changes — the
// device keeps working exactly as it does now (web copy).
//
// Validate on the press, button stays live (CLAUDE.md §11): an empty name
// reddens on submit and the button never goes dead on a missing answer.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Field, FormSheet, TextField } from '../../../ui';
import { DEVICE_NAME_MAX } from '../deviceMeta';

export function RenameDeviceSheet({ device, busy, onSubmit, onClose }) {
  const [name, setName] = useState(device?.device_name || '');
  const [attempted, setAttempted] = useState(false);
  const problem = name.trim() ? '' : 'Give this device a name you’ll recognise later.';

  const save = () => {
    setAttempted(true);
    if (problem || busy) return;
    onSubmit(name.trim());
  };

  return (
    <FormSheet
      title="Rename this device"
      subtitle="Only the name changes — it keeps working exactly as it does now."
      onClose={busy ? undefined : onClose}
      footer={(
        <>
          <View style={{ flex: 1 }}>
            <Button title="Go back" variant="ghost" onPress={onClose} disabled={busy} fullWidth />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button title="Save name" onPress={save} loading={busy} fullWidth />
          </View>
        </>
      )}
    >
      <Field label="Name" required error={attempted ? problem : ''}>
        <TextField
          value={name}
          onChangeText={setName}
          maxLength={DEVICE_NAME_MAX}
          placeholder="e.g. My work phone"
          invalid={attempted && !!problem}
        />
      </Field>
    </FormSheet>
  );
}

export default RenameDeviceSheet;
