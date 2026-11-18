# Removing the safety features; Text my spot and satellite data (Moshpoint+)

The owner's decisions of 16 November 2026: take out the app's own emergency features (Need help,
check-ins, the watch's SOS), keep old builds working with this one, and add two Moshpoint+
features (Text my spot, satellite data). Branch: `claude/remove-safety` (from
`ccr-5839ed7c-1q0ztj` at 75fe2fb).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 18 November
2026, 22:30 UTC._

- **Done, stage 1 core (pushed, 52c876a):** core tests green locally (622, scratch Gradle build
  of `:core` and `:server`, see docs/WATCH.md "Working notes"; server 103 green).
  - `PingPolicy`: Need help, Check in and Home safe are `Group.OLDER_BUILDS`, ordinary pings.
  - `RelayUse.SAFETY` is gone, with every special case: the budget reserve, the pause and
    slot bypasses (`RelayBudget`), the hold bypass (`RelayHolds`), the batch bypass
    (`BatchPlan.route`), the courier's queue jump, slot bypass, retry-through-a-pause, boost and
    durable chat-mailbox copies (`Courier`), and the moderation exception (`BlockList`).
  - `SafetyRules.kt` split: `LiveRules.kt`, `AlarmPlan.kt`, `StorageNotice.kt`, `ClockCheck.kt`
    stay; `HelpRules`, `CheckInReminder` and `CheckIns.kt` are removed with their tests.
  - The interop proof (B): `OlderBuildsTest` opens messages sealed by the code at 75fe2fb
    (Need help with a position, a check-in with its minutes, Home safe, an ordinary ping, a
    chat line, and a History copy carrying them): every field, signature and id exactly.
    `CourierSimTest` and `MessageRulesTest` pin how they're carried and shown.
- **In progress, stage 1 app (not yet pushed):** removed `Safety.kt`, `EmergencyNumbers.kt`,
  `HelpUi.kt`, `CheckInAlarm.kt`, `CheckInAlarmReceiver.kt` and its manifest entry; check-ins
  out of `GroupSync` and `ChatSync`; Need help following out of `OfflineMessages`;
  `CrewNotifications` posts every ping on the ordinary channel and deletes the old `crew_help`
  channel; the home header (wordmark only), activity lines and `FriendsScreen` done.
- **Exact next step:** finish stage 1 app: `HomePanels.PingBar`/`MessageSheet` (drop Heading
  home and Need help), `CrewChatUi` (`onCheckIn`, `onGoLive`), Settings (the emergency contact),
  `Housekeeping` (delete the stored emergency contact and check-in leftovers), comments in
  `Theme`, `VisibilityService`, `BackgroundChecks`, `FollowCheck`; the screenshot tests
  (`ScreensSnapshotTest` help tests, `HomeFixtures`, `HomeTallSnapshotTest`,
  `OfflineSnapshotTest`); then the strings in all 20 values folders (`strings_safety.xml`
  removed, its Live and storage strings moved to a file of their own); then docs; then push
  without [skip ci] for CI.
- **Then:** stage 2 (watch), stage 3 (Text my spot), stage 4 (satellite switch), and stage 5
  (below), each green in CI before the next.
- **Last green run:** none on this branch yet (ccr's last: run 346).

### Stages (each must be green in CI before the next)

1. Phone removal and interop. (core done; app in progress)
2. Watch removal.
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
