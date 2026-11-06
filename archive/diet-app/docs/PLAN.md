# 4-Week MVP Plan — Personal Fitness, Fasting, Keto-Aware Meals and Grocery App

**Status:** Approved by the owner on 19 October 2026. Milestone 1 complete. Implementation starts at `IMPLEMENTATION_CHECKLIST.md` item 1.
**Date:** 19 October 2026 (NZ)
**Audience:** You (the owner, non-coder) first; the implementing model (Opus 5.5) second.
**Companion documents:** `INTEGRATION_FEASIBILITY.md`, `HEALTH_SAFETY.md`, `TEST_PLAN.md`, `UX_SCREENS.md`, `DATA_MODEL.md`, `DECISIONS.md`, `IMPLEMENTATION_CHECKLIST.md`.

---

## 0. Read this first

**The handoff document has been read in full and this plan now follows it.** It is deliberately **not** committed to this repository, because the repository is public and the handoff contains personal health details. The implementing model receives it directly from you at the start of each session (checklist item 1). Where this plan needs a default that comes from your situation, it states the product default without attributing numbers to you. If you would rather the docs speak plainly, make the repo private and say so; the plan does not change.

**Everything you asked in the handoff's "first approval questions" now has an answer:**

| Question | Answer |
|---|---|
| Strictly personal use? | Yes. One health user; optional household scaling for dinners and grocery quantities. |
| Desktop is Chrome; store is PAK'nSAVE Pāpāmoa? | Yes to both. Store is changeable in settings. |
| Home weights, bands or bodyweight only? | **Default: bodyweight.** Settings has "I have bands" and "I have dumbbells" toggles that unlock variants. No decision needed now. |
| Garden crops beyond silverbeet? | Silverbeet is pre-loaded as available. Everything else is entered by you in the inventory screen. |
| Lipid panel and alcohol guidance from a clinician | Built in as standing reminders; the app never presents itself as medical clearance. |

The only thing left is your approval (section 11).

---

## 1. What we are building, in one paragraph

A private, fast app you install on your Android phone from Chrome (a "PWA", a web app that behaves like an installed app and works offline). It gives you a Today screen that needs almost no typing; a seven-day cholesterol-conscious low-carb meal plan built around your garden (silverbeet first) and affordable NZ proteins; adjustable eating windows including your 5 pm snack plus dinner routine; a weight trend that expects a strong first three weeks and tells the difference between early water loss and fat loss; two to three short strength sessions a week that respect a physically demanding job with a high daily step count; honest alcohol logging in NZ standard drinks with a safety-first onboarding; and a grocery list that subtracts what the garden provides. The list, and only the list, can travel securely to your laptop, where a Chrome side-panel extension helps you shop on paknsave.co.nz. You always review the cart, choose replacements and check out yourself.

**What "MVP" means here:** by the end of week 4 you can run a full real week with it. It will not yet be polished, and whether it can place items into your PAK'nSAVE cart is decided by the Phase 0 feasibility spike (section 6), not assumed.

---

## 2. Guiding principles

1. **Health data stays on the device.** No account is needed to meal-plan or log. Export and delete are one tap. Nothing is sent to any AI service.
2. **Safety rules are built in, not bolted on.** The app never produces an alcohol taper, never converts leftover calories into permission to drink, never insists on a fast when protein or energy is short, never promises dramatic fat loss, and always shows where to get real help. Specified in `HEALTH_SAFETY.md`, tested in `TEST_PLAN.md`.
3. **Honesty about what is unverified.** No invented prices, stock, or "added to cart" messages. Unknown is shown as unknown. Estimated nutrition is labelled estimated.
4. **Offline first, deterministic.** Everything except the laptop hand-off works in flight mode. The plan engine is ordinary arithmetic over a seeded recipe set; no AI at runtime.
5. **Very little daily typing.** Quick actions on the Today screen do the common things in one or two taps.
6. **Boring, well-trodden technology.** Four weeks does not allow novelty.
7. **Respect third parties' terms.** No credential handling, no reverse engineering, no scraping, no anti-bot bypass, no automatic orders.

---

## 3. Requirements reconciled with the handoff

The earlier assumptions (A1–A10) have been replaced by the handoff's requirements. The table records what changed.

