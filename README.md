# Diet — personal fitness, fasting, keto-aware meals and grocery app

**Status: plan approved 19 October 2026. Implementation not yet started; follow `docs/IMPLEMENTATION_CHECKLIST.md` from item 1.**

An Android-first, offline-first web app (PWA) for one person: meal planning around a home garden and NZ groceries, weight and fasting logs, safe bodyweight and beach exercise, cholesterol-conscious keto targets, alcohol logging in NZ standard drinks, and a Chrome side-panel extension that helps with PAK'nSAVE Pāpāmoa shopping without automating the store's website.

## Documents

| Document | What it is |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | The 4-week MVP plan, architecture in plain language, decisions, risks, and the three open questions |
| [docs/INTEGRATION_FEASIBILITY.md](docs/INTEGRATION_FEASIBILITY.md) | Why direct PAK'nSAVE cart transfer is unproven, what was verified, and the guided manual-add fallback |
| [docs/HEALTH_SAFETY.md](docs/HEALTH_SAFETY.md) | The health rules the app must obey, with sources |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | How we prove it works, including the real shopping trial |
| [docs/UX_SCREENS.md](docs/UX_SCREENS.md) | Every screen described in plain language |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | What the app stores and the shared formulas |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions log, including why there is no server account |
| [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md) | Numbered build steps for the implementing model with acceptance tests and STOP points |

## The handoff document
The master requirements document `Personal_Fitness_Grocery_App_Claude_Handoff.md` has been read and the plan reconciled with it. It is intentionally **not** committed because this repository is public and it contains personal details. The owner supplies it to the implementing model directly at the start of each session (checklist item 1).

## Privacy note
Nothing personal belongs in this repository: no health history, no logs, no backups. Your data lives only in the app on your phone. See `docs/DECISIONS.md`.
