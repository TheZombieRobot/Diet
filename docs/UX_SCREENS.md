# Screen Descriptions (text wireframes)

Plain-language descriptions of every MVP screen, written so you can picture them and so the implementing model builds the same thing. Design rules: one-handed use, large tap targets (at least 48 px), readable in sunlight (high contrast, no thin grey text), dark mode, very little typing, offline state always visible.

**Global elements**
- Top bar: screen name, a small cloud icon that reads "Offline, all saved" or "Online", and a settings gear.
- Bottom tab bar, five tabs: **Today**, **Food**, **Move**, **Drinks**, **List**.
- A floating "+" quick-action button on Today.
- Any health message is a card with a calm tone, never red alarm styling unless it is an emergency instruction.

---

## 1. First run (once)

**Screen 1a: Welcome.** "The app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service." What setup asks, the privacy note, and every help number (emergency 111, Healthline, the Alcohol Drug Helpline by call and text, Need to Talk by call and text) as tap-to-call rows. Button: Continue. Nothing else in the app, not even About or a restore, can be reached until the notice on screen 1b is acknowledged.

**Screen 1b: Alcohol safety notice (mandatory, cannot be skipped).** Plain text: "If you drink most days or heavily at weekends, cutting down suddenly can be dangerous. Talk to your GP or the Alcohol Drug Helpline (0800 787 797, text 8681) before making a big change. Call 111 for seizures, confusion or hallucinations." Three help rows: call the Alcohol Drug Helpline, text it, and "Emergency: call 111" (red only on this row). Button: I understand. A link "Why am I seeing this?" explains that it is shown to everyone. There is no skip, close or later control.

**Screen 1c: Readiness questions.** Seven yes/no questions from `HEALTH_SAFETY.md` section 1 (question 7 reads "Do you drink alcohol most days, or heavily at weekends?"), one per card, tap only. An unanswered question cannot be passed. A "yes" shows what it switches off before Continue; under questions 3 and 6 a confirmation switch ("My prescriber has agreed…", "I have discussed exercise with a GP") and, once confirmed, "My medication or dose has changed" / "My symptoms have changed". Final card explains what each "yes" changed. From here on every step offers "Restore from a backup instead" and a "Help numbers and About" link.

**Screen 1d: Profile.** Height, current weight, long-term goal weight (shown as "long-term", with the text "the four-week chart is not a promise"), Kickstart choice ("Strong start for 3 weeks: bigger deficit, protein protected, daily electrolytes", on by default), sex (for guidance figures and energy estimate), year you were born, activity level (default "physically active job"), equipment toggles, household size, dislikes and allergens, gluten-free household toggle (off by default). Height, year of birth and sex are required; current weight is required unless goal setting is closed (answers 1, 2, 5 or a birth year that may be under 18), when it is optional. The goal field and the Kickstart switch are hidden, each with its reason, for answers 1, 2 and 5 and for a low weight; Kickstart is also hidden while answer 3 is not confirmed, and starts off when answer 3 is yes. A weight below BMI 18.5 for the height shows a plain note with "Change answer 5" (no BMI figure); a birth year that disagrees with answer 1 shows a note too.

**Screen 1e: Eating schedule.** Choose a preset (16:8, 18:6, 20:4, 22:2 "5 pm snack + dinner", 23:1 "one meal"), Custom times, or "No fasting plan for now". With Kickstart chosen the preset defaults to 23:1 (used only while a Kickstart period runs; on any other day the app uses 22:2) with a line: "One meal has to carry about 140 g protein. If a day's dinner can't, the app will offer the 5 pm snack. That's not a broken fast." That Kickstart note shows only for the untouched 23:1 default; with Kickstart chosen and any other pattern, a line says the pattern is the owner's own, kept every day. Otherwise 22:2 is preselected; with answer 4 nothing is preselected, the pharmacist note sits above the choices, and whatever is picked is recorded as the owner's own. The screen shows the computed window: for the preselected 23:1, "Eating 6:00 pm to 7:00 pm = 1 hour. Fasting 23 hours." Reflux option: "I get reflux; prefer earlier or split dinner" toggles. The step is left out while fasting is unavailable.

**Screen 1f: Garden.** Silverbeet is pre-listed as "available" (it stays until the garden editor of checklist item 19). Add other crops with amount, harvest-ready and perishability; crops added here can be removed. Skip is allowed.

