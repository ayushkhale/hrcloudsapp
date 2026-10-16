
# Implementation plan — HR Clouds Employee app

How we get from an empty folder to a shipping Android app, with iOS waiting
behind a Mac you don't own yet.

Written against `NativeRef/` as read on 2026-10-15. `NativeRef` is the spec;
this file is the schedule, the decisions and the open questions. Where the two
disagree, NativeRef wins on *what* to build and this file wins on *what order
and where*.

---

## 1 · What you already have

This is the unusual part of this project, and it changes the plan: the hard
thinking is done. You are not starting from a blank page.

| Asset | Size | What it means |
|---|---|---|
| `50-starter/src/` | **~12,900 lines** of real code across 80 files | theme, api layer, 6 endpoint modules, 29 UI components, 7 hooks, the role gate, navigation, 4 error modules |
| `40-screens/` | 7 build sheets covering **24 screens** | data, layout, states, actions, ⓘ help, traps — per screen |
| `10-api/05-contract-traps.md` | **26 traps (T0–T25)** | every place the backend does something the spec doesn't say |
| `fieldHelp.employee.json` | **36 hints, 24 surfaces** | already extracted, with Ask Maya questions |
| `00-plan/06-definition-of-done.md` | ~70 checkboxes | the per-screen gate |

**The implication:** this is a *porting* project, not a design project. Almost
every question of the form "how should this work?" has an answer already
written down. The failure mode here is not running out of ideas — it is
building something subtly different from what is specified and only noticing in
Phase 8. So the working loop in §7 is deliberately spec-first.

**What is not written yet:** every screen in `features/`, the leave / claim /
declaration / bank validators, push, biometrics, crash reporting, deep-link
registration.

---

## 2 · Decisions locked in

### Repo location — inside `HR Clouds App`, with a mitigation

```
C:\Freelance Projects\HR Clouds App\
├── NativeRef\              reference. read-only. never imported
├── HRCloudsEmployee\       the app repo — git init HERE
└── IMPLEMENTATION-PLAN.md  this file
```

You chose this over a short path. That is fine, but the risk your own
`04-environment-setup.md` flags is real and specific: **Gradle, CMake and the
NDK have known failures on Windows paths containing spaces, and `node_modules`
pushes the total past 260 characters.** It will not fail gracefully — it fails
as an unreadable C++ toolchain error three minutes into a build.

So Phase 0 does two cheap things up front rather than debugging this later.

**1. Enable Win32 long paths** (one time, admin PowerShell, needs a reboot):

```powershell
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force
git config --system core.longpaths true
```

**2. Build through a directory junction.** A junction is a second, short,
space-free path to the *same files* — not a copy, nothing to sync:

```powershell
# run once, as admin, AFTER the project is created
cmd /c mklink /J C:\hrc-employee "C:\Freelance Projects\HR Clouds App\HRCloudsEmployee"
```

Edit at either path; they are the same bytes. Run **every Gradle / native build
from `C:\hrc-employee`**. If the toolchain never sees a space, it cannot trip
over one. If builds turn out fine from the real path, stop using the junction —
but have it ready before the first `run-android`, not after.

> `react-native-config` is the library most likely to break here: its Android
> Gradle script resolves the `.env` path at build time. If `Config.API_BASE_URL`
> comes back `undefined` on a build that otherwise succeeds, build from the
> junction before you suspect anything else.

### Dev backend — the hosted gateway

```
API_BASE_URL=https://development.hrclouds.in/api/v1
```

**Verified live on 2026-10-15.** It answered in 209 ms with exactly the envelope
`api/client.js` expects:

```json
{ "success": false, "message": "Authentication token is required",
  "errorCode": "AUTH_TOKEN_MISSING" }
```

`client.js:125` reads `data?.errorCode` — the contract matches, confirmed
against the live server rather than assumed.

Note that your **web** repo's `.env.development` currently points at
`http://192.168.29.131:4500/api/v1` instead. Keep that in mind for parity
testing: if you compare the app against the web app side by side (DoD §Parity)
while the web app is on your LAN box and the phone is on the hosted gateway,
**you are comparing two different databases** and will chase phantom
mismatches. Point both at the same base before any parity check.

The LAN option stays available if the hosted env lacks test data. It costs an
Android cleartext exception (`android:usesCleartextTraffic="true"`, **debug
manifest only**) and the phone being on your Wi-Fi.

