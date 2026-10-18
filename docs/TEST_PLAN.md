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
- **Data:** fixtures live in `packages/data/fixtures`. No real health data is ever committed.

---

## 3. Test cases by area

### 3.1 Installability and offline (PWA)
| ID | Case | Expected |
|---|---|---|
| PWA-01 | Lighthouse PWA audit on the deployed URL | Installable; no "missing manifest field" findings; icons 192 and 512 present; `display: standalone`; served over HTTPS (criteria per [web.dev install criteria](https://web.dev/install-criteria)) |
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
| WT-03 | Synthetic series losing 1.2 kg/week for 2 weeks | No card |
| WT-04 | Same series for 3 weeks | Rapid-loss card (HS-11) |
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
| TR-11 | Network audit | No request from the phone app to any host other than the relay, and only on send (HS-14) |

### 3.11 Chrome extension
| ID | Case | Expected |
|---|---|---|
| CX-01 | Manifest | MV3; permissions exactly `sidePanel`, `storage`; host permission only the relay origin; no content scripts |
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

### Week 4 field trial (record in `docs/TRIAL_LOG.md`)
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
5. Every HS-xx rule maps to a passing test in the coverage table generated by CI.
