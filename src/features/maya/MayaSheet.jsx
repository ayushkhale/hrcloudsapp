// ─────────────────────────────────────────────────────────────────────────────
// features/maya/MayaSheet.jsx — the Maya chat, as a full-height panel.
//
// Ported from the web's ChatbotWidget, re-shaped for a phone: a slide-up Modal
// with a message list and a pinned composer, not a corner popover. A chat has a
// keyboard open most of the time, so it is a Modal with its own keyboard lift
// (ui/KeyboardAware.jsx — a KeyboardAvoidingView here did nothing on Android
// once edgeToEdgeEnabled=true stopped the window resizing), never a
// draggable bottom sheet (RecordSheet's header explains why a keyboard and a
// drag gesture fight).
//
// MAYA NEVER AUTO-SENDS (CLAUDE.md §10). A question handed in from an ⓘ "Ask
// Maya" link, the floating button or the drawer only PRE-FILLS the box; the
// person reads it and presses Send. A pre-filled question silently rides with
// "give an example" until the box is emptied — then it's their own question
// (web's rule, mayaInstructions.js).
//
// The language Maya answers in comes from the person's Maya preference
// (mayaPrefs); it is added to the request only, never shown in the bubble.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Text, View,
// A chat is neither a data record (RecordSheet) nor a form (FormSheet) — it is a
// full-height conversation with a pinned composer and a keyboard open most of
// the time, so it uses a raw Modal like FormSheet itself does.
// eslint-disable-next-line no-restricted-imports
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, gutter, radius, space, text } from '../../theme/tokens';
import { icons } from '../../theme/icons';
import { IconButton, TextField } from '../../ui';
import { useKeyboardLift } from '../../ui/KeyboardAware';
import { useMayaChat } from './useMayaChat';
import { MayaMarkdown } from './MayaMarkdown';
import { mayaInstructions } from './mayaInstructions';
import { useMayaPrefs } from './mayaPrefs';
import { ToastLayer } from '../../ui/Toast';

function TypingDots() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color.brandChipFg, opacity: 0.4 + i * 0.2 }} />
      ))}
    </View>
  );
}

function Bubble({ message }) {
  const mine = message.role === 'user';
  if (mine) {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: color.brand, borderRadius: radius.lg, borderBottomRightRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] }}>
        <Text style={[text.body, { color: color.textOnBrand }]}>{message.content}</Text>
      </View>
    );
  }
  const empty = !message.content;
  return (
    <View style={{ flexDirection: 'row', gap: space[2], maxWidth: '92%' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        {icons.maya ? <icons.maya size={15} color={color.brandChipFg} /> : null}
      </View>
      <View style={{ flex: 1, backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderSubtle, borderRadius: radius.lg, borderBottomLeftRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] }}>
        {empty && message.streaming ? (
          <TypingDots />
        ) : (
          <MayaMarkdown style={message.error ? { color: color.danger.fg } : null}>{message.content}</MayaMarkdown>
        )}
        {message.stopped ? <Text style={[text.caption, { color: color.textMuted, marginTop: 4 }]}>Stopped</Text> : null}
      </View>
    </View>
  );
}

export function MayaSheet({ visible, onClose, prefill }) {
  const insets = useSafeAreaInsets();
  // The composer sits on the bottom edge, so it is the thing the keyboard hides.
  const { lift, safeBottom } = useKeyboardLift();
  const { prefs } = useMayaPrefs();
  const { config, messages, isStreaming, send, stop, reset } = useMayaChat();
  const [input, setInput] = useState('');
  const [fromHint, setFromHint] = useState(false);
  const scroller = useRef(null);

  // A handed-in question pre-fills the box (and counts as "from a hint" until
  // the person empties it). Applied whenever the panel opens with one.
  useEffect(() => {
    if (visible && prefill) { setInput(prefill); setFromHint(true); }
  }, [visible, prefill]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, visible]);

  const onChange = (v) => {
    setInput(v);
    if (!v.trim()) setFromHint(false);
  };

  const onSend = () => {
    const q = input.trim();
    if (!q || isStreaming) return;
    send(q, mayaInstructions({ fromHint, lang: prefs.lang }));
    setInput('');
    setFromHint(false);
  };

  const suggestions = useMemo(() => (messages.length === 0 ? config.suggestions || [] : []), [messages.length, config.suggestions]);
  const Send = icons.send;
  const Stop = icons.stop;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, paddingTop: Platform.OS === 'ios' ? space[3] : insets.top + space[2], paddingBottom: space[3], backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.borderSubtle }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
            {icons.maya ? <icons.maya size={20} color={color.brandChipFg} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={text.h3}>Maya</Text>
            <Text style={text.caption}>Your HR assistant</Text>
          </View>
          {messages.length > 0 ? <IconButton icon={icons.refresh} accessibilityLabel="Start a new chat" onPress={reset} /> : null}
          <IconButton icon={icons.close} accessibilityLabel="Close Maya" onPress={onClose} />
        </View>

        {/* ── Messages ── */}
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: gutter, gap: space[3] }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {messages.length === 0 ? (
            <View style={{ gap: space[3], paddingTop: space[2] }}>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
                  {icons.maya ? <icons.maya size={15} color={color.brandChipFg} /> : null}
                </View>
                <View style={{ flex: 1, backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderSubtle, borderRadius: radius.lg, borderBottomLeftRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] }}>
                  <Text style={text.body}>{config.welcome}</Text>
                </View>
              </View>
              {suggestions.length ? (
                <View style={{ gap: space[2] }}>
                  <Text style={[text.label, { color: color.textMuted }]}>Try asking</Text>
                  {suggestions.map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => { setInput(q); setFromHint(false); }}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: color.borderSubtle, backgroundColor: pressed ? color.brandSoftBg : color.surface })}
                    >
                      <Text style={[text.small, { flex: 1, color: color.textBody }]}>{q}</Text>
                      {icons.chevronRight ? <icons.chevronRight size={16} color={color.textMuted} /> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} />)
          )}
        </ScrollView>

        {/* ── Composer ── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: gutter, paddingTop: space[2], paddingBottom: space[2] + safeBottom, marginBottom: lift, backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.borderSubtle }}>
          <View style={{ flex: 1 }}>
            <TextField
              value={input}
              onChangeText={onChange}
              placeholder={config.placeholder}
              multiline
              maxLength={config.maxQueryLength}
            />
          </View>
          {isStreaming ? (
            <Pressable onPress={stop} accessibilityRole="button" accessibilityLabel="Stop Maya" style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: color.surfaceSubtle, alignItems: 'center', justifyContent: 'center' }}>
              {Stop ? <Stop size={20} color={color.textSecondary} /> : <ActivityIndicator size="small" color={color.brand} />}
            </Pressable>
          ) : (
            <Pressable
              onPress={onSend}
              disabled={!input.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send to Maya"
              style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: input.trim() ? color.brand : color.brandSoftBg, alignItems: 'center', justifyContent: 'center' }}
            >
              {Send ? <Send size={20} color={input.trim() ? color.textOnBrand : color.brandSoftFg} /> : null}
            </Pressable>
          )}
        </View>
      </View>
      {/* Toasts draw ABOVE this window while it is the top one (ui/Toast.jsx). */}
      <ToastLayer />
    </Modal>
  );
}

export default MayaSheet;
