// ─────────────────────────────────────────────────────────────────────────────
// .eslintrc.js
//
// The RN default, plus the rules that MECHANICALLY ENFORCE the house rules in
// NativeRef/00-plan/05-house-rules.md. Each one exists because something was
// built wrong once, and a linter catches it cheaper than a code review does.
//
// Add to this list whenever you find yourself repeating a review comment.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // House rule §6: apostrophes in UI text are ’ (U+2019), not '.
    'react/no-unescaped-entities': 'error',

    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Modal'],
            // House rule §3: every popup showing DATA is a RecordSheet. A
            // hand-rolled Modal drifts from the house layout immediately.
            message:
              'Use ui/RecordSheet (data) or ui/FormSheet (forms) — never a raw Modal for data.',
          },
        ],
        patterns: [
          {
            group: ['**/api/client', '**/api/client.js'],
            // House rule §7: all calls go through api/<domain>.api.js, so the
            // 401 bus, the abort timeout and the error shape are never bypassed.
            message:
              'Screens call api/<domain>.api.js, never client.js directly.',
          },
        ],
      },
    ],
  },

  overrides: [
    {
      // THE SANCTIONED IMPLEMENTATIONS. The rules above exist to stop a SCREEN
      // hand-rolling these things; the primitives themselves have to be built
      // out of something.
      //
      //   ui/*          RecordSheet, FormSheet, ReasonPrompt, AttachmentViewer,
      //                 FieldHelp, Select and TimeField are the house popups —
      //                 they are what a screen is told to use instead of Modal.
      //   api/*         the domain modules are the only legitimate callers of
      //                 client.js. That is the whole point of the barrel.
      //   state/session.js  owns the token and the 401 bus, so it sits BELOW
      //                 the api modules and talks to the client directly.
      //
      // If you are tempted to add a file here, ask whether it should instead be
      // using the primitive — that question is the rule doing its job.
      files: ['src/ui/*.jsx', 'src/ui/*.js', 'src/api/*.js', 'src/state/session.js'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
