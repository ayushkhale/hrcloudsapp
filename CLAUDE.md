# CLAUDE.md

HR Clouds **Employee App** — React Native client for the same backend as HR Clouds
Web. One workspace today (`employee`); the manager app is planned and the code is
already shaped for it.

House rules below are decisions already made, most after something was built wrong
once. Don't relitigate them. **The web app's `C:\Freelance Projects\HR Clouds\CLAUDE.md`
still applies wherever this file is silent** — §2 role parity, §4 never show an ID,
§6 wording, §9 the ref docs, §11 form validation are shared law, not web law.

React Native 0.87 · React 19 · plain JS/JSX (no TypeScript) · React Navigation ·
Reanimated 4 + Gesture Handler 3 · `react-native-heroicons` **only** · no Redux,
no React Query, no styled-components, no UI kit.

```bash
npm run lint          # eslint . — only ERRORS matter, inline-style warnings are endemic
npm run android       # device/emulator
npm run start:clean   # Metro, cache reset
```

**Before finishing, lint and bundle.** The bundle is the real compile check — lint
does not catch a bad import path:

```bash
npx eslint src --quiet
npx react-native bundle --platform android --dev true --entry-file index.js \
  --bundle-output "$TMPDIR/verify.jsbundle" --assets-dest "$TMPDIR/verify-assets"
```

---

## 1. This is an APP, not a web page in a phone

**The single most common mistake in this repo is shipping the web screen.** A ported
screen keeps the web's *data and rules* and throws away its *layout*.

- **Less text, more doing.** A label plus a number beats a sentence. Cut the
  explanatory paragraph; if a thing needs explaining, it needs an ⓘ (§7), not a
  column of prose. Three short words on a card beat a full sentence that wraps.
- **Thumbs, not cursors.** Every tap target ≥ 44pt. Primary actions in the lower
  half of the screen. Nothing important in a top corner.
- **Cards and sheets, not tables.** A web `<table>` becomes a list of cards — the
  row's two or three figures in a meta strip, the rest in the sheet. Never a
  horizontally-scrolling grid of columns.
- **One screen, sections.** Where the web sidebar has a dropdown of seven routes,
  this app has one screen with a section strip — seven stack screens means seven
  headers and seven back presses for things people compare against each other.
  See `features/attendance/screens/TimeScreen.jsx`.
