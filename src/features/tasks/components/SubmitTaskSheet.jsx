// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/components/SubmitTaskSheet.jsx — the assignee hands their work
// in for review (#252).
//
// Ported from the web's SubmitTaskDialog. It is a FORM, so it is a FormSheet, not
// a RecordSheet (CLAUDE.md §4) — a note, the links to the work and the files
// handed in, with a pinned footer.
//
// Traps (the web dialog's header has the long form):
//
// • STARTED FIRST. #252 refuses a `pending` task ("start work first"), so My
//   Tasks only offers this from "being worked on" or "changes requested" — the
//   form never has to explain a state it can't be opened from.
//
// • SUBMITTING IS ONE-WAY. The task moves to "waiting for review" and the
//   assignee can no longer change its status (#251 → 409), so the form says that
//   before the button is pressed, not after.
//
// • FILES ARE MODE B: the task exists, so each file is confirmed as it is picked
//   (FilesEditor → #269) and we send `attachment_ids`.
//
// • VALIDATE ON THE PRESS, BUTTON STAYS LIVE (CLAUDE.md §11). A short note or a
//   broken link reddens on submit and the message sits under the field; the
//   button never goes dead on a missing answer.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, Field, FormSheet, InlineAlert, TextField,
} from '../../../ui';
import { FilesEditor, LinksEditor } from './TaskAttachments';
import { TASK_LIMITS, cleanLinks, linkProblem } from '../taskMeta';

export function SubmitTaskSheet({ task, onSubmit, onClose }) {
  const [note, setNote] = useState('');
  const [links, setLinks] = useState([]);
  const [files, setFiles] = useState([]);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = note.trim();
  const noteProblem = trimmed.length < TASK_LIMITS.SUBMISSION_NOTE_MIN
    ? `Write at least ${TASK_LIMITS.SUBMISSION_NOTE_MIN} characters so your reviewer knows what you did.`
    : '';
  const linkTrouble = links.map(linkProblem).find(Boolean) || '';
  const blocked = !!noteProblem || !!linkTrouble;

  const send = async () => {
    setAttempted(true);
    if (saving || blocked) return;
    setSaving(true);
    try {
      await onSubmit({
        submission_note: trimmed,
        attachment_ids: files.map((f) => f.id).filter(Boolean),
        external_links: cleanLinks(links),
      });
      // The parent closes the sheet and refreshes on success.
    } catch {
      // onSubmit surfaces its own error (a toast); keep the form open to retry.
      setSaving(false);
    }
  };

  return (
    <FormSheet
      title="Hand in your work"
      subtitle={task?.title}
      onClose={saving ? undefined : onClose}
      footer={(
        <>
          <View style={{ flex: 1 }}>
            <Button title="Not yet" variant="ghost" onPress={onClose} disabled={saving} fullWidth />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button title="Hand in for review" icon={icons.upload} onPress={send} loading={saving} fullWidth />
          </View>
        </>
      )}
    >
      <InlineAlert tone="blue">
        Once you hand this in, the task waits on your reviewer and you can’t change it until they approve it or send it back.
      </InlineAlert>

      <Field
        label="What you did"
        required
        error={attempted ? noteProblem : ''}
        hint="What you finished, anything you changed, and what to look at first."
      >
        <TextField
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={TASK_LIMITS.SUBMISSION_NOTE_MAX}
          placeholder="Describe the work you’re handing in."
          invalid={attempted && !!noteProblem}
        />
      </Field>

      <LinksEditor rows={links} onChange={setLinks} max={TASK_LIMITS.SUBMISSION_LINKS_MAX} label="Links to the work" />

      <FilesEditor taskId={task?.id} context="submission" files={files} onChange={setFiles} disabled={saving} label="Files you’re handing in" />

      <Text style={[text.caption, { color: color.textMuted }]}>
        {`${note.length}/${TASK_LIMITS.SUBMISSION_NOTE_MAX}`}
      </Text>
    </FormSheet>
  );
}

export default SubmitTaskSheet;
