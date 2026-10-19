# Screen Descriptions (text wireframes)

Plain-language descriptions of every MVP screen, written so you can picture them and so the implementing model builds the same thing. Design rules: one-handed use, large tap targets (at least 48 px), readable in sunlight (high contrast, no thin grey text), dark mode, very little typing, offline state always visible.

**Global elements**
- Top bar: screen name, a small cloud icon that reads "Offline, all saved" or "Online", and a settings gear.
- Bottom tab bar, five tabs: **Today**, **Food**, **Move**, **Drinks**, **List**.
- A floating "+" quick-action button on Today.
- Any health message is a card with a calm tone, never red alarm styling unless it is an emergency instruction.

---

## 1. First run (once)

**Screen 1a: Welcome.** "This is a private logbook and planner. It is not a medical device and does not replace your GP." Button: Continue.

**Screen 1b: Alcohol safety notice (mandatory, cannot be skipped).** Plain text: "If you drink most days or heavily at weekends, cutting down suddenly can be dangerous. Talk to your GP or the Alcohol Drug Helpline (0800 787 797, text 8681) before making a big change. Call 111 for seizures, confusion or hallucinations." Button: I understand. A link "Why am I seeing this?" explains that it is shown to everyone.

**Screen 1c: Readiness questions.** Seven yes/no questions from `HEALTH_SAFETY.md` section 1, one per card, swipe or tap. Final card explains what each "yes" changed.

**Screen 1d: Profile.** Height, current weight, long-term goal weight (shown as "long-term", with the text "the four-week chart is not a promise"), Kickstart choice ("Strong start for 3 weeks: bigger deficit, protein protected, daily electrolytes", on by default), sex (for guidance figures and energy estimate), age, activity level (default "physically active job"), equipment toggles, household size, dislikes and allergens, gluten-free household toggle (off by default).

**Screen 1e: Eating schedule.** Choose a preset (16:8, 18:6, 20:4, 22:2 "5 pm snack + dinner", 23:1 "one meal") or set clock times. During Kickstart the preset defaults to 23:1 with a line: "One meal has to carry about 140 g protein. If a day's dinner can't, the app will offer the 5 pm snack. That's not a broken fast." The screen shows the computed window: "Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours." Reflux option: "I get reflux; prefer earlier or split dinner" toggles.

**Screen 1f: Garden.** Silverbeet is pre-listed as "available". Add other crops with amount, harvest-ready and perishability. Skip is allowed.

---

## 2. Today

Top: date and a one-line status such as "Fasting 14 h 20 m. Snack window opens 5:00 pm."

Cards, in order:
1. **Weight.** Latest weight, 7-day average, long-term goal, phase chip ("Kickstart, week 2 of 3" or "Steady"). Four-week sparkline with a shaded front-loaded band labelled "typical range, not a promise". During Kickstart the note reads: "Kickstart: a fast drop is expected now, mostly water and glycogen with some fat." In Steady it reads: "About 0.5–1 kg a week is the pace that holds. A kilogram back after Kickstart is water, not failure."
2. **Fast.** Big Start/End button, planned window, snack and dinner times. On 23:1 days a one-line meal check: "Tonight's dinner carries 138 g protein" or "Tonight's dinner carries 95 g protein. Add the 5 pm snack?" with a one-tap Add. If protein or energy is short: "It's fine to widen the window."
3. **Nutrition so far.** Energy, protein, fibre, net carbs (if keto mode) as bars with targets. Each logged entry shows a small badge: Label, Database, or Estimate.
4. **Water and electrolytes.** Tap +250 mL; optional electrolyte tick.
5. **Steps.** Manual entry, remembers yesterday's value for one-tap repeat.
6. **Movement.** Today's session or "Rest day, that counts" with Start. After a session: exertion, soreness, energy, each 1–5 taps.
7. **Drinks.** Today and this week: cans, standard drinks, kcal. Neutral grey. Guidance line underneath: "NZ guidance for men: up to 3 a day, 15 a week, 2 alcohol-free days. No drinking is risk-free."
8. **Reminders.** Lipid test, backup, cholesterol check-in at weeks 8 and 12, as they fall due. The backup reminder reads "Back up your records. Your records are kept only on this phone. Export a backup and keep the file somewhere else too." with **Back up now** (opens Settings, Backup and data, with the export ready) and **Not now**. It appears 7 days after the last backup the owner confirmed (or after onboarding), and comes back 7 days after "Not now". When the phone has not promised to keep the app's records, it appears after 3 days, comes back after 1 day, goes first among Today's reminders, and adds "This phone has not promised to keep the app's records. A backup is your only other copy." A backup counts only once the owner answers Yes to "Can you see the file?" after exporting (storage design, section 12.2). After an update or a restore that had to change a stored value to fit new limits, a one-time note reads "This update changed some of your settings to fit new limits." with "See what changed".

