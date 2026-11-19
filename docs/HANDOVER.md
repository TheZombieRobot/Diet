# Moshpoint: start here (handover)

A new chat or agent reads this file first, then only the files its task touches. Keep it
current: update it at the end of every task, and hand over to a fresh chat at about 300k tokens
of context. Last updated 19 November 2026 (ccr at d1f5df4).

## What this is

Moshpoint is an Android app (Kotlin, Jetpack Compose) for finding your mates at gigs, including
when the mobile network jams or drops. It has:
- **finding:** Bluetooth, Wi-Fi distance, UWB, floors from the barometer, GPS, relaying through
  other Moshpoint phones;
- **crews:** chat, quick pings, meet-up pins;
- **planning:** hype groups and Discover (smart search for gigs);
- **after the gig:** the Story;
- **a Wear OS watch app,** and a Ktor relay server on Fly.io.

Modules:
- `core`: pure Kotlin rules, with most of the tests.
- `app`: the phone app.
- `finder`: the engine library. It holds no gig code.
- `wear`: the watch app.
- `server`: the relay.

Where things live: docs/CODE_STRUCTURE.md.

## The owner's rules (always)

- **Builds:**
  - Only when the owner says "build": a manual run of android.yml with publish = true.
  - Otherwise commit with `[skip ci]`.
  - Check-only runs (publish = false) are fine.
- **Git:**
  - Work on `ccr-5839ed7c-1q0ztj` until it's renamed.
  - Run `git pull --rebase` before every push.
  - No pull requests unless asked.
  - End commits with your session's attribution lines; put no model names anywhere else.
- **Secrets:**
  - Never in the repo, the app or a chat. Placeholders only: docs/SECRETS.md.
  - `python3 tools/check_secrets.py` runs in CI.
- **Paid versus free:**
  - API keys live only on the paid relay; keyed features are Moshpoint+.
  - The free path (ntfy.sh) stays.
  - No build may require `MOSHPOINT_SERVER`.
- **No safety or emergency features or rules.** They were removed on 16 November; the owner never
  asked for them. Never state a rule as the owner's unless the owner gave it.
- **No real band names** in screenshots or marketing.
- **Feature freeze** (19 November) until the MVP launches: fixes, tuning and the iPhone app only.
- **Talking to the owner:** short, plain words. They're often on a phone.
- **Usage (the lean way):**
  - one chat or agent at a time;
  - read only what the task needs;
  - one CI check per task, not per small step;
  - hand over early.

## Where it stands

- Everything is merged and green on ccr (check-only runs 362, and one for d1f5df4).
- **The last published test build is 312** (5b138e7, 16 November). Everything since is
  unpublished:
  - the battery work and relay batching;
  - Discover (app and server);
  - Report and Block;
  - the safety removal;
  - Text my spot and the satellite switch (Moshpoint+);
  - texted spots that open Moshpoint;
  - "Heading home";
  - launch prep (deploy button, /privacy, release checks, RELEASE_CHECKLIST.md, store images).
- **First field result:**
  - The build: an early one (about build 15).
  - The gig: a crowd of 10,000–18,000.
  - What happened: a mate coming back from the toilet found the crew in a moving 1,000-person
    mosh pit, about 10 m from where he'd left them. He'd otherwise have missed them all night,
    and the owner reckons that was worth about $20 to him.
- **The core use case:** the last 10–30 m in a packed crowd, getting back from the toilet or the
  bar. It happens many times every gig.

## Queue (in order)

1. **Repo transfer** (the owner) to their main GitHub account, then:
   - reconnect Claude (claude.ai/connect-github, and install the Claude GitHub App on the repo);
   - make `ccr-5839ed7c-1q0ztj` the default branch, or rename it to `main` and update the branch
     names in android.yml and deploy-server.yml. The Run workflow buttons need this.
2. **Android final bug hunt.**
   - A fresh agent at Max effort reviews everything since build 312 (5b138e7).
   - A failing test comes first for every bug, then the fix.
   - It also writes docs/REVIEW_GUIDE.md for an outside reviewer.
3. **ChatGPT (Codex) review.** The owner runs it, report-only, using REVIEW_GUIDE.md. Verify each
   finding before fixing anything.
4. **The owner says "build".** Then the owner's bug check, and the gig field test
   (FIELD_TEST_PLAN.md, with the field recorder on):
   - the toilet return from 30–50 m;
   - Light me up;
   - pings;
   - battery over 4 hours.
