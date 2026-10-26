/**
 * @format
 *
 * ── THE FIRST IMPORT IS LOAD-BEARING ─────────────────────────────────────────
 *
 * 'react-native-gesture-handler' must be imported before anything else in the
 * app, React Native itself included. It patches the native event system on
 * startup; if a navigator or a bottom sheet initialises first, gestures work in
 * development and then fail in a release build on Android — swipes go dead and
 * nothing is logged. See NativeRef/00-plan/04-environment-setup.md § Group A.
 *
 * App lives at src/App.jsx, not ./App.jsx: everything the app is made of sits
 * under src/ and the project root holds only configuration. The RN template's
 * root App.tsx was removed deliberately, not forgotten.
 */

import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { registerNotifeeBackgroundHandler, registerPushBackgroundHandler } from './src/features/notifications/push';

// FCM background/quit handler, registered BEFORE React mounts (Firebase's rule).
// A no-op until the native Firebase module is built in — see push.js.
registerPushBackgroundHandler();
// Notifee background handler for local notifications (location transparency / location fetched)
registerNotifeeBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
