// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/components/TaskAttachments.jsx — the three file/link bits the
// submit form and the discussion composer share, plus the read-only row for a
// file already on the task.
//
//   LinksEditor      add https:// links, named — the web's TaskLinksField
//   FilesEditor      pick + upload files against this task (Mode B), as chips
//   AttachedFileRow  a file already on the task: name, where it came from, a
//                    Download that re-signs the link each press (#270)
//
// A SECTION IS A LABEL, NOT A BOX (CLAUDE.md §1): none of these draws a card
// around itself. The purple-labelled group they sit in is the frame.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { AttachmentPicker, Button, LinkButton, TextField, showToast } from '../../../ui';
import { attachmentContextLabel, formatFileSize, linkProblem } from '../taskMeta';
import { openTaskAttachment, taskFileProblem, taskUploadErrorMessage, uploadTaskFile } from '../taskUpload';

/* ─── Links ──────────────────────────────────────────────────────────────── */

export function LinksEditor({ rows = [], onChange, max = 5, label = 'Links' }) {
  const set = (i, key, value) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const add = () => onChange([...rows, { label: '', url: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <View style={{ gap: space[3] }}>
      <Text style={[text.label, { color: color.textSecondary }]}>{label}</Text>

      {rows.map((row, i) => {
        const problem = linkProblem(row);
        const touched = !!(row.label || row.url);
        return (
          <View key={String(i)} style={{ gap: space[1] }}>
            <TextField
              value={row.label}
              onChangeText={(v) => set(i, 'label', v)}
              placeholder="What the link is"
            />
            <TextField
              value={row.url}
              onChangeText={(v) => set(i, 'url', v)}
              placeholder="https://…"
              kind="email"
              invalid={touched && !!problem}
              right={(
                <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityLabel="Remove this link">
                  {icons.close ? <icons.close size={16} color={color.textMuted} /> : null}
                </Pressable>
              )}
            />
            {touched && problem ? <Text style={[text.caption, { color: color.danger.fg }]}>{problem}</Text> : null}
          </View>
        );
      })}

      {rows.length < max ? (
        <LinkButton title={rows.length ? 'Add another link' : 'Add a link'} align="left" onPress={add} />
      ) : null}
    </View>
  );
}

/* ─── Files being added ──────────────────────────────────────────────────── */

function FileChip({ file, onRemove, busy }) {
  const Clip = icons.attachment;
  const Close = icons.close;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '100%',
        borderRadius: radius.md,
        backgroundColor: color.surfaceSubtle,
        paddingLeft: space[3],
      }}
    >
      {busy ? <ActivityIndicator size="small" color={color.brandChipFg} /> : (Clip ? <Clip size={14} color={color.brandChipFg} /> : null)}
      <Text numberOfLines={1} style={[text.small, { color: color.textPrimary, flexShrink: 1, marginLeft: space[1], paddingVertical: 10 }]}>
        {file.file_name}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${file.file_name}`} style={{ width: 36, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
          {Close ? <Close size={16} color={color.textMuted} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * @param {object} props
 * @param {string} props.taskId
 * @param {'submission'|'comment'} props.context
 * @param {Array} props.files      the confirmed files, each `{ id, file_name, file_size_bytes }`
 * @param {(files) => void} props.onChange
 */
export function FilesEditor({ taskId, context = 'submission', files = [], onChange, disabled = false, label = 'Files' }) {
  const [busy, setBusy] = useState(false);

  const add = useCallback(async (file) => {
    setBusy(true);
    try {
      const saved = await uploadTaskFile({ file, taskId, context });
      if (saved?.id) onChange([...files, saved]);
    } catch (err) {
      showToast(taskUploadErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }, [taskId, context, files, onChange]);

  const remove = (id) => onChange(files.filter((f) => f.id !== id));

  return (
    <View style={{ gap: space[2] }}>
      <Text style={[text.label, { color: color.textSecondary }]}>{label}</Text>
      {files.map((f) => (
        <FileChip key={f.id} file={f} onRemove={() => remove(f.id)} />
      ))}
      {busy ? <FileChip file={{ file_name: 'Uploading…' }} busy /> : null}
      <AttachmentPicker
        label="Add a file"
        onPicked={add}
        validate={taskFileProblem}
        fileTypes="documents"
        hint="PDF, Word, Excel, JPG, PNG or WebP, up to 10 MB."
        disabled={disabled || busy}
      />
    </View>
  );
}

/* ─── A file already on the task ─────────────────────────────────────────── */

export function AttachedFileRow({ attachment }) {
  const [busy, setBusy] = useState(false);
  const Doc = icons.document;
  const Download = icons.download;

  const open = useCallback(async () => {
    setBusy(true);
    try {
      await openTaskAttachment(attachment.id, attachment.file_name);
    } catch (err) {
      showToast(taskUploadErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }, [attachment.id, attachment.file_name]);

  const sub = [attachmentContextLabel(attachment.attachment_context), formatFileSize(attachment.file_size_bytes)]
    .filter((v) => v && v !== 'N/A')
    .join(' · ');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[2],
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
        {Doc ? <Doc size={18} color={color.brandChipFg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.smallStrong}>{attachment.file_name || 'File'}</Text>
        {sub ? <Text style={text.caption}>{sub}</Text> : null}
      </View>
      <Button title="Open" size="sm" variant="outline" icon={Download} loading={busy} onPress={open} />
    </View>
  );
}

export default { LinksEditor, FilesEditor, AttachedFileRow };
