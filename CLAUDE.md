# CatTrack

Shared PWA for a two-person household tracking a kitten's food (calories) and weight.
Installed via Safari Add-to-Home-Screen on two iPhones; no App Store. Free Firebase
Spark tier only — **no feature may require the Blaze plan** (no Cloud Storage, no
Cloud Functions, no SSR hosting).

## Commands

- `npm run dev` — Vite dev server (real Firebase via `.env.local`)
- `VITE_USE_EMULATORS=true npm run dev` + `npx firebase emulators:start --project demo-cattrack` — full local stack
- `npm run lint` / `npm run typecheck` / `npm run format` — gates (also run by husky pre-commit via lint-staged)
- `npm run test` — Vitest unit + component (jsdom, no emulator needed)
- `npm run test:rules` — Firestore security-rules tests (wraps emulators:exec; needs a JDK)
- `npm run test:e2e` — Playwright iPhone-viewport flows (wraps emulators:exec; builds with `build:emu`)
- `npm run test:visual` — layout pass only, on both phones; writes `test-results/screenshots/*.png`
- `npm run build` — `tsc -b --noEmit` + `vite build` (PWA assets into `dist/`)

## Architecture (read these before touching data flow)

- `src/lib/firebase.ts` — app/auth/db singletons. `VITE_USE_EMULATORS=true` switches to the
  `demo-cattrack` emulator project (any non-empty config values work there).
- `src/lib/schemas.ts` — Zod schemas; every Firestore **read** goes through `safeParse`
  (malformed docs are logged + skipped, never white-screen). Firestore `Timestamp`s become
  `Date`s at this boundary. Security rules (`firestore.rules`) are the write-integrity boundary.
- `src/lib/db.ts` — the ONLY place Firestore is queried/written. Pattern per collection:
  `xQueryOptions(...)` (one-shot fetch, TanStack Query) + `useXLive(...)` (onSnapshot →
  `setQueryData` on the same key). All functions take `householdId` explicitly (plan §6:
  multi-tenant from day one; the future public/multiuser jump must stay a UI-only change).
- `awaitOrQueued(write)` — Firestore write promises only resolve on server ack, which never
  comes while offline. Forms must treat both `'confirmed'` and `'queued'` as success.
- `src/routes/__root.tsx` — gate chain: auth loading → SignInScreen → membership lookup
  (collection-group query on `members`) → CreateHouseholdScreen → HouseholdProvider + shell.
- `src/lib/household.tsx` — `useHousehold()`: `householdId`, `role`, `canEdit`, `cats`,
  `activeCat` (MVP is single-cat = first created). Viewers (`role: 'viewer'`) must not see
  mutating UI.
- `src/lib/catmath.ts` — pure, unit-tested RER/MER/growth-band math. Sanity anchor:
  5 kg neutered adult → RER ≈ 234, MER ≈ 281 kcal/day. Any UI showing derived calories
  needs the "Estimates only — always confirm with your vet." disclaimer.
- `catmath.ts` also derives energy from a label that declares none, which is the norm on
  the Hungarian market — tins give analytical constituents and a gram-per-day table
  instead. `kcalPer100gFromAnalysis` applies the modified Atwater factors FEDIAF
  prescribes (3.5 protein / 8.5 fat / 3.5 carbohydrate-by-subtraction, carbohydrate
  clamped at 0 because labels round up). Sanity anchor: Premiere Meat Menu Kitten
  (11 / 5.5 / 2.2 / 0.2 / 78) → 96 kcal/100 g, which the same tin's own 210–245 g/day
  independently corroborates at 3 × RER for a 1–1.7 kg kitten. Crude ash and crude fibre
  are frequently absent from a label, so `TYPICAL_ASH_PCT` / `TYPICAL_FIBRE_PCT` fill in
  per food type — and an assumed value must never trip a "your figures are wrong" error,
  only a hint that the food Type is probably off.
- Data model: `households/{hid}/members/{uid}` (roles owner|editor|viewer, source of truth
  for access) and `households/{hid}/cats/{catId}/{weights|foods|feedings}` — append-only log
  docs so two phones never clobber each other. `/invites` is reserved for the public launch.
  A food's `analysis` map (the five label percentages, nullable) is the one nested map in
  the model: it is non-null only while `kcalPerGram` is the calculator's own output, so
  hand-editing the kcal field clears it and a stored analysis always explains the stored
  kcal. Rules validate it with `hasAll` as well as `hasOnly` — a half-filled map would let
  the figure be re-derived from constituents it never saw.
- Retiring a field: drop it from the Zod schema (z.object strips unknown keys, so old docs
  keep parsing), from the `*Input` type in `db.ts`, and from the rules' `hasOnly` list —
  that last step is what stops it coming back. Retired so far: `bodyConditionScore`
  (weights), `packageSizeG` (foods), `mealType` (feedings, replaced by an editable time).
