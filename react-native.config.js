/**
 * Asset linking.
 *
 * The design tokens name Manrope by its PostScript name (`Manrope-SemiBold`
 * and friends) — see theme/tokens.js. iOS resolves a fontFamily by that
 * PostScript name and Android by the FILENAME, so the two only agree because
 * the files here are named exactly as their PostScript names. Renaming one
 * breaks a platform silently: a missing family raises no error, it just
 * renders in Roboto/San Francisco.
 *
 * Re-run `npx react-native-asset` after adding a weight.
 */
module.exports = {
  project: {
    ios: { automaticPodsInstallation: true },
    android: {},
  },
  assets: ['./src/assets/fonts'],
};
