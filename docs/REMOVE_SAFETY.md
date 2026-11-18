# Removing the safety features; Text my spot and satellite data (Moshpoint+)

The owner's decisions of 16 November 2026: take out the app's own emergency features (Need help,
check-ins, the watch's SOS), keep old builds working with this one, and add two Moshpoint+
features (Text my spot, satellite data). Branch: `claude/remove-safety` (from
`ccr-5839ed7c-1q0ztj` at 75fe2fb).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 18 November
2026, 22:55 UTC._

- **Done, stage 1 core (52c876a):** core tests green locally (622; server 103), using a scratch
  Gradle build of only `:core` and `:server` (docs/WATCH.md, "Working notes").
  - `PingPolicy`: Need help, Check in and Home safe are `Group.OLDER_BUILDS`, ordinary pings.
  - `RelayUse.SAFETY` is gone, with every special case: the budget reserve, the pause and slot
    bypasses (`RelayBudget`), the hold bypass (`RelayHolds`), the batch bypass
    (`BatchPlan.route`), the courier's queue jump, slot bypass, retry-through-a-pause, boost and
    durable chat-mailbox copies (`Courier`), and the moderation exception (`BlockList`).
  - `SafetyRules.kt` split: `LiveRules.kt`, `AlarmPlan.kt`, `StorageNotice.kt`, `ClockCheck.kt`
    stay; `HelpRules`, `CheckInReminder` and `CheckIns.kt` are removed with their tests.
  - The interop proof (B): `OlderBuildsTest` opens messages sealed by the code at 75fe2fb.
- **Done, stage 1 app (2974cb1):** `Safety.kt`, `EmergencyNumbers.kt`,
  `HelpUi.kt`, `CheckInAlarm.kt`, `CheckInAlarmReceiver.kt` (and its manifest entry) removed;
  check-ins out of `GroupSync` and `ChatSync`; Need help following out of `OfflineMessages`;
  every ping on the ordinary channel, the old `crew_help` channel deleted; the home header,
  ping bar, crew chat, activity lines and Settings; `Housekeeping` deletes the stored emergency
  contact; screenshot tests for the help dialog removed. Strings: 62 removed from all 20
  folders; the Live and storage strings are now `strings_live.xml` (`live_*`,
  `storage_full_*`), and "storage full" no longer mentions check-ins (new wording, 20
  languages). Checked before pushing: a plain-`kotlinc` type-check of core, finder and app
  (main and tests) with no Android jars shows no new error about our own code compared with
  75fe2fb, and every `R.string` reference resolves.
- **Done, stage 1 docs (1057a06):** FEATURES, ROADMAP, PRIVACY, PLAY_STORE, FIELD_TEST_PLAN,
  PRODUCTION_AUDIT; WAVE2_SAFETY marked as history.
- **Stage 1 is green: CI run 348 on 2974cb1** (phone and watch: translations, core and server
  tests, debug and release builds, 16 KB alignment, screenshots, lint).
  - **Screenshots, phone** (`ui-screenshots-claude-remove-safety` against `ui-screenshots`, which
    is for 75fe2fb, by blob hash): 1,245 identical; 189 gone (the 9 Need help dialog tests × 21
    language folders); 886 changed, all expected: every screen that draws the home's header
    (the Need help pill is gone: home, sheets and dialogs over the home, the hype group, plan a
    gig, smart search, Moshpoint+ info, the venue card), `settingsSheet` (no emergency
    contact), `noticeStorageFull` (no "check-ins") and `homeWhole` (no check-in banner). Looked
    at in en, de, ar, ja, a small phone with a large font and a large font: the wordmark and the
    Live row keep their places, nothing below moves, Arabic keeps the wordmark at the start.
  - **Screenshots, watch:** all 798 identical.
  - **Merged manifest:** differs from the published main build by one line, the removed
    `CheckInAlarmReceiver`: expected. Licence list the same (126 libraries).
- **Done, stage 2 (watch), pushed for CI:** `SosActivity` and `SosScreen` removed (and the
  manifest entry); the crew screen's Need help chip, the tile's button, `HoldToSend` and its two
  buzzes, `WatchFeature.NEED_HELP`/`SOS_ALL_CLEAR` and `PingKind` codes 3 and 4 (an older
  watch's Need help now reads as unknown: the phone sends nothing and answers "not sent";
  `WatchGateTest` pins it). Every wrist ping is Moshpoint+. Watch strings: 8 removed from all 20
  folders; the 6 that the quick pings' result screen shares are renamed `sos_*` → `ping_*`, and
  the red is `Wrist.Red` (same colour). Docs: WATCH.md (problem 8 is now quick messages),
  FEATURES section 10, README, FIELD_TEST_PLAN 4c F and G, ROADMAP, ARCHITECTURE,
  CODE_STRUCTURE. Core tests green locally (618); type-check clean for app and watch.
- **Exact next step:** when the stage 2 run is green: compare the watch screenshots (expected to
  change: the crew screens, which lose the chip at the bottom; gone: the six SOS screens) and
  the phone ones (expected: all identical to run 348's), then stage 3 (Text my spot).
- **Last green run:** 348 (2974cb1).

### Stages (each must be green in CI before the next)

1. Phone removal and interop. **Done, green: run 348.**
2. Watch removal. (pushed, CI running)
3. Text my spot.
4. Satellite switch.
5. **Added 18 November 2026 (relayed by the session that started this one, as the owner's):**
   the receiving end of Text my spot.
   - **The link,** built in core with tests: `https://<relay host>/spot#<lat>,<lon>[,<name>]`.
     The spot rides after `#`, so browsers never send it to the server. The plain coordinates
     stay in the text too. With no server built in (`MOSHPOINT_SERVER` blank), a Google Maps
     link as in stage 3; never a third party's domain for our link.
   - **The app:** an App Link (`android:autoVerify="true"`) for `https://<server host>/spot`,
     from the build's server through a manifest placeholder; no server, no filter. Opening it
     shows the spot as a pin (the existing meet-up pin drawing, labelled with the name or
     "Texted spot"), with the finder's arrow and distance working without data. Free for
     everyone (only sending is Moshpoint+). The link is untrusted: valid coordinates only, the
     name capped and plain, and nothing in it changes settings, joins a crew or goes live.
   - **The relay (`server/`):** `GET /.well-known/assetlinks.json` (app id and SHA-256
     fingerprints from a non-secret env var such as `MOSHPOINT_APP_CERTS`; default: the public
     debug key's), and `GET /spot`, a tiny page that reads the fragment in the browser and goes
     to Google Maps, with a "Get Moshpoint" line; no location in any server path or log. Server
     tests for both; docs (RELAY_API.md, SERVER_PRODUCTION.md, the owner to-do).

## Decisions (with reasons)

- **Older builds' Need help, Check in and Home safe (B).** Shown as ordinary pings with their
  plain words (`crew_quick_*`, `crew_ping_*`), the ordinary crew notification while fresh
  (20 minutes), carried two hours like any ping. No alarm, no help channel, no overdue timer.
  **No crowd relaying:** this build never gives them crowd hops (crew phones only). Strangers'
  phones can't open any message, so a packet an older build itself put on air with hops is
  still passed on by every phone, this build included; that can't be told apart without
  changing the format, which B rules out.
- **Message format unchanged.** `GigGroup`'s sealing and opening code is untouched (comments
  only); the kind numbers 7, 8 and 9 stay reserved. Proved by `OlderBuildsTest` (golden
  messages from 75fe2fb).
- **The budget reserve went with `SAFETY`:** on the public relay crew messages may now use the
  whole day's 200 (was 190).
- **A blocked person's older-build Need help is hidden like anything else they send:** it was
  the one exception to blocking, and B makes it an ordinary ping. (`hidesLine` no longer takes
  a kind.)
- **The old `crew_help` notification channel is deleted** on existing installs, so an empty
  "help" channel doesn't stay in the phone's settings.
- **The home header:** the wordmark alone on a band as tall as the Live row's band under it
  (48 dp), so the two read as a balanced pair and nothing below moves. No new control there.
- **The `safety/` package keeps its name.** It also holds GhostMode, TorchStrobe, AppErrors,
  Housekeeping and Notices, which are not safety features; renaming a package is a pure move
  that can come later on its own.
- **`strings_safety.xml` is removed, but its Live and storage strings stay** (moved to a file of
  their own): they are for Live going off by itself and a full phone, not for help.
- **No permission was used only by these features:** the text and the call went through
  `ACTION_SENDTO` and `ACTION_DIAL`, which need none. The manifest loses only the receiver.
- **Text my spot reuses the emergency SMS's text code** (`Safety.helpText` at 75fe2fb: the
  maps link at 5 decimals, `Locale.ROOT`); it moves into core in stage 3.

## Open questions

1. **"Heading home" without a timer** (`GOING_HOME`, "Just tell them" in the Heading home
   dialog) went with that dialog. Older builds' ones still show. Bring it back as a plain crew
   ping chip?
2. **An older build's check-in shows its own words, "Heading home 🏠 Will check in within
   30 min"**, but this build never alerts if they don't check in. Reword how it's shown here (for
   example "Heading home 🏠 (30 min)")? That needs new wording in 20 languages, so it wasn't done
   without asking.
3. **The phone still tells the watch when a wrist ping gets further** after its first answer
   (`WatchPings.followUp`, `PingOutcome.improvesOn`), but only the removed Need help screen ever
   showed that. It's generic wrist-ping code, so it stayed. Remove it, or let the quick-ping
   flash show it?
