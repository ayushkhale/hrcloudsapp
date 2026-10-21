// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/components/TaskDiscussion.jsx — the conversation on one task
// (#253, #254), ported from the web's TaskDiscussion.
//
// Traps (the web file's header has the long form):
//
// • COMMENTS ARE APPEND-ONLY AND CARRY NO `If-Match` — three people can type at
//   once and all land, so posting never produces a 412.
//
// • THE FEED IS READ NEWEST-FIRST AND DRAWN OLDEST-FIRST. #254 pages from
//   whichever end `order` names; asking DESC lands on today's messages, and
//   "Show earlier messages" walks back — the way every chat behaves. A post
//   reloads from page 1 rather than paging on, because a message somebody else
//   added between two page reads shifts the window.
//
// • CANCELLED LOCKS WRITING, NOT READING (EC-T23). A cancelled task's thread is
//   exactly what somebody comes looking for later, so the feed stays and only
//   the composer goes. COMPLETED is NOT a lock — a handover note after sign-off
//   is a feature.
//
// • A COMMENT NAMES ITS FILES BY ID (#254 returns `attachment_ids` only). An id
//   must never reach the screen (§4), so each is looked up in the task's own
//   attachments (plus anything uploaded in this screen) and falls back to the
//   words "Attached file", never the uuid.
//
// • SYSTEM NOTES ARE MACHINE SHOUTING. #260/#261/#262 write "REWORK REQUESTED:"
//   into the thread; `parseSystemComment` splits the prefix off and the note is
//   drawn with the human words instead.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { tasksAPI } from '../../../api';
import { fmtDateTime } from '../../../lib/dates';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Avatar, Button, FieldHelp, LinkButton, TextField, showToast,
} from '../../../ui';
import { commentRateLimitMessage, isCommentRateLimited, taskErrorMessage } from '../../../lib/errors/taskErrors';
import { FilesEditor, LinksEditor } from './TaskAttachments';
import {
  TASK_LIMITS, canCommentOnTask, cleanLinks, formatFileSize, linkProblem, parseSystemComment, personInSentence,
} from '../taskMeta';
import { openTaskAttachment } from '../taskUpload';

const unwrap = (res) => (res?.data ?? res ?? {});
const commentsOf = (body) => (Array.isArray(body?.comments) ? body.comments : []);
const oldestFirst = (list) => [...list].reverse();

/* ─── One file bundled with a message ────────────────────────────────────── */

