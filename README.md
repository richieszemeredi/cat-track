# CatTrack 🐾

CatTrack is a playful little PWA for two humans and one very important kitten. Log every meal,
watch the weight curve grow (at the right pace!), and see how today's calories stack up against a
vet-style daily target — all synced live between both phones, and it keeps working offline at the
food bowl. Built for exactly one household, one cat, and a lot of love.

> **Vet disclaimer:** all calorie targets and RER/MER numbers in CatTrack are **estimates only —
> always confirm with your vet.**

## Tech stack

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript (strictest config)
- [TanStack Router](https://tanstack.com/router) (file-based routes) + [TanStack Query](https://tanstack.com/query)
- [Firebase](https://firebase.google.com): Firestore (offline-persistent) + Google Auth + Hosting
- [Tailwind CSS v4](https://tailwindcss.com) with custom warm/playful design tokens
- [Zod](https://zod.dev) validation at every Firestore read boundary
- Vitest (unit + component), `@firebase/rules-unit-testing` (security rules), Playwright (e2e on
  Safari iPhone 14 Pro + Chrome, layout pass also on iPhone 12 Mini and desktop), all against the
  Firebase emulators
- PWA via `vite-plugin-pwa` — installable on iPhone home screens

## Prerequisites

- **Node 24** (CI runs on it too)
- **A Java JDK** (17+, CI uses Temurin 21) — required by the Firestore emulator for
  `npm run test:rules`, `npm run test:e2e`, and local emulator dev
- npm (comes with Node); `firebase-tools` is a devDependency, so `npx firebase ...` just works

## Setup

```sh
npm install
cp .env.example .env.local
```

Fill `.env.local` from the Firebase console: **Project settings → General → Your apps → SDK setup
and configuration**. These values are public identifiers, not secrets, but `.env.local` stays
untracked so each checkout points at its own project.

## Commands

Local dev runs against the Firebase emulators — two terminals:

```sh
# terminal 1: Auth + Firestore emulators (UI at http://localhost:4000)
npx firebase emulators:start --project demo-cattrack

# terminal 2: the app, pointed at the emulators
VITE_USE_EMULATORS=true npm run dev
```

Running `npm run dev` against your **live** Firebase project also works (that's what
`.env.local` is for) — in a browser tab Google sign-in opens a **popup** (allow popups for
localhost); the redirect flow is only used inside the installed iPhone app. Make sure
`localhost` is in **Authentication → Settings → Authorized domains** (it is by default).

| Command                               | What it does                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                         | Dev server against your real Firebase project (`.env.local`)                                     |
| `VITE_USE_EMULATORS=true npm run dev` | Dev server against the local emulators (see two-terminal recipe above)                           |
| `npm run test`                        | Unit + component tests (Vitest, with coverage)                                                   |
| `npm run test:rules`                  | Firestore security rules tests — wraps `firebase emulators:exec`, needs the JDK                  |
| `npm run test:e2e`                    | Playwright e2e on iPhone/Chrome viewports — wraps `firebase emulators:exec`, needs the JDK       |
| `npm run lint`                        | ESLint (strict type-checked config)                                                              |
| `npm run typecheck`                   | TypeScript, no emit                                                                              |
| `npm run build`                       | Typecheck + production build to `dist/`                                                          |
| `npx firebase deploy`                 | Deploy rules, indexes and hosting — after `npx firebase login` + `npx firebase use <project-id>` |

## First deploy checklist

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com).
2. Add a **Web app** and copy its config into `.env.local` (see Setup).
3. **Authentication → Sign-in method**: enable the **Google** provider. Then under
   **Authentication → Settings → Authorized domains**, add your `<project-id>.web.app` domain.
   > **Important for iPhones:** in `.env.local`, set `VITE_FIREBASE_AUTH_DOMAIN` to your
   > **hosting** domain (`<project-id>.web.app`), _not_ the default
   > `<project-id>.firebaseapp.com`. On the installed PWA sign-in uses a redirect flow,
   > and iOS Safari's storage partitioning silently breaks it when the auth helper lives
   > on a different site than the app. Firebase Hosting serves the `/__/auth/*` helpers
   > on your own domain automatically, so same-domain redirects keep working.
4. **Register the custom auth domain with Google's OAuth client** — skipping this causes
   `Error 400: redirect_uri_mismatch` on every Google sign-in:
   1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
      (same project), and edit the OAuth 2.0 client named **"Web client (auto created by
      Google Service)"**.
   2. Under **Authorized redirect URIs**, add `https://<project-id>.web.app/__/auth/handler`
      (keep the existing `firebaseapp.com` one). The trailing `/__/auth/handler` is required.
   3. Under **Authorized JavaScript origins**, add `https://<project-id>.web.app`.
   4. Save — Google can take a few minutes to pick the change up.
5. **Firestore Database**: create a database in **production mode** (the committed
   `firestore.rules` are the real access control).
6. Sign in and point the CLI at your project:
   ```sh
   npx firebase login
   npx firebase use <project-id>
   ```
7. Build and ship everything:
   ```sh
   npm run build
   npx firebase deploy --only firestore:rules,firestore:indexes,hosting
   ```

## Install on your iPhones 📱

Open the deployed URL in **Safari → Share button → Add to Home Screen**. CatTrack runs as a
standalone app with offline support — feedings logged in a dead spot sync when you're back online.

## Household setup (the two of you)

1. **Owner signs in first** with Google and walks through onboarding: create the household, then
   set up the cat's profile.
2. **Partner signs in once** with Google — this creates their account but no access yet.
3. Owner grabs the partner's **UID** from the Firebase console (**Authentication** tab, Users
   list) and adds them to the household as an **editor**. Now both phones see and log everything,
   live.

Roles: `owner`/`editor` can log and edit; `viewer` gets a read-only window into the kitten's life.

## CI & deploys

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every PR: lint,
typecheck, unit/component tests with coverage, Firestore rules tests, Playwright e2e (emulators +
JDK on the runner), a production build, and `npm audit --audit-level=high` — all gating. Playwright
reports and coverage are uploaded as artifacts.

After a green quality job:

- **push to `main`** → deploys to the **live** Hosting channel
- **pull request** → deploys a **preview channel** (30-day expiry), URL commented on the PR

The deploy jobs **fail until you configure the repo** (this is expected on a fresh clone):

- **Secret** — `FIREBASE_SERVICE_ACCOUNT_CATTRACK_8AA49`, created and uploaded for you by
  `npx firebase init hosting:github`. The odd name is the CLI's own convention
  (`FIREBASE_SERVICE_ACCOUNT_<PROJECT_ID>`); `ci.yml` reads it under that name so the key the CLI
  minted stays the only one in existence. If the service-account step 404s, it is usually
  propagation — run the command again.
- **Variables** — `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — the
  same public web-app config as `.env.local`, so CI builds embed a working Firebase config.

`firebase init hosting:github` also writes `firebase-hosting-merge.yml` and
`firebase-hosting-pull-request.yml`. **Delete them.** They trigger on the same events as the jobs
above but skip every quality gate and build without the `VITE_FIREBASE_*` variables, so they would
ship an untested bundle with no Firebase config in it — and win the race, since they run without
`needs: quality`.

Dependabot keeps npm dependencies (weekly, minor+patch grouped) and GitHub Actions up to date.

## Roadmap

- **M1** — Health schedule: vaccinations, deworming and vet visits with due dates
- **M2** — Extra logs: water, litter and symptom tracking alongside food
- **M3** — Photos & export: kitten photo timeline and CSV/JSON data export
- **M4** — Push reminders: "dinner time!" nudges on both phones

## Known gaps (accepted for the MVP)

- **Form drafts don't survive an iOS cold start** — a half-typed entry is lost if iOS evicts
  the backgrounded PWA. Forms are 2–4 fields, so re-typing is cheap; a draft-persistence hook
  is the natural follow-up.
- **Membership lookup uses a members collection-group query** — the security rule scopes it to
  your own docs, but any future collection literally named `members` would inherit that rule;
  rename or re-scope if one ever appears.
- **Install tips target iPhone Safari** — iPadOS detection (it masquerades as macOS) and
  non-Safari iOS browsers aren't special-cased.
- **No error-reporting service** — errors log to the console only; Sentry/GlitchTip slot into
  `react-error-boundary`'s `onError` when wanted.

---

Made with 🧡 for one very hungry kitten. Estimates only — always confirm with your vet.
