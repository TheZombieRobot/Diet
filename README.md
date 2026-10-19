# Diet — personal fitness, fasting, keto-aware meals and grocery app

**Status: checklist items 1–4 are done (conflicts report, repository scaffold, static safety scans, core health formulas). Item 5, the installable app shell, is next. See `docs/IMPLEMENTATION_CHECKLIST.md`.**

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
| `pnpm e2e` | Browser tests (Playwright, Chromium) |
| `pnpm format` | Reformat code |

CI runs `pnpm scan` first, then lint, type check and unit tests, and runs the browser tests (`pnpm e2e`) in a separate job.

### Pre-commit hook
`pnpm install` runs `git config core.hooksPath .githooks`, which turns on `.githooks/pre-commit`: a plain shell script, with no extra dependencies, that runs `pnpm scan` before every commit. Personal data is caught before it reaches the public history, not after a push. If you cloned without installing, run `git config core.hooksPath .githooks` once.

## Privacy note
Nothing personal belongs in this repository: no health history, no logs, no backups. Your data lives only in the app on your phone. See `docs/DECISIONS.md`.