function CommentFile({ id, file }) {
  const [busy, setBusy] = useState(false);
  const Download = icons.download;

  const open = useCallback(async () => {
    setBusy(true);
    try {
      await openTaskAttachment(id, file?.file_name);
    } catch (err) {
      showToast(taskErrorMessage(err, 'Couldn’t open that file. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [id, file?.file_name]);

  return (
    <Pressable
      onPress={open}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Open ${file?.file_name || 'attached file'}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        alignSelf: 'flex-start',
        maxWidth: '100%',
        paddingHorizontal: space[2],
        paddingVertical: 6,
        borderRadius: radius.md,
        backgroundColor: color.brandChipBg,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={color.brandChipFg} /> : (Download ? <Download size={14} color={color.brandChipFg} /> : null)}
      <Text numberOfLines={1} style={[text.small, { color: color.brandChipFg, flexShrink: 1 }]}>
        {file?.file_name || 'Attached file'}
      </Text>
      {file?.file_size_bytes ? <Text style={[text.caption, { color: color.brandChipFg }]}>{formatFileSize(file.file_size_bytes)}</Text> : null}
    </Pressable>
  );
}

/* ─── One message ────────────────────────────────────────────────────────── */

function CommentRow({ comment, fileById }) {
  const ids = Array.isArray(comment?.attachment_ids) ? comment.attachment_ids : [];

  if (comment?.system_generated) {
    const { label, body } = parseSystemComment(comment?.message);
    const Cog = icons.cog;
    return (
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
          {Cog ? <Cog size={16} color={color.brandChipFg} /> : null}
        </View>
        <View style={{ flex: 1, backgroundColor: color.brandSoftBg, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2], gap: 2 }}>
          <Text style={[text.smallStrong, { color: color.brandSoftFg }]}>{label}</Text>
          {body ? <Text style={[text.small, { color: color.brandSoftFg }]}>{body}</Text> : null}
          <Text style={[text.caption, { color: color.brandSoftFg }]}>{fmtDateTime(comment?.created_at, '')}</Text>
        </View>
      </View>
    );
  }

  const links = Array.isArray(comment?.external_links) ? comment.external_links : [];

  return (
    <View style={{ flexDirection: 'row', gap: space[3] }}>
      <Avatar person={comment?.author} size={32} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] }}>
          <Text style={text.smallStrong}>{personInSentence(comment?.author, 'A colleague')}</Text>
          <Text style={text.caption}>{fmtDateTime(comment?.created_at, '')}</Text>
          {comment?.is_progress_update ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space[2], paddingVertical: 1, borderRadius: radius.full, backgroundColor: color.pending.bg }}>
              {icons.star ? <icons.star size={10} color={color.pending.fg} /> : null}
              <Text style={[text.badge, { color: color.pending.fg, fontSize: 9 }]}>Milestone</Text>
            </View>
          ) : null}
        </View>
        {comment?.message ? <Text style={text.body}>{comment.message}</Text> : null}
        {ids.length ? (
          <View style={{ gap: space[1], marginTop: 2 }}>
            {ids.map((id) => <CommentFile key={id} id={id} file={fileById.get(id)} />)}
          </View>
        ) : null}
        {links.map((l, i) => (
          <LinkButton key={String(i)} title={l.label || l.url} align="left" onPress={() => openLink(l.url)} />
        ))}
      </View>
    </View>
  );
}

function openLink(url) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

/* ─── Saying something ───────────────────────────────────────────────────── */