5. **iPhone for the MVP.**
   - First a feasibility spike:
     - Bluetooth finding between iPhone and Android, in the foreground and the background;
     - porting the crypto to a Kotlin Multiplatform core;
     - building on GitHub's macOS runners;
     - TestFlight.
   - Then a native app with MVP scope: crews and QR invites, the map and live location, chat and
     pings, the finder (Bluetooth and GPS), the meet-up pin, Light me up.
   - Later on iPhone: the watch, Story, satellite, Discover.
6. **Tuning from the field recordings.**
   - On Bluetooth-only phones, show an honest wide arrow instead of a sharp needle.
   - Make the distance trend the main signal ("closer… 12 m… 6 m").
   - Offer Light me up automatically within about 15 m.
   - Try Bluetooth 5's long-range mode (LE Coded PHY) in the field test, on phones that support it
     (`isLeCodedPhySupported`): an extended advert on Coded alongside the normal one. Compare its
     range and detection in a packed crowd against battery cost. Wave 2c dropped Coded scanning
     because nothing sent it.
7. **Pricing research after the field test.**
   - Crew pass or per person?
   - Gig, festival and season passes; the first gig free.
   - What's free and what's paid. The proposal: the crew, chat and map are free; the arrow,
     no-signal mode, satellite and smart search are paid.
   - Then payments (Play Billing, checked on the relay).

**After the MVP (frozen until then):**
- Eventfinda as a Discover source, and a "Paste ticket link" box for hand-typed gigs.
- Festival set times, and Android 16 Live Updates.
- Gig mood themes: a colour palette from the API's event image plus genre moods. Never altered
  artwork, and no band names in any AI prompt.
- Ticket affiliates (Ticketmaster through Impact; Ticketek's partner programme).
- A festival partnership.

## The owner's sign-ups (steps in docs/RELEASE_CHECKLIST.md, docs/SERVER_PRODUCTION.md)

- **Fly.io:** an account, then the `FLY_API_TOKEN` secret, then the Deploy server button.
- **Google Play Console:** US$25. A personal account needs a 14-day closed test with 12 testers.
- **Gig data:** a Ticketmaster key, a Bandsintown app ID and a SeatGeek client ID, all on the paid
  relay only.
- **The upload key:** the key and the four `MOSHPOINT_KEY*` secrets.
- **After deploying:** `MOSHPOINT_SERVER` (a variable) and `MOSHPOINT_APP_CERTS`.
- **For iPhone:** Apple Developer, US$99 a year.
- **Optional:** a domain and email (the relay already serves /privacy).
- **Later:** Eventfinda API access.

## Open decisions (the owner's)

- **Pricing model:** see queue item 7.
- **Smart search before payments:**
  - Testers get it through a test relay with `MOSHPOINT_DISCOVER_OPEN=1`.
  - Public users need payments first.
- Should Find (the arrow) also work for the meet-up pin and your own saved spots? Today it only
  works for texted spots.
- The privacy policy's legal name, and whether the Play account is personal or a company.

## How to work

- **At home (the CLI):**
  - Install Android Studio and JDK 17.
  - Tests: `./gradlew :core:test :server:test`.
  - Build: `./gradlew :app:assembleDebug`, then install over USB.
  - Screenshots: `./gradlew :app:recordPaparazziDebug` or `:app:verifyPaparazziDebug`.
- **In the cloud:**
  - Google Maven is blocked, so only CI compiles the app.
  - core and server test locally with a scratch Gradle build of just `:core` and `:server`,
    using mavenCentral (docs/WATCH.md).
- **Before every push:**
  - `python3 tools/check_secrets.py`
  - `for d in app/src/main/res/values-*/; do python3 tools/check_translation.py "$d"; done`
  - `python3 tools/check_translation.py --same-languages app/src/main/res wear/src/main/res`
- **Screens:**
  - Every new string goes in all 20 languages.
  - After CI, compare `ui-screenshots-<branch>` (and the watch pair) with `ui-screenshots` by blob
    hash. Only the screens you meant to change may differ.
- **Older builds have to keep working:** message formats don't change without a core test that
  proves build 312 is unaffected (OlderBuildsTest).

## Key docs

- ROADMAP.md
- FEATURES.md
- PRODUCTION_AUDIT.md
- RELAY_API.md
- SERVER_PRODUCTION.md
- RELEASE_CHECKLIST.md
- SECRETS.md
- FIELD_TEST_PLAN.md
- CODE_STRUCTURE.md
- WATCH.md
- PRIVACY.md
- PLAY_STORE.md

The WAVE*, REMOVE_SAFETY, SPOT_LINKS, LAUNCH_PREP and DISCOVER_* docs are history: read one only
when your task touches that area.