| Area | Earlier assumption | Now, per handoff |
|---|---|---|
| Garden | Long placeholder crop list | Silverbeet seeded as available; all other crops entered by you with amount, harvest-ready flag, perishability, optional photo |
| Health context | Generic adult | Specifics held privately. Product defaults: cholesterol check-in on from day one; reflux-aware options on; alcohol safety onboarding mandatory on first run; activity level defaults to "physically active job" |
| Fasting | 16:8 default, presets to 18:6 | Presets 16:8, 18:6, 20:4, **22:2 (5 pm snack + dinner)**, **23:1 (one meal)** and custom clock times. **Owner decision: 23:1 for the three-week Kickstart.** Window length is computed from clock times. The planner checks daily that the single meal can carry the protein target and energy floor; if not, the 5 pm snack is offered with no penalty. Fast never enforced when protein or energy is short |
| Keto targets | Net carbs 30 g, saturated fat ~10% | Same, plus **protein 120–140 g/day default**, energy estimate for an active job, fibre and micronutrient guides. Switchable diet modes: keto-preferred, moderate low-carb, balanced |
| Exercise | Beach-only bodyweight | 2–3 full-body sessions a week, 20–35 minutes, bodyweight with optional bands/dumbbells; beach walking optional; jogging only as an opt-in progression; no compulsory running; pre-session check for pain, fatigue, sleep, heat, hydration |
| Weight | Trend plus rapid-loss flag | **Owner decision: weight loss should be high to start.** A three-week Kickstart phase expects a fast drop, shows a front-loaded "typical range, not a promise" band, runs a stronger deficit with protein protected, and never shows a rapid-loss warning. From week 4, Steady pace guidance applies. Long-term goal shown separately; no celebration of speed, no punishment of water rebounds; still no "kilograms by a date" claims |
| Alcohol | Standard drinks and guidance | Also: kcal per drink from the label (preset 330 mL, 5%, 94 kcal); cans, standard drinks and kcal per day/week; **clinician- or user-entered milestones allowed, app generates none**; no calories-to-drinks conversion; urgent-care prompts for seizures, confusion, hallucinations |
| Food logging | Recipes only | Food log with source and confidence labels: verified label, reference database, estimated recipe. Raw vs cooked weights, per 100 g and per portion, package sizes |
| Household | Single user | Household dinner scaling: your portion and macros are calculated independently of the total servings |
| Allergies | Not covered | Dislikes and allergens are settings; allergens persist when a recipe is edited; gluten-free substitutions optional, never assumed |
| Grocery | Copy as text | Copy text, **CSV and JSON export**; substitutes; store name always visible; prices "unknown" unless you type one (timestamped); garden deduction with audit trail and estimated savings only when prices are known |
| Extension | Guided manual add assumed | **Phase 0 feasibility spike decides A/B/C** (section 6) before the extension is built. Hard rules: never checkout, never handle payment, never store retailer credentials or session tokens, never defeat security controls, never hide errors |
| Sync | Encrypted relay | Confirmed: opt-in, end-to-end encrypted, no account. Supabase considered and rejected for the MVP (section 4) |
| Repo layout | My names | Handoff names adopted: `apps/mobile-web`, `apps/cart-extension`, `packages/core`, `packages/ui`, `packages/grocery`, `packages/test-fixtures`, plus `services/relay` |

---

## 4. Architecture in plain language

```
 PHONE (Android, Chrome)                     LAPTOP (Chrome)
 +------------------------------+            +------------------------------+
 | Installed web app (PWA)      |            | Chrome extension, side panel |
 |  Today dashboard             |            |  pending list, item matcher  |
 |  Meal plan, food log         |  grocery   |  guided search per item, or  |
 |  Garden & pantry             |  list only,|  permitted push-to-cart if   |
 |  Weight / fasting / water    |  encrypted |  Phase 0 says A              |
 |  Strength & walks            | =========> |  You review, you check out   |
 |  Alcohol log                 |     |      +------------------------------+
 |  Grocery list + exports      |     |
 |  All health data lives here. |     v
 +------------------------------+  +---------------------------+
                                   | Cloudflare Worker relay   |
                                   | holds only encrypted blobs|
                                   | for 15 min; cannot read   |
                                   +---------------------------+
```

**Phone app.** Vite + React + TypeScript with a small mobile design system (`packages/ui`), IndexedDB via Dexie, Workbox service worker. Hosted on GitHub Pages from this public repo. Installable from Chrome; updates itself when reopened online.

**Shared logic.** `packages/core` holds the typed schemas and every health-sensitive formula (standard drinks, net carbs, energy and protein targets, eating-window length, weight trend) behind unit tests. `packages/grocery` holds list aggregation, unit conversion, garden deduction, product-name normalisation and import/export.

