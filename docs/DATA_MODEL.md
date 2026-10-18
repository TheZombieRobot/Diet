# Data Model (plain language)

All data lives in the phone's IndexedDB in one database with versioned migrations from day one. Each table below is a list of records. Fields marked *derived* are calculated, not stored. Times are stored in UTC with the device's time zone recorded, so a fast that crosses midnight or daylight saving is measured correctly.

| Table | What a record is | Key fields |
|---|---|---|
| **profile** | You (one record) | height cm, sex, birth year, activity level, equipment toggles, household size, diet mode, units, store name, created, updated |
| **readiness** | Your answers to the seven questions and the two confirmation toggles (prescriber agreed; GP discussed exercise) | question id, answer, answered at |
| **targets** | Current numeric targets | protein g range, net carb ceiling, saturated-fat budget %, energy floor kJ, water mL, eating window preset, window start/end clock times, reflux options |
| **weights** | One weigh-in | at, kg, note. *Derived:* 7- and 14-day averages, weekly rate |
| **fasts** | One fast | started at, ended at (null while running), planned hours, snack time, dinner time, symptoms (reflux etc.), note. *Derived:* length, over-24 h flag |
| **ingredients** | A food with nutrients per 100 g | name, aliases, aisle, pack sizes, nutrients (energy kJ, protein, fat, saturated fat, carbs, sugars, fibre, sodium), source (label / nz-fcdb / usda / estimate), source citation, allergens, garden flag, season months |
| **recipes** | A recipe | title, serves, time, ingredients (ingredient id, raw grams, cooked grams optional, unit), method, tags, allergens (retained on edit), computed nutrition per serve with confidence (*derived from ingredients, stored with the source mix*) |
| **plan_days** | One planned day | date, diet mode, meals (slot, recipe id, servings, my portion fraction), household servings |
| **food_log** | One eaten item | at, source kind (plan / recipe / label / estimate), reference id, grams, raw-or-cooked, nutrients snapshot, confidence |
| **water_log** | A drink of water or electrolyte tick | at, mL, electrolyte flag |
| **steps_log** | Steps for a day | date, steps, source (manual) |
| **garden** | A crop you have | crop (ingredient id), amount with unit, harvest ready, perishability days, photo blob (device only), updated |
| **pantry** | Something in the cupboard | ingredient id, amount, unit, updated |
| **exercises** | A movement | name, cues, variants (easier, harder, band, dumbbell), tags, stop-rule link |
| **sessions** | A planned or completed session | date, template id, movements (exercise id, sets, reps or seconds, variant), pre-check answers, exertion, soreness, energy, status (planned / done / rested / skipped), note |
| **beverages** | A drink preset | name, mL, ABV, kcal per serve from label, label std drinks (optional). *Derived:* std drinks = mL × ABV × 0.789 ÷ 1000 unless label value given |
| **drinks_log** | One drink | at, beverage id, count, snapshot of mL/ABV/kcal/std at the time |
| **alcohol_milestones** | A milestone you or your clinician entered | label, weekly std drinks, from date, entered by (self / clinician), note. The app never creates these |
| **grocery_lists** | A list | created, store name, items (ingredient id or free text, quantity, unit, pack suggestion, aisle, substitute hint, from garden amount and audit note, price (optional, entered at), ticked), status (draft / sent / received), sent at, transfer id |
| **transfer_pairings** | The laptop pairing | relay URL, room id, key (device only, never exported), paired at |
| **settings** | Misc | last backup at, onboarding done, theme, text size |
| **audit** | Why a number changed | at, table, record id, reason (e.g. "deducted 300 g silverbeet from garden") |

**Shared rules enforced in `packages/core`:**
- Standard drinks: `ml * abv * 0.789 / 1000`, rounded to 2 decimals; label value wins if present.
- Eating window length is computed from clock times, wrapping midnight correctly; fasting hours = 24 − window.
- Net carbs = carbs − fibre, floored at zero.
- Energy estimate = Mifflin-St Jeor × activity factor (1.2 sedentary, 1.55 moderate, 1.725 physically active job, 1.9 very active), labelled "rough guide".
- Portion scaling: user portion = recipe per-serve × my portion fraction; household servings never change the user's numbers.
- Confidence: label > nz-fcdb or usda > estimate; a recipe's confidence is the weakest of its ingredients.
- Grocery aggregation: same ingredient merged across recipes, converted to grams first, then to pack counts rounded up; garden and pantry subtracted before pack rounding; each deduction writes an audit row.

**Export formats**
- Backup: single JSON of all tables, optional AES-GCM password encryption; excludes `transfer_pairings` keys.
- Grocery CSV: `aisle,item,quantity,unit,pack_suggestion,from_garden,substitute,price,price_entered_at,ticked`.
- Grocery JSON: the list record as stored, with the store name and timestamps.
- Transfer payload (phone to laptop): the grocery list JSON, compressed, encrypted; includes a list id and version so re-sending never duplicates on the laptop.

**Extension storage (laptop):** the last received list with tick state and notes, the pairing record, and the mode (A/B/C). Nothing else.
