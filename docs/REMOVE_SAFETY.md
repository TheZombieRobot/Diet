# Removing the safety features; Text my spot and satellite data (Moshpoint+)

The owner's decisions of 16 November 2026: take out the app's own emergency features (Need help,
check-ins, the watch's SOS), keep old builds working with this one, and add two Moshpoint+
features (Text my spot, satellite data). Branch: `claude/remove-safety` (from
`ccr-5839ed7c-1q0ztj` at 75fe2fb).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 18 November
2026, 23:45 UTC._

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
- **Done, stage 2 (watch), 5203058:** `SosActivity` and `SosScreen` removed (and the
  manifest entry); the crew screen's Need help chip, the tile's button, `HoldToSend` and its two
  buzzes, `WatchFeature.NEED_HELP`/`SOS_ALL_CLEAR` and `PingKind` codes 3 and 4 (an older
  watch's Need help now reads as unknown: the phone sends nothing and answers "not sent";
  `WatchGateTest` pins it). Every wrist ping is Moshpoint+. Watch strings: 8 removed from all 20
  folders; the 6 that the quick pings' result screen shares are renamed `sos_*` → `ping_*`, and
  the red is `Wrist.Red` (same colour). Docs: WATCH.md (problem 8 is now quick messages),
  FEATURES section 10, README, FIELD_TEST_PLAN 4c F and G, ROADMAP, ARCHITECTURE,
  CODE_STRUCTURE. Core tests green locally (618); type-check clean for app and watch.
- **Stage 2 is green: CI run 349 on 5203058.**
  - **Screenshots, watch** (`ui-screenshots-watch-claude-remove-safety` against
    `ui-screenshots-watch`, by blob hash): 462 identical; 252 gone (the six SOS screens, small
    and large, × 21 language folders); 84 changed, all expected: `crewLocked` and `crewNoPhone`
    (small and large × 21), which lose the red Need help chip at the bottom. Looked at in en,
    de, ar and ja: the title and the line under it keep their places (the list centres its
    second item, as before). `crew` and `pingNotSent` are identical: their chip was below the
    fold.
  - **Screenshots, phone:** byte-identical to run 348's set (no file differs).
  - **Merged manifest:** the same one-line difference as stage 1 (the removed
    `CheckInAlarmReceiver`); `SosActivity` was the watch's. Licence list the same (126).
- **Done, stage 3 (Text my spot), 7d2f3aa:**
  - Core: `SpotText` builds the text (the line, a Google Maps link and the plain coordinates,
    5 decimals in `Locale.ROOT`; with no usable fix, the "can't tell where I am" line alone),
    with `SpotTextTest`. Core tests green locally (623).
  - App: `sharing/TextMySpot` (the switch, stored in `text_my_spot`, off by default; members
    only through `Entitlements.plus`; opens `ACTION_SENDTO` `smsto:` with no number and the text
    in `sms_body`; "This phone has no texting app." when nothing can send one). The violet
    button is the last in the ping row (`PingBar`), so it shows in Message crew and in the crew
    chat. Settings: `ui/settings/PlusSettings` after Data saver, members only, under the small
    amber Moshpoint+ mark. Strings: `strings_spot.xml`, 5 strings in all 20 languages.
  - Screenshot tests: `SpotSnapshotTest` (21 languages): `textMySpot` and
    `smallPhoneLargeFontTextMySpot` (Message crew over the crew home, the row scrolled to its
    end), `settingsPlus` (Settings as a member sees it) and `smallPhoneLargeFontPlusSettings` (the
    Moshpoint+ section alone). `settingsSheet` stays the free user's view, so it shouldn't change.
  - Docs: FEATURES, ROADMAP (status), PRIVACY, PLAY_STORE (data safety), FIELD_TEST_PLAN 4m.
  - Checked before pushing: translations (both checks), secrets, every `R.string` resolves, and
    the plain-`kotlinc` type-check shows nothing new about our own code against stage 2.
- **Stage 3 is green: CI run 350 on 7d2f3aa.**
  - **Screenshots, phone:** against run 349's set, 84 new files and nothing else changed:
    `textMySpot`, `smallPhoneLargeFontTextMySpot`, `settingsPlus` and
    `smallPhoneLargeFontPlusSettings`, × 21. Looked at in en, de, ar and ja: the violet button
    ends the ping row (Arabic: at the left end, as it should), the Moshpoint+ mark and the switch
    sit after Data saver, nothing is cut off on a small phone with large text.
  - **Screenshots, watch:** identical to run 349's.
  - Noticed, not changed: in Arabic the Moshpoint+ mark reads "+Moshpoint" (the plus moves to
    the other end in right-to-left text). The main branch's Plan a gig does the same.
- **Done, stage 4 (satellite data), pushed for CI:**
  - Core: `SatelliteRule` (with `SatelliteRuleTest`): a satellite network is one without
    `NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED` on Android 16 (every other network has it), or
    with `TRANSPORT_SATELLITE` from Android 15; older phones never. Allowed = the switch on and
    a member. Over satellite only `Request.BATCH`, at most every two minutes; any other network:
    everything, as before. Core tests green locally (632).
  - Manifest: `<meta-data android:name="android.telephony.PROPERTY_SATELLITE_DATA_OPTIMIZED"
    android:value="${applicationId}"/>` in the app's `<application>`.
  - App: `setup/SatelliteSwitch` (stored in `satellite_data`, off by default, members only);
    `NetState.satellite`, and a satellite network counts as no network (`NetState.up` false)
    unless allowed. The one gate is `RelayClient.exchange`: over satellite it lets only the batch
    through, two minutes apart (the batch flusher and the crew sync wait for the gap instead of
    failing; a crew message waits up to 2½ minutes for its batch). `RelayClient.offline` is also
    true over satellite without our own relay's batches (the free public relay has none), so
    nothing goes there. Also kept off satellite: Discover, venue lookups, venue maps (`online`),
    the map's tiles and venue-map downloads (`setup/MapNet` tells MapLibre there's no network,
    only while on satellite), Facebook (login and photo), reports, the install token.
  - Settings: the satellite switch under Text my spot, in the Moshpoint+ section. Strings:
    `strings_satellite.xml`, 2 strings in all 20 languages.
  - Docs: PRODUCTION_AUDIT (owner to-do: Spark and One NZ's app lists), ROADMAP (status),
    FEATURES, PRIVACY, FIELD_TEST_PLAN 4n, ARCHITECTURE, CODE_STRUCTURE.
  - Checked before pushing: translations (both checks), secrets, the type-check against stage 3
    (nothing new about our own code).
- **Stage 5, part 1 (written, not yet pushed for CI; waits for stage 4 to be green):**
  - Core: `SpotLink`: builds `https://<relay host>/spot#<lat>,<lon>[,<first name>]` (null with
    no relay of our own: the text keeps the Google Maps link) and parses a texted one: our host
    exactly, `https`, the path `/spot`, no query, plain decimals in range and not 0,0, and a name
    of letters, digits, spaces, `'` and `-` only, at most 24 (no control or direction-changing
    characters). `SpotLinkTest`: 8 tests, green locally.
  - Relay: `GET /.well-known/assetlinks.json` (app id and certificate fingerprints from
    `MOSHPOINT_APP_CERTS`, default the public debug key's), `GET /spot` and `/spot.js` (the page's
    own script reads the spot in the browser and opens Google Maps, with "Get Moshpoint"; a strict
    content security policy, no referrer, nothing sent back). `SpotPageTest`: 5 tests, green
    locally; the script was also run in Node against good and bad links.
  - Docs: RELAY_API.md section 13, SERVER_PRODUCTION.md (adding Play's signing key to
    `MOSHPOINT_APP_CERTS` in fly.toml's `[env]`), PRODUCTION_AUDIT owner to-do.
- **Stage 5, part 2 (the app; not started).** The plan, from what's there now:
  1. **The link in the text:** `TextMySpot` uses `SpotLink.build(BuildConfig.MOSHPOINT_SERVER,
     ...)` with the sender's first name, keeping the coordinates line; Google Maps link without
     a server. Switch only once the production relay with `/spot` is deployed (an older relay
     answers 404 there).
  2. **The App Link:** an intent filter (`android:autoVerify="true"`, `https`, the server's host,
     path `/spot`). No server, no filter: put it on an `<activity-alias>` whose `enabled` and host
     come from manifest placeholders set in `app/build.gradle.kts` from `MOSHPOINT_SERVER` (check
     that a disabled alias triggers no failed verification).
  3. **Opening one:** `SpotLink.parse(intent.dataString, server)`; if valid, a saved place
     labelled with the name or "Texted spot" (new strings, 20 languages), and the map opened on
     it. Nothing else happens: no crew joined, no Live, no setting changed. The map's places
     (`Spots`, `MapPlace`) already show a place with its distance from the phone's own GPS, which
     needs no data.
  4. **The finder's arrow to it:** the finder only targets mates today (`engine.track(ids)`).
     A place target (GPS and compass only) is the one real piece of new work.
  5. Screenshot tests (the map with a texted spot), FEATURES, PRIVACY, FIELD_TEST_PLAN.
- **Exact next step:** when the stage 4 run is green: check screenshots (expected: phone all
  identical to run 350's except the two Moshpoint+ Settings tests, which gain the satellite
  switch, × 21; watch identical) and the merged manifest (the meta-data isn't in the report's
  list, so the same one line as before); then push stage 5 part 1 for CI, then part 2.
- **Last green run:** 350 (7d2f3aa).

### Stages (each must be green in CI before the next)

1. Phone removal and interop. **Done, green: run 348.**
2. Watch removal. **Done, green: run 349.**
3. Text my spot. **Done, green: run 350.**
4. Satellite switch. (pushed, CI running: run 351)
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
  maps link at 5 decimals, `Locale.ROOT`), moved into core as `SpotText` and tested there. Like
  the old text, with no fix it leaves the link out and says so ("My phone can't tell where I am
  right now."), and still opens the texting app, so the person can say where they are in words.
- **Where Text my spot is: the last button in the ping row,** in violet (the slot "Heading home"
  had). That row is where every crew ping is sent from, in Message crew and in the crew chat, so
  one change puts it in both. It isn't a ping (it leaves the app and never turns into "Sent"),
  hence its own colour. Only members who switched it on see it, so they know it's there; with it
  off, the row and every existing screen are exactly as before.
- **The Moshpoint+ pattern used:** the small amber Moshpoint+ mark (`PlusChip`, as Plan a gig
  shows members) above the Moshpoint+ switches in Settings. Free users see neither the switch
  nor the button, and nothing invites them to pay (no new paywall screen).
- **Satellite: off means off.** With the switch off, or for a free user, a satellite network
  counts as no network at all (`NetState.up` false), so the app behaves exactly as with no
  signal: messages wait, Bluetooth passes them on, nothing is tried over satellite.
- **Satellite: one gate, plus the few that don't go through the relay.** Everything to our relay
  goes through `RelayClient.exchange`, the gate. The few that reach the internet without it
  (Discover, venue lookups, venue maps, the map's tiles, Facebook) each check
  `NetState.satellite` and wait for a normal network, also when the switch is on.
- **Satellite: one batch every two minutes carries both ways.** The crew sync's batch takes
  everything waiting to go up with it, so one request sends and reads (pings, pins, locations,
  intros). Chat lines go up in it too, but reading the crew chat is a request of its own, so a
  member on satellite gets mates' chat lines by Bluetooth or once there's normal signal (open
  question 5).
- **Satellite: the free public relay gets nothing over it.** It has no batches, the only thing
  allowed; members use our own relay, which has them.
- **Satellite: MapLibre is only told anything while on satellite** (`MapNet`: "no network",
  then back to Android's own answer), so on normal networks the map works exactly as before.

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
4. **"What's in Moshpoint+"** (the list free users can open from Plan a gig) doesn't mention
   Text my spot or satellite data, because free users aren't meant to see them. Add a row for
   each?
5. **Reading the crew chat over satellite.** Sending works (chat lines go in the batch), but
   reading is the chat's own poll, which stays off satellite. Move the chat poll into the
   two-minute batch too? That's more data over satellite each time.
