// ─────────────────────────────────────────────────────────────────────────────
// features/maya/mayaInstructions.js — the lines added SILENTLY to what is sent
// to Maya. PORTED from the web's mayaInstructions.js (CLAUDE.md §10).
//
// They ride on the request only: the chat bubble and the history keep exactly
// what the person wrote, so a later turn never repeats an instruction back.
//
// • A question that came from an ⓘ "Ask Maya" link asks for an example — the
//   hint already gave the definition; an example is what makes it land.
// • The chosen language asks for the answer in it, however it was typed. English
//   adds nothing.
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_LINE = 'Give an example of it.';

export const VOICE_LANGS = [
  { value: 'en-IN', label: 'English' },
  { value: 'hi-IN', label: 'हिंदी' },
  { value: 'hinglish', label: 'Hinglish' },
];

const ANSWER_LINE = {
  'en-IN': '',
  'hi-IN': 'Answer in Hindi, in Devanagari script.',
  hinglish: 'Answer in Hinglish: Hindi written in Roman letters, keeping English HR words in English.',
};

export const languageLabel = (lang) => VOICE_LANGS.find((l) => l.value === lang)?.label || 'English';

/** The longest instruction block that can be added, plus its separator. */
export const INSTRUCTION_RESERVE =
  2 + EXAMPLE_LINE.length + 1 + Math.max(...Object.values(ANSWER_LINE).map((l) => l.length));

/**
 * The hidden lines for one question, or '' when there are none.
 * @param {{ fromHint?: boolean, lang?: string }} options
 */
export function mayaInstructions({ fromHint = false, lang = 'en-IN' } = {}) {
  return [fromHint ? EXAMPLE_LINE : '', ANSWER_LINE[lang] || ''].filter(Boolean).join(' ');
}
