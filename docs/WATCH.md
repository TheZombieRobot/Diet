# Moshpoint on the wrist (Wear OS)

The watch app is a **companion**: the phone does the finding, the watch does the pointing and
the buzzing. This note records the decision on each hard problem and why, then how to get the
app onto a watch. Install steps are at the end.

- Module: `wear/` (Wear OS 3 and later: Galaxy Watch4 and newer, Pixel Watch). Same application
  id and signing key as the phone app, which the Wear Data Layer requires.
- Shared logic and all the maths: `core/…/core/watch/` (pure Kotlin, unit-tested).
- Phone side: `app/…/moshpoint/watch/` (new files only).

## Status and next steps

_A handover: enough to pick the work up cold. Updated with every push. Last: 12 November
2026, 09:45 UTC._

### Where things stand

| Piece | State |
|---|---|
| Design (this note) | **Done.** All eleven decisions below. |
| Shared logic, `core/…/core/watch/` | **Done, tested.** 102 unit tests (357 in `core` with the merged branches), green locally. |
| Watch app, `wear/` | **Builds in CI**: debug and release (R8) APKs, the app-id check, screenshots committed to `docs/screenshots/watch/`. Not yet run on a watch. |
| Phone side, `app/…/moshpoint/watch/` | **Builds in CI**, debug and release (R8), with the merged main branch (`6ac7690`). Not yet run on a phone. |
| Main branch merged in | **Done** (`62a770a`): Bluetooth backup and the venue map, no conflicts. Wrist pings now report from the outbox (problem 8). |
| Translations | **Done**, 19 languages: `wear/src/main/res/values-*/strings.xml` and `app/src/main/res/values-*/strings_watch.xml`. Checked by the script; not yet read by native speakers. Notes for them are at the end of each `docs/i18n/*.md` ("Watch app"). |
| Checker and its CI step | **Done.** `tools/check_translation.py` works on any module and can compare languages between modules. |
| Screenshots in every language | 19 screens, 21 locales, 2 sizes, drawn by CI on every push. Five languages looked through by eye; the rest still to skim. |
| Install steps, field test, release notes | **Written**: the end of this note, section 4c of `docs/FIELD_TEST_PLAN.md`, `.github/testing-release.md`. The install steps have not been followed on a real watch yet. |

Nothing has run on a real watch or phone. Everything marked **verify on a watch** below is a
first guess until the field test.

### Next steps, in order

1. **Read both jobs of the latest CI run** and fix what they report. The run before it
   (`6ac7690`) was green in the watch job and green in the phone job through the release (R8)
   build; its phone screenshots were still running when the next push replaced it.
2. **Look again at the watch screenshots.** English, German, Thai, Arabic and Japanese were
   looked through on the small watch after `6ac7690`: everything stayed inside the glass.
   Since then wrapped lines are balanced (no single word or character left alone on a line)
   and "Moshpoint+" keeps its plus on the right in Arabic: check those two took effect, and
   skim the other 14 languages on the `ui-screenshots-watch` branch for anything cut off.
3. **Finish line:** both CI jobs green; report to the owner's main session.

### Shared files this branch touches (for merging with the other two branches)

Everything else is new files (`core/…/core/watch/`, `wear/`, `app/…/moshpoint/watch/`,
`app/src/main/res/values*/strings_watch.xml`, `app/src/main/res/values/wear.xml`,
`docs/WATCH.md`, `docs/screenshots/watch/`).

