# Implementation Checklist for Opus 5.5

Numbered, in build order. Each item has a plain-language purpose, what to build, and an acceptance test (IDs refer to `TEST_PLAN.md`). **STOP** items end with a message to the owner and wait. **OWNER** items are for the owner. Do not start any item below a STOP until the owner has replied.

Conventions for the implementing model:
- Read `PLAN.md`, `HEALTH_SAFETY.md`, `INTEGRATION_FEASIBILITY.md`, `TEST_PLAN.md`, `UX_SCREENS.md`, `DATA_MODEL.md` and `DECISIONS.md` before item 1, and the handoff document the owner supplies.
- The repository is public. Never commit the handoff, backups, photos, logs or anything containing personal health information. Fixtures are generic. `.gitignore` covers `*.backup.json`, `docs/handoff/`, `docs/private/`.
- All user-facing health text lives in `packages/core/src/copy/health.ts` so it can be scanned and reviewed in one place.
- Every health-sensitive formula lives in `packages/core` behind unit tests.
- Commit after each item with the item number in the message. Push to the designated branch. Explain progress in plain English; the owner does not read code.
- Never add a dependency that phones home. Bundle fonts and icons. No AI calls at runtime.
- Never write code that reads or changes paknsave.co.nz pages, cookies, storage or network unless mode A is recorded as approved in `INTEGRATION_FEASIBILITY.md` 9.3, and even then never checkout, payment, credentials, session tokens, or security bypass.

---

## Phase 0 and Week 1 — Feasibility spike and foundations

1. **OWNER: Supply the handoff document** to the model directly (paste or upload). Do not commit it.
   *Acceptance:* model confirms it has read it; `git log -p` contains no personal health data.

2. **Repository scaffold.** pnpm workspace: `apps/mobile-web`, `apps/cart-extension`, `packages/core`, `packages/ui`, `packages/grocery`, `packages/test-fixtures`, `services/relay`. TypeScript strict, ESLint, Prettier, Vitest, Playwright. GitHub Actions: lint, unit tests, static scans on every push. `.gitignore` per conventions.
   *Acceptance:* `pnpm test` and `pnpm lint` pass; CI green.

