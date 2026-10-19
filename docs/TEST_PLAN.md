# Test Plan

**Purpose:** prove, before you rely on it, that the app works offline on your phone, that every health-safety rule holds, that the grocery list reaches the laptop securely, and that the extension helps without overstepping. Written in plain language; the implementing model turns each case into code or a checklist step.

---

## 1. Test levels

| Level | What it covers | Tool | Runs |
|---|---|---|---|
| **Unit** | Pure logic: standard-drink maths, net carbs, saturated-fat budget, BMI floor, fasting ceiling, list aggregation, encryption round trip | Vitest | Every commit |
| **Component** | Screens render the right thing for a given state (readiness gates, cards, badges) | Vitest + Testing Library | Every commit |
| **Browser end-to-end** | Real flows in headless Chrome: install criteria, offline use, backup, planner to list, pairing and transfer, extension side panel | Playwright (Chromium is pre-installed in the build environment) | Every commit on key flows; full suite nightly |
| **Static scans** | Banned-phrase checks for health copy; absence of price/stock/cart language; dependency licence check | Small scripts in CI | Every commit |
| **Device manual** | On your Android phone and laptop: install, sunlight readability, touch targets, real pairing, real shop | Checklists below | End of weeks 1, 3 and 4 |
| **Field trial** | One real Click & Collect or in-store shop at Pāpāmoa | `docs/TRIAL_LOG.md` template | Week 4 |

Target: every rule in `HEALTH_SAFETY.md` section 8 has at least one automated test; every checklist item in `IMPLEMENTATION_CHECKLIST.md` names its acceptance test.

---

## 2. Environments

- **Phone:** your Android device, Chrome stable (record version and Android version in `TRIAL_LOG.md`). Also tested in Chrome's Android emulation in Playwright for automation.
- **Laptop:** Chrome stable, version 116 or later (needed for `sidePanel.open()`); record version.
- **Relay:** a test deployment separate from the one you use, with a 2-minute expiry so expiry tests run quickly.
- **Data:** fixtures live in `packages/test-fixtures` (generic only); seeded app data lives in `packages/core/data`. No real health data is ever committed.

---

## 3. Test cases by area