"+" quick actions: Log weight, Finish meal, Swap recipe, Complete workout, Add harvest, Add drink, Open grocery list.

---

## 3. Food

**3a: Plan (week view).** Seven columns, each with snack and dinner (or the meals your window allows). Tap a meal to swap from suggestions ranked garden-first. A banner shows diet mode (Keto-preferred / Moderate low-carb / Balanced) with a switch; switching re-ranks suggestions and never deletes anything. Household toggle: "Dinner for 3; my portion shown separately."

**3b: Recipe.** Photo-free, fast. Title, time, serves, ingredients with raw/cooked weights, method steps, nutrition per your portion and per 100 g with source badges, heart-smart badge or saturated-fat flag, allergens listed, garden items marked with a leaf. Buttons: Add to plan, Log as eaten, Scale servings, Substitute ingredient.

**3c: Food log (day).** Chronological entries with badges. "Add from label" opens a form: name, per 100 g or per serve, energy, protein, fat, saturated fat, carbs, fibre, sodium, package size. "Add from recipe/plan" is one tap.

**3d: Garden and pantry.** Two lists. Garden rows: crop, amount, harvest-ready toggle, perishability, photo thumbnail. Pantry rows: item, quantity. "Add harvest" is also on the Today quick actions.

---

## 4. Move

**4a: This week.** Seven-day strip with planned sessions and rest days. Default: two or three strength sessions, optional beach walk, rest days marked "counts as success".

**4b: Pre-session check (every session).** Five quick toggles: pain or injury, back or leg symptoms, very tired or poor sleep, hot day or sun exposure, not well hydrated. Any "yes" offers the lighter version or rest. Stop rules shown in one line with "Call 111 for chest pain that does not settle."

**4c: Session.** Movement list with easier/harder variant switch, band or dumbbell variant if enabled, sets and reps or time, big tick per set, optional demonstration text. Progression suggestion at the top, capped at about 10% more than last time. Finish asks exertion, soreness, energy.

**4d: Beach.** Walk or optional jog with duration. Prompts before start: between the flags when patrolled (Bay of Plenty surf beaches patrolled roughly October to March, hours on Safeswim), rips, sun before 10 am or after 4 pm in summer, water, firm sand first. Jogging unlocks only after four tolerated walks.

---

## 5. Drinks

**5a: Log.** Beverage presets as large buttons (default: "Zero-sugar premix 330 mL, 5%, 94 kcal, 1.3 std"). Tap to add one; long-press for several. Edit presets: volume, ABV, kcal from label, optional label standard-drink value.

**5b: Trends.** Daily bars for cans, standard drinks and kcal; weekly totals; alcohol-free days counted plainly; rolling four-week line. Optional milestones you or your clinician entered appear as a dotted line labelled "your milestone", never "target" or "limit".

**5c: Guidance and help.** The NZ guidance in context, the "no drinking is risk-free" line, and the help card with the helpline, GP advice and 111 instructions. Next-day note with a tick box: "Felt shaky, sweaty, anxious or sick without a drink" which surfaces the help card.

What is deliberately absent: streaks, badges, "calories left", "you've earned", blood-alcohol, driving.

---

## 6. List

**6a: Grocery list.** Grouped by aisle. Each row: item, quantity in pack units, substitute hint, a small leaf for "from garden" with the audit line, tick box. Header: store name "PAK'nSAVE Pāpāmoa" (changeable) and "Prices: unknown unless you add them". Price field per row is optional and timestamped.

**6b: Send and export.** Buttons: Send to laptop (encrypted), Copy as text, Export CSV, Export JSON, Paste code (shown when the relay is unreachable). Status line: "Sent 10:42, waiting for laptop" / "Received on laptop" / "Not sent".

