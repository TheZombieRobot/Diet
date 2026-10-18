# Health and Safety Design

This document sets the rules the app must obey when it touches health. It is written for you first and for the implementing model second. Every rule in section 8 becomes an automated test (see `TEST_PLAN.md`). Where a rule rests on published guidance, the source is linked. Where it rests on a judgement call, it says so.

**The app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service.** That sentence, in plain words, appears on the first-run screen and on the "About" screen.

**Emergency and help numbers shown in the app (New Zealand):**
- Emergency: **111**
- Healthline (24/7 health advice): **0800 611 116**
- Alcohol Drug Helpline (24/7, free, confidential): **0800 787 797**, text **8681** ([Healthpoint listing](https://www.healthpoint.co.nz/mental-health-addictions/addiction/alcohol-drug-helpline/print))
- Need to Talk: **1737** (free call or text)

---

## 1. First-run readiness screen

Asked once, editable later in Settings. Answers change what the app allows; they are stored only on the phone.

1. Are you under 18? → If yes: fasting, keto targets and alcohol logging are disabled; the app works as a food and exercise planner only.
2. Are you pregnant or breastfeeding? → If yes: fasting features disabled, keto carb ceiling disabled (meals still planned), message to discuss diet with a midwife or GP.
3. Do you take insulin, a sulfonylurea or any medication for diabetes? → If yes: fasting disabled until you confirm your prescriber has agreed; message explains the hypoglycaemia risk. Basis: a review in BMJ Open Diabetes Research & Care notes intermittent fasting "has the potential for hypoglycemia in patients receiving antidiabetic medications such as sulfonylureas and insulin" and should be medically supervised ([BMJ Open DRC 2020](https://drc.bmj.com/content/8/1/e001248)).
4. Do you take medication that must be taken with food, or blood-pressure or cholesterol medication? → If yes: fasting allowed, with a standing reminder to check timing with your pharmacist or GP; the cholesterol section adds a "share with your GP" export.
5. Have you ever been treated for an eating disorder, or is your weight currently low? → If yes: fasting disabled, weight-goal setting disabled, trend shown without targets.
6. Has a doctor ever told you not to exercise, or do you get chest pain, dizziness or faint during activity? → If yes: exercise plans shown only after you confirm you have discussed exercise with a GP. Based on standard pre-exercise screening practice.
7. Do you drink alcohol most days? → Used only to decide whether the "talk to a professional before changing your drinking" card is shown prominently from day one (section 5).

The app never says "you are safe to fast/train/diet." It says "nothing you have told the app rules this out; your GP knows more."

---

## 2. Weight

**What it does:** daily (or less often) weight entry, 7-day rolling average line, 30/90-day view, optional goal.

**Rules**
- Goals cannot be set below a BMI of 18.5 for your height, or below your current weight by more than 20% at a time. Plain-language reason shown.
- If the rolling average falls faster than 1 kg per week for three consecutive weeks, a card says: "You're losing weight quickly. That's worth a check-in with your GP, especially on a low-carb plan." Judgement call based on common clinical rules of thumb; adjustable in Settings only after reading the explanation.
- The app never shows "ideal weight" or body-fat estimates.
- Daily fluctuations are explained once ("a litre of water is a kilogram") to discourage over-reaction.

---

## 3. Fasting

**What it does:** start/stop timer, planned window (default 16 hours), history, streak, notes for how you felt.

**Rules**
- Default pattern 16:8. Selectable presets: 12:12, 14:10, 16:8, 18:6. The longest selectable planned window is **24 hours**.
- If a running fast passes 24 hours, the timer keeps counting (logging must stay honest) but shows: "Fasts over 24 hours are outside what this app supports. Break the fast if you feel unwell, and talk to a GP before fasting this long again." No streak credit beyond 24 hours.
- The app never recommends extended fasting, dry fasting, or fasting as a way to "compensate" for eating or drinking.
- Stop-signs listed on the fasting screen: dizziness, fainting, heart palpitations, confusion, severe weakness. "Break your fast and, if it doesn't settle, call Healthline 0800 611 116 or 111."
- Fasting is disabled by readiness answers 1, 2, 3 and 5.
- Alcohol logged during a fasting window shows a neutral note: "Alcohol on an empty stomach hits harder and affects blood sugar." No judgement, no streak penalty beyond what the user chooses.

---

## 4. Nutrition and cholesterol-conscious keto

**What it does:** net-carbohydrate ceiling (default 30 g/day, adjustable 20–50 g), saturated-fat budget (default about 10% of estimated energy), protein guide, fibre guide, sodium shown. Recipes carry a "heart-smart" badge when saturated fat per serve is low and the main fats are unsaturated.

**Why cholesterol-conscious:** Ketogenic eating built on butter, cream, fatty meat and processed meat raises LDL cholesterol in many people, sometimes dramatically. A published case report describes extreme LDL elevation on a ketogenic diet that improved when saturated fat was reduced ([Cureus/PMC 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10436130/)). New Zealand guidance from Health NZ notes that while "some saturated fat in the diet is acceptable, eating too much (as many New Zealanders do) can be harmful for cardiovascular health" ([Health NZ, Behind the hype: low-carbohydrate high-fat diets](https://healthed.govt.nz/products/behind-the-hype-low-carbohydrate-high-fat-diets-npa267)). The Heart Foundation's reported position favours replacing dairy fat with olive oil, oily fish, avocado, nuts and seeds, and considers up to six eggs a week acceptable for people at risk (secondary sources: [Healthy Food Guide](https://www.healthyfood.com/news/new-advice-on-meat-dairy-and-eggs-for-heart-health/), [eggs.org.nz](https://eggs.org.nz/cholesterol/)). The implementing model must link the Heart Foundation's own page once it has been located and read, and must not state a Heart Foundation position beyond what that page says.

**Rules**
- Recipe scoring favours: olive oil, avocado, nuts and seeds, oily fish (salmon, sardines, mackerel, canned tuna in oil), chicken, eggs within six a week, legumes in small keto-compatible amounts, non-starchy vegetables, garden greens.
- Recipe scoring flags: butter, cream, coconut oil, bacon, salami and other processed meats, fatty cuts, cheese above about 40 g per serve. Flagged does not mean forbidden; it means the day's saturated-fat budget is consumed faster.
- The saturated-fat budget is shown as a daily bar alongside net carbs. Exceeding it changes a colour; the app never says "bad".
- A "Cholesterol check-in" card appears when you first enable the keto ceiling and again at 8 and 12 weeks: "Low-carb eating can move cholesterol in either direction. A lipid blood test before you start and again after 8–12 weeks is the only way to know. Your GP can arrange one." The app can export a summary of average daily saturated fat and net carbs for that visit.
- Minimum energy floor: the planner warns if a planned day falls below 5,000 kJ (about 1,200 kcal) and will not generate automatic plans below it.
- Electrolyte reminder (sodium, potassium, magnesium) during the first two weeks of the carb ceiling, with food sources from the garden (silverbeet, spinach, avocado) rather than supplement advice.
- No supplement recommendations, no claims about ketosis measurements, no "fat-burning" language.
- Nutrition figures carry a footer: "Values are averages from the New Zealand Food Composition Database (or USDA where noted). Your plate will differ."

---

## 5. Alcohol

**What it does:** log drinks as NZ standard drinks, see daily and weekly totals and alcohol-free days against NZ low-risk guidance, note how you felt the next day.

**Standard drink definition and maths**
- One NZ standard drink contains **10 grams of pure alcohol** ([alcohol.org.nz](https://alcohol.org.nz/help-advice/standard-drinks), [Health NZ](https://info.health.nz/mental-health/alcohol-and-drug-addiction/drinking-responsibly)).
- Standard drinks = volume in millilitres × alcohol percentage × 0.789 ÷ 1000. Example: a 330 mL beer at 5% = 1.3 standard drinks; a 150 mL glass of 13% wine = 1.5; a 30 mL spirit at 40% = 0.95.
- The drink picker uses NZ-typical serves (330 mL bottle, 440 mL can, 150 mL wine, 30 mL spirit, 500 mL cider, 250 mL RTD) with editable volume and ABV. The label's own standard-drink number can be entered directly.

**Guidance shown in the app** (from [alcohol.org.nz](https://alcohol.org.nz/help-advice/standard-drinks) and [bpac](https://bpac.org.nz/2018/alcohol.aspx)):
- Women: no more than 2 standard drinks a day and 10 a week.
- Men: no more than 3 standard drinks a day and 15 a week.
- At least 2 alcohol-free days every week.
- Some NZ summaries add "no more than 4 on a single occasion"; this is shown with a note that it is from secondary sources, until the implementing model verifies it on an official page.
- The app states that "no level of drinking is completely risk-free," which is Health NZ's framing.

**Hard rules: what the app will never do**
- It never produces a reduction schedule, taper, "cut down by one drink a day" plan, or a quit date. This is your explicit requirement, and it is also the safe default: for a dependent drinker, "stopping suddenly can be dangerous if it is not managed with the help of a medical professional" ([NZ Drug Foundation](https://drugfoundation.org.nz/drugs-a-z/alcohol)), and Auckland's community alcohol and drug service notes that unsupervised withdrawal "can be life threatening" because of complications such as seizures ([Te Whatu Ora CADS, 2024](https://www.tewhatuora.govt.nz/assets/For-health-professionals/Hospital-and-specialist-services/Mental-health-and-addiction/District-and-regional-mental-health-and-addiction-services/Auckland/CADS-resources/I-A-guide-to-safe-drinking-before-your-alcohol-withdrawal-Feb-2024.pdf)).
- It never tells you to stop drinking.
- It never estimates blood-alcohol level or says anything about driving.
- It never awards streaks or badges for alcohol-free days (it counts them, neutrally, because the guidance mentions them).

**The "talk to someone" card**
Shown, without judgement, when any of these is true:
- 7 or more consecutive days with alcohol logged, or
- weekly total at or above double the guidance figure for your sex, or
- you tick "I felt shaky, sweaty, anxious or sick when I hadn't had a drink" in the next-day note, or
- readiness answer 7 is "most days" (shown from day one, dismissible but returns monthly).

Card text: "If you've been drinking most days for a while and are thinking about changing that, the safest first step is a conversation, not a sudden stop. Alcohol Drug Helpline 0800 787 797 (call or text 8681), free and 24/7, or your GP. If someone is very unwell, shaking badly, confused or having a seizure, call 111." alcohol.org.nz's advice that daily drinkers should "discuss your plan on how to do this safely with a health professional" is the basis ([alcohol.org.nz, withdrawal](https://alcohol.org.nz/wellbeing/hinengaro-mental-health/withdrawal)).

---

## 6. Exercise: bodyweight and beach

**What it does:** library of about 25 movements, each with an easier and a harder version, three ready sessions, a session logger (what, how many, how it felt), and location-aware safety prompts.

**Movement library (ASSUMPTION A5: no equipment)**
Lower body: bodyweight squat, split squat, reverse lunge, glute bridge, single-leg bridge, calf raise, step-up on a firm log or step.
Upper body: incline push-up (hands on a bench or rail), push-up, pike push-up, inverted row on a sturdy rail, bear crawl.
Core: dead bug, bird-dog, side plank, front plank, hollow hold.
Beach-specific: soft-sand walking, firm-sand brisk walk/jog near the waterline, knee-deep wading, sand sprints (later progression only), swimming between the flags.
Mobility: hip flexor stretch, calf stretch, thoracic rotations, ankle circles.

**Programming rules**
- Weekly structure aims for the NZ adult guidance: at least 2.5 hours of moderate activity across the week plus two muscle-strengthening sessions ([Eating and Activity Guidelines for New Zealand Adults](https://www.health.govt.nz/publication/eating-and-activity-guidelines-new-zealand-adults); the implementing model should confirm the exact strength wording in the 2020 PDF).
- Progression is one step at a time: add reps before adding the harder version; the app never adds volume more than about 10% week to week.
- Rest days are scheduled, not optional.
- Sessions start with a 5-minute warm-up and end with a cool-down.

**Stop rules shown before every session**
Stop immediately and seek help for chest pain or pressure, severe shortness of breath, fainting or near-fainting, sudden severe headache, or pain that changes how you move. "Call 111 for chest pain that does not settle within a few minutes."

**Beach prompts (shown when the session is tagged "beach")**
- Swim only between the red and yellow flags when lifeguards are on patrol; Bay of Plenty surf beaches are usually patrolled from October to the end of March, with hours on Safeswim ([Bay of Plenty tourism water-safety page](https://bayofplentynz.com/staying-safe-in-the-bay/staying-safe-around-the-water/)). Outside patrol, wade no deeper than knee height. Rips: relax and float, raise a hand, do not fight the current.
- Local lifeguards warn that an outgoing afternoon tide with rising swell is a risky combination ([SunLive](https://www.sunlive.co.nz/news/334723-take-care-with-surf-swells.html)).
- Sun: in the warmer months, train before 10 am or after 4 pm where possible; hat, sunscreen reapplied after sweating or swimming, long sleeves. The implementing model should link the Cancer Society SunSmart page and MetService UV index once read.
- Heat and hydration: carry water; 500 mL per hour of activity in the heat is the in-app default, with electrolytes noted if also on the carb ceiling.
- Sand: start barefoot work on firm, wet sand; soft sand is harder on calves and Achilles. Check for glass and shells. Do not jump from dunes.
- Never swim alone, never after drinking (the app does not compute this; it just says it).
- Exercising while fasted is allowed; the app suggests the lighter sessions and reminds you to break the fast afterwards if the plan says so.

---

## 7. Privacy as a safety feature

- Health records are stored only on the phone, in the browser's database for the app's origin. Clearing site data deletes them, so the app nags for a backup once a week.
- Backup files are JSON; the user may set a password, which encrypts the file with AES-GCM via WebCrypto.
- The only data that ever leaves the phone is the grocery list, encrypted end to end, and only when you tap "Send to laptop".
- No analytics, crash reporting, advertising identifiers, or third-party scripts. Fonts and icons are bundled, not fetched.
- The extension stores only the list and tick state in Chrome's extension storage.

---

## 8. Rules that become automated tests

| ID | Rule | Test idea |
|---|---|---|
| HS-01 | No weight goal below BMI 18.5 or more than 20% below current weight | Attempt both; expect refusal with explanation |
| HS-02 | Fast past 24 h shows warning and stops streak credit | Simulate a 25-hour fast |
| HS-03 | Fasting unavailable when readiness answers 1, 2, 3 or 5 are "yes" | Set each; expect feature hidden with reason |
| HS-04 | Standard-drink maths matches the alcohol.org.nz formula to 0.05 | Table of 10 known drinks |
| HS-05 | Weekly totals compare against the correct guidance for the user's sex; thresholds configurable only within published values | Men/women fixtures |
| HS-06 | "Talk to someone" card triggers on each of its four conditions and never on none of them | Four fixtures plus a control |
| HS-07 | No string anywhere in the app contains a taper or quit instruction (banned phrase list: "cut down by", "reduce by", "taper", "quit date", "stop drinking", "wean") | Static scan of all copy files |
| HS-08 | No blood-alcohol or driving language ("BAC", "blood alcohol", "safe to drive", "legal limit") | Static scan |
| HS-09 | Saturated-fat budget and net-carb ceiling computed from profile; day over budget changes indicator only, no "bad" wording | Fixture day |
| HS-10 | Planner refuses to auto-generate days under 5,000 kJ | Request a 4,000 kJ day |
| HS-11 | Rapid-loss card appears after 3 weeks of >1 kg/week average loss, not before | Synthetic weight series |
| HS-12 | Exercise stop rules and beach prompts render before any beach-tagged session | Snapshot test |
| HS-13 | Emergency numbers 111, 0800 611 116, 0800 787 797 appear on the About screen and the alcohol screen | DOM query |
| HS-14 | No network request leaves the phone app except to the relay host when "Send to laptop" is tapped | Playwright network log while using every screen offline |
| HS-15 | Backup round trip preserves every record exactly | Export, wipe, import, compare |
| HS-16 | Price, stock and cart-status strings are absent from both apps | Static scan for "$", "in stock", "added to cart" |

---

## 9. What this document does not do

It does not evaluate whether keto, fasting or your current drinking are right for you. That conversation is between you and your GP. The app is designed so that it will never pretend otherwise.