3. **Static scans in CI.** Banned health phrases (HS-07, HS-08, HS-19, HS-21), price/stock/cart strings (HS-16), personal-data guard (fails if a file matches the handoff's filename or contains "Handoff.md" content markers).
   *Acceptance:* seeded violation fails the build; removed violation passes.

4. **Core formulas with tests.** Standard drinks, eating-window length from clock times with midnight wrap, net carbs, Mifflin-St Jeor with activity factors, 7/14-day averages and weekly rate, portion scaling, confidence rules (per `DATA_MODEL.md`).
   *Acceptance:* AL-01, FL-08, FL-09, HS-04, HS-17, HS-22, HS-23, NN-01, NN-02 pass as unit tests.

5. **PWA shell and hosting.** Vite + React app with manifest, Workbox offline, install prompt, update banner, offline indicator; deployed to GitHub Pages; URL in `README.md`.
   *Acceptance:* PWA-01, PWA-05; owner installs it (PWA-02).

6. **OWNER: Phase 0 store flow.** Walk through store select, login, add one item, view cart, remove it, on paknsave.co.nz for Pāpāmoa in your own browser. Record one line per screen in `INTEGRATION_FEASIBILITY.md` 9.1. No purchase, no screenshots with account details.
   *Acceptance:* 9.1 filled in.

7. **OWNER: Terms.** Read Website Terms and Online Shopping Terms; paste the relevant clauses into `INTEGRATION_FEASIBILITY.md` 3.3, or write "no such clause" with the date.
   *Acceptance:* every "not verified" row in 3.3 updated.

8. **OWNER: Search URL.** Record the observed search URL and whether the store is in the URL, in `apps/cart-extension/README.md`.
   *Acceptance:* recorded with date.

9. **Phase 0 recommendation.** Model reads 3.3 and 9.1, writes 9.2 recommending A, B or C against the gates in section 9. Do not build anything for the extension yet.
   *Acceptance:* 9.2 written with reasons.

10. **Nutrition data licence.** Read foodcomposition.co.nz terms clause 4 (owner or model). Record the NZ vs USDA decision in `DECISIONS.md`.
    *Acceptance:* decision recorded with the clause quoted.

11. **STOP — Phase 0 decision.** Message the owner with the recommendation. Owner records A/B/C in 9.3.

12. **Local database and backup.** Dexie schema per `DATA_MODEL.md` with versioned migrations; persistent storage request; backup export/import with optional AES-GCM password; delete-all; weekly nag.
    *Acceptance:* table CRUD unit tests; BK-01 to BK-03; HS-15; PWA-06.

13. **First-run flow.** Welcome, mandatory alcohol safety notice, readiness questions with gate logic, profile, eating schedule with computed window display, garden with silverbeet pre-listed.
    *Acceptance:* HS-20; RD-01 to RD-06; HS-03; FL-08 in the UI.

14. **Weight log, phases and trend.** Entry, 7/14-day averages, long-term goal labelled, Kickstart/Steady phase engine (21 days plus confirmed extensions), front-loaded "typical range, not a promise" band, Kickstart and Steady notes, goal floors, rapid-loss card only in Steady.
    *Acceptance:* WT-01 to WT-10; HS-01, HS-11, HS-21, HS-26; NN-03.

15. **Fasting timer and history.** Presets 16:8, 18:6, 20:4, 22:2, custom times; snack and dinner times; 24-hour ceiling behaviour; restart-safe; stop-signs; "widen the window" prompt; reflux symptom log and options.
    *Acceptance:* FS-01 to FS-05; FL-10, FL-11; HS-02, HS-18.

16. **Today dashboard skeleton and About screen.** Cards per `UX_SCREENS.md` section 2 wired to weight and fasting; quick actions; About with not-a-medical-device text, emergency numbers, data attribution placeholder, version.
    *Acceptance:* HS-13 (About portion); snapshot of Today.

17. **STOP — week 1 review.** Send the owner the install URL and the end-of-week-1 checklist from `TEST_PLAN.md` section 4.

---

## Week 2 — Food and garden

18. **Ingredient dataset.** About 150 items in `packages/test-fixtures` and `packages/core/data`: name, aliases, aisle, pack sizes seen at PAK'nSAVE (owner corrects in the trial), nutrients per 100 g, source tag and citation, allergens, garden flag, Bay of Plenty season months. Silverbeet and other leafy greens included.
    *Acceptance:* NU-01; validation script; attribution text matches the chosen licence.

19. **Garden and pantry inventory.** Crop, amount, harvest-ready, perishability, optional photo stored on device; pantry quantities; "Add harvest" quick action.
    *Acceptance:* GL-02 fixture; PWA-04 offline persistence; photo never included in exports.

20. **Recipe dataset.** About 30 recipes: silverbeet-first week, leafy greens, affordable NZ proteins (chicken, eggs, canned fish, mince, seasonal fish), seasonal produce, substitutions and leftover reuse; cholesterol-conscious scoring; allergens; raw and cooked weights.
    *Acceptance:* NU-02, NU-03, NU-04; FL-06 (HS-24).

21. **Targets engine, deficits and diet modes.** Protein 120–140 g default (80–200 range), net-carb ceiling in keto mode, saturated-fat budget, fibre guide, energy estimate with "physically active job" default, Kickstart deficit up to 30% with protein at 140 g and net carbs at 20 g, Steady deficit 15–20%, 5,000 kJ floor in both; keto-preferred, moderate low-carb, balanced modes.
    *Acceptance:* unit tests; HS-09, HS-10, HS-22, HS-25; FL-04; WT-06, WT-07.

22. **Seven-day planner.** Window-aware meal slots (snack plus dinner by default), swap with garden-first ranking, household scaling with independent user portion, dislikes and allergens respected, budget note, cholesterol check-in cards (day one, weeks 8 and 12), electrolyte reminder in the first fortnight, optional auto-fill respecting the floor.
    *Acceptance:* NU-05 to NU-08; FL-05 (HS-23).

23. **Food log.** Quick-add from plan or recipe, add from label (per 100 g or per serve), raw/cooked toggle, confidence badges, water and electrolyte log, manual steps.
    *Acceptance:* FL-01 to FL-03.

24. **Grocery list builder and exports.** Aggregate, merge, subtract pantry and garden with audit rows, pack rounding, substitutes, aisle grouping, store name header, optional timestamped prices, copy text, CSV, JSON.
    *Acceptance:* GL-01 to GL-09; NN-04, NN-05, NN-06.

25. **Week 2 regression and owner trial of planning a week.**
    *Acceptance:* CI green; feedback captured in `docs/CHANGELOG.md`.

---

## Week 3 — Body, drinks, hand-off and extension

26. **Exercise dataset.** Movements with easier/harder/band/dumbbell variants and cues; three 20–35-minute full-body sessions; weekly template with two or three sessions and rest days; beach walk and opt-in jog progression.
    *Acceptance:* EX-01, EX-05.

27. **Move screens.** Week view, pre-session check, session view with progression cap, finish ratings, beach prompts, rest counted as success.
    *Acceptance:* EX-02 to EX-04; HS-12.

28. **Alcohol engine and screens.** Beverage presets (default 330 mL, 5%, 94 kcal), log, daily/weekly cans/standard drinks/kcal, trends, alcohol-free days, milestones entered by user or clinician, guidance context, help card triggers, next-day note, no banned phrasing.
    *Acceptance:* AL-01 to AL-12; HS-05, HS-06, HS-07, HS-08, HS-19; NN-01, NN-09.

29. **Relay service** on Cloudflare Worker + KV: POST ciphertext to a room, GET once then delete, 15-minute expiry, 64 KB cap, rate limit, no body logging. Test deployment with 2-minute expiry.
    *Acceptance:* TR-02, TR-05, TR-06, TR-09.

30. **Pairing and encryption.** AES-GCM 256 key in a QR shown by the laptop, scanned by the phone; pairing stored both sides; unpair; list id and version in the payload so re-sends never duplicate.
    *Acceptance:* TR-01, TR-03, TR-10; NN-07.

31. **Send to laptop and fallbacks.** Progress and status line; automatic paste-code offer when the relay is unreachable; CSV/JSON always available.
    *Acceptance:* TR-04, TR-07, TR-08, TR-11.

32. **Extension scaffold in the approved mode.** MV3, `sidePanel` and `storage`, relay host permission; mode gate that refuses to build mode A without 9.3 approval; no content scripts in B/C.
    *Acceptance:* CX-00, CX-01, CX-02, CX-03.

33. **Side panel list UI.** Pairing QR, receive and decrypt, aisle groups, tick, note, progress, partial vs complete status, store name header, paste-code input, clear, unpair, footer disclaimer.
    *Acceptance:* CX-04, CX-08, CX-09.

34. **Mode-specific behaviour.** Mode B: "Find" opens the observed search URL with an editable cleaned term, copy fallback. Mode C: copy per item only. Mode A (only if approved): visible batching with per-batch confirmation, store check before each batch, Stop button, error surfacing, tiny-test fixture; never a checkout control.
    *Acceptance:* CX-05 to CX-07; NN-08.

35. **STOP — week 3 review.** Extension load instructions and the end-of-week-3 checklist to the owner.

---

## Week 4 — Prove it

36. **Full test pass and coverage table** mapping every HS-xx and NN-xx to a passing test, generated into `docs/COVERAGE.md`.
    *Acceptance:* no rule unmapped.

37. **One-handed, sunlight and accessibility pass.** 48 px targets, contrast AA, dark mode, text size setting, offline indicator visible on every screen.
    *Acceptance:* Lighthouse accessibility ≥ 95; manual outdoor check recorded.

38. **Create `docs/TRIAL_LOG.md`** template (shopping observations only; no health data).
    *Acceptance:* file exists with the privacy note at the top.

39. **STOP — before the field week.** Confirm the owner has Club+ access and a shopping day; remind them the extension never checks out.

40. **OWNER: Field week.** Plan, shop with the side panel at Pāpāmoa, train, log; fill in `TRIAL_LOG.md`.
    *Acceptance:* log complete; no personal health data in it.

41. **Triage and fix.** Dispositions for each finding; correct pack sizes and aisles; fix the fix-now items.
    *Acceptance:* each finding dispositioned; CI green.

42. **Health copy review.** Owner reads every string in `health.ts` against `HEALTH_SAFETY.md`; model locates and links the Heart Foundation NZ page, current CDC page, SunSmart and the 2020 Eating and Activity Guidelines PDF, replacing secondary sources where found.
    *Acceptance:* no secondary-source note remains where a primary page was found; scans pass.

43. **Handover notes** in `README.md`: update, re-pair, back up, restore, delete all, reload extension after Chrome updates, redeploy the relay.
    *Acceptance:* owner follows them on a fresh browser profile.

44. **Go/no-go notes** in `DECISIONS.md` for deferred items (reminders, Health Connect, mode A if not chosen). Build nothing.
    *Acceptance:* recorded.

45. **STOP — MVP acceptance.** Walk the owner through `PLAN.md` section 9.

---

## Items explicitly not on this list
Automatic checkout or orders, retailer credential or session handling, scraping, live price capture, blood-alcohol estimates, taper generation, extended-fast coaching, cloud sync of health data, AI calls at runtime, iOS, copying any third-party extension. Any of these later starts with a new feasibility note, not with code.
