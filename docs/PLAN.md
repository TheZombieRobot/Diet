# 4-Week MVP Plan — Personal Fitness, Fasting, Keto-Aware Meals and Grocery App

**Status:** Planning complete, awaiting your approval. No code has been written.
**Date:** 18 October 2026
**Audience:** You (the owner, non-coder) first; the implementing model (Opus 5.5) second.
**Companion documents:** `INTEGRATION_FEASIBILITY.md`, `HEALTH_SAFETY.md`, `TEST_PLAN.md`, `IMPLEMENTATION_CHECKLIST.md`.

---

## 0. Read this first: one gap and three questions

**The handoff document was not available to me.** `Personal_Fitness_Grocery_App_Claude_Handoff.md` is not in this repository, not in the session's upload folder, and the GitHub repository is completely empty. I built this plan from the requirements in your message instead. Everywhere I had to guess a detail that the handoff probably settles, I have written **ASSUMPTION** and recorded it in section 3. Before coding starts, the handoff needs to be committed to `docs/handoff/` (or pasted to me) so the assumptions can be reconciled. That reconciliation is item 1 of the implementation checklist.

The three questions I genuinely cannot answer with a sensible default are in section 10. Everything else has a documented default you can simply accept.

---

## 1. What we are building, in one paragraph

A private app that you install on your Android phone from the browser (a "PWA", a web app that behaves like an installed app and works with no internet). In it you plan keto-leaning, heart-conscious meals built around what your garden produces and what PAK'nSAVE sells; log your weight, fasting windows, exercise sessions and alcohol in New Zealand standard drinks; and generate a grocery list. The grocery list, and only the grocery list, can be sent securely to your laptop, where a small Chrome extension shows it in a side panel while you shop on paknsave.co.nz and ticks items off as you add them yourself. Your health data never leaves the phone.

**What "MVP" means here:** by the end of week 4 you can run a full real week with it: plan meals, shop at Pāpāmoa using the laptop side panel, train on the beach with the exercise plan, and see your weight, fasting and drinking trends. It will not yet be polished, and it will not put items into your PAK'nSAVE cart for you (see `INTEGRATION_FEASIBILITY.md` for why that is unproven).

---

## 2. Guiding principles (the "why" behind every decision below)

1. **Health data stays on the device.** Weight, fasting, alcohol and exercise records live only in the phone's local database. There is no account, no server-side health store, no analytics. You can export an encrypted backup file whenever you like.
2. **Safety rules are built in, not bolted on.** The app has hard rules it will not break: it never produces an alcohol reduction schedule, never coaches fasts longer than 24 hours, never sets a weight goal below a healthy range, and always shows where to get real help. These are specified in `HEALTH_SAFETY.md` and tested in `TEST_PLAN.md`.
3. **Honesty about what is unverified.** The app never shows a price, a stock level or a "added to cart" message that it has not actually confirmed. Where we do not know, the screen says so.
4. **Offline first.** Everything except the grocery-list hand-off works with the phone in flight mode. Pāpāmoa reception is not the app's problem.
5. **Boring, well-trodden technology.** A four-week solo build cannot afford novelty. Every component chosen is mainstream, free, and well documented.
6. **Respect third parties' terms.** No credential handling, no reverse engineering of PAK'nSAVE systems, no scraping, no anti-bot bypass. The extension helps *you* shop; it does not shop for you.

---

## 3. Assumptions made because the handoff was unavailable

