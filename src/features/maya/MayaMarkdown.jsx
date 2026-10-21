// ─────────────────────────────────────────────────────────────────────────────
// features/maya/MayaMarkdown.jsx — a tiny Markdown renderer for Maya's replies.
//
// The web renders Maya's answers with react-markdown. This app has no markdown
// dependency (react-native-heroicons is the only UI package we add — CLAUDE.md),
// and a chat answer only ever uses a small slice of Markdown: paragraphs,
// headings, bullet and numbered lists, bold, inline code and links. So this
// renders exactly that slice and nothing else — no raw HTML, no tables — which
// is enough for an HR answer and avoids a native dependency for one screen.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Linking, Text, View } from 'react-native';
import { color, font, radius, space, text } from '../../theme/tokens';

/** Split one line into bold / code / link / plain spans. */
function inline(line, keyBase) {
  const nodes = [];
  // One regex, three shapes: **bold**, `code`, [label](url).
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(<Text key={`${keyBase}-t${i}`}>{line.slice(last, m.index)}</Text>);
    if (m[1]) {
      nodes.push(<Text key={`${keyBase}-b${i}`} style={{ fontFamily: font.bold, color: color.textPrimary }}>{m[2]}</Text>);
    } else if (m[3]) {
      nodes.push(
        <Text key={`${keyBase}-c${i}`} style={{ fontFamily: font.medium, color: color.brandSoftFg, backgroundColor: color.brandSoftBg }}>
          {` ${m[4]} `}
        </Text>,
      );
    } else if (m[5]) {
      const url = m[7];
      nodes.push(
        <Text key={`${keyBase}-l${i}`} style={{ color: color.brand, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(url).catch(() => {})}>
          {m[6]}
        </Text>,
      );
    }
    last = re.lastIndex;
    i += 1;
  }
  if (last < line.length) nodes.push(<Text key={`${keyBase}-e`}>{line.slice(last)}</Text>);
  return nodes;
}

export function MayaMarkdown({ children, style }) {
  const src = String(children || '');
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let list = null; // { ordered, items: [] }

  const flushList = () => {
    if (!list) return;
    const l = list;
    blocks.push(
      <View key={`l${blocks.length}`} style={{ gap: 3, marginVertical: 3 }}>
        {l.items.map((item, idx) => (
          <View key={idx} style={{ flexDirection: 'row', gap: space[2] }}>
            <Text style={[text.body, style, { color: color.textMuted }]}>{l.ordered ? `${idx + 1}.` : '•'}</Text>
            <Text style={[text.body, style, { flex: 1 }]}>{inline(item, `l${blocks.length}-${idx}`)}</Text>
          </View>
        ))}
      </View>,
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);

    if (bullet) {
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
      return;
    }
    if (numbered) {
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[1]);
      return;
    }
    flushList();
    if (!line.trim()) return;
    if (heading) {
      blocks.push(
        <Text key={`h${idx}`} style={[text.bodyStrong, style, { marginTop: blocks.length ? space[2] : 0 }]}>
          {inline(heading[2], `h${idx}`)}
        </Text>,
      );
      return;
    }
    blocks.push(
      <Text key={`p${idx}`} style={[text.body, style, { marginTop: blocks.length ? 4 : 0 }]}>
        {inline(line, `p${idx}`)}
      </Text>,
    );
  });
  flushList();

  return <View>{blocks}</View>;
}

export default MayaMarkdown;
