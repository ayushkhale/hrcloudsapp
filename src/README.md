# `src/` — where everything lives

One rule decides where a new file goes, and it is not "which role uses it".
Read § Roles before adding a folder.

```
src/
├── App.jsx            the providers, in the one order that works
│
├── api/               EVERY network call. One file per domain + client.js
├── lib/               PURE LOGIC. No React, no RN (one documented exception)
├── theme/             colour · type · space · radius · motion · icons
├── ui/                CROSS-SCREEN primitives. Nothing domain-specific
├── hooks/             data-fetch and lifecycle hooks
├── state/             AuthContext · session.js (the role gate)
├── navigation/        RootNavigator · AppTabs · tabs.<workspace>.js · screens.js
├── config/            env.js — the only reader of react-native-config
├── fieldHelp/         the 36 ⓘ hints + getFieldHelp()
├── assets/fonts/      Manrope, bundled (never fetched at runtime)
│
└── features/          ONE FOLDER PER MODULE. Screens live with their parts
    ├── auth/          Login · Otp · ForgotPassword · SelectOrg
    ├── home/          Home · PunchCard · TodaySummary · RecentDays
    ├── attendance/    Time · DayLog · Corrections · Overtime · Flags · EarnedLeave
    ├── leave/         Leave · ApplyLeave · Holidays
    ├── pay/           PayHome · Salary · Bank · Payslips · Claims · Loans · Tax
    ├── documents/     DocumentsHome · MyDocuments · Company · Requests · Forms
    ├── org/           Company · OrgChart · Directory
    ├── profile/       Profile · Settings
    └── more/          More (the fifth tab's menu)
```

Each `features/<module>/` holds `screens/`, `components/`, and a
`<module>Meta.js` for labels, enum maps, state machines and error copy —
**never inline in JSX**.

---

## Where does a new file go?

| It is… | It goes in |
|---|---|
| a network call | `api/<domain>.api.js` |
| pure logic with no React | `lib/` |
| used by two or more features | `ui/` |
| used by one feature | that `features/<module>/` |
| a label, enum map, state machine, error copy | `features/<module>/<module>Meta.js` |
| a colour, size, radius, duration | `theme/` — **nowhere else** |

**One module → `features/<module>/`. Two or more → `ui/`,** taking a prop
rather than branching on the route.

---

## Roles — why there is no `roles/` folder

The web app splits by role: `src/roles/{employee,hr,manager,guest}/` beside a
large `src/shared/`. **This app deliberately does not**, and the reason matters
enough to write down, because copying the web layout here would reintroduce the
exact bug the house rules exist to prevent.

On web, that split separates four workspaces served from one bundle. Here, the
split would be a **fork**, and house rule §2 forbids forking a screen per role:

> `viewer` picks the endpoints. **It must never change the layout.**

Nearly every screen in this app is *self-service*. A manager also has their own
salary, their own attendance, their own leave — so a `roles/employee/pay/`
would need a near-identical `roles/manager/pay/` the moment the manager app
lands, and the two would drift. That is how the web app once let HR walk the
employee tabs.

So role variation is expressed in **four places, none of them a folder**:

1. **The gate** — `state/session.js`. Exact role match, fails closed. A
   non-employee token never reaches a tab.
2. **The tab set is data** — `navigation/tabs.employee.js`. The manager app
   adds `tabs.manager.js` *beside* it; `AppTabs` reads whichever the session's
   workspace names. Adding a role adds a file and changes no screen.
3. **A `viewer` prop** on every shared screen, defaulting to `'employee'`.
   It selects endpoints, never layout.
4. **Plane adapters** in `<module>Meta.js` — a lookup table keyed by role with
   `null` for "this role cannot do this", so the UI *hides* the control:

   ```js
   export const DOCUMENT_PLANES = {
     employee: { list: documentsAPI.getMyDocuments, teamList: null },
     manager:  { list: documentsAPI.getMyDocuments, teamList: documentsAPI.getTeamDocuments },
   };
   ```

   Never `if (role === 'manager')` inside a component.

`api/` and `lib/` stay **role-free**: no module there ever asks who is calling.

> If you do want physical role folders, the change is cheap *now* and expensive
> once screens exist — say so before Phase 1 starts. The reasoning above is
> from NativeRef/00-plan/02-architecture.md § "Designing for the manager app
> that doesn't exist yet" and house rules §1–2.

---

## The import alias

`@/` maps to `src/`, via `babel.config.js` **and** `jsconfig.json` — change one
and you must change the other. The pasted starter kit uses relative imports
throughout; the alias is for the code written from here on.

```js
import { attendanceAPI } from '@/api';
import { color, space } from '@/theme/tokens';
```

---

## Adding a screen

`navigation/screens.js` maps a route name to a component and renders a named
**Placeholder** for anything not built yet — which is why the app runs with
zero screens written. Building one is:

1. Create `features/<module>/screens/<Name>Screen.jsx`
2. Uncomment its line in `navigation/screens.js`

That is the whole go-live step. Its build spec is in `NativeRef/40-screens/`,
and it is not done until `NativeRef/00-plan/06-definition-of-done.md` is
walked — including the ⓘ field-help pass, in the same sitting.