| # | Assumption | Why this default | Replace with handoff content? |
|---|-----------|------------------|-------------------------------|
| A1 | Your garden produces typical Bay of Plenty home-garden crops: silverbeet, kale, spinach, lettuce, zucchini, tomatoes, capsicum, cucumber, green beans, broccoli, cauliflower, spring onion, parsley, basil, coriander, rosemary, lemons, avocado, feijoa, rhubarb. | Common in the region; most are keto-friendly. | **Yes, essential.** The real list drives recipe selection. |
| A2 | You are an adult with no diagnosed condition that forbids fasting or keto, but with a cholesterol concern (hence "cholesterol-conscious"). | Your message says cholesterol-conscious keto. | Yes. If you take diabetes, blood-pressure or lipid medication, the safety screens in `HEALTH_SAFETY.md` change what the app allows. |
| A3 | Default fasting pattern is 16:8 (16 hours fasting, 8 hours eating), with the app allowing you to log windows up to 24 hours and flagging anything longer. | The most studied, lowest-risk time-restricted pattern. | Yes if the handoff specifies a different protocol. |
| A4 | Keto target is a configurable daily net-carbohydrate ceiling, default 30 g, with a saturated-fat budget of about 10% of energy. | Keeps you in the common "keto" band while honouring NZ guidance to limit saturated fat. | Yes. |
| A5 | "Beach exercise" means Pāpāmoa Beach: sand walking/jogging, bodyweight circuits on the sand, wading and swimming only between the flags at patrolled times. No equipment beyond a mat and a towel. | Matches "safe bodyweight/beach exercise". | Yes if you have equipment (bands, kettlebell) or a different location. |
| A6 | The laptop runs desktop Chrome and you are comfortable loading an "unpacked" extension in developer mode once (a two-minute, one-time step). | Avoids Chrome Web Store review for a personal tool. | Confirm. |
| A7 | You shop at PAK'nSAVE Pāpāmoa using Click & Collect or in person, with a Club+ account you already hold. | PAK'nSAVE's own FAQ says online shopping is Click & Collect only and needs Club+ (sources in `INTEGRATION_FEASIBILITY.md`). | Confirm. |
| A8 | One user, one phone, one laptop. No sharing with household members in the MVP. | Keeps the security model simple. | Yes if someone else needs the list. |
| A9 | Units: kilograms, centimetres, millilitres, kilojoules shown with kilocalories alongside. | NZ convention. | Confirm. |
| A10 | You drink alcohol at least occasionally and want trends against NZ low-risk guidance, not a quit programme. | Your message asks for logging with no unsupervised taper. | Confirm. |

---

## 4. Architecture in plain language

Three pieces, two of which you will touch and one that is invisible.

```
 PHONE (Android, Chrome)                 LAPTOP (Chrome)
 +---------------------------+           +-----------------------------+
 | Installed web app (PWA)   |           | Chrome extension, side panel|
 |  - meals & recipes        |           |  - shows today's list       |
 |  - garden & pantry        |  grocery  |  - "find" opens PAK'nSAVE   |
 |  - weight / fasting log   |  list     |     search for that item    |
 |  - exercise plan & log    |  only,    |  - you add to cart yourself |
 |  - alcohol log (std drinks|  encrypted|  - tick items off           |
 |  - grocery list builder   | ========> |                             |
 |  All health data stays    |     |     +-----------------------------+
 |  here, in the phone.      |     |
 +---------------------------+     |
                                   v
                        +----------------------+
                        | Tiny relay (optional)|
                        | holds ONLY encrypted |
                        | blobs for 15 minutes |
                        | cannot read them     |
                        +----------------------+
```

**Phone app.** A single web app you open once in Chrome and tap "Install". After that it has its own icon and works with no signal. It stores everything in the phone's built-in database (IndexedDB). Built with Vite + React + TypeScript, Dexie for the database and Workbox for the offline layer. Hosted as static files (see question Q2).

