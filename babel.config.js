// ─────────────────────────────────────────────────────────────────────────────
// babel.config.js
//
// TWO THINGS HERE WILL COST YOU AN AFTERNOON IF THEY MOVE:
//
// 1. THE WORKLETS PLUGIN MUST BE LAST. It rewrites functions marked 'worklet'
//    so they can run on the UI thread. Any plugin listed after it sees
//    already-rewritten code and the animation silently stops running on the
//    native thread — no error, just jank.
//
//    NativeRef/00-plan/04-environment-setup.md says to use
//    'react-native-reanimated/plugin'. On Reanimated 4 that path is a two-line
//    shim re-exporting 'react-native-worklets/plugin' (Reanimated 4 split the
//    worklet machinery into its own package). Both work today; we name the real
//    one so a future major dropping the shim cannot break the build.
//
// 2. THE module-resolver ALIAS IS MIRRORED IN jsconfig.json. Change one and you
//    must change the other, or the editor and the bundler disagree about what
//    '@/api' means — which shows up as code that runs fine but is underlined in
//    red, or autocomplete for a module the bundler cannot resolve.
//
// The starter kit in NativeRef/50-starter/ uses RELATIVE imports throughout
// (its single '@/' reference is inside a comment), so the alias is a
// convenience for the code we write from here on, not something the kit needs.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['module-resolver', { root: ['./src'], alias: { '@': './src' } }],
    'react-native-worklets/plugin', // MUST stay last — see note 1
  ],
};