function Composer({ taskId, onPost }) {
  const [message, setMessage] = useState('');
  const [milestone, setMilestone] = useState(false);
  const [links, setLinks] = useState([]);
  const [files, setFiles] = useState([]);
  const [extras, setExtras] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = message.trim();
  const linkTrouble = links.map(linkProblem).find(Boolean) || '';
  const blocked = !trimmed || !!linkTrouble || saving;
  const Star = icons.star;

  const send = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      await onPost({
        message: trimmed,
        is_progress_update: milestone,
        attachment_ids: files.map((f) => f.id).filter(Boolean),
        external_links: cleanLinks(links),
      }, files);
      setMessage('');
      setMilestone(false);
      setLinks([]);
      setFiles([]);
      setExtras(false);
    } catch (err) {
      showToast(isCommentRateLimited(err) ? commentRateLimitMessage(err) : taskErrorMessage(err, 'Couldn’t post that. Try again.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: color.borderSubtle }}>
      <TextField
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={TASK_LIMITS.COMMENT_MAX}
        placeholder="Say where things have got to, or ask a question."
      />

      {extras ? (
        <View style={{ gap: space[3], paddingVertical: space[1] }}>
          <FilesEditor taskId={taskId} context="comment" files={files} onChange={setFiles} label="Files" />
          <LinksEditor rows={links} onChange={setLinks} max={TASK_LIMITS.COMMENT_LINKS_MAX} label="Links" />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Pressable
          onPress={() => setMilestone((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: milestone }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: space[2],
            paddingVertical: 6,
            borderRadius: radius.full,
            backgroundColor: milestone ? color.brand : color.surfaceSubtle,
          }}
        >
          {Star ? <Star size={13} color={milestone ? color.textOnBrand : color.textMuted} /> : null}
          <Text style={[text.caption, { color: milestone ? color.textOnBrand : color.textSecondary }]}>Milestone</Text>
        </Pressable>
        <FieldHelp surface="tasks.discussion" field="is_progress_update" />

        <LinkButton
          title={extras ? 'Hide files and links' : 'Files or links'}
          align="left"
          onPress={() => setExtras((v) => !v)}
        />

        <View style={{ flex: 1 }} />
        <Button title="Post" size="sm" icon={icons.chat} onPress={send} loading={saving} disabled={!trimmed && !saving} disabledReason="Write a message first." />
      </View>
    </View>
  );
}

/* ─── The thread ─────────────────────────────────────────────────────────── */

export function TaskDiscussion({ task, onPosted }) {
  const taskId = task?.id;
  const open = canCommentOnTask(task);

  const [rows, setRows] = useState([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState('');
  const [justUploaded, setJustUploaded] = useState([]);
  const token = useRef(0);

  const read = useCallback(
    (params) => tasksAPI.getMyTaskComments(taskId, { limit: TASK_LIMITS.COMMENTS_PER_PAGE, order: 'DESC', ...params }),
    [taskId],
  );

  const load = useCallback(async () => {
    if (!taskId) return;
    const mine = (token.current += 1);
    setLoading(true);
    setError('');
    try {
      const body = unwrap(await read({ page: 1 }));
      if (mine !== token.current) return;
      setRows(oldestFirst(commentsOf(body)));
      setHasEarlier(!!body.pagination?.has_next_page);
      setPage(1);
    } catch (err) {
      if (mine !== token.current) return;
      setError(taskErrorMessage(err, 'Couldn’t load the discussion.'));
    } finally {
      if (mine === token.current) setLoading(false);
    }
  }, [read, taskId]);

  useEffect(() => { load(); }, [load]);

  const loadEarlier = async () => {
    const next = page + 1;
    const mine = token.current;
    setLoadingEarlier(true);
    try {
      const body = unwrap(await read({ page: next }));
      if (mine !== token.current) return;
      setRows((cur) => [...oldestFirst(commentsOf(body)), ...cur]);
      setHasEarlier(!!body.pagination?.has_next_page);
      setPage(next);
    } catch (err) {
      if (mine !== token.current) return;
      setError(taskErrorMessage(err, 'Couldn’t load the earlier messages.'));
    } finally {
      if (mine === token.current) setLoadingEarlier(false);
    }
  };

  const post = async (payload, files) => {
    const posted = unwrap(await tasksAPI.postMyTaskComment(taskId, payload)).comment;
    if (files?.length) {
      setJustUploaded((cur) => [
        ...cur,
        ...files.filter((f) => f.id).map((f) => ({ id: f.id, file_name: f.file_name, file_size_bytes: f.file_size_bytes })),
      ]);
    }
    if (posted) setRows((cur) => [...cur, posted]);
    else load();
    // A comment that carried files changed the task's Files section.
    if (payload.attachment_ids?.length) onPosted?.();
  };

  const fileById = useMemo(() => {
    const map = new Map();
    (Array.isArray(task?.attachments) ? task.attachments : []).forEach((row) => { if (row?.id) map.set(row.id, row); });
    justUploaded.forEach((row) => map.set(row.id, row));
    return map;
  }, [task?.attachments, justUploaded]);

  return (
    <View style={{ gap: space[4] }}>
      {error ? <Text style={[text.small, { color: color.danger.fg }]}>{error}</Text> : null}

      {hasEarlier ? (
        <LinkButton title={loadingEarlier ? 'Loading…' : 'Show earlier messages'} align="left" onPress={loadEarlier} />
      ) : null}

      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2] }}>
          <ActivityIndicator size="small" color={color.brand} />
          <Text style={text.small}>Loading the discussion…</Text>
        </View>
      ) : rows.length === 0 ? (
        <Text style={[text.small, { color: color.textMuted }]}>
          Nothing said yet. Anything written here stays with the task, so whoever picks it up next can read it.
        </Text>
      ) : (
        <View style={{ gap: space[5] }}>
          {rows.map((row) => <CommentRow key={String(row.id)} comment={row} fileById={fileById} />)}
        </View>
      )}

      {open ? (
        <Composer taskId={taskId} onPost={post} />
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: color.borderSubtle }}>
          {icons.info ? <icons.info size={16} color={color.brand} /> : null}
          <Text style={[text.small, { flex: 1, color: color.textSecondary }]}>
            This task was called off, so nothing more can be added. Everything already said stays on the record.
          </Text>
        </View>
      )}
    </View>
  );
}

export default TaskDiscussion;