### 3.1 Installability and offline (PWA)
| ID | Case | Expected |
|---|---|---|
| PWA-01 | Installability, checked by Chrome itself (replaces the Lighthouse PWA audit, which Lighthouse 12 removed; DOC_REVIEW C35). Runs on the production build in CI and on the deployed HTTPS URL once GitHub Pages is on | `Page.getInstallabilityErrors` (Chrome DevTools Protocol) returns an empty list once the service worker is ready; the manifest has name, short_name, id, start_url and scope under `/Diet/`, `display: standalone`, and 192 and 512 px icons plus a 512 px maskable one, each fetched with a 200 and the declared size; `navigator.serviceWorker.controller` is set after a reload (criteria per [web.dev install criteria](https://web.dev/articles/install-criteria)) |
| PWA-02 | Open app, wait for install prompt, tap "Install" (manual) | Icon on home screen; opens without browser chrome |
| PWA-03 | Flight mode, open installed app, visit every screen | All screens load; no network error dialogs |
| PWA-04 | Flight mode: log weight, start fast, log a drink, plan a day, build list | All saved; visible after relaunch |
| PWA-05 | Deploy a new version, reopen app online | "Update available" banner; reload applies it; data intact |
| PWA-06 | Storage persistence request | App asks for persistent storage once; records survive a week of normal use |

### 3.2 Backup
| ID | Case | Expected |
|---|---|---|
| BK-01 | Export with no password, wipe, import | Every record identical (HS-15) |
| BK-02 | Export with password, import with wrong password | Clear failure, nothing imported |
| BK-03 | Weekly backup nag | Appears after 7 days without export; dismissible |

### 3.3 Profile and readiness gates
| ID | Case | Expected |
|---|---|---|
| RD-01 | Under 18 = yes | Fasting, carb ceiling, alcohol hidden with explanation |
| RD-02 | Pregnant/breastfeeding = yes | Fasting hidden; ceiling off; midwife/GP message |
| RD-03 | Diabetes medication = yes | Fasting hidden until prescriber confirmation toggled; hypoglycaemia text shown |
| RD-04 | Eating-disorder history = yes | Fasting hidden; goal setting hidden; trend still visible |
| RD-05 | Exercise red flag = yes | Sessions hidden until GP-discussion toggle |
| RD-06 | Change answers later | Features appear/disappear immediately; no data lost |

### 3.4 Weight
| ID | Case | Expected |
|---|---|---|
| WT-01 | Goal below BMI 18.5 | Refused with reason (HS-01) |
| WT-02 | Goal >20% below current | Refused with reason (HS-01) |
| WT-03 | Synthetic series losing 2.5 kg/week in weeks 1–3 (Kickstart) | No rapid-loss card; Kickstart note shown (HS-11) |
| WT-04 | Series losing 1.2 kg/week in weeks 4–6 (Steady) | Rapid-loss card after the third week (HS-11) |
| WT-06 | Kickstart deficit with a low energy estimate | Planned energy clamps to the 5,000 kJ floor; protein target unchanged (HS-25) |
| WT-07 | Kickstart deficit with a high estimate | Planned energy is exactly 30% below estimate (HS-25) |
| WT-08 | Day 22 without extension | Phase flips to Steady; planner moves to 15–20% deficit; explanation shown |
| WT-09 | Extend Kickstart | Asks how you feel first; extends 7 days; counter increments |
| WT-10 | Projection band | Shaded range, front-loaded, labelled "not a promise"; no target line (HS-26) |
| WT-05 | 7-day average chart | Matches hand calculation on fixture |

### 3.5 Fasting
| ID | Case | Expected |
|---|---|---|
| FS-01 | Presets available | 12:12, 14:10, 16:8, 18:6, nothing longer than 24 h selectable |
| FS-02 | Fast reaches 24 h 1 min | Warning shown; streak not incremented (HS-02) |
| FS-03 | Fast crosses midnight and device restarts | Timer continues from stored start time |
| FS-04 | Stop-signs text present on fasting screen | Snapshot |
| FS-05 | Drink logged during fast | Neutral note; no penalty text |

### 3.6 Nutrition, recipes, planner
| ID | Case | Expected |
|---|---|---|
| NU-01 | Every ingredient has all eight nutrient fields and a source tag | Data validation script |
| NU-02 | Recipe per-serve totals equal sum of ingredients ÷ serves | Unit test over all recipes |
| NU-03 | Net carbs = carbs − fibre, never negative | Unit test |
| NU-04 | Heart-smart badge logic | Fixtures: avocado salad = badge; bacon-cream carbonara = flagged |
| NU-05 | Day over saturated-fat budget | Indicator changes; no "bad"/"fail" wording (HS-09) |
| NU-06 | Auto-plan under 5,000 kJ | Refused (HS-10) |
| NU-07 | Garden-first filter | Recipes using ≥2 in-season garden items rank first |
| NU-08 | Cholesterol check-in cards | Appear at ceiling start, week 8, week 12 |
| NU-09 | Attribution footer | Present on every nutrition screen |

### 3.7 Grocery list
| ID | Case | Expected |
|---|---|---|
| GL-01 | Two recipes both needing avocado | One line, summed quantity |
| GL-02 | Item in garden/pantry stock | Excluded, shown under "already have" |
| GL-03 | Buyable units | 430 g chicken → "500 g pack"; 2.5 lemons → "3 lemons" |
| GL-04 | Aisle grouping | Each item has an aisle; unknown → "Other" |
| GL-05 | Edit, add manual item, delete | Persist across relaunch |
| GL-06 | Copy as text | Plain text, one line per item, suitable for pasting into the PAK'nSAVE app |
| GL-07 | Export CSV and JSON | Files open correctly; CSV columns per `DATA_MODEL.md`; store name and timestamps present |
| GL-08 | Store name | Visible on the list header; changeable in settings; default PAK'nSAVE Pāpāmoa |
| GL-09 | Substitutes | Each item with a known substitute shows it |

### 3.8 Alcohol
| ID | Case | Expected |
|---|---|---|
| AL-01 | Formula table | 330 mL 5% = 1.30; 440 mL 5% = 1.74; 150 mL 13% = 1.54; 30 mL 40% = 0.95; 500 mL 4.5% = 1.78; 250 mL 7% = 1.38; 750 mL 13.5% = 7.99; 568 mL 4% = 1.79; 100 mL 0.5% = 0.04; 1000 mL 0% = 0 (±0.05) (HS-04) |
| AL-02 | Label value entry | Entered 1.3 overrides calculation |
| AL-03 | Weekly comparison, female profile | 10/week and 2/day thresholds (HS-05) |
| AL-04 | Weekly comparison, male profile | 15/week and 3/day (HS-05) |
| AL-05 | Alcohol-free days count | Correct for fixture week; no badge or streak wording |
| AL-06 | Card trigger: 7 consecutive days | Card shown (HS-06) |
| AL-07 | Card trigger: double weekly guidance | Card shown |
| AL-08 | Card trigger: withdrawal symptoms note | Card shown |
| AL-09 | Card trigger: readiness "most days" | Card shown from day one |
| AL-10 | Control: 3 drinks across a week | No card |
| AL-11 | Banned phrases scan | None of: "cut down by", "reduce by", "taper", "quit date", "stop drinking", "wean", "BAC", "blood alcohol", "safe to drive", "legal limit" (HS-07, HS-08) |
| AL-12 | Helpline numbers present | 0800 787 797 and 8681 on alcohol screen (HS-13) |

### 3.9 Exercise
| ID | Case | Expected |
|---|---|---|
| EX-01 | Every movement has easier and harder variants and a stop-rule link | Data validation |
| EX-02 | Beach-tagged session | Flags, patrol, rip, sun, hydration prompts render before start (HS-12) |
| EX-03 | Progression suggestion | Never more than ~10% more volume than last session |
| EX-04 | Session log | Saves movement, reps/time, effort, notes; visible in history |
| EX-05 | Rest day scheduled | Weekly view shows at least two rest days |

### 3.10 Phone-to-laptop transfer
| ID | Case | Expected |
|---|---|---|
| TR-01 | Encrypt/decrypt round trip (unit) | Identical list; wrong key fails cleanly |
| TR-02 | Relay never sees plaintext | Relay test logs show only ciphertext; relay has no decrypt code |
| TR-03 | Pairing by QR | Laptop shows QR; phone scans; both sides store the pairing; second scan not needed next time |
| TR-04 | Send 25-item list | Appears in side panel within 30 s |
| TR-05 | Send 300-item list | Either succeeds or shows a clear "too large" (64 KB cap) |
| TR-06 | Blob expiry | After expiry, extension shows "nothing waiting"; nothing retrievable |
| TR-07 | Relay down | Phone offers paste fallback immediately; text code produced |
| TR-08 | Paste fallback | Pasting the code into the extension yields the same list |
| TR-09 | Replay | Re-fetching an already-delivered blob returns nothing (one-time delivery) |
| TR-10 | Unpair | Both sides forget key; next send requires pairing |
| TR-11 | Network audit (`context.on('request')`, so service-worker requests are seen too), online and offline, visiting every screen | The phone app makes only GET requests to its own origin for app files and update checks, with no query string or body built from user data, and requests to the relay origin only after "Send to laptop" is tapped and until that transfer is received or expires (HS-14; reworded per DOC_REVIEW C03) |

### 3.11 Food log, diet modes, household, allergens
| ID | Case | Expected |
|---|---|---|
| FL-01 | Add item from label per 100 g, log 150 g | Nutrients scaled; badge "Label" |
| FL-02 | Log recipe portion | Badge "Estimate" if any ingredient is estimated, else "Database" |
| FL-03 | Raw vs cooked | 200 g raw chicken and 150 g cooked are logged as distinct entries with the weight basis stored |
| FL-04 | Switch diet mode keto → balanced → keto | No records deleted; targets change; suggestions re-rank |
| FL-05 | Household dinner for 3, my portion 1/3 | My nutrition equals per-serve; changing household to 4 leaves my numbers unchanged (HS-23) |
| FL-06 | Edit a recipe containing a listed allergen | Allergen still listed after edit and after scaling (HS-24) |
| FL-07 | Gluten-free household toggle off | No gluten-free substitutions suggested |
| FL-08 | Eating window 17:00–19:00 | Shows "2 h eating, 22 h fasting" (HS-17) |
| FL-09 | Eating window 22:00–02:00 (midnight wrap) | 4 h eating |
| FL-10 | Low-protein planned day | Fasting card offers to widen window (HS-18) |
| FL-11 | Reflux options on | Earlier-window and split-meal suggestions appear; symptom log available |
| FL-12 | 23:1 preset, dinner planned at 95 g protein, target 140 g | Fasting card offers the 5 pm snack; no "broken fast" or streak-loss wording (HS-18) |
| FL-13 | 23:1 preset, dinner planned at 140 g protein and above floor | No snack prompt; meal check line shows the protein figure |
| FL-14 | 23:1 window 6 pm to 7 pm | Shows "1 h eating, 23 h fasting"; no over-24 h warning (HS-17) |
| FL-15 | Reflux symptom logged on a 23:1 day | Earlier-dinner and split-meal options offered next day |

### 3.12 Non-negotiable cases from the handoff
| ID | Case | Expected |
|---|---|---|
| NN-01 | 330 mL at 5% | About 1.30 standard drinks; 94 kcal shown **only** when the verified selected beverage preset carries that label value, never inferred for another drink |
| NN-02 | 5 pm snack + 7 pm final meal | 2-hour eating window (22:2), not 4 hours |
| NN-03 | Fixture profile 90 kg start, 70 kg long-term goal | Goal labelled long-term; four-week chart shows trend with "not a promise" line; no "kg in N days" text anywhere |
| NN-04 | Raw/cooked weights and package quantities | Not conflated: 500 g raw mince recipe yields a "500 g pack" grocery line, and a cooked-weight log entry stays cooked |
| NN-05 | Missing price or stock | Shown as "unknown"; never a fabricated live price; any price has an entered-at timestamp |
| NN-06 | Silverbeet 300 g in garden, recipes need 500 g | List shows 200 g to buy and an audit line "300 g from garden" |
| NN-07 | Stop a transfer midway, restart, send again | Laptop shows one copy of the list; no duplicated items; logs intact |
| NN-08 | Extension cannot checkout or change store | No checkout control exists; in mode A a batch refuses to start if the site's selected store is not the configured store; a changed page structure produces a visible error and stops |
| NN-09 | Alcohol tracker wording | Never implies that meeting a guideline is safe; never prescribes detox; "no alcohol use is risk-free" present |

### 3.13 Chrome extension
| ID | Case | Expected |
|---|---|---|
| CX-01 | Manifest | MV3; permissions exactly `sidePanel`, `storage`; host permission only the relay origin in mode B/C (plus paknsave.co.nz only in an approved mode A); no content scripts in mode B/C |
| CX-00 | Mode gate | Extension build fails if mode A is configured without `docs/INTEGRATION_FEASIBILITY.md` section 9.3 recording owner approval of A |
| CX-02 | Load unpacked | Loads without errors in Chrome 116+ |
| CX-03 | Click icon | Side panel opens with list or pairing QR |
| CX-04 | Tick/untick, note, progress bar | Persist across browser restart |
| CX-05 | "Find" with known search URL | New tab opens to PAK'nSAVE search for the cleaned term |
| CX-06 | "Find" with no known URL pattern | Term copied to clipboard; instruction shown |
| CX-07 | Edit search term | Edited term used |
| CX-08 | Static scan | No price/stock/cart-status strings (HS-16); footer disclaimer present |
| CX-09 | Clear list | Removed from laptop only; phone unaffected |

---

## 4. Manual device checklists

### End of week 1
- [ ] Install on phone from Chrome; icon appears.
- [ ] Flight mode; open; log weight; start fast; close; reopen; data present.
- [ ] Export backup; file lands in Downloads; import on the laptop browser works.
- [ ] Text readable outdoors at midday; buttons tappable with a thumb.

### End of week 3
- [ ] Pair laptop and phone via QR in under one minute.
- [ ] Send today's list; appears on laptop.
- [ ] Turn off Wi-Fi on laptop; send again; use paste fallback.
- [ ] Do one beach session from the app; prompts appeared; log saved.
- [ ] Log a weekend of drinks; weekly view and guidance make sense; no judgemental wording.

### Phase 0 spike (week 1, owner)
- [ ] Store flow walked through and recorded in `INTEGRATION_FEASIBILITY.md` 9.1 (no personal data).
- [ ] Both terms pages read; clauses pasted into 3.3.
- [ ] Search URL recorded.
- [ ] Mode A/B/C approved and recorded in 9.3.

### Week 4 field trial (record in `docs/TRIAL_LOG.md`; shopping observations only, no health data)
- [ ] Plan the week on the phone using garden stock.
- [ ] Send list to laptop. Shop on paknsave.co.nz with the side panel.
- [ ] Note per item: found first search / needed edit / not stocked / substituted.
- [ ] Time from "open panel" to "checkout page".
- [ ] Anything that felt like the extension was doing too much or too little.
- [ ] Any screen that showed or implied price, stock or cart state (should be none).

---

## 5. Acceptance criteria roll-up

The MVP is accepted when:
1. All unit, component and static tests pass in CI.
2. Playwright suites for PWA, transfer and extension pass on the test deployment.
3. Both manual checklists are complete.
4. `TRIAL_LOG.md` records one completed shop and its findings have been triaged into fix/later.
5. Every HS-xx rule and every NN-xx case maps to a passing test in the coverage table generated by CI.
6. The extension mode in the build matches the owner's recorded Phase 0 decision.