**6c: Pairing.** Camera view to scan the QR shown by the laptop extension. One-time. Unpair in settings.

---

## 7. Settings
Profile, eating schedule, readiness answers, diet mode, targets (protein, net carbs, saturated-fat budget), the drinking-day cut-over (drinks before 5 am count toward the previous evening; adjustable from midnight to 6 am, C21), the rapid-loss bounds (only after reading their explanation, C46), the alcohol guidance set (C46), equipment, household, allergens, dislikes (C43), hidden recipes and foods, store, pairing, Backup and data, About (not a medical device, emergency numbers, data sources and attribution, version). Units are fixed metric, so there is no units setting.

**Backup and data** (built at checklist item 12):
- **Storage status line**, checked at every launch and never stored: "Protected from automatic clearing. A backup is still your only copy if the phone is lost or Chrome's data is cleared.", "Not protected yet: the phone may clear the app's records when space runs low. A backup is your only other copy.", "This browser cannot protect the app's records from clearing. A backup is your only other copy." or "Checking…". About shows the same line.
- **Last backup made** with its date, or "No backup made yet". The backup reminder shows here too when it is due.
- **Export a backup.** "Lock the file with a password" is on by default; the password is typed twice (at least 10 characters) with "If you forget this password, the backup cannot be opened. Nobody can recover it." Turning the lock off shows "Anyone who opens this file can read your records." After the download: "Your phone should now show diet-backup-YYYY-MM-DD.json in Downloads. Check it is there." and "Can you see the file?" Yes records the backup; No says "The backup may not have saved. Try again." If the app's own check of the file fails, it names the store, field and rule and offers "Save an unchecked copy", which does not count as a backup.
- **Restore from a backup.** Choose a file; a locked one asks for its password ("Wrong password, or the file is damaged. Nothing was imported." can be retried). Nothing changes until Replace: the confirmation shows the file's date, whether it was locked, the records per store, any value changed to fit this version, any record a rescue copy could not keep, and "This replaces everything on this phone. N records on this phone are not in the file. M records on this phone were changed after the file was made. Newest record on this phone: …; in the file: …. The laptop pairing will be removed." When the phone has newer records, "Export what is on this phone first" is the first button. After Replace the app reloads on Today.
- **Delete all data.** A first confirmation lists what goes and what stays (the app's own files, a fresh start with the default drink preset and silverbeet, the home-screen icon and the storage setting, a backup password saved in Chrome, backup files saved elsewhere, the laptop's list and pairing, and a list waiting in the relay for up to 15 minutes) and offers "Export a backup first". A second, explicit confirmation, "Delete everything on this phone", follows. The app then reloads into a fresh start.

**Storage failure screens.** When the records cannot be opened, one plain screen replaces the app (no tabs, no Settings, no delete-all), always with the not-a-medical-device line and the help numbers: "This phone has records from a newer version of the app. Nothing has been changed. Connect to the internet and reload. If this screen comes back, close the app in every Chrome tab and in Recent apps, then open it again.", "The app could not update your records. Nothing was changed. Save a rescue copy, then reload. …" (with "Save a rescue copy", locked by default), "This browser cannot store the app's records (private mode or storage blocked)." and "The app's records were closed in this window. Another window or tab of the app may have updated, restored or reset them, or the browser closed them. Reload." A waiting update shows its banner there too, and Reload applies it (storage spec section 7.4)

---

## 8. Laptop side panel (Chrome extension)

**Mode B (expected):** Header "PAK'nSAVE Pāpāmoa, list from phone 10:42". Items grouped by aisle with tick box, "Find" button and a note field. "Find" opens a new tab with the site's search for an editable term. Progress bar: "7 of 23 done". Footer: "This panel does not read PAK'nSAVE pages. Prices and stock are whatever the site shows. You add items and check out yourself." Buttons: Paste code, Clear list, Unpair.

**Mode A (only if permitted):** Same, plus a "Push selected items" button that shows each item, the match found, the quantity, and requires one explicit click per batch; a visible progress log; a Stop button; a "Review in cart" link. Never a checkout button. Store check before every batch: if the site's selected store is not Pāpāmoa, the batch does not start.

**Mode C:** The panel simply shows the list for reference, with copy per item.