**Laptop extension.** Chrome Manifest V3 side panel. Permissions: `sidePanel`, `storage`, and the relay origin. In mode B (guided) it has **no** access to paknsave.co.nz pages. In mode A (permitted push-to-cart) it would need a host permission for paknsave.co.nz only, and only if Phase 0 and the terms allow it.

**Relay.** Decided: Cloudflare Worker + KV on the free tier under your account. The phone encrypts the list with a key shared once by scanning a QR code on the laptop; the relay stores ciphertext for 15 minutes, hands it over once, and deletes it. It cannot read the list. If the relay is down, the phone offers the list as a paste code or a CSV/JSON file.

**Why not Supabase or any account-based sync?** The handoff allows it only if needed. It is not: the only cross-device data is the grocery list, which the blind relay handles with no account, no row-level security to maintain, and no monthly cost. Threat model and trade-offs are in `DECISIONS.md`.

**Why a PWA, not native Android?** Installs from the browser, no Play Store, one codebase, offline by design. Health Connect (steps) is the one feature a PWA cannot reach; steps are manual entry in the MVP and Health Connect is a later optional add-on via a thin wrapper if you want it.

---

## 5. Feature scope

### In the MVP (weeks 1–4)
**Today dashboard.** Weight now, goal and rolling trend; fast start/end with snack and dinner times, time-aware; energy, protein, fibre and optional net carbs so far with source and confidence; water and optional electrolytes; steps (manual); today's session or rest with exertion, soreness and energy rating; alcohol today and this week in cans, standard drinks and kcal, neutrally displayed. Quick actions: log weight, finish meal, swap recipe, complete workout, add harvest, add drink, open grocery list.

**Meal planning.** Seven-day rotating plan honouring your eating window, servings, budget note, dislikes and allergens. Diet modes keto-preferred (default), moderate low-carb, balanced; switching never deletes data. Optional 5 pm protein snack plus dinner. Protein target 120–140 g default, adjustable. Recipes using silverbeet and leafy greens, affordable NZ proteins and seasonal produce, with substitutions and leftover reuse. Household dinner option computing your portion separately. Nutrition labelled by source: verified label, reference database, estimated.

**Food log.** Quick-add from plan or recipe, custom items from a label (per 100 g or per serve), raw vs cooked weight toggle, confidence badge.

**Weight and fasting.** Weight log, 7- and 14-day averages, long-term goal, Kickstart phase (weeks 1–3) with a front-loaded expectation band and no rapid-loss warnings, Steady phase from week 4 with pace guidance and the rapid-loss check-in. Fasting timer with presets and custom clock times; window length computed correctly; symptoms log for reflux; "widen the window" prompt when protein or energy is short.

**Strength and beach activity.** Library of bodyweight movements with band and dumbbell variants, three 20–35-minute sessions, weekly template with rest days, pre-session check, progression capped at about 10% a week, beach walk and optional jog progression with beach safety prompts, rest counted as success.

**Garden inventory.** Crop, amount, harvest-ready, perishability, optional photo (stored on device). Deduction from the grocery list with an audit line ("silverbeet 300 g from garden, 21 Oct"). Estimated savings only when you have entered a price.

**Alcohol.** Beverage presets you can edit (volume, ABV, kcal from label; default 330 mL, 5%, 94 kcal, about 1.30 standard drinks). Daily and weekly cans, standard drinks and kcal; rolling trend; optional clinician- or self-entered milestones; NZ guidance shown as context with "no alcohol use is risk-free"; mandatory first-run safety notice; urgent-care prompts. No taper generation, no calorie-to-alcohol conversion, no rewards.

**Grocery list.** Aggregate by exact units and portions, merge duplicates, subtract pantry and garden, convert to sensible pack counts, show substitutes, store name visible, price unknown unless entered. Export: copy text, CSV, JSON. Send to laptop (encrypted) or paste code.

**Chrome extension.** Mode decided by Phase 0: A (permitted, user-initiated, visibly batched push-to-cart with review), B (guided search and manual add, one item at a time, partial vs complete status), or C (export only). Never checkout, payment, credentials, session tokens, or hidden errors.

**Testing.** Automated tests for every formula and safety rule; the handoff's nine non-negotiable test cases; a real shopping week with you.

