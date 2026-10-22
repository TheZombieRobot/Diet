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
- **Relay:** a test deployment separate from the one you use, with a 2-minute expiry so expiry tests run quickly. Checked with `pnpm relay:smoke <address> --expiry 120` and `--limits` after each deploy. CI never needs the Cloudflare account.
- **Data:** fixtures live in `packages/test-fixtures` (generic only); seeded app data lives in `packages/core/data`. No real health data is ever committed.

---

## 3. Test cases by area

### 3.1 Installability and offline (PWA)
| ID | Case | Expected |
|---|---|---|
| PWA-01 | Installability, checked by Chrome itself (replaces the Lighthouse PWA audit, which Lighthouse 12 removed; DOC_REVIEW C35). Runs on the production build in CI and on the deployed HTTPS URL once GitHub Pages is on | `Page.getInstallabilityErrors` (Chrome DevTools Protocol) returns an empty list once the service worker is ready; the manifest has name, short_name, id, start_url and scope under `/Diet/`, `display: standalone`, and 192 and 512 px icons plus a 512 px maskable one, each fetched with a 200 and the declared size; `navigator.serviceWorker.controller` is set after a reload (criteria per [web.dev install criteria](https://web.dev/articles/install-criteria)) |
| PWA-02 | Open app, wait for install prompt, tap "Install" (manual) | Icon on home screen; opens without browser chrome |
| PWA-03 | Flight mode, open installed app, visit every screen | All screens load; no network error dialogs |
| PWA-04 | Flight mode: log weight, start fast, log a drink, plan a day, build list | All saved; visible after relaunch. Garden, pantry and photo at item 19 (e2e/garden.spec.ts E2); weight and fast at items 14 and 15 |
| PWA-05 | Deploy a new version, reopen app online | "Update available" banner; reload applies it; data intact |
| PWA-06 | Storage persistence request (reworded per DOC_REVIEW C98) | The request is made at every launch while storage is not already persisted, and the result is shown (unit test with a mocked StorageManager); it is asked again after install, when onboarding first completes and after a successful restore; Settings (Backup and data) and About show the result of `navigator.storage.persisted()`. "Records survive a week" moved to the end-of-week-1 checklist |

### 3.2 Backup
| ID | Case | Expected |
|---|---|---|
| BK-01 | Export (plain, and again locked), answer Yes to "Can you see the file?", delete all, import (reworded per DOC_REVIEW C49) | Every record round-trips exactly, except the documented device-only data (the laptop pairing and garden photos), which is absent from the file and empty after the import; the file contains no pairing or photo data (HS-15). Runs through the real database in unit tests and in Chromium with a real download and file chooser |
| BK-02 | Export with password, import with wrong password | "Wrong password, or the file is damaged. Nothing was imported."; the phone's records, including the last backup date, are unchanged; retrying with the right password imports |
| BK-03 | Weekly backup reminder | Appears 7 days after the last backup the owner confirmed (Yes to "Can you see the file?"), or after onboarding; "Not now" hides it for 7 days; an export answered No does not count. When storage is not protected: due after 3 days, back 1 day after "Not now", shown first |
| BK-04 | Tampered locked file: any header field (iterations, salt, IV, version, encrypted flag, cipher length) or one ciphertext bit changed | Refused before anything is imported (damaged, or wrong password or damaged) |
| BK-05 | A file from a newer version, or of an unknown envelope or schema version | Refused with "This backup was made by a newer version of the app…" or "…a format this app cannot read"; nothing imported |
| BK-06 | A file with a value outside the safety bounds (energy floor below 5,000 kJ, Kickstart deficit over 30%, Steady deficit outside 15–20%, protein, carb ceilings, saturated-fat budget, rapid-loss bounds, more than 3 Kickstart extensions or 42 Kickstart days) (DOC_REVIEW C50) | The whole file is refused with a clear message; nothing is clamped and nothing imported |
| BK-07 | A failure during the import write (a bug, a refused row, a full phone) | Nothing on the phone changes ("Nothing was changed"), and "Save what was on this phone" offers the records shown on the confirmation as a rescue copy |
| BK-08 | File names and the public repository (DOC_REVIEW C89) | Every name the app gives a saved file (diet-backup-…, rescue and locked variants, the browser's " (1)" copies, the GP summary and grocery exports) is ignored by git; a generated backup trips the backup-file and backup-marker scan rules |
| BK-12 | A restore never erases what the phone holds about Kickstart (full review F1, F3, F12, F13) | The Kickstart history written is the phone's and the file's merged: a stop-sign answer, an end, an extension or a pre-start "yes" on the phone is kept, and the start refusal, the stop-sign card and the extension offer are the same after the restore as before; two histories that cannot be combined refuse the file, as does one with a Kickstart starting within 336 hours of the other's stop-sign answer, or with an end that cuts days the other had already lived (re-check V1, V2); a record saved or changed in place, or a pairing saved, in another tab after the confirmation stops Replace and the confirmation comes back with fresh counts (re-check V3); a Kickstart running on the phone keeps running; a fast running when the file was made is named, with a switch to end it at the time the file was made |
| BK-09 | The fixed version-1 reference files, plain and locked (DOC_REVIEW C99) | Decode, decrypt with the reference phrase and import in every later version |
| BK-10 | Rescue copy after an upgrade fails | The upgrade-failed screen offers "Save a rescue copy", locked by default and named diet-backup-YYYY-MM-DD-rescue-locked.json; it is read with plain IndexedDB at the installed version from that version's allow-list, never reads the pairing or photos, and imports record by record, listing any record it could not keep by store and position; it never counts as a backup |
| BK-11 | A database newer than the app (a stale tab, a rolled-back deploy) | "This phone has records from a newer version of the app. Reload to update."; the database's version, stores and indexes are left exactly as they were |
| HS-30 | Delete all data (new per DOC_REVIEW C17, built at checklist item 12) | After two confirmations, every store is empty, the laptop pairing and every garden photo are gone, every other IndexedDB database and every cache except the app's own files are deleted, local and session storage are empty, and nothing the app was doing beforehand (an autosave, a live query, another tab) can write to the fresh database; only the app's files and a fresh database's seed rows remain. A deletion blocked by another tab says "Close the app's other tabs, then try again" and claims no success |

### 3.3 Profile and readiness gates
| ID | Case | Expected |
|---|---|---|
| RD-01 | Under 18 = yes | Fasting, carb ceiling, alcohol hidden with explanation; Kickstart unavailable, deficit 0 (plan at the estimate), no window text |
| RD-02 | Pregnant/breastfeeding = yes | Fasting hidden; ceiling off; midwife/GP message; no weight goal; Kickstart unavailable, deficit 0 |
| RD-03 | Diabetes medication = yes | Fasting hidden until prescriber confirmation toggled; hypoglycaemia text shown; carb ceilings under 50 g and Kickstart off until then |
| RD-04 | Eating-disorder history = yes | Fasting hidden; goal setting hidden; keto carb ceiling off (meals still planned) and no Kickstart; trend still visible |
| RD-05 | Exercise red flag = yes | Sessions hidden on the Move tab, the Today Movement card and Complete workout until GP-discussion toggle |
| RD-06 | Change answers later | Features appear/disappear immediately; no data lost |
| RD-07 | Close the app after the notice and reopen | Setup resumes at the first unfinished step; fasting hidden while gated |
| RD-08 | Import a backup with no readiness rows | Gates closed; readiness asked before anything else |
| RD-09 | Medication with food, blood-pressure or cholesterol medication = yes | Fasting not switched off by this answer, and no line says it is allowed; pharmacist reminder above the schedule choices with nothing preselected, at setup and in Settings; a pattern the app chose before the answer is cleared at setup and the step asked again; a stored 23:1 Kickstart default is read as 22:2, even during Kickstart; whatever the owner picks is recorded as their own; salt wording flag on |

### 3.4 Weight
| ID | Case | Expected |
|---|---|---|
| WT-01 | Goal below BMI 18.5 | Refused with reason (HS-01) |
| WT-02 | Goal >20% below current | Long-term goal accepted and labelled long-term; the next milestone shown is never more than 20% below the current weight (rounded up to 0.1 kg) (HS-01) |
| WT-03 | Synthetic series losing 2.5 kg/week in weeks 1–3 (Kickstart); and four Steady weeks at 1.2 kg/week before a first Kickstart from day 29 | No rapid-loss card in the 21 Kickstart days (the second series shows it on day 28, so the check can fail); Kickstart note shown (HS-11) |
| WT-04 | Series losing 1.2 kg/week in weeks 4–6 (Steady) | Rapid-loss card after the third week (HS-11) |
| WT-06 | Kickstart deficit with a low energy estimate | Planned energy clamps to the 5,000 kJ floor; protein target unchanged (HS-25) |
| WT-07 | Kickstart deficit with a high estimate | Planned energy is exactly 30% below estimate (HS-25) |
| WT-08 | Day 22 without extension | Phase flips to Steady; planner moves to 15–20% deficit; explanation shown; with the clock moved past day 22 and no launch on day 22; the Steady deficit lies in [15, 20]; an untouched 23:1 Kickstart default reads and is stored as 22:2 with the explanation; a user-chosen preset stays |
| WT-09 | Extend Kickstart | Asks how you feel first; extends 7 days; counter increments; a palpitations yes gives no extension, shows the stop-sign card, and leaves the counter unchanged; a yes whose check cannot be saved is held for the day (the stop-sign card, no offer, no deficit, no fast timed to the window) |
| WT-10 | Projection band | Shaded range, front-loaded, labelled "not a promise"; no target line (HS-26); no band edge appears as a number or a date; the band is absent when readiness gates the deficit, no carb ceiling is active, or weight is below BMI 18.5 |
| WT-05 | 7-day average chart | 7-day average: the mean of each day's mean weigh-in over the 7 local dates ending today, shown when at least 3 of those days have one; matches the hand calculation |
| WT-11 | Kickstart stop-sign card | Shown on every Kickstart day with the eat, salt and fluids line, Healthline or a GP and 111 (the blood-pressure wording under readiness answer 4); hidden only for the day; after a stop-sign answer forced back, expanded and unhideable through that Kickstart's last day (HS-27) |
| WT-12 | Cumulative exemption and restart | Only the first 21 Kickstart days ever are free of the rapid-loss card; extension weeks and a Kickstart restarted after 21 days used show it (D27) |
| WT-13 | Readiness gating of the weight card | Readiness answer 5 (or 1 or 2): no goal, milestone, chip, band or pace notes; weigh-ins, averages, the line and the rapid-loss card still show; the stored goal comes back when the answer changes (RD-04, RD-06) |
| WT-14 | Fluctuation explained once | "About daily changes" shows once weigh-ins exist on two dates, until "Got it" |

### 3.5 Fasting
| ID | Case | Expected |
|---|---|---|
| FS-01 | Presets available | Presets exactly 16:8, 18:6, 20:4, 22:2 and 23:1, plus custom clock times and no fasting plan; 23:1 preselected while Kickstart is chosen and fasting is not gated, 22:2 otherwise, and no pattern preselected when readiness answer 4 is yes or unanswered (nothing at setup; "No fasting plan for now" in Settings when nothing is stored); a custom start equal to its end is refused; no selection can plan a fast over 24 h (reworded per DOC_REVIEW C09) |
| FS-02 | Fast (or fasts less than an hour apart) reaches 24 h 1 min | Warning shown; streak neither incremented nor reset (HS-02) |
| FS-03 | Fast crosses midnight and device restarts | Timer continues from stored start time |
| FS-04 | Stop-signs text present on fasting screen | Snapshot |
| FS-05 | Drink logged during fast | Neutral note; no penalty text; the food figures, the meal check and the streak are unchanged |
| FS-06 | Planned fast would pass 24 h (a later window tomorrow, a start inside the window on the April daylight-saving night, a fast restarted within the hour, a fast still running after its planned window has closed) | Plan ends at 24 h from the start of the fast (or of the fasts less than an hour apart), eat-by time shown, stored planned minutes never over 1,440 (C30) |
| FS-07 | Streak counter | A completed fast of 24 h or less counts for the day it ends; one over 24 h, or still running, neither adds nor resets; a day without one ends the count with no message (C63) |
| FS-08 | Fasting gated by readiness | No Start anywhere, no timer, pattern or history; the repository refuses to start or reopen a fast; a fast already open can still be ended, with "It's fine to eat now." and the stop-signs (HS-03) |

### 3.6 Nutrition, recipes, planner
| ID | Case | Expected |
|---|---|---|
| NU-01 | Every ingredient, as the app reads it from `packages/core/data`, has all eight nutrient fields, each either a figure with its source tag (database, field and unit) or explicitly not known (never a silent 0 and never filled in by the app); a carb basis; a food-level source tag (`not-loaded` until a database approved at checklist item 10 is imported, with a citation for every database figure); and names, aliases, aisle, typical pack sizes with count and container words, allergens and whether the list is complete, garden flag, season months, raw/cooked/as-sold basis and substitutes that pass the dataset rules | Data validation script (`pnpm foods:check`); with real figures at step 18b |
| NU-02 | Recipe per-serve totals equal sum of ingredients ÷ serves; a figure an ingredient lacks is a lower bound and listed as unknown | Unit test over all recipes, with the shipped (not loaded) figures, partly loaded figures and complete fixture figures |
| NU-03 | Net carbs = available carbohydrate (fibre excluded), never negative; a USDA-style total figure is converted as total − fibre and floored at 0; a recipe's net carbs are its lines' available carbohydrate ÷ serves (C01) | Unit test with one 'available' and one 'total' fixture |
| NU-04 | Heart-smart badge logic | Fixtures: avocado salad = badge; bacon-cream carbonara = flagged; plus boundary fixtures (saturated fat exactly a quarter of the fat; exactly the per-portion cap; 40 g of cheese in the portion) and incomplete figures (never a badge) |
| NU-05 | Day over saturated-fat budget | Indicator changes; no "bad"/"fail" wording (HS-09) |
| NU-06 | Auto-plan under 5,000 kJ | Refused (HS-10): the core refusal (floorCheck, every app-made write kind) at item 21; the planner's refusal at item 22 |
| NU-07 | Garden-first filter | Recipes using ≥2 in-season garden items rank first |
| NU-08 | Cholesterol check-in cards | Lipid test at first run; check-ins when 56 and 84 days have passed since the first low-carb day (or since the profile was made if there was none); boundaries 55/56 and 83/84 days; one case starting in balanced mode, where the lipid test and check-ins are counted again from the first low-carb day (C109) |
| NU-09 | Attribution footer | Present on every nutrition screen; names only the databases recorded as approved in DECISIONS.md (none until checklist item 10); no NZ Food Composition Database wording when only USDA is approved (C97); including the recipe page (item 18's footer) |
| NU-10 | Recipe whose ingredients have no figures yet | Item 18's "not known" rows and no badge; no heart-smart label; no bare keto, moderate or balanced chip; Substitute explains why it is not available; counts as not met in every check (HS-37, HS-39) |
| NU-11 | Recipe dataset validation | Every seed recipe passes the dataset validator against item 18's catalogue: ids, allergens, cooked weights, eggs, no added salt, curated swaps that never flag, limits already broken by a partly loaded release, wording, the keto first week, coverage |

### 3.7 Grocery list
| ID | Case | Expected |
|---|---|---|
| GL-01 | Two recipes both needing avocado | One line, summed quantity |
| GL-02 | Item in garden/pantry stock | Excluded, shown under "already have". The stock fixture is defined at item 19 (GL02_GARDEN, GL02_PANTRY, GL02_NULL_AMOUNT_GARDEN); the deduction is tested at item 24 |
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
| AL-03 | Weekly comparison, female profile | 10/week and 2/day thresholds (HS-05); with readiness answer 2 yes or unanswered no figure is shown as guidance (HEALTH_SAFETY section 5) |
| AL-04 | Weekly comparison, male profile | 15/week and 3/day (HS-05) |
| AL-05 | Alcohol-free days count | Correct for the fixture week (Monday-start, counted from the notice day up to yesterday); no badge or streak wording |
| AL-06 | Card trigger: 7 consecutive days | Card shown (HS-06) |
| AL-07 | Card trigger: double weekly guidance | Card shown; still shown while that 7-day window ended within the last 7 drinking days; a label figure lower than the calculation, however close, counts at the calculation; a date skipped by crossing the date line widens the window to 7 days lived |
| AL-08 | Card trigger: withdrawal symptoms note | Card shown; still shown after a reload and after a backup round trip; an un-ticked note shows no card (C05) |
| AL-09 | Card trigger: readiness "most days" | Card shown from day one |
| AL-09b | Readiness Q7 "most days or heavily at weekends" answered yes, or unanswered | Card shown from day one (C58) |
| AL-10 | Control: 3 drinks across a week | No card |
| AL-11 | Banned phrases scan | None of: "cut down by", "reduce by", "taper", "quit date", "stop drinking", "wean", "BAC", "blood alcohol", "safe to drive", "legal limit" (HS-07, HS-08) |
| AL-12 | Helpline numbers present | 0800 787 797 and 8681 on alcohol screen (HS-13) |

### 3.9 Exercise
| ID | Case | Expected |
|---|---|---|
| EX-01 | Every exercise in the dataset has easier and harder variants and a stop-rule link | Data validation |
| EX-02 | Beach-tagged session | Flags, patrol, rip, sun, hydration prompts render before start (HS-12) |
| EX-03 | Progression suggestion | Never more than about 10% more volume per movement than the last completed week (C76), nor than the last session; once a set uses the session's whole amount, no further set is suggested |
| EX-04 | Session log | Saves movement, reps/time, effort, notes; visible in history (history on the Move tab) |
| EX-05 | Rest day scheduled | Weekly view shows at least two rest days |
| EX-06 | Beach jogging is opt-in | With the switch off, or fewer than four tolerated walks, no jog can be planned or started. After a jog that was not tolerated, or one left unfinished, the beach walk is shown again until one more tolerated walk (UX 4d, C51) |
| EX-07 | Weekly plan editor | A plan cannot be saved, and the reasons are shown, when it has: fewer than two rest days; strength on consecutive days (Sunday to Monday included); other than two or three strength sessions; a jog while jogging is locked; or, counting the sessions done in the last six days, fewer than two rest days in some 7 days in a row |
| EX-08 | Rest counts as success | Rest days, rested days and past days with nothing logged read calmly ("Rest day, that counts", "Rested. That counts.", "Not done. Rest counts too."); no screen says missed, failed, behind or streak; the Today card shows the week's plan without done or not-done marks |

### 3.10 Phone-to-laptop transfer
| ID | Case | Expected |
|---|---|---|
| TR-01 | Encrypt/decrypt round trip (unit) | Identical list and acknowledgement; a wrong key, a changed byte or the wrong slot fails cleanly ('cannot open') and never throws; fixed vectors pin the pairing code, the body layout, the additional data and both payloads (item 30). |
| TR-02 | Relay never sees plaintext | Relay half (item 29): the relay logs nothing, has no decrypt code and stores only the posted body, refusing raw text. End-to-end half (item 31): every stored body decodes to AES-GCM ciphertext under the pairing key that opens to the sent list, and shows no item name, compressed or not. |
| TR-03a | Pairing by QR, phone half (item 30) | A pairing code drawn into the camera is read by the bundled reader (Chrome's own reader is never asked); the phone stores the pairing with a key it cannot read back, keeps it after a reload, stops the camera and, from the tap on Scan until the pairing is saved, requests nothing but the bundled reader's own file. |
| TR-03b | Pairing by QR, end to end (item 33) | Laptop shows QR; phone scans; both sides store the pairing and show the same pairing check; second scan not needed next time |
| TR-04 | Send 25-item list | Appears in side panel within 30 s |
| TR-05a | Send a 300-item list (`groceryList300()` fixture) | Succeeds (C114) |
| TR-05b | A body over the cap (`MAX_RELAY_BODY_BYTES` = 65,536 bytes of the encoded request body, checked on Content-Length and on the bytes read), for example high-entropy notes | The relay answers 413 and stores nothing; the phone shows "too large", offers CSV or JSON, and never shows "Sent" (C114) |
| TR-06 | Blob expiry | After expiry (test deployment 2 minutes, production 15), nothing is retrievable. The relay refuses a blob past the expiry stored with it, even while KV still holds it, and answers "nothing waiting"; the extension shows "nothing waiting". A live check waits for the expiry plus the 30-second KV read cache (C79). |
| TR-07 | Relay down | Phone offers paste fallback immediately; text code produced |
| TR-08 | Paste fallback | Pasting the code into the extension yields the same list |
| TR-09a | Replay (relay, item 29) | Re-fetching an already-delivered blob at the same place returns nothing. A copy served elsewhere is byte-identical to a blob sent to that room and is never served after its expiry (C79, C113). |
| TR-09b | Replay (extension, item 33) | Each of these is ignored, and leaves one copy with ticks and notes intact: a byte-identical duplicate; a duplicate arriving after Clear list (the list stays cleared); an older version of the same list; an earlier send of the same version arriving after a later one. A deliberate re-send of the same version is accepted and keeps ticks and notes. The acknowledgement always names the version the laptop holds and the send that brought it (C79, NN-07). |
| TR-10 | Unpair (C115) | Unpair on a device deletes that device's key and room id; the next send requires pairing; a list sealed after re-pairing cannot be opened with the old key; no network request is made on unpair (HS-14). Phone half at items 30 (unpair) and 31 (the next send requires pairing), laptop half at item 33. |
| TR-11 | Network audit (`context.on('request')`, so service-worker requests are seen too), online and offline, visiting every screen | The phone app makes only GET requests to its own origin for app files and update checks, with no query string or body built from user data, and requests to the relay origin only after "Send to laptop" is tapped and until that transfer is received or expires (HS-14; reworded per DOC_REVIEW C03) |

### 3.11 Food log, diet modes, household, allergens
| ID | Case | Expected |
|---|---|---|
| FL-01 | Add item from label per 100 g, log 150 g | Nutrients scaled; badge "Label" |
| FL-02 | Log recipe portion | Badge "Estimate" if any ingredient is estimated, else "Database" |
| FL-03 | Raw vs cooked | 200 g raw chicken and 150 g cooked are logged as distinct entries with the weight basis stored |
| FL-04 | Switch diet mode keto → balanced → keto | No records deleted; targets change; suggestions re-rank (the ranking in core at item 21; the suggestion list UI at item 22, C23) |
| FL-05 | Household dinner for 3, my portion 1/3 | My nutrition equals per-serve; changing household to 4 leaves my numbers unchanged (HS-23) |
| FL-06 | Swap away the line that carries a listed allergen in a recipe | Allergen still listed after the swap, after scaling and after a reload, with the note that the original recipe contains it (HS-24) |
| FL-07 | Gluten-free household toggle off | No gluten-free substitutions suggested |
| FL-08 | Eating window 17:00–19:00 | 2 h eating and 22 h fasting, from the core window formatter: screen 1e shows "Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours." and the Fasting screen's Eating pattern card "2 h eating, 22 h fasting" (HS-17, C101) |
| FL-09 | Eating window 22:00–02:00 (midnight wrap) | 4 h eating |
| FL-10 | Low-protein planned day; also a day with enough protein but planned food energy under the day's energy target (C10) | Fasting card offers to widen window (HS-18). Core and card level at item 15, plan wiring at item 22 (C23) |
| FL-11 | Reflux options on | Earlier-window and split-meal suggestions appear; symptom log available |
| FL-12 | 23:1 preset, dinner planned at 95 g protein, target 140 g | Fasting card offers the 5 pm snack; no "broken fast" or streak-loss wording (HS-18). Core and card level at item 15, plan wiring at item 22 (C23) |
| FL-13 | 23:1 preset, dinner planned at the protein target, at or above the day's energy target, under 600 g of protein food | No snack prompt; meal check line shows the protein figure. Core and card level at item 15, plan wiring at item 22 (C23) |
| FL-14 | 23:1 window 6 pm to 7 pm | 1 h eating and 23 h fasting, from the core window formatter: screen 1e shows "Eating 6:00 pm to 7:00 pm = 1 hour. Fasting 23 hours." and the Fasting screen's Eating pattern card "1 h eating, 23 h fasting"; no over-24 h warning (HS-17, C101) |
| FL-15 | Reflux symptom logged on a 23:1 day; also on a 16:8 day | Earlier-dinner and split-meal options offered that day and the next day, not the day after |
| FL-16 | Reflux symptoms on 3 days within 2 weeks, or rated stronger this week than last | The symptom log suggests seeing a GP; "Not now" hides it for 7 days (C47) |
| FL-17 | Six cans logged on a day | Food energy, protein and the floor result unchanged; alcohol shown as its own part of the day's energy; an unknown drink marks the total "at least" and never shows as 0 (HS-36, C11) |

### 3.12 Non-negotiable cases from the handoff
| ID | Case | Expected |
|---|---|---|
| NN-01 | 330 mL at 5% | About 1.30 standard drinks; 94 kcal shown **only** when the verified selected beverage preset carries that label value, never inferred for another drink |
| NN-02 | 5 pm snack + 7 pm final meal | 2-hour eating window (22:2), not 4 hours |
| NN-03 | Fixture profile 90 kg start, 70 kg long-term goal | Goal labelled long-term; four-week chart shows trend with "not a promise" line; no "kg in N days" text anywhere (the item 14 fixture uses synthetic values instead: 180 cm, 100 kg, a 78 kg long-term goal, per C103) |
| NN-04 | Raw/cooked weights and package quantities | Not conflated: 500 g raw mince recipe yields a "500 g pack" grocery line, and a cooked-weight log entry stays cooked |
| NN-05 | Missing price or stock | Shown as "unknown"; never a fabricated live price; any price has an entered-at timestamp |
| NN-06 | Silverbeet 300 g in garden, recipes need 500 g | List shows 200 g to buy and an audit line "300 g from garden" |
| NN-07 | Stop a transfer midway, restart, send again | Laptop shows one copy of the list; no duplicated items; logs intact (the duplicate rule, scoped to the pairing, is unit-tested at item 30; end to end at item 33) |
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

### 3.14 Today (checklist item 16)
| ID | Case | Expected |
|---|---|---|
| TD-01 | Card order and the Today snapshot | Status line, then the "talk to someone" card, then a prominent Reminders card, then the UX_SCREENS section 2 cards; the structural snapshot with its explicit assertions |
| TD-02 | Unbuilt features | Movement and drink logging show no numbers (the Nutrition today card shows the day's own intake, item 21); unbuilt quick actions are shown with "Later", focusable and inert; nothing is written before setup; a failed read offers a reload and keeps the status line and the "talk to someone" card |
| TD-03 | Water and the electrolyte tick | Saved and still there after a reload offline, by local day; Undo removes only its own entry; the status total matches the stored total; focus stays on the control used, after a save and after a failed one |
| TD-04 | Steps | Manual entry within 0–100,000; Done saves; "Same as yesterday" only when yesterday has an entry and today none; never overwrites |
| TD-05 | Drinks guidance | By stored sex and setting, the stricter wins, women's when sex is missing, never without "No alcohol use is risk-free."; under 18 shows the reason and no figures; with readiness answer 2 yes or unanswered, the pregnancy line and no daily or weekly figures (full review F30) |
| TD-06 | Reminders | Cholesterol per NU-08 (counted again once when low-carb eating first starts); electrolytes per C72, only with the keto ceiling on in keto mode; medication timing (RD-09) on the Fast card when fasting is available and in Reminders when it is switched off, never twice; backup per BK-03, with Reminders first when storage is not protected |
| TD-07 | Status line | The over-24-hours sentence strictly over 24 h whether or not fasting is switched off; a neutral "still open" line when it is; no time past the running fast's 24-hour point, and from 23 h "It's fine to eat now.", as on the Fast card; the day's window after the snack is added; no fasting words with no pattern |

### 3.15 Foods in the app (checklist item 18)
| ID | Case | Expected |
|---|---|---|
| FD-01 | Search the catalogue by name or another name ("chard") | The matching food is listed (Silverbeet); fewer than 2 letters lists every food by aisle |
| FD-02 | Open a food whose figures are not loaded | Every per-100 g figure reads "not known", never 0; no badge; the footer says no figure is from a food database |
| FD-03 | Allergens of a fresh single food, a packed single food, a brand-dependent food, and one the profile lists | "None of the 15 allergens", "check the label" (with "none by nature" for the single food), what it contains plus "check the label", and the conflict in the owner's own terms ("Has wheat (gluten), which you listed") |
| FD-04 | Swaps on a food's details | Never a swap carrying a listed allergen, nor a food the owner does not want suggested; gluten-free swaps only with Gluten-free household on, whatever the profile lists, and with it on never a swap known to carry a gluten cereal; "(check the label)" on a swap whose allergens are not complete |

### 3.16 Garden and pantry (checklist item 19)
| ID | Case | Expected |
|---|---|---|
| GD-01 | A photo carrying EXIF location, XMP, a comment and trailing data is added to a crop | The stored photo is a JPEG at most 1,024 px on its long side, upright, with no APPn or comment segment and nothing after the end marker. Any write of a photo that still has one is refused, whichever code makes it |
| GD-02 | A photo is stored, then every export the app can make is produced | No photo bytes, photo keys or photo text in any file, in any encoding. No file outside the named list mentions the photo store, opens the database or reaches stores generically, read with the TypeScript compiler and its types (an alias, an escape, a template or `+` name, a cast, Dexie's own table lists), and no app file imports test data or a test helper |
| GD-03 | A crop or pantry item with no amount entered | Shown as "Available, amount not entered" (a ready crop) or "Some, not measured" (pantry). Read by the plan and list with no weight; no gram figure is made up |
| GD-04 | Garden and pantry wording | No food-safety, freshness, price, savings, stock or kilogram wording, and no gram figure in fixed copy |

---

## 4. Manual device checklists

### End of week 1
- [ ] Install on phone from Chrome; icon appears.
- [ ] Flight mode; open; log weight; start fast; close; reopen; data present.
- [ ] Records survive a week of normal use (PWA-06, as reworded by DOC_REVIEW C98).
- [ ] Export a locked backup; the file lands in Downloads.
- [ ] Restore that locked file in an Incognito tab on the same phone, check that the records appear, then close the Incognito tab, which discards that copy (DOC_REVIEW C48).
- [ ] Optional, the laptop: copy the locked file to the laptop by USB cable, open the app in a Chrome Guest window, restore it there, check the records, then close the Guest window straight away, which discards that copy. Never restore into an ordinary laptop browser window: it would keep every record (HEALTH_SAFETY section 7, DOC_REVIEW C48).
- [ ] Clean-up: if a restore was ever made in an ordinary browser window anywhere other than this phone's app, open the app in that window and use Settings, Backup and data, Delete all data, so no copy of the records stays there.
- [ ] Text readable outdoors at midday; buttons tappable with a thumb.

### End of week 3
- [ ] Pair laptop and phone via QR in under one minute; both show the same pairing check.
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
2. Playwright suites for PWA, transfer and extension pass in CI against a local relay. The test deployment is checked with the smoke command after each deploy, and once by hand at the week-3 review (item 35).
3. Both manual checklists are complete.
4. `TRIAL_LOG.md` records one completed shop and its findings have been triaged into fix/later.
5. Every HS-xx rule and every NN-xx case maps to a passing test in the coverage table generated by CI.
6. The extension mode in the build matches the owner's recorded Phase 0 decision.