---

## 2. Today

Top: date and a one-line status such as "Fasting 14 h 20 m. Snack window opens 5:00 pm."

Cards, in order:
1. **Weight.** Latest weight, 7-day average, long-term goal, phase chip ("Kickstart, week 2 of 3" or "Steady"). Four-week sparkline with a shaded front-loaded band labelled "typical range, not a promise". During Kickstart the note reads: "Kickstart: a fast drop is expected now, mostly water and glycogen with some fat." In Steady it reads: "About 0.5–1 kg a week is the pace that holds. A kilogram back after Kickstart is water, not failure." Under the long-term goal, "Next milestone" (never more than 20% below the current weight, worked out by the app). **Log weight** opens the entry in place; **Weigh-ins and trend** opens the Weight screen. Someone who chose Kickstart during setup and has not started one sees a **Start Kickstart today** card here, which asks the four stop-sign questions first.
2. **Fast.** Big Start/End button, planned window, snack and dinner times. On 23:1 days a one-line meal check with the live figures from the day's plan: "Tonight's dinner carries 140 g protein" or "Tonight's dinner carries 95 g protein. Add the 5 pm snack?" with a one-tap Add. If protein or energy is short: "It's fine to widen the window." The protein and energy it checks against are the same day's figures the Nutrition today card shows (item 21).
3. **Nutrition today.** Energy (food, with alcohol as its own part), protein, fibre, net carbs (with the mode's ceiling; no bar in balanced) and saturated fat as bars. Each logged entry shows its time, name and a small badge: Label, Database, or Estimate. With readiness answer 1 or 5, figures are shown without targets. The diet mode's name shows beside the card label, except while the readiness answers switch the carb ceilings off. Until food logging is built (item 23), the card says food logging arrives at a later step and that no food is counted yet, never "Nothing logged yet today." (full review F24).
4. **Water and electrolytes.** Tap Add 250 mL; optional electrolyte switch; no target until the water guide is wired (item 23).
5. **Steps.** Manual entry, remembers yesterday's value for one-tap repeat.
6. **Movement.** Today's session or "Rest day, that counts" with Start. After a session: exertion, soreness, energy, each 1–5 taps.
7. **Drinks.** Today and this week (from Monday): drinks, standard drinks and kcal. Neutral grey. Guidance line underneath: "NZ guidance for men: no more than 3 standard drinks a day and 15 a week, with at least 2 alcohol-free days. No alcohol use is risk-free." (women: 2 and 10). With readiness answer 2 yes or unanswered (pregnant or breastfeeding) the line gives no figures: the safest choice is no alcohol, with the midwife or GP to talk it through. Under 18 the card shows the reason and no figures.
8. **Reminders.** Lipid test at first run (and again when low-carb eating first starts after a balanced start), then cholesterol check-ins when 56 and 84 days have passed since low-carb eating first started (C109); the electrolyte reminder daily during Kickstart and for the first two weeks of any keto carb-ceiling period (C72); a medication-timing reminder when readiness question 4 is yes or unanswered and fasting is switched off (otherwise it is on the Fast card); backup. The backup reminder reads "Back up your records. Your records are kept only on this phone. Export a backup and keep the file somewhere else too." with **Back up now** (opens Settings, Backup and data, with the export ready) and **Not now**. It appears 7 days after the last backup the owner confirmed (or after onboarding), and comes back 7 days after "Not now". When the phone has not promised to keep the app's records, it appears after 3 days, comes back after 1 day, goes first among Today's reminders, and adds "This phone has not promised to keep the app's records. A backup is your only other copy." A backup counts only once the owner answers Yes to "Can you see the file?" after exporting (storage design, section 12.2). After an update or a restore that had to change a stored value to fit new limits, a one-time note reads "This update changed some of your settings to fit new limits." with "See what changed".

"+" quick actions: Log weight, Finish meal, Swap recipe, Complete workout, Add harvest, Add drink, Open grocery list.

Every action opens the screen that owns it; Log weight opens the Weight card's entry in place, with the field ready. Actions not built yet are shown with a "Later" marker and do nothing; actions switched off by a readiness answer show "Off" and the reason.

**2a: Weight** (`#/weight`, from the Weight card; not a tab). Log weight (empty field with the last weigh-in as its hint, −/+ 0.1 kg, "Same as last time", an optional date, time and note); Trend (7- and 14-day averages, weekly change in plain words, the chart over 4 weeks, 30 days or 90 days); Long-term goal (entry, the next milestone, removal); Phase (week of Kickstart, its due date and extensions used, **End Kickstart now**; in Steady, **Start a Kickstart** or the reason one cannot start, the longest wait first, so a stop-sign or the 6-week limit is never "from tomorrow"; a Kickstart whose first day has not come by the phone's date, because the clock was ahead when it was started, says so with that day and **End Kickstart now**; when readiness answers or a weight below BMI 18.5 switch the phase off, the reason with a link to Settings, Readiness answers); Weigh-ins (newest first, edit and delete); How to read this (the "steeper in your first Kickstart" sentence only while the chart draws it). The weight check-in, Kickstart stop-signs, extension offer, "Kickstart has finished" ("Kickstart has ended", with the reason, when a readiness answer, the birth year or the weight ended it; after a stop-sign answer it names the day the no-deficit pause lasts to) and daily-changes cards show here as on Today, and so does the guidance after a "yes" before a start (eat, salt, 111 and Healthline), which stays through a change of screen or a reload until **OK**.

**2b: Fasting and reflux** (`#/fasting`, opened from the Fast card, and from Settings, Eating schedule). The current fast with its start time (which can be corrected), the stop-signs with the Healthline and 111 rows, the eating pattern (the same editor as Settings, Eating schedule), the reflux card (log heartburn, night cough or regurgitation with one tap, rate it, add a note; the earlier-dinner and split-meal options; the chest-pain line with 111; the "see a GP" line; the last 14 days) and the history of completed fasts with the streak ("3 days in a row with a completed fast", shown from 2 days, never as something lost). While fasting is switched off by the readiness answers, only the reflux card and the reason show, and a fast still open can be ended.

---

## 3. Food

**3a: Plan (week view).** Seven columns, each with snack and dinner (or the meals your window allows). Tap a meal to swap from suggestions ranked garden-first. A banner shows diet mode (Keto-preferred / Moderate low-carb / Balanced) with a switch; switching re-ranks suggestions and never deletes anything. Household toggle: "Dinner for 3; my portion shown separately."

**3b: Recipe.** Photo-free, fast. Title, time, serves, ingredients with raw/cooked weights, method steps, nutrition per your portion and per 100 g with source badges, heart-smart badge or saturated-fat flag, allergens listed, garden items marked with a leaf. Buttons: Add to plan, Log as eaten, Scale servings, Substitute ingredient.

**3c: Food log (day).** Chronological entries with badges. "Add from label" opens a form: name, per 100 g or per serve, energy, protein, fat, saturated fat, carbs, fibre, sodium, package size. "Add from recipe/plan" is one tap.

**3d: Garden and pantry.** Two lists. Garden rows: crop, amount, harvest-ready toggle, perishability, photo thumbnail. Pantry rows: item, quantity. "Add harvest" is also on the Today quick actions.

---

## 4. Move

**4a: This week.** Seven-day strip with planned sessions and rest days. Default: two strength sessions (A and B), an optional beach walk and four rest days; a third session (C) can be added with Change weekly plan, here in Move. Rest days marked "counts as success".

**4b: Pre-session check (every session).** Six questions, each answered Yes or No (adding a heavy physical work day): pain or injury, back or leg symptoms, very tired or poor sleep, hot day or sun exposure, not well hydrated, a heavy physical work day. Any "yes" offers the lighter version or rest. Stop rules (all five red flags) with "Call 111 for chest pain that does not settle within a few minutes."

**4c: Session.** Movement list with easier/harder variant switch, band or dumbbell variant if enabled, sets and reps or time, big tick per set, optional demonstration text. Progression suggestion at the top, capped at about 10% more than last week. Finish asks exertion, soreness, energy.

**4d: Beach.** Walk or optional jog with duration. Prompts before start: between the flags when patrolled (Bay of Plenty surf beaches patrolled roughly October to March, hours on Safeswim), rips, sun before 10 am or after 4 pm in summer, water, firm sand first. Jogging unlocks only after four tolerated walks; a tolerated walk is defined in HEALTH_SAFETY section 6.

---

## 5. Drinks

Drinks is one scrolling screen (checklist item 28): the "talk to someone" card at the top while it shows, a row of buttons that jump to each part, then Log, Today and this week, Trends, Your milestones, How you felt, NZ guidance and Help, in that order. The Help card, with the safety notice and every help number, is there in every state, including while drink logging is off.

**5a: Log.** Beverage presets as large buttons (default: "Zero-sugar premix 330 mL, 5%, 94 kcal, 1.3 std"). Tap to add one; hold it, or tap More, for several or an earlier time. Edit presets: volume, ABV, kcal from label, optional label standard-drink value.

**5b: Trends.** Daily bars for drinks, standard drinks and kcal; weekly totals on Monday-start weeks; alcohol-free days counted plainly; a 4-week average line. Optional milestones you or your clinician entered appear as a dotted line labelled "your milestone", never "target" or "limit".

**5c: Guidance and help.** The NZ guidance in context, the "no drinking is risk-free" line, and the help card with the helpline, GP advice and 111 instructions. The sources line names what it covers (the daily and weekly figures and the alcohol-free days); the single-occasion figure comes after it, with a note that it comes from summaries of the guidance and has not yet been checked against an official page (C78). Next-day note with a tick box: "I felt shaky, sweaty, anxious or sick when I hadn't had a drink" which surfaces the help card.

What is deliberately absent: streaks, badges, "calories left", "you've earned", blood-alcohol, driving.

---

## 6. List

**6a: Grocery list.** Grouped by aisle. Each row: item, quantity in pack units, substitute hint, a small leaf for "from garden" with the audit line, tick box. Header: store name "PAK'nSAVE Pāpāmoa" (changeable) and "Prices: unknown unless you add them". Price field per row is optional and timestamped.

**6b: Send and export.** Buttons: Send to laptop (encrypted), Copy as text, Export CSV, Export JSON, Paste code (shown when the relay is unreachable). Status line: "Sent 10:42, waiting for laptop" / "Received on laptop" / "Not sent".

**6c: Pairing** (Settings, Laptop pairing). Says what pairing does, that the camera is used only while scanning, that anyone who photographs the laptop's code could read lists sent and change the list the laptop shows until you pair again, and to scan the code only from this screen, never with the camera app. **Scan the laptop's code** opens a camera view on this screen, moved to the top below the top bar so it can be aimed at 200% text too, and reads the square code the laptop's side panel shows with a reader bundled with the app; there is no way to type the code. Once the code is saved, the screen shows the date and a four-letter pairing check that the laptop shows too, with **Pair again** and **Unpair**. Unpair works on this phone only and asks first; the laptop is unpaired in its own side panel.

---

## 7. Settings
A "Your setup" card leads to **Readiness answers** (every answer, the confirmation switches and what the answers switch off; a change applies at once and deletes nothing), **Profile** (the setup fields except current weight, goal and Kickstart) and **Eating schedule** (only the reason while fasting is unavailable; with a link to "Fasting timer, history and reflux log").

**Diet and targets** (`#/targets`, from Settings, More; built at checklist item 21): diet mode (pick, then "Change diet mode"; leaving keto during a Kickstart asks first and ends it), the energy rough guide and what it is based on, today's energy target, the Kickstart and Steady deficits, the energy floor, protein, the carb ceilings, the saturated-fat budget, and the fibre and water guides. Each figure shows the value in use; an entry outside its range is refused with a message, never changed.

Profile, eating schedule, readiness answers, diet mode, targets (protein, net carbs, saturated-fat budget), the drinking-day cut-over (drinks before 5 am count toward the previous evening; adjustable from midnight to 6 am, C21), the Weight check-in card (the rapid-loss bounds, only after reading their explanation, C46), the alcohol guidance set (C46), equipment (bands, dumbbells and the beach-jogging opt-in), household, allergens, dislikes (C43), hidden recipes and foods, store, Laptop pairing, Backup and data, About (not a medical device, emergency numbers, privacy with the note that no other site is published from the app's GitHub account (C34), what the Label, Database and Estimate badges mean with the data source and its attribution once the food data is added (C97), version). Units are fixed metric, so there is no units setting.

**Backup and data** (built at checklist item 12):
- **Storage status line**, checked at every launch and never stored: "Protected from automatic clearing. A backup is still your only copy if the phone is lost or Chrome's data is cleared.", "Not protected yet: the phone may clear the app's records when space runs low. A backup is your only other copy.", "This browser cannot protect the app's records from clearing. A backup is your only other copy." or "Checking…". About shows the same line.
- **Last backup made** with its date, or "No backup made yet". The backup reminder shows here too when it is due.
- **Export a backup.** "Lock the file with a password" is on by default; the password is typed twice (at least 10 characters) with "If you forget this password, the backup cannot be opened. Nobody can recover it." Turning the lock off shows "Anyone who opens this file can read your records." After the download: "Your phone should now show diet-backup-YYYY-MM-DD.json in Downloads. Check it is there." and "Can you see the file?" Yes records the backup; No says "The backup may not have saved. Try again." If the app's own check of the file fails, it names the store, field and rule and offers "Save an unchecked copy", which does not count as a backup.
- **Restore from a backup.** Choose a file; a locked one asks for its password ("Wrong password, or the file is damaged. Nothing was imported." can be retried). Nothing changes until Replace: the confirmation shows the file's date, whether it was locked, the records per store, any value changed to fit this version, any record a rescue copy could not keep, and "This replaces everything on this phone. N records on this phone are not in the file. M records on this phone were changed after the file was made. Newest record on this phone: …; in the file: …. The laptop pairing will be removed." When the phone has newer records, "Export what is on this phone first" is the first button. The confirmation also says when this phone's Kickstart records are kept with the file's (a restore never removes a Kickstart day, extension or stop-sign answer), when a running Kickstart keeps its diet mode and eating pattern or will end, and when the file holds a fast that was running when it was made, with a switch "End that fast at …, when the backup was made". If something is saved in another tab before Replace, nothing is replaced and the confirmation comes back with fresh counts and a line saying why. After Replace the app reloads on Today; from setup's "Restore from a backup instead" (only after the alcohol notice), it reloads on Settings, Readiness answers, which says once "Your records from the backup are back on this phone. Check that these answers still apply, then go to Today." with "These still apply", or back in setup when the file's setup is not finished.
- **Delete all data.** A first confirmation lists what goes and what stays (the app's own files, a fresh start with the default drink preset and silverbeet, the home-screen icon and the storage setting, a backup password saved in Chrome, the camera permission Chrome keeps for the app, backup files saved elsewhere, the laptop's list and pairing, a list waiting in the relay for up to 15 minutes, and copies restored in another browser) and offers "Export a backup first". A second, explicit confirmation, "Delete everything on this phone", follows. The app then reloads into a fresh start: the first-run flow, from Welcome and the alcohol safety notice.

**Storage failure screens.** When the records cannot be opened, one plain screen replaces the app (no tabs, no Settings, no delete-all), always with the not-a-medical-device line and the help numbers: "This phone has records from a newer version of the app. Nothing has been changed. Connect to the internet and reload. If this screen comes back, close the app in every Chrome tab and in Recent apps, then open it again.", "The app could not update your records. Nothing was changed. Save a rescue copy, then reload. …" (with "Save a rescue copy", locked by default), "This browser cannot store the app's records (private mode or storage blocked)." and "The app's records were closed in this window. Another window or tab of the app may have updated, restored or reset them, or the browser closed them. Reload." A waiting update shows its banner there too, and Reload applies it (storage spec section 7.4)

---

## 8. Laptop side panel (Chrome extension)

**Mode B (expected):** Header "PAK'nSAVE Pāpāmoa, list from phone 10:42". Items grouped by aisle with tick box, "Find" button and a note field. "Find" opens a new tab with the site's search for an editable term. Progress bar: "7 of 23 done". Footer: "This panel does not read PAK'nSAVE pages. Prices and stock are whatever the site shows. You add items and check out yourself." Buttons: Paste code, Clear list, Unpair.

**Mode A (only if permitted):** Same, plus a "Push selected items" button that shows each item, the match found, the quantity, and requires one explicit click per batch; a visible progress log; a Stop button; a "Review in cart" link. Never a checkout button. Store check before every batch: if the site's selected store is not Pāpāmoa, the batch does not start.

**Mode C:** The panel simply shows the list for reference, with copy per item.

**Pairing:** Pair (or Pair again) makes a new key and room and shows them as a square code, black on white, only on demand and for at most 5 minutes, with the same pairing check the phone shows. Unpair forgets the key on the laptop only. The header shows when the phone sent the list, and the progress line how many lines it has; when the panel keeps its list instead of an older copy, it says so.