### Later (after MVP, if wanted)
Reminders (fasting window, training); Health Connect steps; barcode scanning for pantry; price memory from receipts you type; recipe photos; household member list sharing; optional AI suggestions with explicit opt-in.

### Not planned
Automatic checkout or orders; any retailer credential handling; scraping prices or stock; blood-alcohol or driving estimates; alcohol taper generation; extended-fast coaching beyond 24 hours; cloud health-data sync; iOS; copying any third-party extension's code.

---

## 6. Week-by-week plan

The handoff's five milestones map onto four weeks. Milestone 1 (design) is this document set.

### Week 1 — Phase 0 spike and foundations (Milestone 2 begins)
**Phase 0 feasibility spike, timeboxed to one owner session of about two hours plus half a model day.** You, in your own browser and your own Club+ session, with no passwords typed anywhere near the model:
1. Walk through store selection, login and adding a single item to the cart on paknsave.co.nz for Pāpāmoa, as a normal customer. Note each screen in `docs/INTEGRATION_FEASIBILITY.md` section 9 (no screenshots containing personal data in the repo).
2. Read the Website Terms and the Online Shopping Terms; paste the clauses on automated access, third-party tools and reproduction into the feasibility document.
3. Record the search URL the site uses when you search for "avocado".
4. The model reviews the recorded facts and recommends A, B or C with reasons.
5. **STOP:** you approve the mode. Only B or C can be chosen without written permission from Foodstuffs or an official interface; A additionally requires a successful tiny test (eggs ×1, chicken pack size, silverbeet excluded as garden stock, yoghurt variant) with no purchase.

**Foundations, in parallel:** monorepo, installable PWA shell on GitHub Pages, database with migrations, backup export/import, profile and readiness screens, eating-window engine, weight log and trend, fasting timer, Today dashboard skeleton, About screen, static safety scans in CI.

**You can:** install it, set your eating window, log weight and a fast, see it work offline, and know which extension mode we are building.

### Week 2 — Food and garden (Milestone 2 completes, Milestone 3 begins)
Ingredient data with source tags; garden and pantry inventory; recipe set with silverbeet-first week; diet modes; targets engine with protein 120–140 g; seven-day planner with household scaling; food log with confidence badges; grocery list builder with garden deduction audit trail and CSV/JSON export; reflux options.

**You can:** plan a week that uses the garden, log a real food day, and export the list.

### Week 3 — Body, drinks, hand-off and extension (Milestones 3 and 4)
Strength library and sessions with pre-session check; beach activity with prompts; alcohol log with mandatory onboarding, presets, milestones and guidance; Cloudflare relay, QR pairing, encryption, "Send to laptop", paste fallback; Chrome extension in the mode approved in week 1.

**You can:** train from the app, log a weekend honestly, and see the list arrive on the laptop.

### Week 4 — Prove it (Milestone 5)
Full test pass including the nine non-negotiable cases; one-handed and sunlight checks; offline state indicator; the real grocery week end to end with you; fixes from the trial; handover notes; go/no-go on anything deferred.

**You can:** rely on it for a normal week.

### Schedule risk
Week 3 is heaviest. If it slips, paste/CSV hand-off ships first and QR pairing moves into week 4. The week 4 trial is never cut.

---

## 7. Decisions and defaults

