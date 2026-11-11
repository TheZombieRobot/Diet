# Moshpoint on the wrist (Wear OS)

The watch app is a **companion**: the phone does the finding, the watch does the pointing and
the buzzing. This note records the decision on each hard problem and why, then how to get the
app onto a watch. Install steps are at the end.

- Module: `wear/` (Wear OS 3 and later: Galaxy Watch4 and newer, Pixel Watch). Same application
  id and signing key as the phone app, which the Wear Data Layer requires.
- Shared logic and all the maths: `core/…/core/watch/` (pure Kotlin, unit-tested).
- Phone side: `app/…/moshpoint/watch/` (new files only).

## Status and next steps

_A handover: enough to pick the work up cold. Last updated 11 November 2026, 22:55 UTC, when
the work was paused part-way through the phone side._

### Where things stand

| Piece | State |
|---|---|
| Design (this note) | **Done.** All eleven decisions below. |
| Shared logic, `core/…/core/watch/` | **Done, tested, green in CI.** 101 unit tests: arrow maths (true north, declination, tilt limits, old readings), which directions are valid on a wrist, buzz choice, message format and versions, crew status, the Moshpoint+ rule, the finding lease. |
| Watch app, `wear/` | **Written; not yet proven.** Every screen, the compass, buzzer, find session and its foreground service, Data Layer listener, tile, complication, screenshot tests. The first CI compile found two errors (one cause); the fix is pushed but **its CI result had not been seen** when work paused. The release (R8) build, the screenshot run and lint for `wear` have never run yet. English strings only. |
| CI | A separate `wear` job (at the end of `android.yml`) builds watch debug and release, checks the APK has the phone's app id, records screenshots, uploads the watch APK, and publishes it to the test release on the main Moshpoint branch. |
| Phone side | **Half written, parked in `wip/watch-phone-side/`, not compiled.** See below. |
| Translations, checker, install steps, field test | **Not started.** |

Nothing has run on a real watch or phone. Everything marked **verify on a watch** below is a
first guess until the field test.

### Next steps, in order

1. **Read the `wear` job of the latest CI run** on this branch and fix what it reports
   (expect R8 or screenshot-rendering problems; the Kotlin already compiled bar the one fix).
2. **Finish the phone side.**
   - Move `wip/watch-phone-side/*.kt` to `app/src/main/java/nz/waveformlabs/moshpoint/watch/`,
     apply `locatorengine-bridge.patch` (`git apply`; it only appends a read-only block to
     the end of `LocatorEngine`), then delete `wip/`.
   - Parked and written: `Entitlements` (the one Moshpoint+ check), `WatchLink` (send
     helpers, "is there a watch at all"), `WatchLinkService` (the Data Layer listener),
     `WatchPings` (wrist pings through `GroupSync.sendPing`, read back from the relay;
     Need help skips the paywall), `WatchSync` + `WatchSyncStarter` (crew status and faces to
     the watch when they change), `PhoneFinderBridge` + `PhoneHeld`.
   - **Still to write** (`WatchLinkService` already calls the first):
     - `WatchFind` (object): `start(context, watchNode, FindStart)`, `renew(…, FindRenew)`,
       `stop(sessionId)`. Holds a `core` `FindLease` and a `WristArbiter`. Checks
       `Entitlements.plus` and that the mate exists. While the lease is active, every
       `intervalMs`: take fixes from `PhoneFinderBridge` if the phone's own finder is running
       (passing `PhoneHeld.held`), else from `PocketFinder`; send
       `FindUpdate(sessionId, seq, status, arbiter.reading(…), lease.lastWatchClockMs,
       lease.echoHeldMs(now))` with `WatchLink.send`. On `FindLease.State.Ended` send
       `FindEnded` and stop everything. Must hop to the main thread (the listener calls it
       from a background thread).
     - `PocketFinder`: the screen-off finder from problem 4. `BleRanger(…).start(lowLatency =
       false)` plus its own `BleHub.subscribe(…, BleHub.Sub(listOf(Ble.SERVICE_UUID), fast =
       true, unfiltered = false) {})` so the shared scan is fast **and filtered**; `UwbFinder`
       (distance only: pass no bearing); `WifiAwareFinder`; `GpsFinder` (its `declinationDeg`
       is what goes to the watch); `CrowdRelayRadio.startListening`; a "looking" advert
       (`BleBroadcaster` + `Advert.encode(…, looking = true)`, re-made each id rotation, as
       `LocatorEngine.updateLookingAdvert` does); `RadioWatcher`. In test builds, feed
       `FriendSimulator` fixes for `sim-` friends so the wrist can be tried with one phone.
     - `WatchFinderService`: a `LifecycleService` copied in shape from
       `VisibilityService.startInForeground`: try `connectedDevice | location`, fall back to
       `connectedDevice` on `SecurityException`, give up on `IllegalStateException`; low
       importance channel, "Finding Sam for your watch", a Stop action. If Android refuses
       the start but `VisibilityPrefs.isVisible` (the live service is up), find anyway; if
       it can't find at all, the updates carry `FindStatus.NEEDS_PHONE`.
   - Add (additions only): `implementation(libs.play.services.wearable)` in
     `app/build.gradle.kts`; in the app manifest `WatchLinkService` (exported, intent filter
     `com.google.android.gms.wearable.MESSAGE_RECEIVED`, data `wear://*/mosh/` path prefix),
     `WatchFinderService` (`foregroundServiceType="connectedDevice|location"`), the
     `WatchSyncStarter` provider (authority `${applicationId}.watchsync`, not exported);
     `app/src/main/res/values/wear.xml` declaring the capability `moshpoint_phone`;
     `strings_watch.xml` (channel name, "Finding %1$s for your watch", Stop) in English and
     all 19 languages.