- Adding a field is the mirror image: give it `.default(...)` in the Zod schema, never a
  bare `.nullable()`. Documents written before the field existed have no such key at all,
  and a required-but-absent key fails `safeParse` — which silently drops every old doc.
  In the rules, read it as `request.resource.data.get('field', null)`: reading a key that
  isn't there denies the write outright, so a plain `.field` reference would lock every
  pre-existing doc out of being updated.
- Decimal input: iOS offers a comma on the decimal keypad and `<input type="number">`
  discards the value, so every decimal field is `{...DECIMAL_INPUT_PROPS}` (text +
  inputMode) parsed with `parseDecimal` from `src/lib/numbers.ts`. Never `type="number"`.

## Visual testing (do this every session that touches UI)

The app is opened in Safari on two iPhones — **14 Pro (393pt)** and **12 mini (375pt)** —
and in Chrome on a desktop. All four are Playwright projects: the `iPhone` devices are
WebKit, `Pixel 7` / `Desktop Chrome` are Chromium. The 14 Pro and chrome-phone run the
whole suite; the other two run the layout pass only.

Run `npm run test:visual` and **look at the PNGs** it writes to
`test-results/screenshots/` — the assertions catch geometry, your eyes catch the rest
(wrapped axis labels, orphaned pills, a page that ends on a stray word).

`tests/e2e/layout.spec.ts` asserts, on every screen:

- nothing crosses either viewport edge, and the page never scrolls sideways;
- no control escapes the card it lives in (`.surface`);
- no button, link or `summary` is under 36px in either direction;
- one text column — every `.gutter` element starts exactly one card-padding inside
  the cards.

Add an assertion there whenever a layout bug is found on a real phone. Two that already
paid for themselves: the weigh-in form's stacked-rows check pins a two-column grid that
shipped a date picker squeezed to 187pt, and the escapes-a-card check exists because a
time input punched out through the right edge of its card while still sitting well
inside the screen.

**Playwright's WebKit is not iOS Safari.** It sizes `input[type=date|time]` correctly
where a real iPhone sizes them from the native picker and ignores `width:100%` — that
bug reached a phone with a green suite. `@layer base` in `index.css` neutralises it with
`appearance: none`, and anything else found only on a device belongs in the layout spec
as an explicit assertion rather than as trust in the emulated engine.

## Conventions & gotchas

- `src/routeTree.gen.ts` is generated by the TanStack Router vite plugin — never edit,
  excluded from lint/format; regenerate by running any vite command.
- TS is `@tsconfig/strictest` + typescript-eslint `strictTypeChecked`. Notable:
  `exactOptionalPropertyTypes` (omit props instead of passing `undefined`),
  `noPropertyAccessFromIndexSignature` (`process.env['CI']`), React 19 deprecates
  `FormEvent` → use `type SubmitEvent` from `react`.
- Event handlers calling async code: `onClick={() => { void doThing() }}` (no-floating-promises).
- Firestore rules cap `get()/exists()` at 10/request — membership checks must stay one
  shallow `exists()`; never inline UID lists in rules or client code.
- Tests run against the **emulator only** (`demo-cattrack`), never production.

## Design system

The whole visual language lives in `src/index.css` — `@theme` tokens plus a small set of
component classes (`gutter`, `page-title`, `section-label`, `surface`, `field`,
`btn-primary`, `btn-secondary`, `btn-chip`, `btn-icon`, `disclosure`). Style with those;
reach for raw Tailwind only for layout. Prettier sorts Tailwind classes. UI language is
English.

Five rules keep it from drifting back into generic-app territory:

1. **One accent.** Coral on cream and ink. `positive` (green) and `danger` (red) are
   TEXT-only signals — never surfaces — so colour always means something.
2. **One big number per screen.** `text-5xl` for the figure the screen exists to show
   (kcal eaten, latest weight); `section-label` for headings; body text at normal weight.
   Bolding everything emphasises nothing.
3. **Cards are objects, not paragraphs.** `.surface` is for forms and grouped lists.
   Sections are a quiet label plus content — not another white rounded box.
   Page-level text carries `.gutter` so it lines up with the text inside cards; without
   it the screen has a ragged left edge (labels at 16px, card text at 32px).
4. **Emoji only in the tab bar**, where they are thumb-level wayfinding. Not in headings,
   buttons, or empty states; `PawMark` is the app's own mark. This was the single loudest
   "generated by an AI" tell.
5. **Plain microcopy.** "Loading…", "Nothing logged yet today." Cute-per-string ("Sniffing
   out today's meals…") is charming once and grating by the fourth screen; the Splash
   line is the one place with any whimsy left.