| Decision | Default | Why | Change it if |
|---|---|---|---|
| App type | Installable PWA | Handoff recommendation; no store account; offline | You want Health Connect: add a thin wrapper later |
| Stack | Vite + React + TypeScript; Dexie; Workbox; small design system in `packages/ui` | Mainstream, fast, maintainable by any model | Never for the MVP |
| Hosting | GitHub Pages (repo public) | Free HTTPS | Repo goes private: Cloudflare Pages |
| Relay | **Cloudflare Worker + KV, free tier, your account** (decided) | Blind to content, no account for you to manage, no cost | n/a |
| Cross-device sync | Grocery list only, end-to-end encrypted, opt-in | Health data never leaves the phone | Household sharing later |
| Extension mode | Decided by Phase 0; B is the expected outcome | Terms and feasibility unverified until you look | Phase 0 shows A is permitted and reliable |
| Eating windows | Presets 16:8, 18:6, 20:4, 22:2, 23:1; custom clock times; length computed from times. Kickstart default 23:1 (owner's choice), with the 5 pm snack offered whenever one meal cannot carry the protein target | Handoff; owner decision; prevents the 20:4 vs 22:2 error | You change the preset any time |
| Fast enforcement | Never enforced when planned protein or energy is below target | Handoff | n/a |
| Protein | 120–140 g/day default, adjustable 80–200 | Handoff, pending clinician input | Clinician advises |
| Energy estimate | Mifflin-St Jeor × activity factor; default activity "physically active job"; shown as a rough guide | A physically demanding job is not sedentary | Profile change |
| Net carbs | 30 g default (20–50) in keto mode; wider in other modes | Common keto band | Mode switch |
| Saturated fat | About 10% of energy budget, shown as a bar | NZ guidance to limit saturated fat; handoff asks for cholesterol-conscious defaults | Clinician advises |
| Weight phases | Kickstart weeks 1–3: fast drop expected, no warnings, deficit up to 30% with protein at 140 g and net carbs at 20 g; Steady from week 4: 15–20% deficit, rapid-loss card only after 3 weeks over 1 kg/week | Owner wants a strong start; early loss on a carb ceiling is largely water and glycogen; CDC's gradual pace applies afterwards | You extend Kickstart (one week at a time, after a how-do-you-feel check) or a clinician advises |
| Standard drink | 10 g alcohol; mL × ABV × 0.789 ÷ 1000 | NZ definition | n/a |
| Alcohol kcal | From the label per beverage; preset 94 kcal for the default can | Handoff | You edit presets |
| Guidance shown | Men: ≤3/day, ≤15/week, ≥2 alcohol-free days; women: ≤2/day, ≤10/week; "no alcohol use is risk-free" | alcohol.org.nz, Health NZ | Guidance updates |
| Alcohol onboarding | Mandatory first-run notice about clinician advice before major reduction | Handoff: protection must come before any reduction, not after | n/a |
| Units | kg, cm, mL, kJ with kcal shown | NZ | n/a |
| Prices | "Unknown" unless typed, with timestamp | Handoff; no permitted live source | Permitted source appears |
| Testing | Vitest, Playwright, static scans, device checklists, field week | Mainstream | n/a |

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 0 finds terms forbid even deep-linking searches | Low | Low | Mode C plus copy-to-clipboard; the list is still excellent |
| Phase 0 tempts a mode-A build without permission | Medium | High | Hard gate: A requires written permission or official interface, plus the tiny test, plus your approval |
| Health copy drifts into medical advice or taper language | Medium | High | All health strings in one file; banned-phrase scans in CI; your copy review in week 4 |
| Eating-window arithmetic wrong | Low | Medium | Unit test on clock-time windows (5–7 pm = 2 h) |
| Nutrition data licence disallows app use | Medium | Low | USDA fallback decided in advance; label-entered values always allowed |
| Week 3 overload | Medium | Medium | Paste/CSV first; QR pairing can slide |
| Personal data leaks into public repo | Medium | High | Handoff kept out of git; fixtures are generic; `.gitignore` for backups; review before each push |
| Over-engineering | High | High | "Not planned" list is a contract |

---

## 9. Definition of done for the MVP

1. Installs on your Android phone from Chrome and passes Chrome's installability check.
2. In flight mode: edit profile, eating schedule and garden; see and edit the seven-day menu and workouts; log weight, fasting, food and alcohol; build and export a list.
3. Every rule in `HEALTH_SAFETY.md` section 8 and every non-negotiable test in `TEST_PLAN.md` section 3.12 passes automatically.
4. A 25-item list reaches the laptop within 30 seconds via the encrypted path, and via paste or file when the relay is unreachable.
5. The extension works in the mode approved after Phase 0; it cannot check out, change store silently, or hide an error; partial vs complete status is always visible.
6. No price, stock or cart status appears anywhere unless it came from you or a permitted source, and it is timestamped.
7. Backup export and import round-trip all data; stop/restart of a transfer never duplicates list items.
8. You complete one real grocery week end to end and the findings are triaged.

---

## 10. Open items

None that block approval. Minor defaults you can change any time: equipment toggles (bands, dumbbells), protein range, saturated-fat budget, which guidance figures are shown.

---

## 11. What happens after you approve

The implementing model follows `IMPLEMENTATION_CHECKLIST.md` in order, stopping at the STOP points: after the Phase 0 recommendation (mode A/B/C), after week 1 (app in your hands), after week 3 (extension in your hands), before the field week, and at acceptance. Each stop is a short plain-English message with what to try. No step touches PAK'nSAVE systems beyond what you do yourself in your own browser, unless Phase 0 and the terms permit otherwise.
