# iOS catch-up

There is no Mac on this project yet, so **nothing in this file has been built
or run** — it has only been written. Android is the only platform verified.

This file is the iOS phase. Every entry was added in the same commit as the
Android change that needed it, so when a Mac arrives this should read as a
checklist rather than an investigation. **Keep it that way:** touch anything
native, add a line here.

---

## First run on a Mac, in order

```bash
sudo gem install cocoapods      # 1.15+
cd ios && pod install && cd ..
npm run ios
```

Expect to fix signing (a team must be selected in Xcode) and nothing else, if
the list below is honest.

---

## Already written, never compiled

| # | What | Where | Risk if wrong |
|---|---|---|---|
| 1 | Bundle id `com.hrclouds` | `ios/HRCloudsEmployee.xcodeproj/project.pbxproj` (2 configs) | Must match the Apple Developer App ID and any Firebase iOS app |
| 2 | Display name `HR Clouds` | `Info.plist` → `CFBundleDisplayName` | Cosmetic |
| 3 | Location usage string | `Info.plist` → `NSLocationWhenInUseUsageDescription` | **Apple reads this.** It says why, in the employee's words. Changing it needs the wording rules in `NativeRef/60-ops/02-permissions-and-native.md` |
| 4 | Dark mode locked off | `Info.plist` → `UIUserInterfaceStyle = Light` | Without it, a light-only token set renders half-themed on a dark-mode phone |
| 5 | Status bar not VC-based | `Info.plist` → `UIViewControllerBasedStatusBarAppearance = false` | RN's StatusBar component is ignored otherwise |
| 6 | Permission handlers | `ios/Podfile` → `setup_permissions([...])` | **The sharp one.** iOS compiles in only the handlers listed. A permission missing from that list fails at runtime with "handler not found" instead of prompting. Currently: `LocationWhenInUse`, `Camera`, `PhotoLibrary`, `Notifications`, `FaceID` |

## Not started

- [ ] **`react-native-config`** — the iOS half is a build-phase script, separate
      from the Gradle wiring already done. Follow its README, then verify
      `ENV.API_BASE_URL` on a **release** build, not in Metro. A half-done
      setup yields `undefined` for every key with no error.
- [ ] **Manrope fonts** — `npx react-native-asset` should add them to
      `Info.plist` → `UIAppFonts`. Confirm it did, and confirm the family name
      is the PostScript name (`Manrope-Bold`, not `Manrope Bold`) or text
      silently falls back to the system font.
- [ ] **`react-native-bootsplash`** — iOS storyboard generation is a separate
      command from the Android side.
- [ ] **Google SSO** — needs its own iOS OAuth client id
      (`GOOGLE_IOS_CLIENT_ID`) plus a `CFBundleURLSchemes` entry. Blank keeps
      the button hidden, which is the correct degradation.
- [ ] **Push** (phase 6) — APNs key, capability, `Notifications` handler is
      already in the Podfile.
- [ ] **Associated Domains** (phase 6) — the `company-documents/:id` deep link.
- [ ] **Biometrics** (phase 8) — `NSFaceIDUsageDescription` is **not yet in
      `Info.plist`**; add it with the app-lock work. `FaceID` is already in the
      Podfile handler list.
- [ ] **Attendance device key** (2026-10-21) — Android has `HRDeviceKey`
      (`android/…/devicekey/DeviceKeyModule.kt`): a non-exportable P-256 key,
      SPKI export, SHA256withECDSA behind BiometricPrompt. iOS needs the same
      five methods (`isSupported · hasKey · createKey · deleteKey · sign`) over
      the Secure Enclave (`kSecAttrTokenIDSecureEnclave`, `.biometryCurrentSet`,
      `SecKeyCreateSignature(.ecdsaSignatureMessageX962SHA256)` — DER, use as
      is). Until then `deviceKey.js` reports the phone unsupported and the
      register button is absent. Needs `NSFaceIDUsageDescription` too.
- [ ] A small iPhone (SE) and a notched iPhone in the phase gate, per
      `NativeRef/00-plan/06-definition-of-done.md`.

---

## The rules that keep this list short

From the implementation plan § Platform:

1. Every native config change lands on **both** platforms in the same commit.
2. No `Platform.OS === 'android'` branch without its iOS arm written. If the
   iOS behaviour is genuinely unknown, the `else` throws a loud dev-only
   warning naming the file — never a silent no-op.
3. Append to this file every time you touch anything native.
4. Nothing Android-only in `src/`. Logic, API layer and UI stay
   platform-neutral; the starter kit already is.
