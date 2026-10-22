# Diet — personal fitness, fasting, keto-aware meals and grocery app

**Status: checklist items 1–5, 12 to 16, 19, 21 to 24, 26, 29, 30 and 31 are built (conflicts report, repository scaffold, static safety scans, core health formulas, the installable phone app shell, the local database with backup, restore and delete-all, the first-run flow with the readiness questions, the weight log with its Kickstart and Steady phases and trend, the fasting timer with its history and the reflux log, the Today dashboard and About, the garden and pantry with crop photos kept only on the phone, the targets engine with Diet and targets in Settings and the Nutrition today card, the seven-day meal planner on the Food tab, the food log with water, steps and a summary for your GP, the grocery list made from the plan with its garden and pantry questions, copy text, CSV and JSON, the exercise dataset and its safety rules, which the Move screens of item 27 will show, and the relay that will carry the grocery list to the laptop, which is not online yet: see [The relay](#the-relay), the phone half of pairing with the laptop, with the encryption the list travels under, and Send to laptop on the List screen, which makes a paste code until the relay's address is added), and checklist items 18 and 20 in part: the ingredient catalogue and the recipes, whose nutrition figures all read "not known" until a food database is approved at checklist item 10. The app works offline and passes its browser tests. A commit marked "[deploy]" publishes it at https://thezombierobot.github.io/Diet/ (see [Phone app](#phone-app)); the published copy is updated when a checklist item is finished and reviewed. See `docs/IMPLEMENTATION_CHECKLIST.md`.**

An Android-first, offline-first web app (PWA) for one person: meal planning around a home garden and NZ groceries, weight and fasting logs, safe bodyweight and beach exercise, cholesterol-conscious keto targets, alcohol logging in NZ standard drinks, and a Chrome side-panel extension that helps with PAK'nSAVE Pāpāmoa shopping without automating the store's website.

## Documents

| Document | What it is |
|---|---|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | The requirements, de-personalised from the owner's handoff; complete for implementation |
| [docs/PLAN.md](docs/PLAN.md) | The 4-week MVP plan, architecture in plain language, decisions and risks |
| [docs/INTEGRATION_FEASIBILITY.md](docs/INTEGRATION_FEASIBILITY.md) | Why direct PAK'nSAVE cart transfer is unproven, what was verified, and the guided manual-add fallback |
| [docs/HEALTH_SAFETY.md](docs/HEALTH_SAFETY.md) | The health rules the app must obey, with sources |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | How we prove it works, including the real shopping trial |
| [docs/UX_SCREENS.md](docs/UX_SCREENS.md) | Every screen described in plain language |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | What the app stores and the shared formulas |
| [docs/STORAGE_DESIGN.md](docs/STORAGE_DESIGN.md) | The on-phone database, backup, restore and delete-all design (checklist item 12) |
| [docs/DOC_REVIEW.md](docs/DOC_REVIEW.md) | Checklist item 1: every conflict and gap found in the planning documents, verified, with the decisions awaiting the owner |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions log, including why there is no server account |
| [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md) | Numbered build steps for the implementing model with acceptance tests and STOP points |
| [docs/OPUS_HANDOVER_PROMPT.md](docs/OPUS_HANDOVER_PROMPT.md) | The prompt to paste into the implementing session |

## The handoff document
The owner's original handoff has been read and the plan reconciled with it. A de-personalised version is `docs/REQUIREMENTS.md`, which is complete for implementation. The original is intentionally not committed because this repository is public and it contains personal details.

## Repository layout

| Folder | What lives there |
|---|---|
| `apps/mobile-web` | The phone app (installable web app) |
| `apps/cart-extension` | The laptop Chrome side panel. Empty until the Phase 0 mode decision is recorded |
| `packages/core` | Shared types and every health-sensitive formula, with tests; all health wording in one file |
| `packages/ui` | The small mobile design system |
| `packages/grocery` | Grocery list building, unit conversion, garden deduction, exports |
| `packages/test-fixtures` | Generic test data (never real personal data) |
| `services/relay` | The blind relay that briefly holds the encrypted list |

## For developers

Node 22.18 or later and pnpm (version pinned in `package.json`; run `corepack enable`).

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies; also turns on the pre-commit hook (below) |
| `pnpm check` | Lint, format check, type check (browser tests included), unit tests and safety scans |
| `pnpm scan` | Safety scans only: banned health wording, price and cart-status wording, personal data and secrets (in the current files and in the whole git history), network and AI calls, telemetry, licences, skipped tests, the extension guard, backup file names, database transactions that could commit halfway, and target arithmetic outside the core engine |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm foods:check` | The ingredient dataset's validation script (checklist item 18, NU-01) |
| `pnpm --filter @diet/mobile-web test` | One package's unit tests (each workspace package has a `test` script for its own Vitest project) |
| `pnpm e2e` | Browser tests (Playwright, Chromium): builds the phone app, serves the production build on port 4317 (set `DIET_E2E_PORT` to use another) and tests it |
| `pnpm icons` | Redraws the app icons into `apps/mobile-web/public/` (after changing the mark or the teal colour) |
| `pnpm format` | Reformat code |

CI runs `pnpm scan` first, then lint, type check and unit tests, and runs the browser tests (`pnpm e2e`) in a separate job. When a browser test fails, CI keeps its report and traces for a week (synthetic data only).

### Pre-commit hook
`pnpm install` runs `git config core.hooksPath .githooks`, which turns on `.githooks/pre-commit`: a plain shell script, with no extra dependencies, that runs `pnpm scan` before every commit. Personal data is caught before it reaches the public history, not after a push. If you cloned without installing, run `git config core.hooksPath .githooks` once.

## Phone app

`apps/mobile-web` is the installable web app (a PWA) the owner adds to the Android home screen from Chrome. Checklist item 5 built its shell: the five tabs (Today, Food, Move, Drinks, List), Settings and About, the offline copy, the install button, the "Update available" banner and the offline pill. Every screen except About says honestly that it arrives at a later checklist step; About shows the not-a-medical-device statement, the New Zealand help numbers (tap to call or text), a privacy note, a placeholder for data sources, the version, whether the offline copy is saved yet, and whether the phone protects the app's records from automatic clearing.

Checklist item 12 added the local database (IndexedDB through Dexie, `apps/mobile-web/src/db`; the record rules and the backup format are in `packages/core/src/storage`):
- **Settings, Backup and data:** export a backup (locked with a password by default; the app asks "Can you see the file?" and counts the backup only on Yes), restore from a backup (nothing changes until you tap Replace, after seeing what would be lost), delete all data (two confirmations; it lists what stays), the storage protection line and when the last backup was made.
- **Today:** a backup reminder 7 days after the last confirmed backup (3 days if the phone has not promised to keep the records), which "Not now" snoozes.
- If the records cannot be opened (a newer version in another tab, a failed update, private mode), a plain screen with the help numbers replaces the app; a failed update offers a rescue copy of the records first.
- The repository scan `tools/scans/txScope.ts` checks that every database transaction holds only database requests, so a restore can never commit halfway.

Checklist item 13 added the first-run flow (`apps/mobile-web/src/onboarding`):
- Nothing in the app opens until the alcohol safety note is acknowledged, not even About or a restore. Then come the seven readiness questions, the profile, the eating schedule (left out while fasting is switched off) and the garden; a reload resumes at the first unfinished step. Once the note is acknowledged, setup also offers "Restore from a backup instead". After delete-all the app starts this flow again.
- One gate function in core (`packages/core/src/readiness/gates.ts`) decides from the answers, the birth year and the current weight what is switched off; an unanswered question counts as yes.
- **Settings:** Readiness answers, Profile and Eating schedule. **Today:** the "talk to someone" card from day one when answer 7 is yes or unanswered.

Checklist item 15 added fasting (`apps/mobile-web/src/screens/fasting`; the rules are in `packages/core/src/fasting`):
- **Today:** the Fast card: Start and End (End is always there, with no confirmation step), the time counted from the stored start so it survives a restart, the planned eating window, the 5 pm snack offer when one meal would carry the day, and past 24 hours a warning with the stop-signs and the help numbers. Fasts less than an hour apart count as one fast for the 24-hour rule.
- **Fasting and reflux** (from the Fast card, or Settings, Eating schedule): the stop-signs, the eating pattern (the same editor as Settings), a one-tap reflux symptom log with the earlier-dinner and split-meal options, and the history of completed fasts with the streak.
- While the readiness answers switch fasting off, only the reason and the reflux log show, and a fast still open can be ended; nothing is deleted.

Checklist item 16 finished Today and About (`apps/mobile-web/src/screens/today`; the rules are in `packages/core/src/today`):
- **Today:** the date and a one-line status from the fasting timer (past 24 hours, always the warning); the "talk to someone" card first when it applies; Weight and Fast; item 21's Nutrition today card; water with "Add 250 mL", Undo and an electrolyte switch; steps typed in, with "Same as yesterday"; the NZ alcohol guidance line, always with "No alcohol use is risk-free."; and Reminders: the lipid test and cholesterol check-ins, the electrolyte reminder during Kickstart and the first two weeks of the keto carb ceiling, medication timing while fasting is switched off, and the backup reminder. Movement and drink logging say they arrive later, with no figures. Nothing can be logged before setup is finished.
- **"+" quick actions:** Log weight opens the entry on the Weight card; Swap recipe opens today's plan (item 22); the actions not built yet are marked "Later" and do nothing; Add drink shows "Off" with the reason under 18.
- **About:** says that no other site is published from the app's GitHub account, and what the Label, Database and Estimate badges mean; the Data sources card links to Foods in the app (item 18) and will name a food database, with its attribution, once one is approved at checklist item 10.

Checklist item 18 added the ingredient catalogue (`packages/core/data/ingredients.json`; the rules are in `packages/core/src/foods`), in part:
- 169 everyday foods with their other names, aisles, typical pack sizes (never prices, never checked against a store), allergens (packed foods always say "check the label"), garden flag, Bay of Plenty seasons, raw and cooked forms and swaps. Firm and silken tofu carry soy.
- **Foods in the app** (from About, Data sources): search by name or another name ("chard" finds Silverbeet) and open a food for its details. Every nutrition figure reads "not known", never 0: no food database has been approved yet (checklist item 10), so none is loaded, and the app never fills one in. Until then the app cannot warn when a day's food is under the energy floor or short of protein; the Kickstart start check says so.

Checklist item 19 added the garden and pantry (`apps/mobile-web/src/screens/garden`; the rules are in `packages/core/src/garden`):
- **Garden and pantry** (from Food's "At home" card, and Today's "+" Add harvest): crops with their amount in your own unit (never a made-up weight: "Available, amount not entered" until you add one), "Ready to use", days left from the day picked and the days you said it keeps, and a Ready switch on each row; pantry items with "Some, not measured" or "None left". Add harvest asks whether to add to the amount listed or replace it.
- **Photos:** one per crop, resized on the phone, with the location and camera details removed from the copy the app keeps. Photos stay on the phone: they are never in a backup or anything the app sends, and delete-all removes them. A write check refuses any photo that still carries such details, and a repository scan lets only named files reach the photo store.
- The planner and the grocery list (items 22 and 24) will read garden and pantry through one read-only stock view (`apps/mobile-web/src/garden/stock.ts`). A crop or pantry item is linked to a food of the ingredient catalogue (item 18) when you pick a suggestion or its name matches one food's name exactly.

Checklist item 20 added the recipes (`packages/core/data/recipes.json`; the rules are in `packages/core/src/recipes`), in part:
- 30 recipes written for the app: a silverbeet week of seven dinners, two tofu dinners, everyday New Zealand proteins, snacks for the 5 pm snack, and breakfasts and lunches. No butter, cream, coconut, processed meat or fatty cuts; at most 2 eggs a serve; no added salt (four use soy sauce); no alcohol. Every ingredient is one of the catalogue's foods.
- **Food, Recipes** and a recipe's page: ingredients with raw and cooked weights and "Cooking for" (the amounts only: the nutrition stays one serve), the method, one serve's nutrition, allergens and swap hints. Every figure reads "not known" with no badge until food data is loaded, and the carb label says "Written for keto" until the carbs are worked out. A packed ingredient's allergens depend on the brand, so for an owner who lists an allergen every recipe carries "Check labels for allergens".
- Substitute ingredient saves your own version, keeping every allergen of the original; it opens once the ingredients have figures (after checklist item 10). Add to plan (checklist item 22) chooses a day and meal of the next seven days; Log as eaten arrives with checklist item 23.

Checklist item 22 added the seven-day planner (`apps/mobile-web/src/screens/planner`; the rules are in `packages/core/src/planner`):
- **Food, Meal plan:** Monday to Sunday, back to earlier weeks and forward to next week; each day opens its own screen with its eating window and the meals that window allows (dinner only on a one-meal day, the 5 pm snack and dinner on 22:2, breakfast, lunch and dinner while fasting is off). Meals planned before the window changed stay on the day but are not counted. During a Kickstart stop-sign pause no eating-window time is shown.
- **Choosing a meal:** suggestions pass your allergens, dislikes, hidden recipes and carb ceiling, with recipes using two or more ready garden foods first. Recipes whose allergens are not fully known (every recipe, while any allergen is listed) are listed apart and added only after a label check that names the allergens and the ingredients to check. "Your portion" and "Cooking for" are separate: cooking for more people never changes your figures.
- **Fill empty meals** and **Copy to the following week** show what they would do first and write a day only when its energy and protein are known to reach the day's targets; until food figures are loaded (checklist item 10) they fill and copy nothing and say why. Your own choices are always kept, with a note when a day is under the floor.
- The Budget card keeps your own note, shown as you typed it; the planner uses no prices. The Fast card on Today reads the planned meals for its 5 pm snack check. Settings has a Hidden recipes card.

Checklist item 30 added the phone half of pairing with the laptop (`apps/mobile-web/src/screens/pairing`; the encryption, the list's transfer format and the duplicate rule the laptop will use are in `packages/grocery/src/transfer`):
- **Settings, Laptop pairing:** the camera turns on only when you tap "Scan the laptop's code", reads the square code the laptop's side panel will show (checklist item 33), and stops as soon as it has it, on Cancel, after 2 minutes and when the app goes to the background. The key is kept in the phone's database in a form the app cannot read back and never goes into a backup; there is no way to type it. The screen shows when the phone was paired and a four-letter pairing check that the laptop shows too. Pair again and Unpair ask first; Unpair sends nothing.
- Pairing itself sends nothing; sending is checklist item 31's Send to laptop. The code is read with a small reader bundled with the app (jsQR), which is kept for offline use. Chrome's own reader is not used: on Android it comes from Google Play services, which was not checked, and the key would pass through it; the owner can choose it at the week-3 review (checklist item 35).

How it is built:
- Vite and React. The look comes from the owner's mock-up; every colour lives in one file, `packages/ui/src/styles/tokens.css`, with a light and a dark value each, so feedback on the look is an edit there. The launch screen and the task switcher use the icon's teal, which suits both themes. The Manrope font is bundled with the app, never fetched.
- A Workbox service worker keeps a copy of the whole app on the phone, so every screen opens offline. It only ever fetches the app's own files, and there is no analytics of any kind. When the app comes back into view, it checks for a new version (at most once a minute) and offers "Update available".
- A Content Security Policy in `index.html` lets the page load and connect to nothing but its own address, and to the relay's address once it is set in the app (checklist item 31; while it is not set, nothing else). That policy does not cover the service worker, so a check of the build confirms the built service worker loads and keeps only the app's own files, by relative address. The browser tests check that every request goes to the app's own address only, online and offline, and that the policy blocks nothing. The app will not run inside a frame on another site.

Run it on your computer:

| Command | What it does |
|---|---|
| `pnpm --filter @diet/mobile-web dev` | Development server with live reload at http://localhost:5173/Diet/ (no offline copy in this mode) |
| `pnpm --filter @diet/mobile-web build` | Production build into `apps/mobile-web/dist/`, including the offline copy |
| `pnpm --filter @diet/mobile-web preview` | Serves that build at http://127.0.0.1:4173/Diet/, offline copy included |

The app lives under `/Diet/` because that is its address on GitHub Pages. To build for the root of a server instead, set `DIET_BASE=/` for the build (for example `DIET_BASE=/ pnpm --filter @diet/mobile-web build`).

### Putting it online (GitHub Pages)

The app will live at **https://thezombierobot.github.io/Diet/**. Publishing happens only on purpose: the deploy workflow (`.github/workflows/pages.yml`) starts for every push to a work branch (named `ccr-...`), but publishes only when the subject line (the first line) of the pushed head commit's message contains **[deploy]**, and only after the full checks (`pnpm check`: safety scans, lint, type check, unit tests) and the full browser tests (`pnpm e2e`) pass. Any other push publishes nothing, and its run says so in its summary. The marker anywhere else in a message (a commit body quoting it, say) does not count. Steps:
1. On GitHub: Settings → Pages → Build and deployment → Source: **GitHub Actions** (done by the owner on 19 October 2026).
2. **Still to do by the owner:** Settings → Environments → **github-pages** → Deployment branches and tags → Add deployment branch rule → `ccr-*`. By default only the default branch may deploy, so until this rule exists a deploy is refused.
3. Push a commit whose subject line contains `[deploy]` (or, once the workflow is on the default branch, Actions → **Deploy phone app to GitHub Pages** → Run workflow). Before telling anyone the new version is live, check that a **Deploy phone app to GitHub Pages** run for that exact commit finished its Deploy job (Actions tab, or `gh run list --workflow pages.yml --commit <sha>`). It runs the safety scans and tests, the browser tests, builds the app, publishes it, then checks the live copy in Chrome: installable with no errors, manifest and icons present, works offline, requests only to its own address, the Content Security Policy blocks nothing, and it will not run in a frame. The same check can be run by hand: `DIET_E2E_URL=https://thezombierobot.github.io/Diet/ pnpm exec playwright test e2e/pwa.spec.ts e2e/network.spec.ts e2e/rendered-text.spec.ts e2e/shell.spec.ts`.
4. On the phone, open the address in Chrome and tap **Install app** (Today or Settings), or use Chrome's menu → Install app (TEST_PLAN PWA-02).

A later version shows "Update available" in the app, also when the installed app is reopened from the background; tapping Reload switches to it, and records stay on the phone.

Note: GitHub Pages sites of one account share one web origin (thezombierobot.github.io), so another Pages site on the same account could read this app's stored records. The decision (`docs/DECISIONS.md`, C34) is that this account publishes no other Pages site; if one is ever wanted, the app first moves to its own origin.

## The relay

The relay is a small program that runs on Cloudflare's free plan, under your own Cloudflare account. When you tap Send to laptop, the phone locks the grocery list with the key your phone and laptop share through the pairing code, and hands the locked copy to the relay. The laptop collects it, and the relay deletes it. The relay hands out a list for at most 15 minutes; Cloudflare deletes its copy soon after.

Now and then, Cloudflare may offer the laptop a second copy of a list it already has, usually within a minute and never after the 15 minutes are up. Once checklist items 30 and 33 are built, the laptop recognises the copy and ignores it. If you send a corrected list within a minute or so of the first, the correction can occasionally be lost; the phone then never shows "Received on laptop" for it, so send it again.

The relay cannot read the list. It writes no logs, its logging settings on Cloudflare are switched off, and it sends nothing anywhere else. It turns away plain text; the app's own tests check that every list is locked before it leaves the phone. What it can see is a locked block of text, a random room number your phone and laptop share, the internet addresses they connect from, and when they connect; Cloudflare can see the same. Anyone who photographs the pairing QR code on your laptop screen could read later lists until you unpair, so show it only when pairing.

Until the relay's address is added to the app (after step 7), Send to laptop on the phone makes a paste code instead, once the side panel exists (checklist item 33) and the phone is paired with it: copy the code, send it to yourself, and paste it into the side panel. The code is the list locked with your pairing key. Only the lines still to buy go, each with its amount, pack, aisle, substitute and tick, and the store name: no prices, garden or pantry amounts, notes or health records.

The technical details (addresses, answers, limits and tests) are in [services/relay/README.md](services/relay/README.md). Its tests run on every change without a Cloudflare account, and nothing in CI contacts Cloudflare.

### Setting it up (about 30 minutes, once, at the start of week 3)

If any step prints an error or the word FAILED, stop and paste its last lines into chat.

You need Git and Node.js 22.18 or newer on your laptop (check with `node --version`). Ask in chat if either is missing.

1. **Create a Cloudflare account** at dash.cloudflare.com, on the free plan, and turn on two-step sign-in in your profile. If the dashboard already shows a workers.dev subdomain (under Workers & Pages) that contains your name or email, change it to random words, or ask in chat how.
2. **Get the code.** If this repository is not on your laptop yet, run `git clone https://github.com/TheZombieRobot/Diet.git`, then `cd Diet`. In the repository folder, switch to the branch the implementer names in chat: `git fetch`, then `git switch <branch name>`, then `git pull`. Then run `corepack enable` and `pnpm install`. If `corepack enable` says permission denied, ask in chat.
3. **Switch off Wrangler's usage reports, then sign in.** Run `pnpm relay:telemetry-off`. This switches off Wrangler's usage reports on this laptop. Then run `pnpm relay:login`. A browser tab opens; approve it. The sign-in stays in your user folder on this laptop, never in the repository. If Wrangler asks to send error reports or to install anything, answer No.
4. **Create the two storage spaces:** `pnpm relay:create-storage`, then `pnpm relay:create-test-storage`. Each prints an id, a long string of letters and digits. Copy everything both commands printed into chat (if it shows your email address, delete that part first). The ids are labels, not passwords. If one says the storage space already exists, run `pnpm relay:list-storage` and copy what it prints instead. Wait until the implementer says the ids are added, then run `git pull`.
5. **Put the test relay online:** `pnpm relay:deploy-test`. It first checks the relay's settings on your laptop; if it says a storage id is not filled in yet, step 4 is not finished, so wait for the implementer and run `git pull` again. If Wrangler asks to register a workers.dev subdomain, answer Yes and type random words that say nothing about you. It ends with an address like https://list-relay-test.your-words.workers.dev.
6. **Check it:** `pnpm relay:smoke <that address> --expiry 120`. It takes about four minutes, because it waits for a test list to expire. Then run `pnpm relay:smoke <that address> --limits` (about two minutes). Copy the last lines of both into chat.
7. **Put the real relay online:** `pnpm relay:deploy`, then `pnpm relay:smoke <its address>` (about a minute). Send both addresses in chat. Before either address is saved in this public repository, the implementer shows it to you so you can confirm it says nothing about you.
8. **Sign out:** `pnpm relay:logout`. Nothing that can change your Cloudflare account stays on the laptop.

To update the relay later (the implementer will say when): steps 2, 3, 5, 6, 7 and 8.

Wrangler is the Cloudflare tool these commands use. Step 3 switches off its usage reports for every Wrangler command on this laptop, and the commands also tell it not to send them. It may check the internet for a newer version of itself; that check carries nothing about you or the app.

## Privacy note
Nothing personal belongs in this repository: no health history, no logs, no backups. Your data lives only in the app on your phone. See `docs/DECISIONS.md`.
