# Requirements (de-personalised from the owner's handoff)

This is the owner's master requirements document restated without personal health details, so it can live in a public repository. It is complete for implementation purposes: everything the implementer needs is here or in the companion documents. The owner's own numbers (height, weight, lipid results, drinking pattern) are entered by the owner inside the app and never belong in this repository.

**Workflow:** Fable 5.1 planned and designed (done, approved 19 October 2026). Opus 5.5 implements, tests and refines following `IMPLEMENTATION_CHECKLIST.md`.

## 1. Outcome and non-negotiables

Build a polished, fast personal health, nutrition, strength-training and grocery-planning app, primarily for Android, with a small laptop Chrome extension that helps transfer a validated shopping list toward the owner's own PAK'nSAVE online cart. The owner reviews the cart, chooses replacements and personally checks out.

A private, practical tool for one person, not a social fitness app. Very little daily typing. Optional household-size scaling for shared dinners and grocery quantities.

**Hard requirement:** the grocery bridge is unproven. Prototype and assess it before depending on it (Phase 0 in `INTEGRATION_FEASIBILITY.md` section 9). Do not assume a public cart API exists, scrape in violation of terms, bypass authentication, reverse-engineer protected services, copy a third-party extension, store retailer credentials, or place orders automatically. If permitted one-click cart insertion cannot be achieved safely, ship an excellent assisted-shopping fallback, not a fake integration.

## 2. Owner situation, in product terms

- New Zealand; shops mainly at PAK'nSAVE Pāpāmoa, 42 Domain Road. Club+ is required by PAK'nSAVE for online shopping. Store is changeable.
- Has a long-term weight goal well below current weight, entered in-app. Wants a strong start and noticeable progress in about four weeks. The app must never claim or target a number of kilograms of fat loss in a number of days; a previous very-low-carb attempt produced a large early drop with a substantial water component, so the app distinguishes early glycogen and water loss from fat loss and avoids extreme prescriptions. (Approved design: Kickstart and Steady phases, `HEALTH_SAFETY.md` section 2.)
- Physically demanding trade job with a high daily step count on work days. Do not treat as sedentary; do not prescribe extra long daily runs.
- Prefers keto or very-low-carb eating. Has used roughly 16:8 fasting for years; now wants one dinner plus an optional 5 pm snack, and 23:1 during the three-week Kickstart. A 5–7 pm window is 22:2, not 20:4. Provide adjustable windows (16:8, 18:6, 20:4, 22:2, 23:1, custom). Never insist on a fast when energy or protein is inadequate.
- A previous mildly raised cholesterol reading with no breakdown known. Default menu is cholesterol-conscious low-carb: olive oil, avocado, fish, poultry, lean meat, nuts, fibre-rich non-starchy plants; limit bacon, sausages, butter, cream and other high saturated-fat staples. Remind the owner to obtain actual lipid values and discuss monitoring with a GP.
- History of reflux. Very large late dinners may aggravate it: permit an earlier window, a split main meal, and symptom logging.
- Home garden; silverbeet is definitely available. Owner adds other crops and quantities; planned harvest is subtracted from grocery needs.
- Exercise: home bodyweight, bands or dumbbells if available (toggles), beach walks, optional progressive beach jogging. No gym. Sessions easy to modify or skip for pain, exhaustion or injury.
- Alcohol: a regular pattern above NZ low-risk guidance, including heavier weekend evenings, switching to zero-sugar premixed cans. Default beverage preset 330 mL, 5%, 94 kcal from the label, about 1.3 NZ standard drinks. There is meaningful potential for dependence and withdrawal, so a GP or clinician must advise before any major sudden reduction. The app records alcohol and clinician-approved goals; it never calculates a personal "safe allowance" from leftover calories. Public lower-risk guidance is shown as context, never as a promise of safety.
- The owner does not read code. Explain progress, decisions and test outcomes in plain English.

