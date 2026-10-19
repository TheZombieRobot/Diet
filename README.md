# Diet — personal fitness, fasting, keto-aware meals and grocery app

**Status: checklist items 1–5 are built (conflicts report, repository scaffold, static safety scans, core health formulas, and the installable phone app shell). The app shell works offline and passes its browser tests; putting it online at https://thezombierobot.github.io/Diet/ waits for the owner to turn on GitHub Pages (see [Phone app](#phone-app)). See `docs/IMPLEMENTATION_CHECKLIST.md`.**

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
| `pnpm scan` | Safety scans only: banned health wording, price and cart-status wording, personal data and secrets (in the current files and in the whole git history), network and AI calls, telemetry, licences, skipped tests, and the extension guard |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm e2e` | Browser tests (Playwright, Chromium): builds the phone app, serves the production build and tests it |
| `pnpm icons` | Redraws the app icons into `apps/mobile-web/public/` (after changing the mark or the teal colour) |
| `pnpm format` | Reformat code |

CI runs `pnpm scan` first, then lint, type check and unit tests, and runs the browser tests (`pnpm e2e`) in a separate job.

### Pre-commit hook
`pnpm install` runs `git config core.hooksPath .githooks`, which turns on `.githooks/pre-commit`: a plain shell script, with no extra dependencies, that runs `pnpm scan` before every commit. Personal data is caught before it reaches the public history, not after a push. If you cloned without installing, run `git config core.hooksPath .githooks` once.

## Phone app

`apps/mobile-web` is the installable web app (a PWA) the owner adds to the Android home screen from Chrome. Checklist item 5 built its shell: the five tabs (Today, Food, Move, Drinks, List), Settings and About, the offline copy, the install button, the "Update available" banner and the offline pill. Every screen except About says honestly that it arrives at a later checklist step; About shows the not-a-medical-device statement, the New Zealand help numbers, a placeholder for data sources and the version.

How it is built:
- Vite and React. The look comes from the owner's mock-up; every colour lives in one file, `packages/ui/src/styles/tokens.css`, with a light and a dark value each, so feedback on the look is an edit there. The Manrope font is bundled with the app, never fetched.
- A Workbox service worker keeps a copy of the whole app on the phone, so every screen opens offline. It only ever fetches the app's own files, and there is no analytics of any kind.
- A Content Security Policy in `index.html` lets the page load and connect to nothing but its own address (the relay is added at checklist item 31). The browser tests check that every request goes to the app's own address only, online and offline.

Run it on your computer:

| Command | What it does |
|---|---|
| `pnpm --filter @diet/mobile-web dev` | Development server with live reload at http://localhost:5173/Diet/ (no offline copy in this mode) |
| `pnpm --filter @diet/mobile-web build` | Production build into `apps/mobile-web/dist/`, including the offline copy |
| `pnpm --filter @diet/mobile-web preview` | Serves that build at http://127.0.0.1:4173/Diet/, offline copy included |

The app lives under `/Diet/` because that is its address on GitHub Pages. To build for the root of a server instead, set `DIET_BASE=/` for the build (for example `DIET_BASE=/ pnpm --filter @diet/mobile-web build`).

### Putting it online (GitHub Pages)

The app will live at **https://thezombierobot.github.io/Diet/**. The deploy workflow (`.github/workflows/pages.yml`) runs on every push to a work branch (named `ccr-...`) that changes more than documentation, after the same checks as CI. Steps:
1. On GitHub: Settings → Pages → Build and deployment → Source: **GitHub Actions** (done by the owner on 19 October 2026).
2. Settings → Environments → **github-pages** → Deployment branches and tags: add the branch to deploy from (the work branch), or merge the work into the default branch first. By default only the default branch may deploy.
3. Push to the work branch (or, once the workflow is on the default branch, Actions → **Deploy phone app to GitHub Pages** → Run workflow). It runs the safety scans and tests, builds the app, publishes it, then checks the live copy in Chrome: installable with no errors, manifest and icons present, works offline, and requests only to its own address. The same check can be run by hand: `DIET_E2E_URL=https://thezombierobot.github.io/Diet/ pnpm exec playwright test e2e/pwa.spec.ts e2e/network.spec.ts e2e/rendered-text.spec.ts`.
4. On the phone, open the address in Chrome and tap **Install app** (Today or Settings), or use Chrome's menu → Install app (TEST_PLAN PWA-02).

A later version shows "Update available" in the app; tapping Reload switches to it, and records stay on the phone.

Note: GitHub Pages sites of one account share one web origin (thezombierobot.github.io), so another Pages site on the same account could read this app's stored records. The decision (`docs/DECISIONS.md`, C34) is that this account publishes no other Pages site; if one is ever wanted, the app first moves to its own origin.

## Privacy note
Nothing personal belongs in this repository: no health history, no logs, no backups. Your data lives only in the app on your phone. See `docs/DECISIONS.md`.
