// ─────────────────────────────────────────────────────────────────────────────
// features/documents/components/FormsTab.jsx — My Documents › Forms.
// The web's "Blank Forms" (shared/screens/FormsLibraryPage.jsx).
//
// The blank company forms anyone can download and fill in. The only list in
// the module that is the same for everybody — a form holds nobody's
// information — and the only version ever listed is the live one (the server
// never sends replaced or retired versions).
//
// The whole card is the button, as on the web: there is nothing else to do
// with a blank form. A tap fetches a fresh download link and hands the file to
// the phone's viewer; a form that is a LINK to a page elsewhere opens in the
// browser and says so on the card.
//
// Search is debounced (350ms, the web's figure) and server-side (`q`).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { documentsAPI } from '../../../api';
import { icons } from '../../../theme/icons';
import { color, text } from '../../../theme/tokens';
import { EmptyState, ErrorState, TextField } from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { contentTypeLabel, formatBytes, isReferenceTemplate, listPayload } from '../docMeta';
import { openDocument } from '../openDoc';

export function FormsTab() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getPublishedTemplates({ q: query || undefined, limit: 50 });
      setState({ rows: listPayload(res).rows, loading: false, error: null });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const download = async (row) => {
    if (busy) return;
    setBusy(row.id);
    await openDocument(() => documentsAPI.getPublishedTemplateDownloadUrl(row.id), {
      title: row.title, contentType: row.content_type, reference: isReferenceTemplate(row),
    });
    setBusy('');
  };

  const rows = state.rows;
  const Search = icons.search;

  return (
    <ScrollView contentContainerStyle={cardListStyle} keyboardShouldPersistTaps="handled">
      <TextField
        kind="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Search forms"
        left={Search ? <Search size={18} color={color.textMuted} /> : null}
      />

      {state.error && rows.length === 0 ? (
        <ErrorState error={state.error} domain="documents" onRetry={load} fallback="We couldn’t load the forms." />
      ) : state.loading && rows.length === 0 ? (
        <CardsSkeleton rows={4} height={72} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={icons.attachment}
          title={query ? 'No form matches that' : 'No forms published'}
          message={query ? 'Try a different word.' : 'Your HR team hasn’t published any blank forms yet.'}
        />
      ) : (
        rows.map((row) => {
          const reference = isReferenceTemplate(row);
          return (
            <RecordCard
              key={row.id}
              icon={reference ? icons.external : icons.downloadDoc}
              tone="purple"
              title={row.title || 'Form'}
              subtitle={[
                row.document_type?.name,
                reference ? 'Opens a page elsewhere' : contentTypeLabel(row.content_type),
                reference ? null : formatBytes(row.size_bytes),
              ].filter((p) => p && p !== 'N/A').join(' · ')}
              value={busy === row.id ? 'Opening…' : null}
              onPress={() => download(row)}
              accessibilityLabel={`${row.title}. ${reference ? 'Open the page.' : 'Download the form.'}`}
            />
          );
        })
      )}

      {rows.length > 0 ? (
        <Text style={text.caption}>
          Fill a form in and send it back the way it says — usually by uploading it under Personal, or handing it to HR.
        </Text>
      ) : null}
    </ScrollView>
  );
}

export default FormsTab;
