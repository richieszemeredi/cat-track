# CatTrack

Shared PWA for a two-person household tracking a kitten's food (calories), weight, and the
supplies and chores around her (food and litter stock, litter boxes, water bowls).
Installed via Safari Add-to-Home-Screen on two iPhones (and usable on an iPad or a
desktop browser); no App Store. Free Firebase Spark tier only — **no feature may require the Blaze plan** (no Cloud Storage, no
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

## Git workflow

The owner works in bursts — several asks dropped in one sitting — and wants that turned
into a clean, incremental history, not one giant commit at the end. So: commit as you go,
not in a pile-up.

- Each independent change is its own commit, made as soon as that change is done and
  verified (typecheck + the tests that cover it, at minimum), not batched with whatever
  comes next in the same conversation. If a fix or a follow-up request changes something
  already committed this session, that is a new commit on top — never an amend of one the
  user has already seen land.
- This is standing authorization to commit without asking each time. Pushing and any
  Firestore rules/hosting deploy are separate, still-ask-first actions — a commit lands
  locally; it does not imply `git push` or `firebase deploy`.
- **Don't hand-run the suite before a push.** `.husky/pre-push` already runs `npm audit`
  (first, since it is the cheapest and fails on advisories rather than on code), lint,
  unit, the production build (which typechecks), rules and e2e, so a manual rerun right before `git push` (including after a rebase
  onto an unrelated upstream commit) only duplicates it. Verifying before each _commit_ is
  still on you: the pre-commit hook only runs lint-staged.
- **CI deploys Firestore rules and Hosting; nothing else.** `.github/workflows/ci.yml` runs
  every gate (lint, typecheck, unit, rules, e2e, build, audit) on each push and PR, and only then
  deploys: a push to `main` deploys `firestore.rules` first, then goes live on Firebase Hosting; a
  PR gets a 30-day Hosting preview channel (rules are never deployed from a PR). So never run
  `firebase deploy` for rules or hosting by hand — it skips the gates; a push is the deploy.
  CI does **not** deploy `firestore.indexes.json`; that stays a manual, ask-first
  `npx firebase deploy --only firestore:indexes` (against the real `cattrack-8aa49`).
- When a chunk of work touches the same files for two different asks (e.g. two features
  both editing `plan.ts`), split by content, not just by file: stage only the hunks for the
  change being committed. A later ask's edits to an already-committed file are their own
  commit even if the diff overlaps.

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
  A member's `displayName` is never typed or edited: `use-display-name-sync.ts` mirrors it
  from the signed-in user's own Auth profile (name, else email) every time membership
  resolves, and rules let a member `update` only their OWN doc's `displayName`. Firestore
  still has to hold a copy — there is no client-side way to read the OTHER member's Auth
  profile without a Cloud Function the Spark tier doesn't have — so `addMember` writes a
  placeholder name that self-corrects the moment the invited member's own client loads.
- `src/lib/household.tsx` — `useHousehold()`: `householdId`, `role`, `canEdit`, `cats`,
  `activeCat`, `selectCat`. Viewers (`role: 'viewer'`) must not see mutating UI.
- Screens: five tabs, in this order — Home `/`, Weight `/weight`, Plan `/plan`, Supplies
  `/supplies`, Profile `/profile`. There is no Food or Chores screen any more: bowls are
  ticked on Home, the plan lives on Plan, the food catalog and stock on Supplies, and water
  and litter boxes on Home. While any food or litter is low, the Supplies tab wears a
  small coral dot (`aria-hidden`; the link's name gains ", needs restocking").
- Home is the day's tasks, for every cat at once: "Needs attention" (one link row per low
  food, low litter kind or overdue box; the section is absent when nothing is due), then each
  cat's planned bowls (`MealChecklist`, grams only — no kcal, no meter, no "2 of 3"), the
  water right under the last cat's bowls (`HomeWater`), one weight row per cat (`WeightRow`:
  latest, trend, and an inline kg field until she's weighed today), and two folds:
  "Anything off-plan" (`OffPlanList` + `LogMealForm` per cat) and "Litter boxes"
  (`LitterFold`; an overdue box's attention row opens it). No calories and no disclaimer on
  Home — those live on Plan. From 768pt: meals + water left; attention, weight, folds right.
  `use-cat-day.ts` is the per-cat data Home and Plan share: `useCatPlan(cat)` (current plan,
  items, target, ratio) and `useCatDay(cat)` (that plus today's feedings, overrides, the
  ticks by meal and the off-plan list) — one query set, so the ticks and counts agree.
- Plan shows the plan as it reads on paper (`PlanSummaryRows`: meals and times, a row per
  food, kcal against target), "Change the plan" opening the full-page `PlanForm`, the
  `OutgrownNudge`, and folded "How the target works" (`RerMerMath`) and history. One cat:
  plan left, folds right. Several: one self-contained block per cat (a column each from
  768pt), no switcher.
- Several cats per household: `activeCat` is the cat chosen on THIS device (localStorage per
  household, `selected-cat.ts`; never Firestore — what one phone is looking at says nothing
  about the other), else the first created. Only Weight and Profile show one cat at a time,
  with a `CatSwitcher` of name chips that exists only from two cats, and key their body by
  cat id so a half-typed form never carries over; Home and Plan show every cat. Cats are
  added from Profile ("Add another cat"); removing one is not built (it would orphan the
  cat's weights, feedings and plans).
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
- `weeklyWeightTrend` is the week-over-week figure both weight screens lead with. It
  measures from the weigh-in whose span is CLOSEST to 7 days, not from the previous entry,
  and reports nothing below a 5-day span (`MIN_TREND_SPAN_DAYS`): dividing a next-morning
  re-weigh by one day and multiplying by seven turns ±10 g of kitchen-scale noise into
  ±70 g/week and would show a thriving kitten as losing weight. An extra weigh-in must
  sharpen the window, never shorten it. Below that span the screens fall back to the raw
  change since the previous entry, phrased as the same shape of sentence.
- `src/lib/plan.ts` — pure, unit-tested planner math. A cat eats the same thing every day,
  so a plan stores a COUNT and a WINDOW, never a list of meals: `mealTimes(3, '07:00',
'19:00')` _is_ 07:00 / 13:00 / 19:00. Grams are held per DAY because that is the figure
  Hungarian tins print (a grams-per-day table, no kcal); the serving is derived. Also holds
  `isOutgrown`, whose 8% tolerance is deliberate: servings round to 5 g, so an honest plan
  already sits within ~2% of target.
- Plans are **never edited**: a revision is a new doc, and the plan before it is closed by
  the next one's `effectiveFrom` (rules deny `update`). That is what stops two phones writing
  overlapping date ranges. `db.sortPlans` breaks a same-day tie on `createdAt` — ordering on
  `effectiveFrom` alone let two revisions saved on one day fall back to document id, which
  could leave the FIRST one in force.
- `src/lib/litter.ts` + `LitterFold` — litter boxes are HOUSEHOLD-level
  (`households/{hid}/litterBoxes`, not under a cat): a `location`, one `lastChangedAt` date,
  `changeEveryWeeks` (default 4, max 52) and `bagsPerSwap` (1–20, default 1). Unlike the
  log collections they are edited in place, and there is no history. Days are calendar days;
  a box is due on `lastChangedAt + changeEveryWeeks` weeks (`stock.litterBoxDueOn`), and due
  ON that day. Each row reads "Last swap · Oct 8 · 5 weeks ago" and "Next swap · Dec 13 · in
  4 weeks" (`lastSwapLine` / `nextSwapLine`); past due, the whole next-swap line turns danger
  ("was due Nov 5 · 10 days overdue"). Only the "Replaced today" button counts as a swap: in
  ONE batch (`db.replaceLitterBox`) it moves the date and writes a litter-stock `swap` of the
  box's `bagsPerSwap`; editing the date in the form does not.
  A box also names the litter kind it takes, `litterId`, and its `bagsPerSwap` is bags OF
  THAT KIND; the swap is written against it. `LitterBoxForm`'s "Litter" select offers the
  active kinds (plus the box's own, if archived since) and starts a new box on the first;
  with no kinds at all the field gives way to "Add a litter on Supplies to count its bags."
  and a new box saves `litterId: null`, whose "Replaced today" only moves the date. With
  two or more active kinds each row names its kind softly after the location ("Bathroom ·
  Clumping"); with one, nothing — every box takes it.
- `src/lib/water.ts` + `HomeWater` — water bowls track when the water was last REPLACED, never
  what a cat drank. Same shape as litter boxes (household-level `households/{hid}/waterBowls`,
  a `location` and one `lastChangedAt`, edited in place, no history) with two deliberate
  differences: it is a full timestamp and the age is ELAPSED HOURS (`useNow`, a minute tick —
  `useToday` only moves at midnight), and the stale limit is one fixed 24 h, not per bowl.
  On Home, one row per bowl ("Water", or each location once there are several), "changed
  6 h ago" (danger past 24 h), a "Refreshed" chip (disabled under a minute) and "Edit" (the
  form, with date AND time for the morning-rush refill nobody logged, and "Add another
  bowl"). No bowls: a "Track water" chip. No reminders anywhere: the screen is the reminder.
- Data model: `households/{hid}/members/{uid}` (roles owner|editor|viewer, source of truth
  for access) and `households/{hid}/cats/{catId}/{weights|feedings|plans}` — append-only
  log docs so two phones never clobber each other. `plans/{planId}/items/{itemId}` holds the
  day's mix, one document per food, because rules cannot iterate a list: as its own document
  every item gets the same `hasOnly` validation as everything else. A feeding carries
  `planId` + `mealIndex` when it ticks off a planned bowl, and both null when it is off-plan
  (the `LogMealForm` hatch). `/invites` is reserved for the public launch.
- Foods belong to the HOUSEHOLD: `households/{hid}/foods/{foodId}` — one catalog every cat's
  plan and feedings name by `foodId`. Besides the energy fields a food has `unit` (`tin` |
  `pouch` | `bag`, null = follow the type: wet → tin, dry and treat → bag) and `unitSizeG`
  (grams in one; null = unknown), both `.default(null)`.
  A food's `analysis` map (the five label percentages, nullable) is the one nested map in
  the model: it is non-null only while `kcalPerGram` is the calculator's own output, so
  hand-editing the kcal field clears it and a stored analysis always explains the stored
  kcal. Rules validate it with `hasAll` as well as `hasOnly` — a half-filled map would let
  the figure be re-derived from constituents it never saw.
- Foods used to live per cat (`cats/{catId}/foods`). `use-legacy-foods-migration.ts` copies
  them up automatically: once per app session, for a member who can edit, once the cats
  have loaded, `db.migrateLegacyFoods` reads every cat's legacy foods and the household's
  (server reads only — an empty offline cache would look like "everything missing") and, in a
  transaction, `set`s each legacy doc whose id is missing under the SAME id, fields verbatim
  (original `createdBy`/`createdAt`; retired keys dropped). It never overwrites a household
  doc and only logs on failure. Same ids is the whole point: plans and feedings keep
  resolving. The legacy path is read for nothing else, and its rules stay as they were.
- Litter is a household catalog too, like foods: `households/{hid}/litters/{litterId}` — a
  `name`, a DESCRIPTIVE `bagSize` + `bagUnit` (`'kg' | 'L'`, both nullable: "10 L bags",
  never in the maths — stock is counted in bags of the kind) and `archived` (never deleted).
  Kinds came after boxes and litter stock, so an ABSENT `litterId` on a box or a stock event
  reads as `LEGACY_LITTER_ID` (`'default'`), while a box's explicit null means no kind was
  chosen; the rules read the key with `get('litterId', 'default')` so an older cached build
  still writes. `use-legacy-litter-migration.ts` (once per session, for an editor, the
  foods migration's pattern) creates `litters/default` ("Litter", no size) in a transaction
  that never overwrites, for a household with any box or litter stock and no such doc —
  nothing else is rewritten; the owner renames it on Supplies.
- Stock is an append-only log, never a stored figure: `foods/{foodId}/stock/{eventId}`
  (`kind: 'bought' | 'count'`, `units`) and `households/{hid}/litterStock/{eventId}`
  (`'bought' | 'count' | 'swap'`, `bags`, `litterId`), each with `at`. `src/lib/stock.ts` (pure,
  unit-tested) derives the level: anchor on the latest `count` (by `at`, then `createdAt`),
  add purchases after it, subtract what was used after it; no count yet, it runs from the
  first purchase; no events, untracked ("Not counted yet"). Food "used" is the grams of
  feedings (every cat) of that food after the anchor ÷ `unitSizeG` — so counts are LOOSE,
  fractional tins and all, and with no size nothing is used up. Litter is worked out PER
  KIND (`litterKindStockState`: that kind's events and the boxes that take it; an event
  naming no existing kind counts for nothing), and its "used" is the `swap` bags. The figure is `exact` ("5 tins") only while nothing was bought or used since the
  count, otherwise "about 5"; shown as max(0, round(level)). One threshold for both,
  `ORDER_LEAD_DAYS = 7` (the delivery lead time): a food is low when its days left —
  level × size ÷ the grams a day of every cat's CURRENT plan — fall under it (no plan use or
  no size: no run-out date, never low). A litter kind is low when the level minus the bags of
  every swap of its boxes due within the lead time (overdue included) is under the RESERVE —
  the largest `bagsPerSwap` of its boxes — i.e. after this week's swaps there would not be
  one full swap left. No boxes or untracked: never low. Archived foods and kinds never are. `supply-lines.ts` and `supply-alerts.ts` hold the
  wording (Supplies' lines, Home's attention rows), unit-tested as strings.
- `src/lib/supplies.tsx` — `SuppliesProvider`, mounted once in the shell inside the
  household, loads the foods, each food's stock log, the litter kinds, the litter stock and
  boxes, every cat's
  current plan + items, and each cat's feedings since the earliest food anchor (floored to
  the day; one single-field range per cat, so no composite index). `useSupplies()` gives
  each food's stock state, one `LitterKindSupply` per active kind (`litters`), the boxes,
  Home's `alerts` ("Order {name}" per low food or kind) and `anyLow` for the tab dot.
  Supplies renders it with `StockCard` (figure, when it was last known for sure, the danger
  line, "Bought more" / "Recount" / "Edit" chips whose panels open inline, one at a time)
  and `Stepper` (− / + round buttons around a typed whole number). Adding a food (`FoodForm`)
  asks what it comes in, how big one is and — on add only — how many are on the shelf,
  which writes a `count`. The Litter column mirrors the Food one: "Add litter" opens
  `LitterForm` in place (a name, the bag size with a kg / L choice that starts on L, and on
  add only "Bags in stock"); each kind's card reads "10 L bags · Bathroom, Hall"
  (`litterMeta`); Edit opens the form with an "Archive" chip; no kinds reads "No litter
  added yet." Archived foods and kinds both sit behind "Show archived (n)" (`ArchivedList`).
- Retiring a field: drop it from the Zod schema (z.object strips unknown keys, so old docs
  keep parsing), from the `*Input` type in `db.ts`, and from the rules' `hasOnly` list —
  that last step is what stops it coming back. Retired so far: `bodyConditionScore`
  (weights), `packageSizeG` (foods), `mealType` (feedings, replaced by an editable time).
  Retired screens: `/food` and `/chores` (and with them `CatToday` and `LitterGlance`).
  The whole "repeat a previous day" feature (`repeat.ts`, `RepeatDayCard`) is gone too: it
  was the data model apologising for itself, and the plan subsumes it. Same for a plan's
  `transition` (the food-switch ramp): it split a bowl across two foods via
  `mealComposition`, turned out not to earn its keep, and is gone from the schema, the
  rules, `PlanForm`, and `plan.ts` — `mealComposition` is back to one line per plan item.
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
on an iPad, and in Chrome on a desktop. All six are Playwright projects: the `iPhone` and
`iPad` devices are WebKit, `Pixel 7` / `Desktop Chrome` are Chromium. The 14 Pro and
chrome-phone run the whole suite; the rest run the layout pass only. The two iPads sit
at the width each wide layout starts: `iPad Mini` (768pt, two columns) and `iPad Pro 11
landscape` (1194pt, side rail).

### Wide screens

The layout switches on **width only**, never on device: Split View, Slide Over and Stage
Manager can make an iPad phone-width at any moment, and a desktop window can be any size.

- **< 768** — the phone layout: one column, bottom tab bar.
- **768+** (`md`) — every screen splits into two `.page-column`s inside `.page-columns`.
  Each column is a contiguous run of the phone's own order (today's figures and tasks on
  the left, records and reference on the right), so on a phone they simply stack. A
  column is never narrower than a card on the 12 mini (343pt). A lone card (loading, no
  cat yet) takes `.page-solo`; a full-page form (the plan editor) keeps `max-w-lg`.
- **1024+** (`lg`) — `TabBar` stands up as a left rail. It is the same Main `<nav>` in
  both shapes, so there is one landmark and `tabBar()` in the e2e helpers finds it
  either way; `AppShell` pads itself beside it.

Mouse and keyboard: `hover:` states on the component classes (Tailwind only applies them
where a pointer can hover, so phones never show a stuck state) and one `:focus-visible`
ring in `@layer base`.

Run `npm run test:visual` and **look at the PNGs** it writes to
`test-results/screenshots/` — the assertions catch geometry, your eyes catch the rest
(wrapped axis labels, orphaned pills, a page that ends on a stray word).

`tests/e2e/layout.spec.ts` asserts, on every screen:

- nothing crosses either viewport edge, and the page never scrolls sideways;
- no control escapes the card it lives in (`.surface`);
- no button, link or `summary` is under 36px in either direction;
- no chip or button in a card sits on the card's edge (a class name that ran into the
  next, `self-startmx-4`, once stretched a chip across its whole card);
- one text column per page column — every `.gutter` element starts exactly one
  card-padding inside the cards of the column it sits in;
- some phrases never split across lines — a Needs-attention detail ("· about 1 / day
  left"), a cat's age after her name ("1 year 1 / month old"), a cat's name in a Home
  weight row — and no danger line, page-level note (`.gutter`) or `text-balance` line
  ends on one stray word ("— time to / order", "… stays in the / history.");
- from 768pt the two `.page-column`s sit side by side, each ≥ 343pt; below it they stack;
- the main nav is a full-width bottom bar below 1024pt and a full-height left rail from
  it, with no content underneath.

Each tab is opened by its tab-bar link and waited on by URL (a tap WebKit drops is
retried), then every screen is swept with one cat and again with two (a long-named second cat), with
everything seeded that can show: two litter kinds (one long-named, its box overdue and its
stock low), a full "Needs attention", both folds open with their forms (the box form with
its litter picker), a water bowl's edit and add forms, Plan's folds open, Supplies with a
stock panel open and the food and litter forms (edit and add, stock fields included) — and
the whole sweep again in dark mode.

Add an assertion there whenever a layout bug is found on a real phone. Two that already
paid for themselves: the weigh-in form's stacked-rows check pins a two-column grid that
shipped a date picker squeezed to 187pt, and the escapes-a-card check exists because a
time input punched out through the right edge of its card while still sitting well
inside the screen.

`a two-food bowl shows both foods and holds its layout` is the widest row the app can
produce — two food names, two gram figures and a meal total in one checklist row on
Home — so it is the first place a layout regression will show. It also lays out Plan with
that two-food plan and its history open.

**Playwright's WebKit is not iOS Safari.** It sizes `input[type=date|time]` correctly
where a real iPhone sizes them from the native picker and ignores `width:100%` — that
bug reached a phone with a green suite. `@layer base` in `index.css` neutralises it with
`appearance: none`, and anything else found only on a device belongs in the layout spec
as an explicit assertion rather than as trust in the emulated engine. Same story for
iOS 27's Liquid Glass blur over the top of an installed web app: it is suppressed by
`.status-bar-backdrop` (a fixed, full-width, cream strip in `index.html`, as tall as the
status bar), which the emulator can't show — the layout spec pins its geometry and colour.

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
`btn-primary`, `btn-secondary`, `btn-chip`, `btn-icon`, `disclosure`, `nudge`). Style with those;
reach for raw Tailwind only for layout. Prettier sorts Tailwind classes. UI language is
English.

Dark mode is automatic (`prefers-color-scheme`, no toggle) and lives entirely in one
`@media` block in `index.css` that re-points the same tokens — never a `dark:` variant in
a component. So a colour must come from a token, never a hex or `white`: that includes
Recharts props (`stroke="var(--color-sand-deep)"`) and its defaults, which paint dots
`#fff`. Text on a coral fill is `text-on-coral`, not `text-ink` (ink turns light at night).
`tests/unit/theme.test.ts` checks AA contrast for both palettes straight from the
stylesheet, and the layout spec's dark pass fails on any light background left behind.

Five rules keep it from drifting back into generic-app territory:

1. **One accent.** Coral on cream and ink. `positive` (green) and `danger` (red) are
   TEXT-only signals — never surfaces — so colour always means something.
2. **At most one big number per screen.** `text-5xl` for the figure a screen exists to
   show (Weight's latest weight); a supply's stock on Supplies is a `text-2xl` figure per
   card. Home has none — it is a list of tasks. `section-label` for headings; body text at
   normal weight. Bolding everything emphasises nothing.
3. **Cards are objects, not paragraphs.** `.surface` is for forms and grouped lists.
   Sections are a quiet label plus content — not another white rounded box.
   Page-level text carries `.gutter` so it lines up with the text inside cards; without
   it the screen has a ragged left edge (labels at 16px, card text at 32px).
4. **Emoji only in the tab bar** (and the rail it becomes on wide screens), where they
   are thumb-level wayfinding. Not in headings, buttons, or empty states. This was the single loudest
   "generated by an AI" tell. The exceptions are the app's logo — a plain 🐈 on the
   rail and the sign-in screen, never a drawn paw — and the loading screen (`Splash`),
   which shows a plain 🐾; both the owner's call.
5. **Plain microcopy.** "Loading…", "Nothing logged yet today." Cute-per-string ("Sniffing
   out today's meals…") is charming once and grating by the fourth screen; the Splash
   line is the one place with any whimsy left.

### Motion

Motion is a feedback channel, not decoration — the same restraint as the palette.

- **CSS first.** Hover/press states, a meter filling, a `<details>` opening: a CSS
  `transition`. `ease-squishy` (the `@theme` token) for what should give a little — a
  press, a disclosure; plain `ease-out` for colours and fills, since a meter overshooting
  its value would lie. An overdue chore line takes `.nudge` (one swell on appearing,
  never a loop). Screen changes are the browser's View Transitions API through the
  router, not JS.
- **Motion (`motion/react`) only for what CSS can't do:** exits (`AnimatePresence`),
  layout/`layoutId` moves (the sliding tab and cat pills, list rows making room) and
  interruptible springs (the meal tick). Use `m.*`, never `motion.*` — `main.tsx` mounts
  `LazyMotion strict` with `domMax` — and the shared transitions in `src/lib/motion.ts`
  (`squishy`, `glide`, `fade`) rather than per-component numbers. A list whose rows come
  and go wraps them in `ListRow` (`StackRow` for a gap-spaced stack) inside
  `<AnimatePresence initial={false}>`, so opening a screen never grows every row in.
  A big figure tweens through `AnimatedNumber`; a small count (a stock figure) pops through
  `PoppingNumber`.
- **Nothing loops.** One-shot only: no confetti, no bouncing paw, no animation on
  the growth chart (a live update would redraw the curve).
- **Reduced motion means none.** `MotionConfig reducedMotion="user"` covers Motion; the
  `prefers-reduced-motion` block in `index.css` zeroes every CSS transition, keyframe and
  view transition. Playwright runs with `reducedMotion: 'reduce'` and Motion skips all
  animations under `navigator.webdriver`, so the layout suite measures settled geometry;
  component tests set `MotionGlobalConfig.skipAnimations` in `tests/component/setup.ts`.