## 3. Core modules

### A. Today / home dashboard
Weight now, goal and rolling trend (no celebration of dangerous speed, no punishment of water rebounds). Fast start/end, optional 5 pm snack and dinner times, time-aware. Calories, protein, fibre and optional net carbs from transparent food entries with source and confidence shown. Water and optional electrolytes. Steps (manual first; Health Connect only later, with consent, if feasible). Today's strength, walk, run or rest, with exertion, soreness and energy ratings. Alcohol cans, standard drinks and kcal today and this week, displayed neutrally; no gamification rewarding unsafe abstinence or aggressive tapering. Quick actions: log weight, finish meal, swap recipe, complete workout, add harvest, add drink, open grocery list.

### B. Meal planning
Seven-day rotating plan honouring the fasting window, shopping budget note, servings, dislikes and allergies. Default cholesterol-conscious low-carb, keto-preferred; switchable to moderate low-carb or balanced without losing data. Optional 5 pm protein-rich snack plus dinner; no "one meal at all costs" enforcement. Protein target initially about 120–140 g/day, subject to review and clinician or dietitian input; realistic amounts; energy for an active job; vegetables, fibre and micronutrients. Fasting does not eliminate nutritional needs. Distinguish verified label macros, reputable composition references and estimated recipe values; label estimates clearly. Track raw vs cooked weights, per portion, per 100 g, units and package sizes. Recipes using silverbeet, leafy vegetables, affordable NZ proteins and seasonal produce; substitutions and leftover reuse; weekly variety and budget. Household dinner option computing the owner's portion independently of total servings. Food safety, allergy and gluten-free household substitutions are optional settings, never guessed defaults. Track 7- or 14-day weight average, adherence, energy and training performance; suggest review rather than ratcheting restriction from one weigh-in.

### C. Home fitness and beach exercise
Start without a gym: 2–3 full-body resistance sessions a week of about 20–35 minutes, rest days, gradual progression (supported squats or sit-to-stands, push-ups against bench or wall, band rows, step-ups, light hinge only if pain-free, core stability). No compulsory running on top of a high-step job; beach walking optional; beach jogging only as a progressive opt-in if tolerated. Check injury, back or leg symptoms, fatigue, sleep, heat exposure and hydration before increasing load. Do not diagnose injury or promise medical safety. Track sets, reps, effort and progression; optional demonstrations. Rest and recovery count as success.

### D. Garden inventory
Crop, amount available, harvest-ready, perishability, optional photo. Prioritise silverbeet in the first week's recipes. Deduct garden quantities from the shopping list and report saved purchases as estimates only unless prices are known. Never claim exact homegrown weights until entered.

### E. Alcohol tracking and safer-reduction support
User-addable beverages with volume, ABV and kcal from the label. Standard drinks = mL × ABV (decimal) × 0.789 ÷ 10 (equivalently mL × ABV% × 0.789 ÷ 1000); 330 mL at 5% is about 1.30. Daily and weekly totals, rolling trends, optional user- or clinician-entered milestones. No aggressive numeric taper schedule; no automatic counselling to stop abruptly. Context: NZ guidance for men is no more than three standard drinks a day, 15 a week and at least two alcohol-free days (women two, ten), and no alcohol use is risk-free; general guidance is distinguished from tailored medical advice. Strong onboarding alert before any abrupt stop or reduction of heavy habitual drinking: speak to a GP or clinician; seek urgent care for seizures, confusion or hallucinations. Protection must come before a reduction, not only after. Never convert remaining calorie budget into permission to drink; no "you earned alcohol" experience.