- **The section strip is ONE scrolling row of icons** (user, 2026-10-21: "they
  look so awful one packed into another — one line horizontal, one row,
  scrollable"). This replaced the four-per-row grid; don't put the grid back.
  Each item is a round tinted chip, a word, and an underline when selected —
  no box around it. Items are sized so the fifth is cut in half at a 360pt
  edge, because a half-drawn item is what tells people the row scrolls.
  `CategoryStrip` in `ui/ListCards.jsx`.
- **A section's one create action floats at the bottom** — `FloatingAction`
  (Apply for leave, Request a correction), not a full-width button at the top
  of the list (user, 2026-10-21). The list under it pads by `FLOATING_CLEARANCE`. Ask Maya is the
  sparkle beside the bell in `AppTopBar` — there is no floating Maya button.
- **Every list re-reads on pull AND on return.** `hooks/useListRefresh.js` gives
  the `refreshControl` and quietly reloads when the screen regains focus (a
  modal form closed over it). A new section list uses it from day one.
- **No hover, no tooltip, no right-click.** If the web screen depended on one, the
  information moves into the card or the sheet.

### A SECTION IS A LABEL, NOT A BOX — never nest a box in a box

The second most common mistake, and the one that makes a sheet feel like a form
from 2009. A 360pt screen has **one** level of enclosure to spend.

> "why you apply and reason is again under a box , whyy , there are so much
> things like this — we dont have that much space in app, its not web"
> — user, 2026-10-18

**One alternation, ever: white panel → grey block → white rows.** Then stop.

| Wrong | Right |
|---|---|
| A bordered `SheetSection` holding a bordered `SheetText` | `SheetSection` draws a purple icon + a label; the value is plain `text.body` under it |
| A card inside a card inside a sheet | The inner card loses its border and becomes a labelled group |
| `marginTop: space[4]` on each section *and* `gap: space[4]` on the parent | The parent's `gap` is the only spacing |

`SheetSection` **draws no box by default** — it is an icon, a title and a
chevron. `boxed` exists for the one genuine grey block per sheet; if you reach
for it twice in a file, the second one is wrong. Same for density: a tile that
says "1d" does not need 90pt of height, and a stat card that counts the cards
below it is `phokat` — delete it.

### Make it look like an app, not an admin panel

> "show in a way it feels attractive and visually appealing… design for mobile,
> take functionality from web but design like a pro app developer and ui expert,
> only kaam ki chize no phokat ki chize… you could have used purple icons here,
> currently the app feels so bland — Zepto also have purple theme, study how its
> app feels so good" — user, 2026-10-18

The palette has always been purple; the *application* of it was grey. The rules
that came out of that pass:

- **Every icon chip is tinted, never slate.** Use `color.brandChipBg` /
  `brandChipFg`, or a tone's `chip` shade — **not** its `bg`. `bg` is the 50
  shade: correct behind 10px badge text, invisible behind a 20px glyph.
- **No hairline around a tint.** A border on a coloured chip reads as a box
  (see above) and mutes the colour. Fill or border, not both.
- **Fills are purple, and few.** The primary button, the selected section chip
  and the selected filter chip are all solid `brand` purple (2026-10-21 — the
  primary button and filter used to be near-black "ink"; the user asked for
  purple). Beyond those, a screen gets no other solid purple block.
- **Colour the figure that matters.** A row of identical slate numbers has no
  shape. The headline figure takes the tone's `fg`.
- **A screen with no colour in it is a bug**, not a neutral default. If a screen
  renders and nothing on it is purple, something was skipped.

## 2. Never a blank screen — skeletons everywhere

**Every surface that fetches renders a skeleton shaped like its content.** Not a
spinner, not `null`, not a white screen, not a centred "Loading…". Design the
loading, empty and error states as part of the build; they are the same task and
the same commit as the happy path.

| Surface | Use |
|---|---|
| A whole screen | `<Skeleton type="…" />` — `ui/Skeleton.jsx`, variants `rows · card · tiles · dashboard · sheet · chart` |
| A list of cards inside My Time | `<CardsSkeleton rows={5} height={76} />` — `features/attendance/components/TimeCards.jsx` |
| One block of a known size | `<SkeletonBlock height={110} radius={radius.lg} />` |

Pick the variant that matches what is coming: a `chart` placeholder where a chart
loads, `sheet` inside a sheet, `tiles` above a list. A `rows` skeleton in front of
a chart is a lie about the layout and causes a jump when the real thing arrives.

`CardsSkeleton` exists because `ui/Skeleton`'s variants each add their own gutter,
and a card list already supplies one — the two together inset the placeholders 32pt
on a 360pt phone, visibly narrower than the cards that replace them. **Inside a
`cardListStyle` list, use `CardsSkeleton`.** Everywhere else, `Skeleton`.

**Only the first load gets a skeleton.** A refresh of data already on screen keeps
the old content and shows the pull-to-refresh spinner — swapping loaded content for
grey blocks on every poll is a flicker, not a loading state. The condition is
`loading && !data`, never `loading`.

## 3. Where an error goes — one place per kind

**Never a native `Alert.alert`, never a raw red screen, never a toast of a raw API
code.** Every failure maps through `lib/errors/index.js` first:

```js
errorMessage(err, 'attendance', 'We couldn’t load your days.')
```

Domains: `attendance · leave · payroll · documents · organization · auth`. Then it
lands in exactly one of four places, by what the person can do about it:

| The failure is… | Goes to | Why |
|---|---|---|
| A **write** that failed — save, submit, approve, cancel | **Toast** (`showToast(msg, 'error')`) | They are looking at the thing they pressed. A sheet over it hides the form they must fix. |
| **Session / auth / logout / trusted device** — anything that ends or blocks the session | **Toast**, always | User instruction, 2026-10-17: *"for any kind of error logout issue, no matter what, use the toast we have created."* It must reach them wherever they are, including mid-navigation. |
| A **read** that failed — the screen or section has no data | **`<ErrorState>`** in place, with `onRetry` | The failure *is* the content. A toast over an empty screen leaves nothing behind when it fades. |
| An error with **detail worth reading** — a rejection reason, a validation breakdown, a server explanation of several lines | **Bottom sheet** (`RecordSheet`) | User instruction, 2026-10-17. A toast is 2 seconds and one line; anything longer needs somewhere to sit while it is read. |

A field-level problem is none of these: it is a red box beside the field
(`FieldError`, `invalid` on the control) — see web §11, which applies here in full.
**The button stays live; the press does the checking.**

`showToast(message, kind)` is imperative and importable from anywhere, including
non-component code like `state/AuthContext.jsx`: `import { showToast } from '../ui/Toast'`
(the module, not the barrel, to avoid a cycle). Kinds: `success · error · info`.

## 4. Popups: the house set, never a hand-rolled modal

**Every popup in this app is one of these five.** There is no generic `Modal` in
`ui/` and that is deliberate — see the catalog's "deliberately absent" list.

| Need | Use | Not |
|---|---|---|
| Show a record | `RecordSheet` + `SheetStats`/`SheetSection`/`SheetGrid`/`SheetTable`/`SheetText`/`SheetFooterNote` | A card that expands |
| A form | `FormSheet` + `FormSection`, or a `presentation: 'modal'` route for a long one | A sheet you must scroll to reach the button |
| Confirm a destructive action | `useConfirm()` — the **custom global alert** | `Alert.alert`, ever |
| Ask for a reason | `ReasonPrompt` | A confirm with a text box bolted on |
| Choose from a list | `Select` / `OptionSheet` / `PersonSelect` | A native picker |

`useConfirm()` is the app's global alert and the answer to "use the custom alert we
have". It is a promise: `if (!(await confirm({ … }))) return;`. `ConfirmProvider`'s
header records why it stopped calling `Alert.alert`.

**A sheet covers at most 75% of the screen.** The remaining quarter is the backdrop
you tap to dismiss — a sheet that reaches the status bar has no way out but the X,
and people reach for the gap first.

**A record being read is local state, never a route.** Routing a sheet unmounts the
list behind it, and the master–detail illusion is the entire point.

### The Android shadow trap

**Android cannot round two corners and cast a shadow at the same time.**
`ViewOutlineProvider` understands one radius for all four corners, so a view with
mixed radii silently falls back to a *rectangular* outline and paints a square
shadow just outside its rounded corners. That is the "extra unrounded corner".

Use `elevateSheet()` from `theme/tokens.js` — iOS shadow, nothing on Android, where
the dimmed backdrop already separates the sheet. **Never `elevate()` on anything
with `borderTopLeftRadius`-style partial rounding.** The same trap bites a pressed
card that changes elevation; if a press reveals a grey rectangle behind a rounded
card, this is why.

## 5. Tokens, icons, words

- **Design tokens only, from `theme/tokens.js`.** No component holds a hex. Names
  that exist: `radius {sm md lg xl full}` (**no `pill`**), `iconSize {info sm md lg xl}`
  (**no `xs`**), `space {0 1 2 3 4 5 6 8 10 12 16}`, `text {display h1 h2 h3 body
  bodyStrong small smallStrong label caption badge metric metricLg mono}`, `card`
  (a flat style object — **no `.base`**), `color`, `elevate(size)`, `elevateSheet()`,
  `toneOf(key)`.
- **Purple, grey, white — and the lavender surfaces.** That is the whole
  palette (user, 2026-10-21: "too many colors on app, only keep purple, white,
  grey like hrclouds web"). `palette` has no violet, fuchsia or indigo any more —
  removed, so nothing can reach for them. `color.ink` is slate-900 heading TEXT,
  never a fill. Tone keys keep the historic web names (`emerald`, `amber`,
  `blue`, `rose`, `indigo`, `slate`, `purple`) and render as purple steps;
  `toneOf(key)` gives `{bg, fg, border, dot}`. rose/red stays for errors,
  destructive actions and "absent", nothing else (asked, same day).
- **One deliberate exception: the ✚ Quick Actions sheet** (`navigation/ActionSheet.jsx`)
  keeps its multi-colour bordered cards. A purple-only pass was reverted on
  2026-10-18 at the user's request ("it was looking so good"). Change its
  behaviour freely; leave its look alone. Re-confirmed 2026-10-21 during the
  purple-only pass.
- **Icons only via `theme/icons.js`**, by semantic name — `icons.earnedLeave`, never
  `GiftIcon`. Add a name there with a comment rather than importing Heroicons in a
  screen. **The same destination wears the same icon everywhere** — the drawer row
  and the section tile that open one thing use one icon.
- **Never render a dash.** Unknown → "N/A" or "Not set"; unmeasured duration →
  "0m"; no action → nothing. A `—` is a bug.
- **Words come from `config/dictionary.js`** where a term has one source:
  `TERMS.COMP_OFF` is "Earned Leave" and the UI never says "comp-off". Web §6's
  whole glossary applies.
- Use `’` (U+2019) in JSX text.

## 6. Data and navigation

- **All calls through `api/*.api.js`.** No `fetch` in a component.
- **Gate the UI on what the server returned, not on the spec.** A 404 or a disabled
  feature **drops the section**; it never opens onto a page explaining the feature
  is unavailable. A network failure is *not* a 404 and must not make features
  vanish — a flaky minute is the section's own error state. `useTimeSections` in
  `TimeScreen.jsx` is the reference.
- **A capability the API lacks is ABSENT, not broken.** No button that 403s, no
  form that cannot submit.
- **Never hardcode a route in a shared component.** Destinations come from
  `navigation/routes.js` — `useRouteTarget(key)` returns `null` to mean *hide the
  link*, and `useGo()` navigates. A destination may carry its own params as a third
  element (which section of My Time to open); the caller's params win.
- **A screen that a menu row deep-links into must honour the param and then clear
  it.** `navigation.setParams({ section: undefined })` after applying — otherwise
  the param is sticky and the screen snaps back to it every time the tab regains
  focus.
- **The tab set is data** (`navigation/tabs.employee.js`). Five tabs maximum; a
  sixth means the grouping is wrong. `title` there is the native header title AND
  the screen's `<h1>` AND the tab label, and those three must be the same words.
- Guard stale responses with a `cancelled` flag. No request per row.
- **Anything rendered OUTSIDE the tab navigator navigates through
  `navigationRef`, never `useNavigation()`.** The ✚ sheet, the drawer
  overlay and toasts are mounted beside `<Tab.Navigator>` in AppTabs, so
  `useNavigation()` there is the ROOT stack — which has no `TimeTab` — and
  every press failed with "The action 'NAVIGATE' … was not handled by any
  navigator". `navigationRef` dispatches to the focused navigator and bubbles
  up. A form opened in another tab passes `initial: false`, so the tab's root
  is under it when it closes. `runQuickAction` in
  `features/settings/quickActions.js` is the reference.
- **The ✚ button always holds SIX quick actions** — the original six by
  default. In Settings › Quick actions a person can only REPLACE a slot (picking
  one already elsewhere swaps them): no add, no remove, no reorder (user,
  2026-10-18). Saved per user on the phone. A new action is ONE entry in
  `QUICK_ACTION_CATALOG` in `features/settings/quickActions.js`.

## 7. ⓘ help

`ui/FieldHelp.jsx` + `fieldHelp/`. Web §10 applies, with one amendment: **the 4
-per-screen cap is 2 on a phone.** Screen real estate is a quarter of the web's and
an ⓘ beside every label is visual noise at 360pt. Ordinary fields (name, date,
amount, reason) never get one. Everyday attendance data — present/absent/late
counts, hours, the day inspector — never gets one, same as the web.

## 8. Code style

Match the file you're editing. Non-trivial files open with a `─────` header comment
saying **what the screen is for and why it is built this way**, including contract
traps and anything the API does that contradicts the spec. Keep this up — it is the
main defence against a later change undoing a deliberate choice, and several of the
rules above exist only because a header comment recorded the first mistake.

Comments explain **why**, not what. Functional components and hooks only.
`export default` the component plus a named export; helpers move to a sibling
`*Fields.js` / `*Meta.js` module.

Platform notes for this checkout: Windows host, **no Python**, Git Bash heredocs are
unreliable for large JSX — use the Write tool for new files, `perl -0pi -e` for small
mechanical edits (beware `${…}` interpolation), and `head`/`tail` splicing for large
block replacements.

**Several files are CRLF.** A perl or regex edit whose pattern spans a line end
matches nothing and reports success — that, not the pattern, is why multi-line
perl edits here kept silently no-oping. For anything multi-line, write a small
node script to the scratchpad that normalises `\r\n` to `\n`, does exact
`includes()`-checked replacements (throwing on a miss), and writes the file back
with its original line endings. Shell quoting of JSX inside `node -e` breaks
easily too; put the script in a file.

## 9. Reference docs

`NativeRef/` is this app's spec: `00-plan`, `10-api` (payload shapes — the contract
source of truth), `20-design` (`02-component-catalog.md` lists what is deliberately
absent), `30-domain`, `40-screens`, `50-starter`, `60-ops`, `70-reference`.

**The spec is occasionally wrong, and the live API beats it.** When they disagree,
trust the API, fix the code, and record the deviation in the file's header comment
so the next person doesn't "correct" it back. Known deviations already recorded:
`/attendance/graph-data` reports every day without a record as `absent`, including
the person's weekly offs; `/attendance/regularizations` validates `status` and then
ignores it; `PATCH /organizations/me` takes a partial diff, not the whole profile.

---

## 10. The web app is the other half of this codebase

**Said twice by the user, so it is a rule and not a preference.** Before writing
a formatter, a status map, a metadata table or a term, look in
`C:\Freelance Projects\HR Clouds\src\shared\`. If it is there, **port it** —
same name, same behaviour, same header comment — and never re-derive it.

> "we have wording doc in hrclouds web which is used to show same name
> throughout the system, unlike two names like regularization and corrections.
> similarly we have more files in hrclouds, like hrs mintutes to days wala, so
> kindly use them also" — user, 2026-10-18

### The two sources of truth

| For | Read |
|---|---|
| **Words** — what a thing is called on screen | `NativeRef/30-domain/01-wording.md`, and `src/config/dictionary.js` for terms with one source |
| **Shared logic** — formatters, metadata, error maps | `HR Clouds\src\shared\utils\` and `\config\` — the port map is **wording doc §14** |

`NativeRef/30-domain/01-wording.md` **§14 is the inventory**: what is already
ported, what is still only on the web and which feature needs it. Read it before
building a screen; update it when you port something.

### What this actually costs when ignored

`formatDayCount` is the worked example. The web changed `"2 Days and 1 Half
Day"` → `"2d and 1/2 d"` on 2026-10-13; this copy did not follow; for five days
the same leave balance read two different ways in the two products. The fix was
three lines. Finding it took a user complaint.

### The rule

1. `grep` the web's `src/shared/` before writing a helper.
2. If it exists, port it. Keep the name and the signature **identical**, even
   the arguments that have become no-ops — a diverging signature is the next
   drift.
3. Native-only additions (`spokenDayCount`, `parseYMDLocal`) are *extra*, not
   divergence. The shared behaviour underneath stays the same.
4. Change one side → change both in the same sitting, and say so in both
   header comments.
5. Two names for one thing — "regularization" *and* "corrections", "comp-off"
   *and* "earned leave" — is always a bug. `TERMS` exists so the term is typed
   once.
