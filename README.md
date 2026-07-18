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
- Vitest (unit + component), `@firebase/rules-unit-testing` (security rules), Playwright (e2e on an
  iPhone viewport), all against the Firebase emulators
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

| Command                               | What it does                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                         | Dev server against your real Firebase project (`.env.local`)                                     |
| `VITE_USE_EMULATORS=true npm run dev` | Dev server against the local emulators (see two-terminal recipe above)                           |
| `npm run test`                        | Unit + component tests (Vitest, with coverage)                                                   |
| `npm run test:rules`                  | Firestore security rules tests — wraps `firebase emulators:exec`, needs the JDK                  |
| `npm run test:e2e`                    | Playwright e2e on an iPhone 13 viewport — wraps `firebase emulators:exec`, needs the JDK         |
| `npm run lint`                        | ESLint (strict type-checked config)                                                              |
| `npm run typecheck`                   | TypeScript, no emit                                                                              |
| `npm run build`                       | Typecheck + production build to `dist/`                                                          |
| `npx firebase deploy`                 | Deploy rules, indexes and hosting — after `npx firebase login` + `npx firebase use <project-id>` |

## First deploy checklist

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com).
2. Add a **Web app** and copy its config into `.env.local` (see Setup).
3. **Authentication → Sign-in method**: enable the **Google** provider. Then under
   **Authentication → Settings → Authorized domains**, add your `<project-id>.web.app` domain.
4. **Firestore Database**: create a database in **production mode** (the committed
   `firestore.rules` are the real access control).
5. Sign in and point the CLI at your project:
   ```sh
   npx firebase login
   npx firebase use <project-id>
   ```
6. Build and ship everything:
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

- **Secrets** — `FIREBASE_SERVICE_ACCOUNT`: easiest via `npx firebase init hosting:github`, which
  creates the service account and uploads the secret for you; or create a service account manually
  (Firebase Hosting Admin + API roles) and paste its JSON key. And `FIREBASE_PROJECT_ID`: your
  Firebase project id.
- **Variables** — `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — the
  same public web-app config as `.env.local`, so CI builds embed a working Firebase config.

Dependabot keeps npm dependencies (weekly, minor+patch grouped) and GitHub Actions up to date.

## Roadmap

- **M1** — Health schedule: vaccinations, deworming and vet visits with due dates
- **M2** — Extra logs: water, litter and symptom tracking alongside food
- **M3** — Photos & export: kitten photo timeline and CSV/JSON data export
- **M4** — Push reminders: "dinner time!" nudges on both phones

---

Made with 🧡 for one very hungry kitten. Estimates only — always confirm with your vet.