### Platform — Android now, iOS-ready by discipline

No Mac today, a Mac later. That does **not** mean "write Android and port
later" — that is how you get a three-week iOS catch-up. It means Android is the
only thing we *build and test*, while every iOS-side artefact is written at the
moment it becomes relevant and simply goes unverified.

Four rules, enforced in review:

1. **Every native config change is made on both platforms in the same commit.**
   Add the Android manifest permission → write the `Info.plist` usage string and
   add the handler to the Podfile `setup_permissions([...])` list *then*. An
   unverified plist entry costs 30 seconds now and is archaeology in March.
2. **No `Platform.OS === 'android'` branch without its iOS arm written.** If you
   genuinely don't know the iOS behaviour, the `else` throws a loud dev-only
   warning naming the file — not a silent no-op that works by accident.
3. **An `IOS-TODO.md` at the app root**, appended to every time you touch
   anything native. That file *is* the iOS catch-up phase; when the Mac arrives
   it should read as a checklist, not a mystery.
4. **Nothing Android-only in `src/`.** Business logic, formatters, API layer and
   UI components stay platform-neutral. The starter kit already is — don't be
   the one to break it.

The dependency list in `04-environment-setup.md` is already cross-platform; no
library on it is Android-only. The design tokens lock `light` mode on both.

---

## 3 · Phase 0 — foundation

The one phase worth writing out as literal steps, because every later phase
assumes it worked.

### 0.1 Toolchain (verify before creating anything)

```bash
node -v                # 20 or 22 LTS. Not 23+
java -version          # must be 17.x — JDK 21 gives "Could not determine java version"
adb devices            # your physical phone, USB debugging on
```

`ANDROID_HOME` → `%LOCALAPPDATA%\Android\Sdk`, SDK Platform 35, Build Tools
35.0.0, NDK whatever RN pins. Restart the terminal after setting env vars.

### 0.2 Create and prove the bare app

```bash
cd "C:/Freelance Projects/HR Clouds App"
npx @react-native-community/cli@latest init HRCloudsEmployee
cd HRCloudsEmployee
npx react-native run-android      # MUST show the welcome screen
```

Then set up the junction (§2) and **re-run the build from `C:\hrc-employee`** to
confirm both paths work. Also raise the Gradle heap now rather than when it
hangs — `android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

> **Do not install a single dependency until the welcome screen renders.**
> Debugging a native build with 25 libraries in it is a different and much worse
> job.

### 0.3 Dependencies, group by group

Install groups A→F from `04-environment-setup.md` §3 and **build after each
group**. That is the entire trick to bare RN: a broken build always has exactly
one suspect.

The two that need manual work and silently half-succeed:

- **`react-native-reanimated`** → `'react-native-reanimated/plugin'` must be the
  **last** entry in the babel plugins array. And
  `import 'react-native-gesture-handler'` must be the **first** line of
  `index.js`.
- **`react-native-config`** → follow its README exactly, then verify with
  `console.log(Config.API_BASE_URL)` on a **release** build. In Metro it can
  appear to work while the release build has nothing.

Set `applicationId "in.hrclouds.employee"` and `minSdk 24` **now** — before any
signing key, Firebase project or store listing exists, because changing it later
means redoing all three.

**The `@/` alias is optional.** I checked: the starter kit's only `@/` reference
is inside a comment in `api/index.js:4`; all 55 real import sites are relative.
So `babel-plugin-module-resolver` is a convenience you can add whenever, not a
Phase 0 blocker. One less thing that can break the first build.

### 0.4 Paste the starter kit

```bash
cp -r "C:/Freelance Projects/HR Clouds App/NativeRef/50-starter/src/." ./src/
cp "C:/Freelance Projects/HR Clouds App/NativeRef/50-starter/.env.example" ./.env.development
# then set API_BASE_URL, GOOGLE_WEB_CLIENT_ID, DOCMIND_API_KEY
```

Nothing in `src/` imports a screen, so **it compiles on its own** — and
`navigation/screens.js` renders a named Placeholder for all 24 routes. The app
is navigable on day one with zero screens written. Wire `App.jsx` in the one
order that works:

```
GestureHandlerRootView → SafeAreaProvider → AuthProvider
  → ToastProvider → ConfirmProvider → NavigationContainer → RootNavigator
