# The launch window's assets — and why the logo here is NOT shown

`react-native-bootsplash` generated this folder, and
`npx react-native-bootsplash generate` would regenerate it. **Running that
regenerator puts the static logo splash back, and the app would show two
splashes again.**

There is ONE splash in this app and it is the Lottie animation
(`src/features/splash/LottieSplash.jsx`, `src/assets/hr_clouds_splash.json`).
The native launch window still exists — Android 12+ always draws one, and with
no theme of our own it draws the launcher icon — but it shows **nothing but the
background colour**, which is `theme/tokens.js` `color.bg` (#F7F5FC), the same
canvas the animation draws on. So the handover from the OS window to the
animation has no logo in it and no flash.

What makes it blank, per platform:

| Platform | Where |
|---|---|
| Android | `android/app/src/main/res/drawable/bootsplash_blank.xml` (a transparent icon) wired into `BootTheme` in `res/values/styles.xml` |
| iOS | `ios/HRCloudsEmployee/BootSplash.storyboard` — the logo `imageView` carries `hidden="YES"` |

If you regenerate, re-apply both of those. `logo.png` and the `drawable-*/`
copies are kept only so the regenerator has something to work from.