3. **Translate the watch strings** (`wear/src/main/res/values/strings.xml`, 59 entries) into
   the app's 19 languages with the terms in `docs/i18n` and the app's own wording for the
   same pings. Make `tools/check_translation.py` take any module's `values-xx` folder (its
   English folder is the sibling `values`), run it over `wear` in the CI step, and fail if
   `app` and `wear` ship different sets of languages.
4. **Look at the watch screenshots.** CI commits English, German, Thai, Arabic and Japanese to
   `docs/screenshots/watch/` and pushes every language and both sizes to the
   `ui-screenshots-watch` branch. Fix anything that runs off the round edge.
5. **Docs:** the install steps at the end of this note (facts already checked: adb 30 or
   newer; phone/computer and watch on the same Wi-Fi; on a Galaxy Watch, Settings → About
   watch → Software information → tap Software version seven times, then Developer options →
   ADB debugging and Wireless debugging → Pair new device; `adb pair IP:PORT`, then `adb
   connect IP:PORT` with the *other* port shown, then `adb -s IP:PORT install -r
   moshpoint-watch.apk`); a wrist section in `docs/FIELD_TEST_PLAN.md`; the watch APK link in
   `.github/testing-release.md`; one-line pointers in `ARCHITECTURE.md` and `FEATURES.md`.
6. **Finish line:** both CI jobs green.

### Shared files this branch touches (for merging with the other two branches)

Everything else is new files (`core/…/core/watch/`, `wear/`, `docs/WATCH.md`, `wip/`).

| File | Change | State |
|---|---|---|
| `settings.gradle.kts` | One line at the end: `include(":wear")` | Done |
| `gradle/libs.versions.toml` | A block of Wear versions at the end of `[versions]`, a block of libraries at the end of `[libraries]`. No existing line changed | Done |
| `.github/workflows/android.yml` | A new `wear` job appended at the very end. No existing line changed | Done |
| `.github/workflows/android.yml` | The "Translations match English" step will also loop over `wear/src/main/res` | Planned |
| `app/build.gradle.kts` | One dependency line: `implementation(libs.play.services.wearable)` | Planned |
| `app/src/main/AndroidManifest.xml` | Two services and one provider added inside `<application>`, after the existing ones | Planned |
| `app/…/locate/LocatorEngine.kt` | 17 lines appended as the last thing in the class (after `class ScanUi`): three read-only members and an `init` that registers with the bridge. Parked as `wip/watch-phone-side/locatorengine-bridge.patch`. If the venue-map branch also appends there, keep both | Planned |
| `tools/check_translation.py` | The English folder becomes "the `values` folder next to the one being checked" instead of a fixed `app/…` path; a check that modules ship the same languages | Planned |
| `.github/testing-release.md`, `docs/FIELD_TEST_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md` | Added sections or lines only | Planned |

Not touched, and not going to be: `core/Advert.kt`, `service/VisibilityService.kt`,
`MainActivity.kt`, `MoshpointApp.kt`, `GroupSync.kt`, `CrewStatus.kt`, the server. The phone
side reads the app's existing state from outside (it is Compose state) and starts itself from
a manifest-declared provider, so none of those need a hook. The pocket finder calls
`Advert.encode(…, looking = true)` with named arguments, so new optional parameters there
won't break it.

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
| One very long buzz | "Need help was sent" | |
| Four rapid ticks | "That did not send" | Any ping that failed |

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
  the app closed: Play services wakes the listener, which loads the crew first.
- **It says what happened, and only what it knows:**
  - No phone in reach, or the message can't be handed over → **"Not sent. Your phone is out of
    reach."** with the failure buzz and a Retry.
  - Handed over → the phone then **reads the crew's ping box back from the relay** and looks
    for its own signed Need-help ping. Found → **"Sent to your crew."** Not found within a few
    seconds → **"Not confirmed. Your phone may have no signal."** with a Retry.
  - No answer from the phone in 12 s → treated as not sent.
  - Not in a crew → "You're not in a crew, so there's no one to tell."
- A retry reuses the same request number, so a slow first attempt and a retry never send two.
- After a send, "I'm OK now" tells the crew you're all good. That is part of the safety
  feature, so it is free too.
- **Never paywalled:** the phone handles Need help (and its all-clear) before, and without,
  the Moshpoint+ check; the watch shows the button in every state, including the locked one
  and the tile.

`sendPing` itself is not changed (the Bluetooth-messaging work is rewriting how pings travel).
Once that lands, its "Sent / Sent nearby / Waiting for signal" can replace the read-back.

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

_To be written once the first watch build exists (see Status)._