| File | Change | State |
|---|---|---|
| `settings.gradle.kts` | One line at the end: `include(":wear")` | Done |
| `gradle/libs.versions.toml` | A block of Wear versions at the end of `[versions]`, a block of libraries at the end of `[libraries]`. No existing line changed | Done |
| `.github/workflows/android.yml` | A new `wear` job appended at the very end. No existing line changed | Done |
| `.github/workflows/android.yml` | The "Translations match English" step also loops over `wear/src/main/res/values-*/` and checks both modules have the same languages (three lines added inside the step) | Done |
| `app/build.gradle.kts` | One dependency line after the UWB one: `implementation(libs.play.services.wearable)` | Done |
| `app/src/main/AndroidManifest.xml` | Two services and one provider added at the very end of `<application>`, after the boot receiver | Done |
| `app/…/locate/LocatorEngine.kt` | 17 lines appended as the last thing in the class (after `class ScanUi`): three read-only members and an `init` that registers with the bridge. The venue-map branch edits other places in that file (around lines 78 to 520), not the end | Done |
| `app/…/ui/SettingsScreen.kt` | One line in the TESTING block, after the Bluetooth backup's `OfflineDebugTools()`: a call to `WatchDebugTools()` (a new file in `app/…/watch/`) | Done |
| `tools/check_translation.py` | The English folder is "the `values` folder next to the one being checked" instead of a fixed `app/…` path; `--same-languages` checks that modules ship the same languages. The old command line still works | Done |
| `.github/testing-release.md`, `docs/FIELD_TEST_PLAN.md` (section 4c and one known limit), `docs/ARCHITECTURE.md`, `docs/FEATURES.md` (section 10; the "No smartwatch support" gap reworded), `docs/ROADMAP.md` (the watch bullet under Later), `README.md` (one link), `docs/i18n/*.md` (a "Watch app" section at the end of each) | Added sections or lines only, except the two reworded lines named here | Done |