**Laptop extension.** A Chrome "Manifest V3" extension that adds a side panel (Chrome's built-in sidebar, available since Chrome 114). It needs only two permissions, `sidePanel` and `storage`, plus permission to talk to the relay. It needs **no** permission to read or change paknsave.co.nz pages in the MVP, which keeps it well inside both Chrome's rules and PAK'nSAVE's.

**Relay.** When you tap "Send to laptop", the phone encrypts the list with a key that only your phone and your laptop know (established once by scanning a QR code shown on the laptop). The encrypted blob is posted to a tiny relay service, which stores it for 15 minutes and hands it to the extension. The relay cannot read the list. Default: a Cloudflare Worker on the free tier under your own account (question Q1). **Fallback if you prefer no relay at all:** the phone shows the list as a compact text code you share to yourself (email, Keep, Messages for Web) and paste into the extension. Grocery lists are low-sensitivity, but the encrypted path is still the default.

**Why not a "real" Android app?** A PWA installs from the browser, needs no Play Store account, updates by itself when you reload, and the same code runs on the laptop for testing. Native Android would roughly double the build time for no MVP benefit.

**Why not one shared cloud database?** It would make health data leave the phone, require accounts and security work we do not need, and is the single largest source of scope creep in apps like this.

---

## 5. Feature scope

### In the MVP (weeks 1–4)
- Installable, offline Android PWA with backup export/import.
- Profile and safety screens (one-time health readiness questions, see `HEALTH_SAFETY.md`).
- Weight log with 7-day trend line and rate-of-change flag.
- Fasting timer and log (start/stop, planned window, history, streak), with the 24-hour ceiling behaviour.
- Ingredient database of roughly 150 NZ-relevant foods with energy, protein, fat, saturated fat, carbohydrate, sugars, fibre and sodium, sourced from the New Zealand Food Composition Database subject to its terms (see `INTEGRATION_FEASIBILITY.md` section 6).
- Garden and pantry inventory (what you have, so it is not bought).
- About 30 keto-leaning, heart-conscious recipes tagged by garden ingredients, with per-serve nutrition and a saturated-fat indicator.
- Day and week meal planner with daily net-carb and saturated-fat totals against your targets.
- Grocery list generation: planned recipes minus garden/pantry stock, grouped by supermarket aisle, with quantities in buyable units.
- Exercise library (about 25 bodyweight and beach movements with easier/harder versions), three ready-made sessions, session logging, and beach-safety prompts.
- Alcohol log in NZ standard drinks (10 g alcohol), with a drink picker, custom volume/ABV entry, daily and weekly totals against NZ low-risk guidance, alcohol-free-day tracking, and the "talk to a professional" card. No taper, no reduction schedule, no blood-alcohol estimates.
- Secure phone-to-laptop list transfer with QR pairing and end-to-end encryption, plus the paste fallback.
- Chrome side-panel extension: receive list, open PAK'nSAVE search per item, tick off, "not found/substituted" notes, clear list.
- Automated tests and a real-world shopping trial at Pāpāmoa.

### Later (after MVP, if wanted)
- Fasting-window and training reminders (Android notifications from the PWA).
- Barcode scanning to add pantry items.
- Price memory (you type the price you paid; the app remembers it). No automated price capture.
- Reading your PAK'nSAVE cart to auto-tick items ("Tier 2" in the feasibility document), only after the terms review passes.
- Sharing a list with a household member.
- Photo of meals, water intake, step count via Health Connect.

### Not planned
- Automated add-to-cart or checkout on PAK'nSAVE (unproven and possibly disallowed; see feasibility document).
- Any handling of your PAK'nSAVE login or password.
- Scraping prices or stock from any supermarket.
- Blood-alcohol or "safe to drive" calculations.
- Alcohol reduction/taper plans.
- Extended-fast coaching (over 24 hours).
- Cloud sync of health data, accounts, analytics, advertising.
- iOS.

---

## 6. Week-by-week plan

Each week ends with something you can hold in your hand and try. Estimates assume one implementing model working in focused sessions with you reviewing at week ends.

### Week 1 — Foundations you can install
**Goal:** the app is on your phone, works offline, and already logs weight and fasting.
- Repository structure (one repo, three parts: phone app, extension, shared code and data).
- Installable PWA shell: icon, splash, offline caching, "Install" prompt, update banner.
- Local database and backup export/import (JSON, optionally password-encrypted).
- Profile and health-readiness screens with the safety rules wired in.
- Weight log and trend chart. Fasting timer and history.
- Your tasks this week: commit the handoff document; answer Q1–Q3; read the two PAK'nSAVE terms pages and paste the relevant clauses into `INTEGRATION_FEASIBILITY.md` (I could not fetch them from this environment).

**You can:** install it, log weight and a fast, turn off Wi-Fi and see it still work, export a backup.

### Week 2 — Food
**Goal:** plan a real week of meals and get a shopping list.
- Ingredient database loaded, with source attribution.
- Garden and pantry inventory screens (seasonal "in the garden now" toggles).
- Recipe library with filters: garden-first, net carbs, saturated fat, time to cook.
- Day/week planner with running totals and target indicators.
- Grocery list builder with aisle grouping and buyable units.

**You can:** plan Monday to Sunday using what the garden has, see the daily carb and saturated-fat picture, and get a list grouped by aisle.

### Week 3 — Body, drinks, and the laptop hand-off
**Goal:** train safely, log drinks honestly, and get the list onto the laptop.
- Exercise library and three sessions (sand circuit, mobility/core, walk-wade recovery) with readiness and stop-rule prompts.
- Alcohol log with NZ standard-drink maths and the guidance comparison.
- Relay service, QR pairing, encryption, "Send to laptop".
- Chrome extension side panel: pairing, receive, tick, per-item PAK'nSAVE search link.
- Paste fallback.

**You can:** do a beach session from the app, log the weekend's drinks and see where you sit against NZ guidance, and watch your list appear on the laptop.

### Week 4 — Prove it works
**Goal:** confidence, not features.
- Full test pass (`TEST_PLAN.md`), including every safety rule.
- Real shopping trial at PAK'nSAVE Pāpāmoa with the side panel: time it, note what was awkward.
- Lighthouse PWA audit, accessibility pass (large touch targets, readable in sunlight, dark mode).
- Bug fixing from the trial, data corrections, copy review of all health text.
- Go/no-go review for the "later" items, especially Tier 2 cart reading.
- Handover notes: how to update, back up, and re-pair.

**You can:** rely on it for a normal week.

### Schedule risk
Week 3 is the heaviest. If it slips, the paste fallback ships first and QR/relay pairing moves to the start of week 4. Nothing in week 4 is sacrificed; the trial and tests are the point of the MVP.

---

## 7. Decisions and defaults

| Decision | Default | Why | Change it if |
|---|---|---|---|
| App type | Installable PWA | No store account, offline, updates itself, one codebase | You need Health Connect or background sensors (then a thin Android wrapper later) |
| Front-end stack | Vite + React + TypeScript | Mainstream, excellent tooling, easy for any model to maintain | Never for the MVP |
| Local database | IndexedDB via Dexie | Robust offline storage, handles thousands of records easily | n/a |
| Offline layer | Workbox via vite-plugin-pwa | Standard service-worker tooling | n/a |
| Hosting (phone app) | GitHub Pages from this repo (repo confirmed public, 18 Oct 2026) | Free HTTPS static hosting; HTTPS is required for install | The repo is made private: switch to Cloudflare Pages, a one-hour change |
| Relay for list transfer | Cloudflare Worker + KV, free tier, 15-minute expiry, 64 KB cap, encrypted blobs only | Cheapest reliable path; relay is blind to content | See Q1 |
| Encryption | WebCrypto AES-GCM 256, key shared by QR at pairing, never sent to the relay | Browser-native, no libraries to trust | n/a |
| Extension type | Chrome MV3 with side panel, loaded unpacked | No store review, no page-access permissions | You later want it on the Web Store |
| PAK'nSAVE interaction | Tier 1 only: open a search for each item; you add to cart | Legal and technical status of anything deeper is unverified | Terms review and (if needed) written permission pass |
| Nutrition data | NZ Food Composition Database (Concise tables), hand-curated subset, attribution shown in app | NZ-specific, authoritative | Its terms (clause 4) disallow app use; then switch to USDA FoodData Central, which is public domain, and note the NZ gaps |
| Standard drink | 10 g pure alcohol; drinks = volume (mL) × ABV% × 0.789 ÷ 1000 | NZ definition and alcohol.org.nz formula | n/a |
| Drinking guidance shown | NZ low-risk advice: women ≤2/day and ≤10/week, men ≤3/day and ≤15/week, ≥2 alcohol-free days, with a 4-per-occasion note flagged as secondary-sourced | Published NZ guidance | Guidance is updated |
| Fasting ceiling | Log up to 24 h; longer shows a warning and no coaching | Safety | Your clinician advises otherwise |
| Weight loss flag | More than 1 kg/week sustained for 3 weeks prompts a check-in message | Common clinical rule of thumb | Your clinician advises otherwise |
| Energy estimate | Mifflin-St Jeor from profile, shown as a rough guide only | Standard, simple | n/a |
| Units | kg, cm, mL, kJ with kcal | NZ convention | A9 |
| Testing | Vitest (logic), Playwright (browser and extension), manual device checklist | Mainstream | n/a |
| Licence | Private repository, no licence file needed for MVP | Personal project | You open-source it |

---

## 8. Risks and how the plan handles them

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Handoff requirements differ from my assumptions | High | Medium | Reconcile in week 1 before food or exercise content is written; data files are easy to swap |
| PAK'nSAVE terms forbid even opening search URLs from an extension | Low | Low | You read the terms in week 1; fall back to copy-to-clipboard, which no terms can object to |
| Week 3 overload | Medium | Medium | Paste fallback first; QR/relay can slide into week 4 |
| NZ food database terms disallow app embedding | Medium | Low | USDA fallback decided in advance |
| Chrome "developer mode extension" warning annoys you | Medium | Low | One-time dismissal; Web Store listing is a later option |
| Health copy drifts into medical advice | Medium | High | Every health string lives in one file reviewed against `HEALTH_SAFETY.md`; tests assert forbidden phrases are absent |
| Phone storage loss | Low | High | Weekly backup reminder; export is one tap |
| Over-engineering | High | High | The "Not planned" list is a contract; new ideas go to "Later" |

---

## 9. Definition of done for the MVP

1. The app installs on your Android phone from Chrome and passes Chrome's installability check.
2. With the phone in flight mode you can log weight, a fast, a training session and drinks, plan a day of meals, and generate a list.
3. Every rule in `HEALTH_SAFETY.md` section 8 has a passing automated test.
4. A list of at least 25 items reaches the laptop extension within 30 seconds via the encrypted path, and via paste when the relay is unreachable.
5. You complete one real Click & Collect or in-store shop at Pāpāmoa using the side panel and record the experience in `docs/TRIAL_LOG.md`.
6. The app shows no price, stock, or cart status anywhere.
7. Backup export and import round-trips all data.
8. All items in `IMPLEMENTATION_CHECKLIST.md` marked "MVP" are ticked with their acceptance tests passing.

---

## 10. Questions for you (only the ones I cannot default)

**Q1. Relay hosting.** May the implementing model set up a free Cloudflare Workers account (or use one you create) for the blind, encrypted list relay? If you would rather have no third-party service at all, say so and the MVP ships with the paste fallback only, with QR-camera transfer as a later option. *Default if no answer: Cloudflare Worker.*

**Q2. Repository visibility.** *Answered 18 Oct 2026: the repo is public.* Hosting is GitHub Pages. Consequence: everything committed here is visible to anyone, so personal documents must not be committed (see Q3 and `docs/DECISIONS.md`). If you later make the repo private, hosting moves to Cloudflare Pages.

**Q3. The handoff document.** Because the repo is public, do **not** commit the handoff if it contains anything personal (health history, medications, address, drinking patterns). Instead paste it into the chat, or commit a version with personal details removed. The reconciled, de-personalised assumptions then live in `docs/PLAN.md`; your personal answers live only in the app on your phone. Without the handoff, assumptions A1 (garden list) and A2 (health context) stay as placeholders.

Everything else proceeds on the defaults in section 7 unless you object.

---

## 11. What happens after you approve

The implementing model follows `IMPLEMENTATION_CHECKLIST.md` in order, stopping at the marked STOP points: after week 1 (installable app in your hands), after the terms review, and before the shopping trial. Each stop is a short message to you with what to try and what to look at. No step touches PAK'nSAVE systems beyond opening ordinary web pages in your own browser.
