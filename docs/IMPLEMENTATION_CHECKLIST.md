# Implementation Checklist for Opus 5.5

Numbered, in build order. Each item has a plain-language purpose, what to build, and an acceptance test (IDs refer to `TEST_PLAN.md`). Items marked **STOP** end with a message to the owner and wait. Items marked **OWNER** are for the owner, not the model. Do not start any item below a STOP until the owner has replied.

Conventions for the implementing model:
- Read `PLAN.md`, `HEALTH_SAFETY.md`, `INTEGRATION_FEASIBILITY.md` and `TEST_PLAN.md` before item 1.
- All user-facing health text lives in `packages/shared/src/copy/health.ts` so it can be scanned and reviewed in one place.
- Commit after each item with the item number in the message. Push to the designated branch.
- Never add a dependency that phones home. Bundle fonts and icons.
- Never write code that touches paknsave.co.nz pages, cookies or network beyond opening a URL in a new tab.

---

## Week 0 — Reconcile and verify (owner and model)

1. **OWNER: Provide the handoff document.** The repo is public, so paste it into the chat rather than committing it if it holds personal details. Commit only a de-personalised copy to `docs/handoff/` if you want one in the repo.
   *Acceptance:* model has read it; nothing personal is in git history.

2. **Reconcile assumptions.** Compare `PLAN.md` section 3 (A1–A10) with the handoff. Update the plan, the garden list fixture and the readiness defaults. List every change in `docs/CHANGELOG.md`.
   *Acceptance:* no row in section 3 still reads "ASSUMPTION" without an owner decision beside it.

3. **OWNER: Answer Q1–Q3** in `PLAN.md` section 10 (relay hosting, repo visibility, handoff). Defaults apply if unanswered after the week-0 STOP.

4. **Create `docs/DECISIONS.md`** recording the final answers to Q1–Q3 and any changed defaults.
   *Acceptance:* file exists; each decision has a one-line reason.

5. **STOP — confirm scope.** Message the owner with the reconciled assumptions and decisions. Proceed only on approval.

---

## Week 1 — Foundations

6. **OWNER: Read PAK'nSAVE Website Terms** and paste the clauses on automated access, reproduction and third-party tools into `INTEGRATION_FEASIBILITY.md` section 3.3.
   *Acceptance:* the "not verified" rows are updated to verified or "no such clause".

7. **OWNER: Read PAK'nSAVE Online Shopping Terms** and paste clauses on third-party tools, account use and prices. While logged in normally, search for "avocado" and copy the address-bar URL into `apps/extension/README.md` under "Observed search URL" with the date.
   *Acceptance:* clauses recorded; URL recorded or "no stable URL" recorded.

8. **OWNER or model: Read foodcomposition.co.nz terms clause 4** and record the NZ-vs-USDA data decision in `docs/DECISIONS.md`.
   *Acceptance:* decision recorded with the clause quoted.

9. **Repository scaffold.** pnpm workspace with `apps/pwa`, `apps/extension`, `packages/shared`, `packages/data`, `services/relay`. TypeScript strict. ESLint, Prettier, Vitest, Playwright configured. GitHub Actions workflow runs lint, unit tests and static scans on every push.
   *Acceptance:* `pnpm test` and `pnpm lint` pass on an empty project; CI green.

10. **PWA shell.** Vite + React app with manifest (name, short name, 192/512 icons, standalone display, start URL, theme colours), Workbox service worker with precache and offline fallback, install prompt handling, update banner.
    *Acceptance:* PWA-01, PWA-05 pass on the test deployment.

11. **Hosting.** Deploy to GitHub Pages or Cloudflare Pages per `DECISIONS.md`; HTTPS URL recorded in `README.md`.
    *Acceptance:* owner can open the URL on the phone; PWA-02 passes manually.

12. **Local database.** Dexie schema: profile, readiness answers, weights, fasts, meals (planned), recipes (user-added), inventory (garden/pantry), grocery lists, exercise sessions, drinks, settings. Versioned migrations from day one. Request persistent storage.
    *Acceptance:* unit tests for each table's create/read/update/delete; PWA-06.

13. **Backup export/import** with optional AES-GCM password encryption; weekly nag.
    *Acceptance:* BK-01, BK-02, BK-03; HS-15.