### F. NZ grocery list and retailer hand-off
Aggregate recipe ingredients by precise units and portions, merge duplicates, account for pantry and garden, convert to sensible package counts, show substitutes. Default store PAK'nSAVE Pāpāmoa, changeable. Prices, stock, promotions and pack sizes only from verifiable current store data when the access method is permitted and available; otherwise "price unknown" or manually entered estimates with timestamps. Export via copy text, CSV and JSON. Share between Android and laptop via opt-in secure transfer or manual import/export; no mandatory server account. Desktop Chrome extension, Manifest V3, least-privilege permissions: select a pending list, show an item matcher, handle unavailable items, batch visibly with progress, review before any cart modification. The extension must never checkout, submit payment, handle payment methods, persist retailer username, password or session tokens, defeat anti-bot or security controls, or hide errors. Do not assume automatic cart transfer is permitted; examine current terms and permitted surface, or obtain written permission; build a small user-initiated proof of concept only if compliant. Fallback: a guided companion side panel opening one item search at a time for manual addition, with clear partial vs complete status and no misleading integration claims. Checkout and Click & Collect are always completed on PAK'nSAVE by the owner.

## 4. Platform and architecture
Progressive Web App installable on Android from Chrome, not a native app. TypeScript, React, Vite, a clean mobile design system, IndexedDB offline storage, service worker caching, responsive desktop view. Chrome MV3 extension in the same monorepo. Shared typed schemas and calculation logic in a common package. Layout: `apps/mobile-web`, `apps/cart-extension`, `packages/core`, `packages/ui`, `packages/grocery`, `packages/test-fixtures`, `services/relay`, `docs/`.

Security and privacy: local-first personal data; explicit opt-in for encrypted transfer between phone and laptop (decided: blind Cloudflare Worker relay, no account; Supabase rejected, see `DECISIONS.md`). Export and delete functions; basic privacy transparency. Never upload health logs or PAK'nSAVE content to an AI service without specific informed opt-in. No secrets in the client repo, app code or prompts. Narrow extension permissions. The plan engine is deterministic with a seeded recipe dataset and works offline; no external LLM at runtime.

## 5. Phase 0: prove the grocery workflow first
Timeboxed spike before full extension implementation. Details and recording tables are in `INTEGRATION_FEASIBILITY.md` section 9. Outcome is a recorded owner decision: A authorised user-initiated cart insertion, B guided search plus manual addition, or C exported list only. The prior existence of a third-party "push to cart" extension is evidence of a claimed approach, not proof of permission or reliability.

## 6. Milestones and acceptance
1. Design: done and approved.
2. Working offline PWA: installs to Android home screen; edit profile, eating schedule and garden; preloaded editable seven-day menus and workouts; log weights, fasting, food and alcohol; NZ measurements; usable offline.
3. Nutrition and grocery quality: verified formulas; tested macros and standard drinks; adjustable portions and garden deductions; reusable grocery list, pantry and CSV/JSON export; store name visible; no fabricated live price or stock.
4. Browser extension: only once the Phase 0 choice is approved; imports or syncs a list; safe guided workflow or permitted push-to-cart; handles failure; leaves checkout to the owner.
5. Polish and field testing: one-handed Android use, fast loading, readable in sunlight, obvious offline state, no fake data; a complete grocery week end to end with the owner.

Non-negotiable test cases are NN-01 to NN-09 in `TEST_PLAN.md` section 3.12.

## 7. Source references to verify during implementation
PAK'nSAVE online shopping and Pāpāmoa store pages; PAK'nSAVE online shopping terms; the third-party push-to-cart extension listing (observe, never copy); Health NZ drinking responsibly; NZ Heart Foundation on diets; NICE alcohol withdrawal guidance (CG100, CG115); CDC gradual weight loss. Links are in `HEALTH_SAFETY.md` and `INTEGRATION_FEASIBILITY.md`.

## 8. Definition of success
The owner can plan a week of meals that use the garden, log a realistic workout and nutrition day on Android, see alcohol consumed in NZ standard drinks, and take a correct, reviewable PAK'nSAVE shopping list to the laptop; the extension assists the store workflow only to the extent that is technically reliable and permitted.