```

Fonts: Manrope 300–800 into `src/assets/fonts/`, then `npx react-native-asset`.
**The family name is the PostScript name** (`Manrope-Bold`, not `Manrope Bold`)
— get it wrong and text silently renders in the system font with no error.

### 0.5 The DebugScreen

Your build sequence calls this "the most valuable hour of the whole project" and
it is right. One button per API module, printing the raw response.

Run the starter kit's own verification (`50-starter/README.md` §Verify) through
it. **This one decides whether any pay screen can be trusted:**

```js
formatMoney(1234567)   // must be '₹12,34,567'  — Indian grouping
formatMoney(57559.4)   // must be '₹57,559.40'  — two decimals, always
formatDayCount(2.5)    // must be '2 Days and 1 Half Day'
```

If `formatMoney` is wrong, stop and fix it before building anything in Phase 5.

### Phase 0 exit gate

- [ ] Builds on a **physical** Android device from both the real path and the junction
- [ ] `Config.API_BASE_URL` prints the hosted gateway on a **release** build
- [ ] `DebugScreen` hits `/attendance/holidays` with a pasted token and prints JSON
- [ ] Hermes + New Architecture on (`global.HermesInternal`, `global.nativeFabricUIManager`)
- [ ] The three formatter assertions above pass
- [ ] Manrope renders — compared against the web app on screen
- [ ] Keychain round-trips a string; `@gorhom/bottom-sheet` opens and drags
- [ ] `IOS-TODO.md` exists and lists every plist / Podfile entry added so far

---

## 4 · Phases 1–9

Straight from `03-build-sequence.md`, which stays the authority. One screen at a
time, spec open, DoD open.

| Phase | What | Days | The thing that overruns |
|---|---|---|---|
| **1** | Auth + the role gate | 2–3 | Testing all four non-employee roles properly |
| **2** | Home + the punch card | 4–6 | Location edge cases. **Budget real time** |
| **3** | Time (5 strip tabs) | 4–5 | T5 — the ignored `status` filter |
| **4** | Leave | 4–5 | T8 — cancellation branches on date, not status |
| **5** | Pay | 6–8 | **The biggest.** Claims upload + Tax declarations |
| **6** | Documents | 4–5 | Deep links from a cold start |
| **7** | Org, profile, settings | 2–3 | Org chart on a phone — drill-down, not a canvas |
| **8** | Hardening | 4–6 | **Do not compress this one** |
| **9** | Release | 2–3 | Location privacy declaration |

**33–46 working days. 7–9 weeks, one developer.**

Phase 1 is where a non-code blocker can stop you dead — see §6.

Phases 2 and 5 are where I would expect this estimate to slip, for different
reasons. Phase 2 because location has an unbounded tail of device-specific
behaviour, and the acceptance list has eleven items, several of which need a
real phone, outdoors, in two permission states. Phase 5 because it is five
independently shippable screens wearing one phase number, and "every money
figure matches character for character" is a harsher gate than it reads.

### A numbering discrepancy to know about

The docs disagree with themselves by one, and it will confuse you at some point:

| Module | `03-build-sequence.md` | `40-screens/00-index.md` + `screens.js` |
|---|---|---|
| Auth | Phase 1 | Phase 2 |
| Home + punch | Phase 2 | Phase 3 |
| Pay | Phase 5 | Phase 6 |
| Org + profile | Phase 7 | Phase 8 |

`40-screens/00-index.md` itself says "Build order is
`00-plan/03-build-sequence.md`", so **build-sequence numbering is canonical** and
this file uses it. The comments in `screens.js` carry the other set. Worth a
five-minute fix to `screens.js` and the index table in Phase 0 so nobody loses
an afternoon to it — the order is identical either way, only the labels differ.

---

## 5 · What I'd do differently from a literal reading

Three small deviations, each with its reason. Everything else: follow the pack.

**1. Build the Settings screen in Phase 1, not Phase 7.** It is where Sign Out
lives, and you will be signing in and out dozens of times testing the role gate.
A throwaway button is fine, but you'll want the real screen early and it costs
almost nothing.

**2. Do the ⓘ field-help pass for a screen in the same sitting, truly.** House
rule §10 says this and the DoD gates on it, so this is less a deviation than a
warning: the 36 hints already exist, so "wiring them" is ten minutes per screen
when done alongside the build and a two-day archaeology project when deferred to
Phase 8. The rule exists because deferring it failed once already.

**3. Run the trap checklist at the *start* of each module, not the end.**
`10-api/05-contract-traps.md` ends with a pre-ship checklist. Reading the
relevant traps before writing the module is strictly cheaper — T2 (today returns
yesterday), T5 (ignored status filter), T8 (date-based cancellation) and T13 (the
punch always succeeded) each describe a bug you would otherwise write on purpose
and then have to unpick from working code.

---

## 6 · Open items that can block

Ordered by when they bite.

| # | Item | Blocks | Why it matters |
|---|---|---|---|
| 1 | **An employee test account on the hosted dev env** | **Phase 1, hard stop** | The role gate refuses every non-employee role by design. Without employee credentials on `development.hrclouds.in` you cannot get past the login screen — and you cannot build Phase 2 behind it |
| 2 | **One account per non-employee role** (`hr`, `admin`, `super-admin`, `manager`) | Phase 1 gate | The acceptance list says test all four. You cannot verify a fail-closed gate with no accounts to fail |
| 3 | **A multi-org account** | Phase 1 | `SelectOrgScreen` and the selection-token path are otherwise dead code you ship untested |
| 4 | **`GOOGLE_WEB_CLIENT_ID` for the Android app** | Phase 1 (SSO only) | The web client id in the web repo is for the *web* origin. Android SSO needs its own OAuth client keyed to the package name + signing SHA-1. Degrades gracefully: no id → SSO button hidden, which `config/env.js` already handles |
| 5 | **Is the hosted dev env's data the same as your LAN box's?** | Any parity check | §2. Comparing two databases produces mismatches that aren't bugs |
| 6 | **A real Android phone, plus ideally a low-end one** | Phase 0 and every gate | Simulators lie about location, and the cold-start budget is 2.5 s *on a low-end device* |
| 7 | **Firebase project** (push, Phase 6) | Phase 6 | Needs the final `applicationId`, which is why §3 sets it in Phase 0 |
| 8 | **A Mac** | iOS | Known and accepted. §2 rule 3 keeps the cost bounded |

Item 1 is the one to sort out today. Everything in Phase 0 can proceed without
it; nothing in Phase 1 can.

### One housekeeping note

`NativeRef/` now exists in **two** places — here and in
`C:\Freelance Projects\HR Clouds\NativeRef\` (the web repo). They will drift, and
then it won't be clear which one is true. Pick this copy as canonical and delete
the other, or leave the web one and reference it — but don't maintain both. The
pack was generated from web `dev` @ `3284f4a`; re-derive any section whose web
counterpart has since changed.

---

## 7 · How we'll work, screen by screen

The loop, once Phase 0 is green. It is the same seven steps every time, and it is
spec-first on purpose (§1).

1. **Read the spec** — one screen group in `40-screens/`, all eight headings, §8
   Traps included. Then the relevant traps in `10-api/05-contract-traps.md`.
2. **Open the web ancestor** (§2 of the spec) and read its `─────` header
   comment. It says why the screen is strange. Read it before "fixing" anything.
3. **Build it** — components from `20-design/02-component-catalog.md`, never raw
   Views. Domain labels into a `*Meta.js`, not inline in JSX.
4. **Wire its ⓘ help** in the same sitting (§5 above), from the entries in
   `fieldHelp.employee.json`.
5. **Uncomment its line in `navigation/screens.js`.** That is the whole go-live
   step.
6. **Walk the DoD** — every state rendered, including the ones you have to force
   with a thrown error and an empty array.
7. **Hand it off with the one-line ⓘ report**: surface id, hint count, Ask Maya
   count — or "no field qualifies" and why. House rule §10: a hand-off without it
   is unfinished.

Between phases, run the per-phase gate in `06-definition-of-done.md`: release
build, cold start, 30 minutes hands-on with no crash.

---

## 8 · Where I'd start, concretely

Three things, in this order:

1. **Chase the employee test account** (§6 item 1). It has a lead time you don't
   control and it blocks Phase 1 completely.
2. **Phase 0.1–0.2** — toolchain, `init`, welcome screen, junction, re-prove the
   build. Stop there. Don't install anything.
3. **Phase 0.3–0.5** — dependencies group by group, starter kit, DebugScreen, the
   three formatter assertions.