14. **Profile and readiness screens** implementing `HEALTH_SAFETY.md` section 1, with the gate logic as a pure function in `packages/shared`.
    *Acceptance:* RD-01 to RD-06; HS-03.

15. **Weight log and trend** with 7-day average, goal rules and rapid-loss card.
    *Acceptance:* WT-01 to WT-05; HS-01, HS-11.

16. **Fasting timer and history** with presets, 24-hour ceiling behaviour, stop-signs text, restart-safe timer.
    *Acceptance:* FS-01 to FS-05; HS-02.

17. **About screen** with the "not a medical device" statement, emergency numbers, data attribution placeholder, version number.
    *Acceptance:* HS-13 (About portion).

18. **Static scans in CI**: banned health phrases (HS-07, HS-08) and price/stock/cart strings (HS-16) across both apps.
    *Acceptance:* scans run in CI; seeded violation fails the build; removed violation passes.

19. **STOP — week 1 review.** Send the owner the install URL and the end-of-week-1 manual checklist from `TEST_PLAN.md` section 4.

---

## Week 2 — Food

20. **Ingredient dataset.** About 150 items as JSON in `packages/data/ingredients.json`: name, aliases, aisle, buyable unit and pack sizes common at PAK'nSAVE (owner to correct during trial), nutrients per 100 g (energy kJ, protein, total fat, saturated fat, carbohydrate, sugars, fibre, sodium), source tag and citation. Garden items flagged with season months for Bay of Plenty.
    *Acceptance:* NU-01; validation script passes; attribution text matches the chosen source's requirements.

21. **Garden and pantry inventory screens.** "In the garden now" toggles by item, pantry quantities, quick add.
    *Acceptance:* GL-02 fixture passes; data persists offline (PWA-04).

22. **Recipe dataset.** About 30 recipes in `packages/data/recipes.json` with ingredients, method, serves, time, tags (garden items used, meal type), computed nutrition per serve, heart-smart badge rule from `HEALTH_SAFETY.md` section 4. Favour olive oil, avocado, fish, chicken, eggs within six per week, garden greens; flag butter/cream/processed meats.
    *Acceptance:* NU-02, NU-03, NU-04.

23. **Recipe library screen** with filters (garden-first, net carbs, saturated fat, time) and recipe detail view.
    *Acceptance:* NU-07 ranking test; snapshot of detail view with nutrition footer (NU-09).

24. **Targets engine.** Mifflin-St Jeor energy estimate from profile, net-carb ceiling (default 30 g, range 20–50), saturated-fat budget (about 10% of energy), protein and fibre guides, 5,000 kJ floor.
    *Acceptance:* unit tests on fixtures; HS-09, HS-10.

25. **Day/week planner.** Assign recipes to meals, see daily bars for net carbs and saturated fat, cholesterol check-in cards at start/8/12 weeks, electrolyte reminder for first two weeks, optional auto-fill respecting the floor.
    *Acceptance:* NU-05, NU-06, NU-08.

26. **Grocery list builder.** Aggregate planned recipes, subtract inventory, convert to buyable units, group by aisle, allow manual edits, copy as text.
    *Acceptance:* GL-01 to GL-06.

27. **Week 2 regression.** Full unit and Playwright run; owner tries planning a week.
    *Acceptance:* CI green; owner feedback captured in `docs/CHANGELOG.md`.

---

## Week 3 — Body, drinks, hand-off

28. **Exercise dataset.** About 25 movements with easier/harder variants, cues, and tags; three sessions (sand circuit, mobility/core, walk-wade recovery); weekly template with two rest days.
    *Acceptance:* EX-01, EX-05.

29. **Exercise screens.** Session view with warm-up, stop rules before start, beach prompts when tagged beach, logger, history, progression suggestion capped at ~10%.
    *Acceptance:* EX-02, EX-03, EX-04; HS-12.

30. **Alcohol maths and guidance** in `packages/shared`: standard-drink formula, NZ serve presets, guidance thresholds by sex, alcohol-free-day count, card trigger logic.
    *Acceptance:* AL-01 to AL-10; HS-04, HS-05, HS-06.