Not touched, and not going to be: `core/Advert.kt`, `service/VisibilityService.kt`,
`MainActivity.kt`, `MoshpointApp.kt`, `GroupSync.kt`, `OfflineMessages.kt`, `CrewChat.kt`,
`CrewStatus.kt`, the server. The phone side reads the app's existing state from outside (it is
Compose state) and starts itself from a manifest-declared provider, so none of those need a
hook (the one exception is the test-build switch in `SettingsScreen.kt`, in the table above). It calls four existing functions as they are: `GroupSync.sendPing`, `GroupSync.load`,
`OfflineMessages.retryNow` and `Advert.encode(…, looking = true)` (named arguments, so new
optional parameters there won't break it), and reads `CrewChat.lines` to see how the outbox
says a wrist ping is doing.

### Working notes

- The Android modules cannot be built in the cloud session (Google's Maven host is blocked
  there), so `app` and `wear` are checked by CI only: push, wait about 13 minutes, read the
  job log. `core` builds and tests locally with a scratch Gradle settings file that includes
  only `:core` and points its version catalogue at `gradle/libs.versions.toml`.
- Library calls in `wear` were checked against the published API signature files in the
  androidx GitHub mirror (`…/api/<version>-beta0x.txt`): Wear Compose 1.4, wear 1.3, ongoing
  1.0, tiles 1.4, protolayout 1.2, watch-face complications 1.2.
- Not built on purpose: a tile screenshot test (tiles aren't Compose), a companion-device
  association (battery-optimisation exemption already covers background starts).

## What it does

| | |
|---|---|
| Arrow | Tap a mate. An arrow on the wrist points at them, with their face, name and distance. |
| Buzzes | Faster as you get closer, a double tap when you're facing them, one long buzz when you're heading away. |
| Tile and watch face | Crew status tile; complication with the nearest mate, or "4 of 5 live". |
| Wrist pings | "On my way", "All good", and hold-to-send "Need help". |
| Paid | Everything is Moshpoint+ except "Need help", which is free for everyone, always. |

## How the pieces fit

```
 WATCH (wear)                              PHONE (app)
 compass + tilt ──┐                        WatchLinkService  (Data Layer listener)
 WristArrow maths │   messages, 2 a second   ├─ Need help ──► GroupSync.sendPing
 BuzzPlan ────────┼◄──────────────────────►  ├─ pings (Moshpoint+)
 FindSession      │   (true bearing,          └─ find start / renew / stop
 (foreground      │    distance, ages)      WatchFind + WatchFinderService (foreground)
  service +       │                           ├─ PocketFinder: BLE, UWB, Wi-Fi Aware, GPS
  ongoing         │   data items, on change   │    → its own MethodArbiter
  activity)       │◄──────────────────────    └─ or reads the phone's own finder (bridge)
 tile, complication   (crew status, faces,  WatchSync (crew status, faces, Moshpoint+)
                       Moshpoint+ flag)
```

The phone never sends "turn left 30°". It sends **where the mate is** (bearing from true north,
distance, how old each reading is). The watch turns that into an arrow with its own compass,
fresh, 25 times a second. That one choice is what makes the link's delay harmless (problem 1).

## The hard problems

### 1. True north on the wrist

**Checked in the code:** `Fix.bearingDeg` is "degrees clockwise from true north" (`Model.kt`).
The phone gets there by adding `GpsFinder.declinationDeg` to its magnetic compass
(`LocatorEngine.start`), and `MethodArbiter.arrowFor` then subtracts the phone's heading. So an
`ArrowState.relativeDeg` is relative to *the phone's* top edge and is useless on a wrist.

**Decision**
- The phone sends the **true bearing** and the **declination it is using**. The watch computes
  `true heading = watch compass (magnetic) + that declination` and draws
  `Geo.relativeDeg(bearing, heading)`. The watch needs no location permission and no GPS.
- The declination sent is the one the *source finder* used, even when that is 0 because the
  phone has no GPS fix yet. Bearings and heading then stay in the same frame either way. (A GPS
  bearing cannot exist before the fix that also sets the declination, so a GPS arrow is never
  drawn with the wrong one.) In New Zealand the correction is about 20°, so it is very visible
  if this is wrong.
- Watch heading comes from the rotation-vector sensor (fused, magnetic north): the compass
  direction of the screen's 12 o'clock, read from the rotation matrix, allowing for a flipped
  display (watch worn with the buttons on the other side).
- Noise: `core/HeadingFilter` is reused as it is (unit-circle average, heavy for jitter, light
  for a real turn), tuned for the watch's 25 readings a second: `slowAlpha 0.15, fastAlpha 0.8,
  fastAboveDeg 25`. That is where it fits. It does **not** fit the bearing from the phone (two
  readings a second, and a jump there is a real change of method), so the screen simply glides
  the arrow between updates.
- Old readings. Three things, all in `WristArrow`:
  1. The bearing is in world terms, so turning the wrist never waits for the phone.
  2. No clocks are compared between phone and watch (they can differ by seconds). The phone
     sends each reading's **age**; the watch adds its own time since arrival plus the measured
     link delay (the phone echoes the watch's own timestamp from the last renewal, which gives
     the round trip).
  3. A bearing only goes stale because *you* move: worst case it drifts by
     `atan(walking speed × age ÷ distance)`. Past 25° of possible drift the arrow is shown as
     "rough" (dimmed) and the facing buzz is held back. With no update for 2.5 s the arrow
     dims; after 10 s the watch says the phone is out of reach.

**Why:** a few hundred milliseconds only matters if the angle depends on the phone's or the
watch's heading at send time. Here it doesn't.

**Verify on a watch:** compass quality near speakers and steel; whether a flipped Galaxy Watch
reports the display rotation the standard way (if the arrow points backwards when flipped, it
doesn't).

### 2. Wrist position

**Decision:** a live arrow only while the watch face is within **40°** of flat (face up). Once
showing, it stays until **50°** (so it doesn't flicker at the edge), and it needs 0.3 s inside
the limit before it appears. Otherwise the screen shows distance and "Hold your wrist flat".
Buzzes carry on either way.

**Why these numbers**
- People read a watch tilted 20–40° towards their eyes. A stricter limit would hide the arrow
  in the normal reading pose.
- On a tilted screen, "the angle I see" and "the angle on the ground" differ by at most 7.6° at
  40° and 12.5° at 50°; compass noise grows by 1.3× and 1.6×. Past that, "up on the screen"
  starts to mean "sky", not "ahead".
- Tilt comes from the same fused sensor as the heading (steadier than the raw accelerometer in
  a jumping crowd).

A watch with no compass shows distance and buzzes only. A compass reporting low accuracy shows
the arrow as rough with a "move your wrist in a figure 8" hint.

### 3. Phone in the pocket

**Checked in the code** (`Method.givesDirection`, `LocatorEngine`, `GpsFinder`, `UwbFinder`,
`WalkDirection`, `SpinScan`):

| Method | How its bearing is made | In a pocket |
|---|---|---|
| `GPS_SERVER`, `CROWD_RELAY` | Geometry between two GPS positions (`Geo.bearingDeg`) | **Valid.** Nothing to do with how the phone is held. |
| `UWB` | Phone's compass heading + angle at the phone's antennas (`heading + azimuth`) | **Not valid.** The antennas face your leg, may be upside down, and your body is in the way. Distance stays good. |
| `SPIN_SCAN` | Signal against the phone's heading while you turn with the phone on your chest | **Not valid** unless the scan was done phone-in-hand. |
| `WALK` | Treats the phone's heading as the way you're walking | **Not valid.** A pocketed phone's "heading" is not your direction of travel. |
| `WIFI_AWARE`, `BLE_RSSI` | No direction | Distance only, as on the phone. |

**Decision**
- `core/watch/WristDirections` strips the bearing (never the distance) from `UWB`, `SPIN_SCAN`
  and `WALK` fixes unless the phone is demonstrably being held as a finder, then runs the
  ordinary `MethodArbiter` over what is left. So the wrist gets the arbiter's rules unchanged
  (stale fixes dropped, GPS direction ignored under 20 m, hysteresis, "unsure"), just with a
  smaller set of directions. A test fails if a new direction method is added without being put
  in one list or the other.
- In practice: **further than about 20 m** the wrist arrow runs on GPS or crowd relay. **Closer
  than that** there is no honest arrow from a pocket, so the watch shows distance and the
  warmer / colder buzzes do the work (UWB, when both phones have it, still gives the distance
  to within centimetres).
- "Held as a finder" means: the phone's own finder is running, its screen is on, and gravity
  says it is upright or flat in portrait (top edge not hanging down, screen not facing the
  floor). Only then are the phone's UWB / scan / walk directions passed on, so the two arrows
  agree when you hold both.
- The phone's own compass, motion sensor and 20-a-second loop do not run in pocket mode at all.

**Why:** a wrong arrow is worse than no arrow; `MethodArbiter` already takes that view for GPS
up close.

### 4. Phone side running in the background

**Checked in the code:** the finder (`LocatorEngine`) belongs to `MainActivity` and its scan is
**unfiltered** (`BleRanger.start(lowLatency = true)` → `BleHub`), which Android suspends the
moment the screen goes off. So the existing finder cannot simply be left running in a pocket.

**Decision**
- A separate small **`PocketFinder`** (new file) built from the same public parts
  (`BleRanger`, `UwbFinder`, `WifiAwareFinder`, `GpsFinder`, crowd relay, a "looking" advert)
  with a **filtered, fast** scan, which keeps working with the screen off. No compass, no
  walk-and-watch, no spin scan, no 20-a-second loop: none of them mean anything in a pocket.
- `LocatorEngine` is not refactored. It gains one read-only block at the end of the class (is
  it running, each method's latest fix, the declination) and registers itself with
  `PhoneFinderBridge`. If the phone's own finder is running, `PocketFinder` stands down and the
  watch is fed from it instead, so there are never two UWB sessions or two "looking" adverts.
- **`WatchFinderService`**: a foreground service, type `connectedDevice`, plus `location` when
  Android allows it, with its own notification ("Finding Sam for your watch" · Stop). The
  permissions for both types are already in the manifest.
- **Starts only when the watch asks; stops as soon as it stops.** The watch holds a lease it
  renews every 5 s. No renewal for 15 s (watch out of range, crashed, flat battery), a stop
  message, or the Stop button ends the service. A hard cap of 20 minutes means a forgotten
  session cannot run all night.
- Android's rules, and what happens (Android 12–16):

| Phone when the watch asks | Starting the service | Location and Bluetooth results | What you get |
|---|---|---|---|
| You're live (normal at a gig), phone in pocket | Allowed when battery optimisation is off for Moshpoint, which the app already asks for at Go live. Otherwise it relies on Play services being bound to us at that moment, which Android's code allows but its documentation doesn't promise | Yes. The live service already holds the `location` type from when it was started with the app open | Full finding |
| App open on screen | Always allowed, with `location` | Yes | Full finding |
| Not live, app closed | As the first row | **No.** Android 14+ refuses a `location` service started from the background | Watch says "Open Moshpoint on your phone". Opening it once fixes it for that session |

- If the start is refused but you're live, the finder still runs under the live service's
  foreground status. If it can't run at all, the watch is told and says so; it never shows a
  stale or made-up arrow.

**Battery:** nothing runs unless the watch asks; pocket mode skips the phone's compass and
motion sensors; Android itself drops a screen-off scan to a low duty cycle; the lease and the
cap bound the worst case.

**Verify on a phone:** background start on Samsung/Xiaomi with battery optimisation left on;
whether UWB ranges from a pocket at all.

### 5. The phone-watch link

- **Same app id and key:** `wear` uses `applicationId "nz.waveformlabs.moshpoint"` and the same
  signing set-up as `app` (the public debug key for test builds, the private key from CI
  secrets when present). Its version code is the phone's plus 1,000,000 so the two can share a
  Play listing.
- **Versioned messages:** every frame starts `magic, version, type`. A side that sees a version
  it can't read says "update Moshpoint on your phone / watch" instead of guessing. Inside a
  version, new fields are only ever added at the end and unknown types are ignored, so a newer
  phone and an older watch keep working. Encoding and rules live in `core/watch/WatchProtocol`
  and are unit-tested.
- **Rate:** about two updates a second while the arrow can be seen; one every two seconds
  while the wrist is down (buzzes only need distance); **nothing at all when no one is being
  found**. Crew status is a data item written only when it changes, and only once a watch has
  been seen.
- **Bluetooth dropping:** the watch shows "Reconnecting…", gives one distinct buzz so silence
  isn't mistaken for "no change", keeps asking for up to a minute, and picks the session back
  up when the phone returns. The phone keeps finding until the lease runs out (15 s), then
  stops.
- **Only a phone that's with you counts.** Finding requires a *nearby* Data Layer node (direct
  Bluetooth). A phone left at home and reached through the cloud would point from the wrong
  place. "Need help" goes by any route.
- **Faces sent once:** each mate's face (their photo, else the drawn default avatar, as on the
  phone) goes as a 96-pixel image in its own data item, named by a hash of the picture. The
  watch keeps it. The twice-a-second updates carry no images and no names.

### 6. Watch battery and ambient mode

- **Wrist up:** compass on, arrow live, two updates a second.
- **Wrist down** (ambient, screen off, or arm hanging for more than 3 s): compass **off**, the
  fast updates **stop**. If a find is on, a slow trickle (one small message every 2 s) keeps
  the buzzes going, because buzzes are the part that is meant to work without looking. Ending
  the find stops everything.
- **Ambient:** the finder goes black with thin grey text (mate, last distance), no arrow, no
  animation, updated once a minute.
- **Ongoing activity:** while finding, a small foreground service (`connectedDevice`) holds the
  session and shows it as an ongoing activity ("Sam · 40 m"), so it has a chip on the watch
  face and one tap returns to the arrow.
- **A find ends by itself** when you reach them, after 15 minutes, or after a minute without
  the phone.
- **Tile and complication** are drawn from what the phone last pushed. They refresh when a
  push arrives (`onDataChanged` → update requests). No timers, no polling: the tile's refresh
  interval is 0, the complication's update period is 0. A status older than 3 minutes is shown
  without the "live" claim rather than fetched again.

### 7. Buzz design

A small vocabulary told apart by rhythm alone (many watch motors have no strength control):

| Buzz | Means | When |
|---|---|---|
| One short tick, repeating | "Getting there" | Gap shrinks with distance: 4 s at 150 m, about 2.6 s at 30 m, 1.7 s at 10 m, 0.6 s at 3 m. Every 8 s beyond 150 m |
| Two quick ticks | "You're facing them" | Once, when the arrow comes within 15° of straight ahead; armed again after you turn 30° away |
| One long buzz | "Wrong way" | When the distance has clearly grown; ticks pause; repeats every 6 s while it keeps growing |
| Short, short, long | "Found them" | Once, under 3 m; the find ends |
| Two long buzzes | "Lost the phone" | Once, when updates stop |
| One very long buzz | "Need help reached someone" | The relay has it, or at least a crew phone nearby does |
| Four rapid ticks | "That has not gone" | Any ping that failed, or is still waiting for signal |

- **Never constant:** every pattern is under a second, with at least 0.4 s of silence after
  it, and the motor is never on for more than one second in any ten. The planner drops a buzz
  rather than break that, whatever the readings do.
- **The watch's settings win.** Guidance buzzes are played as notification-class vibrations at
  the system's default strength (never a fixed maximum). Android itself then applies the
  watch's vibration strength, its master switch, silent mode, Do Not Disturb and battery
  saver; the app does not second-guess or override any of them. When one of those is
  silencing the buzzes, the finder says "Buzzes are off on this watch" so the quiet isn't a
  mystery. The short confirmations under your finger (hold ticks, sent, not sent) are touch
  feedback and follow the watch's touch-vibration setting.
- The choice of pattern and its timing is pure logic in `core/watch/BuzzPlan`, unit-tested.

### 8. "Need help" from the wrist

- **Hold to send:** press and hold the red button for 2 seconds. A ring fills and the watch
  ticks each half second; let go early and nothing is sent.
- **Same path as the phone:** the phone's `WatchLinkService` calls `GroupSync.sendPing(NEED_HELP)`
  with the phone's last known position, exactly as the button in the app does. It works with
  the app closed: Play services wakes the listener, which loads the crew first. From there the
  phone's outbox (Bluetooth backup, `OfflineMessages`) looks after it like any crew message:
  the relay when there's signal, crew phones nearby over Bluetooth when there isn't.
- **It says what happened, and only what it knows.** The watch repeats what the outbox says,
  in the phone's own words, never anything kinder:

  | What happened | The wrist says | Buzz |
  |---|---|---|
  | No phone in reach, or the message can't be handed over | **Not sent** · Your phone is out of reach · Try again | Not gone |
  | The relay has it | **Sent to your crew** · I'm OK now | Long |
  | No signal, but a crew phone nearby took it over Bluetooth | **Sent nearby** · Only crew nearby have it so far · I'm OK now | Long |
  | Still in the phone's outbox after about 8 seconds (5 with no network) | **Not sent yet** · Waiting for signal · Try again | Not gone |
  | The phone took it but never answered (12 s) | **Not confirmed** · Your phone didn't answer · Try again | Not gone |
  | Not in a crew | **Not sent** · You're not in a crew, so there's no one to tell | Not gone |

- **Later news reaches the wrist.** If the ping gets further after the watch was answered (a
  crew phone takes it, or signal comes back), the phone tells the watch, and a screen still
  showing "Not sent yet" changes to "Sent nearby" or "Sent to your crew" with the long buzz.
  News only moves forward: "sent" is never taken back (`PingOutcome.improvesOn`, unit-tested).
  The phone doesn't poll for this; the chat line that carries the outbox's state is Compose
  state, so it wakes only when that changes, for up to 30 minutes.
- **Never twice.** "Try again" reuses the same request number. If the phone already has that
  ping in its outbox it does not send another: it asks the outbox to try now and reports again.
- After a send, "I'm OK now" tells the crew you're all good. That is part of the safety
  feature, so it is free too.
- **Never paywalled:** the phone handles Need help (and its all-clear) before, and without,
  the Moshpoint+ check; the watch shows the button in every state, including the locked one
  and the tile.
- **A limit to know about:** while the phone has no signal and you aren't live, Android may
  put the phone app to sleep once the watch has been answered. The ping stays in the outbox
  and goes when the app next runs: when you open it or go live, or at its hourly chat check.
  So the wrist says "Not sent yet" and makes no promise about when. **Verify on a watch**; if
  this turns out to matter, the fix is to hold the phone awake with the watch finder's
  foreground service until the ping has gone.
- How the phone knows: the outbox reports on each of your own messages on its line in the crew
  chat. The phone side finds the line `sendPing` just added and reads its state. If the chat
  in memory is another crew's (you were reading it on the phone), it falls back to looking on
  the relay for its own signed ping. Neither `sendPing` nor the outbox is changed.
- **With the phone app not running** there is one trap, found by reading the outbox's code:
  loading the crew starts the outbox, and the outbox finishes starting a moment later, in a
  main-thread task of its own. A ping handed to it before then is dropped without a word. So
  the phone side loads the crew in one main-thread task and hands the ping over in the next,
  and afterwards asks the outbox whether it is really holding that message. If it isn't, the
  wrist is told it failed, and "Try again" sends a fresh one. **Verify on a phone:** swipe
  Moshpoint away, then send Need help from the wrist (field test, section 4c F).

### 9. Moshpoint+ check

- **One check, on the phone:** `Entitlements.plus(context)`. Today it returns a saved value
  that defaults to `BuildConfig.TEST_BUILD`, so it is **on in test builds** and off in a
  release build until billing calls `Entitlements.set(…)`. That is the only place billing has
  to plug in.
- **Synced to the watch** in the crew-status data item. The watch uses it to choose between
  the real screens and a "Moshpoint+ · unlock on your phone" screen; the phone enforces it
  again on every find request and paid ping, so an old or tampered watch gains nothing.
- **Wrist SOS skips the check** on both sides (problem 8). `core/watch/WatchGate` holds the
  rule and a test pins it.
- **To try it without billing:** test builds have a switch, phone Settings → TESTING →
  "Moshpoint+ (watch app)". Off shows the watch as a non-member sees it, and is how the field
  test checks that Need help still goes.

### 10. Small round screens in 19 languages

- All watch text is in `wear/src/main/res/values*/strings.xml`; the few new phone-side texts
  are in `strings_watch.xml`. Both are translated into the same 19 languages as the app, using
  the terms already chosen in `docs/i18n` and the app's existing wording for the same pings.
- Strings are written short on purpose (a watch line holds about 14 Latin characters), text
  sits inside the round screen's safe area with percentage margins, long words shrink a step
  before they wrap, and lists use the scaling list so rows near the edge stay inside the curve.
- Right-to-left: text and lists mirror for Arabic. The **arrow does not**: it points at a real
  place.
- Numbers and units follow the watch's language and country, with the same rules as the phone
  (`core/watch/WristDistance`): metres and km, feet and miles in the US, miles in the UK.
- `tools/check_translation.py` now takes any module's `values-xx` folder and CI runs it over
  `wear` as well as `app`, plus a check that both have the same set of languages.
- Screenshot tests render every watch screen on a small (192 dp) and a large (227 dp) round
  watch in every language, with the round edge drawn in, so clipped text shows up in review.

### 11. Getting it onto a watch

- CI builds `:wear:assembleDebug` and `:wear:assembleRelease` on every push, uploads the watch
  APK next to the phone APK, and (on the main Moshpoint branch) publishes it in the test
  release as `moshpoint-watch.apk`.
- Install steps are below.

## Privacy

- **No new identifiers.** The watch names a mate by the id that mate already has in the
  phone's own list (a random id that never leaves your devices). Nothing new is minted and
  nothing about a person can be worked out from it.
- **Keys stay on the phone.** The watch never sees a crew key, a friend's secret, or anyone's
  coordinates, and never talks to the relay. It gets what its screen shows: names, colours,
  small faces, distance, bearing. Crew data stays end-to-end encrypted exactly as now; the
  phone is still the only thing that can open it.
- The link is the Wear Data Layer between your own phone and your own watch. Play services
  only connects apps with the same package name and signing key.
- If Moshpoint+ is off, the phone sends the watch no crew details at all.

## Install on a Galaxy Watch (wireless debugging)

The watch app isn't in the Play Store yet, so it goes on over Wi-Fi from a computer. About ten
minutes the first time. These steps are for a Galaxy Watch4 or newer; a Pixel Watch is the
same apart from step 4.

**You need**

- The watch, paired with your phone in the usual way (Galaxy Wearable app).
- The newest Moshpoint test build on that phone, opened once, with its permissions allowed:
  <https://github.com/TheZombieRobot/Diet/releases/download/testing/moshpoint.apk>
- The watch build **from the same test release**:
  <https://github.com/TheZombieRobot/Diet/releases/download/testing/moshpoint-watch.apk>
  The two are signed with the same key, and the watch and phone only talk to each other when
  they are. A watch build from somewhere else (a different CI run on another branch, your own
  Android Studio) will install but never find the phone.
- A computer with `adb` version 30 or newer. It comes in Google's "SDK Platform-Tools"
  download (a zip; no Android Studio needed). Check with `adb version`.
- The watch and the computer on the **same Wi-Fi**. Guest and public Wi-Fi often stop devices
  seeing each other: if step 6 fails, turn on your phone's hotspot and join both to that.

**Steps**

1. Download `moshpoint-watch.apk` to the computer and open a terminal in that folder.
2. On the watch, check the Wi-Fi: **Settings → Connections → Wi-Fi**. It must say connected,
   to the same network as the computer.
3. Put the watch on its charger or make sure it has plenty of battery. Installing over Wi-Fi
   is slow and the screen needs to stay awake.
4. Turn on developer options: **Settings → About watch → Software information**, then tap
   **Software version** seven times. It says "Developer mode turned on".
   (Pixel Watch: **Settings → System → About → Versions**, tap **Build number** seven times.)
5. Go back to **Settings → Developer options** (new, at the bottom). Turn on **ADB debugging**,
   then **Wireless debugging**, and allow it on this network. Tap **Wireless debugging** to
   open its screen. It shows an address like `192.168.1.23:37121`. Leave this screen open.
6. Tap **Pair new device**. The watch shows a six-digit code and an address with a
   **different** number after the colon, like `192.168.1.23:41235`. On the computer:

   ```
   adb pair 192.168.1.23:41235
   ```

   Type the code when asked. It says `Successfully paired`. (The code and that number change
   every time this screen opens, so type them while it is showing.)
7. Connect, using the address from step 5 (the Wireless debugging screen, not the pairing one):

   ```
   adb connect 192.168.1.23:37121
   ```

   It says `connected to 192.168.1.23:37121`.
8. Install:

   ```
   adb -s 192.168.1.23:37121 install -r moshpoint-watch.apk
   ```

   It takes a minute or two and ends with `Success`.
9. On the watch, open the app list and tap **Moshpoint**. Allow notifications when it asks
   (that is the chip on the watch face while you're finding someone). With the phone nearby,
   your crew appears within a few seconds.
10. Add the extras if you want them. **Tile:** from the watch face, swipe to the end of the
    tiles, tap **+**, choose **Moshpoint · Crew status**. **Watch face:** touch and hold the
    watch face → **Customise** → **Complications**, pick a slot, choose **Moshpoint · Nearest
    mate**.
11. Turn **Wireless debugging** off again (it uses battery and leaves a door open).

To update later, repeat steps 5, 7 and 8 with the new file. The pairing in step 6 is
remembered until developer options are reset.

**If it doesn't work**

| What you see | What to do |
|---|---|
| `adb pair` waits, then fails | The watch and computer aren't on the same network, or the network blocks devices from each other (use the phone's hotspot). Or the pairing screen closed: open it again and use the new code and number. |
| `adb connect` says refused or can't connect | The number after the colon changes whenever Wireless debugging is switched off and on. Read it again from the watch. |
| `adb: command not found`, or `adb pair` isn't recognised | adb is missing or older than version 30. Download the current SDK Platform-Tools. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An older Moshpoint watch build signed with a different key is on the watch. Remove it with `adb -s 192.168.1.23:37121 uninstall nz.waveformlabs.moshpoint`, then install again. |
| The watch says "Open Moshpoint on your phone" and stays that way | Open Moshpoint on the phone once. Check both builds came from the same test release, and that this watch is paired with this phone. |
| Finding starts with the phone in your hand but not from your pocket | On the phone: **Settings → Apps → Moshpoint → Battery → Unrestricted**, and tap **Go live** in Moshpoint before you put the phone away. Android only lets an app start location work from the background if it was already doing it. |
| No buzzes | Check the watch isn't on silent, Do Not Disturb or power saving, and that **Settings → Sounds and vibration** has vibration on. The finder says "Buzzes are off on this watch" when one of those is the reason. |

No computer to hand? Apps that run adb from an Android phone can do steps 6 to 8 with the same
three commands. That route hasn't been tried for this note.