31. **Alcohol screens.** Drink picker, custom entry, label-value entry, daily/weekly view against guidance, next-day note with the withdrawal-symptom tick box, "talk to someone" card, helpline numbers.
    *Acceptance:* AL-11, AL-12; HS-07, HS-08, HS-13.

32. **Relay service** (`services/relay`, Cloudflare Worker + KV, or skipped if the owner chose no relay): POST ciphertext to a room, GET once then delete, 15-minute expiry, 64 KB cap, basic rate limit, no logging of bodies.
    *Acceptance:* TR-02, TR-05, TR-06, TR-09 against a test deployment.

33. **Pairing and encryption** in `packages/shared`: generate AES-GCM 256 key, encode pairing payload (relay URL, room id, key) into a QR; phone scans with the camera (BarcodeDetector where available, fallback library bundled); store pairing on both sides; unpair.
    *Acceptance:* TR-01, TR-03, TR-10.

34. **"Send to laptop" on the phone** with progress, success, and automatic paste-fallback offer when the relay is unreachable; "Copy list as text" always available.
    *Acceptance:* TR-04, TR-07, TR-08, TR-11.

35. **Chrome extension scaffold.** MV3 manifest with `sidePanel` and `storage` permissions, host permission for the relay origin only, action click opens the panel (`setPanelBehavior`), no content scripts.
    *Acceptance:* CX-01, CX-02, CX-03.

36. **Side panel list UI.** Pairing QR, receive and decrypt, aisle groups, tick, note, progress bar, clear, paste-code input, footer disclaimer.
    *Acceptance:* CX-04, CX-08, CX-09.

37. **"Find at PAK'nSAVE" button** using the observed search URL from item 7 with a cleaned, editable search term; copy-to-clipboard fallback when no URL is recorded.
    *Acceptance:* CX-05, CX-06, CX-07.

38. **STOP — week 3 review.** Send the owner the extension load instructions and the end-of-week-3 manual checklist.

---

## Week 4 — Prove it

39. **Full test pass** and coverage table mapping every HS-xx rule to a passing test, generated into `docs/COVERAGE.md` by CI.
    *Acceptance:* table complete; no HS rule unmapped.

40. **Accessibility and sunlight pass.** Minimum 48 px touch targets, contrast AA, dark mode, large-text setting respected.
    *Acceptance:* Lighthouse accessibility ≥ 95; manual outdoor check recorded.

41. **Create `docs/TRIAL_LOG.md`** template from `TEST_PLAN.md` section 4.
    *Acceptance:* file exists.

42. **STOP — before the field trial.** Confirm the owner has Club+ access and a shopping day planned; remind them the extension never adds to cart.

43. **OWNER: Field trial** at PAK'nSAVE Pāpāmoa; fill in `TRIAL_LOG.md`. Keep the log to shopping observations (items found, search terms, timing); no health data, since the repo is public.
    *Acceptance:* log complete; contains no personal health information.

44. **Triage trial findings** into fix-now (this week) and later (`PLAN.md` "Later" list); fix the fix-now items; correct pack sizes and aisles in the ingredient data.
    *Acceptance:* each finding has a disposition; CI green after fixes.

45. **Health copy review.** Owner reads every string in `health.ts` against `HEALTH_SAFETY.md`; model locates and links the Heart Foundation NZ, SunSmart and 2020 Eating and Activity Guidelines pages, replacing secondary sources where found.
    *Acceptance:* no secondary-source note remains where a primary page was found; scans pass.

46. **Handover notes** in `README.md`: how to update the app, re-pair, back up, restore, load the extension after a Chrome update, rotate the relay.
    *Acceptance:* owner follows the notes on a fresh browser profile successfully.

47. **Go/no-go for Tier 2 cart awareness.** Write a one-page recommendation in `docs/DECISIONS.md` based on the terms recorded in items 6–7 and the trial experience. Build nothing.
    *Acceptance:* recommendation recorded; no code touching paknsave.co.nz pages exists in the repo.

48. **STOP — MVP acceptance.** Walk the owner through `PLAN.md` section 9. MVP is done when every point is met.

---

## Items explicitly not on this list
Automated add-to-cart, credential handling, scraping, price capture, blood-alcohol estimates, taper plans, extended-fast coaching, cloud sync of health data, iOS. If any of these is requested later, it starts with a new feasibility note, not with code.
