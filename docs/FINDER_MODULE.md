# The finder module (`:finder`)

The roadmap's "Before launch" item: move the finder engine out of the gig code, because the
watch (watch-side UWB) and a construction-site spin-off on the same core need it without crews,
chat, pins, venue maps or relay mailboxes.

**The rule above everything else: no change in behaviour.** This is a pure refactor. The same
advert bytes, UWB session ids and keys, scan modes, timings, thresholds, permissions, battery
behaviour, fixes and arrows, debug lines and watch bridge. Where keeping behaviour identical forced
something awkward, the behaviour was kept and the awkwardness is listed under
[Awkward on purpose](#awkward-on-purpose-for-later).

## Status and next steps

_Handover, kept current at every push. Branch: `claude/finder-module-h6t4wn`, from
`ccr-5839ed7c-1q0ztj` at `121f057`._

**Where things stand:** all the code is written and pushed. CI is green for stage 1 (run 264),
stage 2 (run 265) and stages 3 + 4 together (run 267: stage 3's own run was replaced while still
queued). Run 267: merged manifest and licence list (126 libraries) the same as the published main
build, screenshots unchanged, release check passed, watch job green. It also showed one finder debug
line in the release APK (review item 3); the fix is pushed as stage 4b, CI pending.
`ARCHITECTURE.md` and `ROADMAP.md` updated.

| Stage | What | State |
|---|---|---|
| 1 | `:finder` library module in the build (`com.android.library`, namespace `nz.waveformlabs.moshpoint.finder`, its own `BuildConfig.TEST_BUILD`); the app depends on it. The plug-in API (`FinderMate`, `FinderPlugins`, `FinderLog`) and the app's side of it (`FinderSetup`, installed first in `MoshpointApp.onCreate`; `Friend` implements `FinderMate`). The five files with no app dependencies moved: `Ble`, `Capabilities`, `Compass`, `MotionDetector`, `MyLocation`. CI: the finder's own lint report; a report-only step that compares the merged manifest (and, from stage 4, the licence list) with the published main build | **green** (run 264) |
| 2 | The radios: `BleHub`, `BleBroadcaster`, `BleRanger`, `RadioWatcher`, `WifiAware`, `UwbFinder`, `UwbResponder` (from `service/`). `DebugStatus` calls become `FinderLog`; `Friend` parameters become `FinderMate`; `UwbFinder` gets a name lookup for its one log line (`nameOf`, the app passes `FriendsRepository.byId(id)?.name`); `RelayClient` gets its own copy of the `hex()` helper it used from `UwbFinder.kt` | **green** (run 265) |
| 3 | `CrowdRelayRadio`, `GpsFinder`, `LocatorEngine`, `PocketFinder` (from `watch/`) and the new `Findable` (the being-findable work out of `VisibilityService`, line for line). The app passes its parts in: `MainActivity` (engine; registers it with `PhoneFinderBridge`), `VisibilityService` (drives `Findable`), `WatchFind` (pocket finder) | **green** (run 267, with stage 4) |
| 4 | Pure logic that can live in `core` moves there, with tests: core `FinderRules.kt` (`ScanStarts`, `WalkingTest`, `CompassHeading`, `LocationPick`, `GpsFixRule`, `HeadingLog`), `FinderRulesTest` (20 tests; core + server 505 tests pass locally). `BleHub`, `MotionDetector`, `Compass`, `MyLocation`, `GpsFinder` and `LocatorEngine` call them. The CI report step moves to the end of the job and also compares the licence list | **green** (run 267) |
| 4b | The six debug lines that build text from an interface call are built only in test builds (review item 3); the report step checks eleven finder lines in the release APK | pushed, CI pending |
| 5 | `ARCHITECTURE.md` (modules, the finder's files, the boundary) and `ROADMAP.md` (status); this note's file list and review list | done, kept current |

**Exact next step:** read the stage-4b CI run's last ~60 log lines (the report step: "merged
manifest: same…", "licence list: same…", and every "finder debug text …: not in the release
APK"); confirm the run is green and no screenshot commit came back. Then rebase onto the latest
`ccr-5839ed7c-1q0ztj` if it has moved, and send the report.

How to work on it: `core` and `server` tests run in the cloud container with a scratch Gradle
settings file that includes only `:core` and `:server` and points its version catalogue at
`gradle/libs.versions.toml` (Google's Maven host is blocked there, so `:app`, `:finder` and `:wear`
are only built by CI, about 13 minutes a run). CI commits changed screenshots back to the branch:
`git pull --rebase` before pushing.

## The boundary

### What moves into `:finder`, and why

Everything that finds a person or makes this phone findable, and nothing that knows about gigs.
The code keeps its package, `nz.waveformlabs.moshpoint.locate`, so nothing in the app changes its
imports; only the Gradle namespace (for `BuildConfig`) is new.

| File | Job | Was |
|---|---|---|
| `Ble.kt` | The 16-bit service UUID of every Moshpoint advert | app `locate/` |
| `Capabilities.kt` | What the phone has: BLE, UWB, Wi-Fi Aware, compass, GPS | app `locate/` |
| `Compass.kt` | Rotation vector → heading | app `locate/` |
| `MotionDetector.kt` | Walking or not, from the accelerometer | app `locate/` |
| `MyLocation.kt` | This phone's GPS position (framework `LocationManager`) | app `locate/` |
| `BleHub.kt` | The app's one Bluetooth scan, shared by everything that listens, within Android's 5-starts-in-30-s limit | app `locate/` (stage 2) |
| `BleBroadcaster.kt` | One advert | app `locate/` (stage 2) |
| `BleRanger.kt` | Mates' adverts → signal strength, distance, decoded advert | app `locate/` (stage 2) |
| `RadioWatcher.kt` | Bluetooth / Wi-Fi Aware switched off and on | app `locate/` (stage 2) |
| `WifiAware.kt` | Wi-Fi Aware publish (findable) and subscribe + RTT (finding) | app `locate/` (stage 2) |
| `UwbFinder.kt` | UWB on the looking phone (controller) | app `locate/` (stage 2) |
| `UwbResponder.kt` | UWB on the phone being found (controlee) | app `service/` (stage 2) |
| `CrowdRelayRadio.kt` | The crowd relay's Bluetooth: sealed locations hop phone to phone; other packets (the app's messages) take turns in its one advertising set | app `locate/` (stage 3) |
| `GpsFinder.kt` | GPS bearings from sealed boxes (crowd relay cache, relay server) | app `locate/` (stage 3) |
| `LocatorEngine.kt` | The phone's finder: every method at once into core `MethodArbiter`, compass, spin scan, walk-and-watch, the "looking" advert, light-me-up, simulated mates | app `locate/` (stage 3) |
| `PocketFinder.kt` | The finder for the watch with the phone in a pocket | app `watch/` (stage 3) |
| `Findable.kt` (new, stage 3) | Being findable: the advert with our rotating code (rotating, and following identity changes), Wi-Fi Aware publish, the UWB responder, the low-power listen for lookers, fast advert while someone looks | taken out of `VisibilityService` |
| `FinderMate.kt`, `FinderPlugins.kt`, `FinderLog.kt` (new) | What the app plugs in (below) | — |

### What stays in the app, and why

| File | Why it stays |
|---|---|
| `locate/RelayClient.kt` | The relay server client for everything the gig app sends (chat, pins, photos, avatars, intros) as well as GPS lookups. It carries the app's build-time server address, the public relay's daily budget, `NetState` and the "Force no internet" test switch. The finder only needs four things from it, through `FinderMailbox`. It keeps its package name in the app. |
| `locate/MapFeed.kt` | The map screen's feed (crew first, the crew's pin mailbox, the map's status strings). It uses the finder's `MyLocation` and crowd-relay cache. |
| `service/VisibilityService.kt` | The foreground service, its notification, the Quick Settings tile's state, the "light up" notification, the battery receiver. It drives `Findable` and the gig work around it (crew intros, venue maps, floors, messages without signal, location sharing) in the same order as before. |
| `service/LocationUploader.kt` | Sharing our sealed GPS through the relay: ghost mode, the night recap's distance and the relay's upload gaps are app things. Candidate to move later behind `FinderMailbox`. |
| `watch/PhoneFinderBridge.kt` | The watch's read-only window onto the phone's finder. The engine used to register itself; `MainActivity` now registers it right after making it. |
| `DebugStatus.kt`, `FieldRecorder.kt` | The test builds' debug panel and field recorder, plugged in as the finder's status and recorder. |
| `Friends.kt`, `Identity.kt`, `LocationBook.kt`, `HerePins.kt`, `venue/Floors.kt`, `GroupSync.kt`, `OfflineMessages.kt` | Gig things. They reach the finder only through the interfaces below. |

## What the app plugs in

Things that differ from one finder to the next are passed to each one; things that are the same
for the whole process are set once in `FinderPlugins`.

**Each finder** (constructor parameters):

| What | Phone app |
|---|---|
| My identity: `identity: () -> ByteArray` | `Identity.current` (the crew pass at a gig) |
| Who to find: `FinderMate` (id, name, secret, rotating code) | `Friend` implements it; the engine looks ids up with `FriendsRepository.byId` |
| Pretend mates (test builds): `isSimulated` | `FriendsRepository.isSimulated` |
| Readings for floors: Bluetooth distance + advert, UWB distance | `Floors.onBluetooth`, `Floors.onUwb` |
| Bluetooth switched off/on | `GroupSync.onBluetooth` (restarts the crew intro advert) |
| The finder's focused mate | `LocatorEngine.focus(id)` (unchanged) |
| The spin scan's "can't hear them" words | the app's sentence, which mentions crews |
| Being findable: our pressure in the advert, a mate looking, a mate asking us to light up | `Floors.advertPressure`, `LocationUploader.boost`, the service's notification |

**The whole process** (`FinderPlugins`, set in `FinderSetup.install()` from `MoshpointApp.onCreate`):

| Plug-in | Phone app |
|---|---|
| `status`: status lines and log (test builds) | `DebugStatus` |
| `recorder`: field recordings (test builds) | `FieldRecorder` |
| `mailbox`: relay lookups, poll gap, label, passing crowd-relay packets up | `RelayClient` |
| `sharedLocations`: where a mate last shared their GPS | `LocationBook.update` |
| `extraFixes`: fixes from our own position besides shared GPS | "I'm here" pins: `HerePins.pinOf` → `HereRule.fix` |
| `relayLane`: other packets in the crowd relay's advertising set | `OfflineMessages` (messages without signal) |

`FinderLog` passes status lines and recordings on only when the module's own
`BuildConfig.TEST_BUILD` is true (debug build type; release is false), a constant, so R8 strips
them from release builds exactly as it did when the code called `DebugStatus` directly.

## How another app would use it

```kotlin
// Once, in Application.onCreate (all optional):
FinderPlugins.mailbox = MyRelay          // GPS finding through a server
FinderPlugins.status = MyDebugPanel      // test builds

// Finding (scope on the main thread):
val finder = LocatorEngine(context, scope, identity = { mySecret }, mateById = { id -> workers[id] })
finder.track(setOf("sam")); finder.start()
finder.arrows.collect { /* one ArrowState per mate */ }

// Being findable, from a foreground service (type connectedDevice, plus location for GPS):
val findable = Findable(context, scope, identity = { mySecret }, mates = { workers.values.toList() })
findable.start(); /* ... */ findable.stop()
```

The host app declares the permissions (the module's manifest is empty on purpose, so the phone
app's merged manifest is exactly what it was): `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`,
`BLUETOOTH_CONNECT` (and `BLUETOOTH`, `BLUETOOTH_ADMIN` up to SDK 30), `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `UWB_RANGING`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`,
`NEARBY_WIFI_DEVICES`, `INTERNET` (with a mailbox), and for being findable in the background
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `FOREGROUND_SERVICE_LOCATION`.
The watch (`wear`, minSdk 30) can depend on `:finder` (minSdk 29) for watch-side UWB.

## Pure logic moved to `core` (stage 4)

Only where the arithmetic could be moved exactly, with tests (`FinderRulesTest`). Each is the same
code in the same order with the same number types; some of it is Float on purpose, because that is
what the sensors and `Location` give, and a test pins that down.

| core `FinderRules.kt` | Was | The rule |
|---|---|---|
| `ScanStarts` | `BleHub`'s `starts`, `prune`, `delayToNextStart`, the refresh check | At most 4 scan starts in any 30 s (Android allows 5); a restart needs the gap asked for and room; how long to wait (until the oldest start leaves the window, plus 200 ms, at least 200 ms) |
| `WalkingTest` | `MotionDetector.onSensorChanged` | Size of the acceleration over the last 1.5 s; walking when its spread is over 0.9 m/s²; fewer than 10 readings: keep the last answer |
| `CompassHeading` | `Compass` | Heading from the rotation matrix: top edge plus back of the phone, horizontal part; none when that is under 0.01 |
| `LocationPick` | `MyLocation.isBetter` | A fix over 30 s newer wins, one over 30 s older loses, otherwise no more than 1.5 times vaguer |
| `GpsFixRule` | `GpsFinder.poll`'s age limit and confidence | Shared positions older than 4 minutes are dropped; confidence from both error circles against the gap (0.1 to 1) times freshness (0.2 to 1) |
| `HeadingLog` | `LocatorEngine.headingLog` and `headingAt` | The last 200 compass headings; a reading gets the one nearest its own time if within a second, else the current heading |

## Places where behaviour could conceivably differ (review these first)

Filled in as the stages land; each says why it is believed identical.

1. **Status lines and recordings go through `FinderPlugins`.** Installed first thing in
   `MoshpointApp.onCreate`. Only content providers run earlier (`WatchSyncStarter`, which posts to
   the main thread and touches no finder code), so no line is lost.
2. **Release builds strip the finder's debug text through the module's own constant**
   (`TEST_BUILD`, false for release) rather than the app's; the app's release check (five UI
   strings) is unchanged and still runs, and the report step also looks for eleven of the finder's
   own debug lines in the release APK.
3. **Debug lines that name a mate.** Run 267 found one finder line in the release APK ("… is
   looking: advert to fast"). The moved code reads the name through the `FinderMate` interface
   (it used the final `Friend` class), and R8 can't prove an interface call harmless, so it kept
   the text and would have built it, unused, in release builds. The six lines that build text from
   an interface call (`BleRanger` "on, heard …", `WifiAware` "found …", `UwbResponder` "in session
   with …" and "joining …'s session", `Findable` "… is looking", `GpsFinder` "… box(es) for …",
   and the app's "… asked us to light up") are now built only inside `if (FinderLog.enabled)` /
   `if (DebugStatus.enabled)`, the constant, so release builds do no more than they used to (the
   same pattern the engine already used for its debug rows). Test builds log exactly as before.
4. **Lint:** `:app:lintDebug` no longer sees the moved files (`checkDependencies = false`); CI now
   runs `:finder:lintDebug` too and prints its summary under "finder lint summary". Report only.
5. **The watch bridge registration** (`MainActivity`): the engine used to call
   `PhoneFinderBridge.attach(this)` as the last thing in its constructor; now `MainActivity` calls
   `PhoneFinderBridge.attach(engine)` on the next line. Nothing can run in between (same thread,
   no suspension), and `MainActivity` is the only place an engine is made.
6. **`VisibilityService` start order** is unchanged: `Findable.startAdvertising()` where the
   advert and its rotation started, the gig work (location sharing, battery, crew intros, venue
   map, floors, crowd relay, messages) where it was, `Findable.startListening()` where Wi-Fi Aware,
   the radio watcher, UWB and the listen scan started. Advertisers therefore start in the same
   order (the visible advert, then the crew intro set, then the crowd relay set).
7. **`VisibilityService` stop order:** `Findable.stop()` runs at the end of `onDestroy`, where the
   listen scan, UWB responder and advert stopped before, so the UWB responder's last re-advert is
   still built after floors are released. The rotation coroutine, the radio watcher and the Wi-Fi
   Aware publisher now stop at that point too, a few statements later than before: all of it runs
   in one go on the main thread, nothing in between calls into them, and none of them can run
   (coroutine, broadcast receiver, Wi-Fi Aware callbacks are all posted to the main thread).
8. **The spin scan's "can't hear" sentence** mentions crews, so the app passes it in
   (`cantHear`); the text is character for character the old one. The module's default is a
   neutral sentence nobody in the phone app sees.
9. **GPS finding without a mailbox** (not the phone app): polls the crowd-relay cache every 4 s.
   The phone app always has one, so its polling gap is `RelayClient.pollMs` as before.
10. **The six rules moved to `core`** (stage 4, table above): copied expression for expression,
   including where the old code mixed Float and Double. `BleHub` still prunes before checking
   `running` in `refresh`, and still reads the clock twice when it has to wait (once for the status
   line, once for the timer), as before.
11. **App lint report:** besides the moved files' warnings now appearing in the finder's report,
   `AndroidGradlePluginVersion` notices went from 3 to 6 (the library plugin's entries in the build
   files). Report only; everything else in the app's lint summary is the same as before.
12. **Small copies:** `RelayClient` has its own `hex()`, character for character the helper it
   used to borrow from `UwbFinder.kt`. `Friend` implements `FinderMate` with the same getters, and
   the finder gets the same `Friend` objects (their cached rotating codes included) back in every
   callback.

## Awkward on purpose (for later)

- The app keeps `implementation(libs.androidx.core.uwb)` although its UWB code moves out (the
  finder brings it): removing it changes nothing at runtime but was not needed for the move.
- The scan's other outcome lines ("found", "couldn't tell…", "Not enough signal…") are English
  text inside the engine, as before. They should become the app's words (translated) one day.
- `LocatorEngine.uwbSpots` uses core's `VenuePlacement.UwbReading` (bearing, distance, time):
  plain data, but named after the venue map that reads it.
- `VisibilityService` calls `Findable` in two steps (`startAdvertising`, `startListening`) only so
  its own gig work keeps its place between them; `Findable.start()` does both for anyone else.
- `RelayClient` and `MapFeed` stay in the app in a package called `locate`, the finder's package:
  moving them would only rename them.

## Files moved or changed

Every file this work touched, against `121f057`.

**Moved into `finder/src/main/java/nz/waveformlabs/moshpoint/locate/`** (package unchanged unless
said):

| File | From | Changes besides the move |
|---|---|---|
| `Ble.kt`, `Capabilities.kt` | app `locate/` | none |
| `Compass.kt` | app `locate/` | heading maths → core `CompassHeading` |
| `MotionDetector.kt` | app `locate/` | walking test → core `WalkingTest` |
| `MyLocation.kt` | app `locate/` | "better fix" → core `LocationPick` |
| `BleHub.kt` | app `locate/` | `DebugStatus` → `FinderLog`; start budget → core `ScanStarts` |
| `BleBroadcaster.kt`, `RadioWatcher.kt` | app `locate/` | `DebugStatus` → `FinderLog` |
| `BleRanger.kt`, `WifiAware.kt` | app `locate/` | `DebugStatus` → `FinderLog`; `Friend` → `FinderMate`; the line naming a mate built only in test builds |
| `UwbFinder.kt` | app `locate/` | `DebugStatus` → `FinderLog`; `nameOf` for its one log line with a name |
| `UwbResponder.kt` | app `service/` (package `service` → `locate`) | `DebugStatus` → `FinderLog`; `Friend` → `FinderMate`; the lines naming a mate built only in test builds |
| `CrowdRelayRadio.kt` | app `locate/` | `DebugStatus` → `FinderLog`; `OfflineMessages` → `FinderPlugins.relayLane`; `RelayClient` → `FinderPlugins.mailbox` |
| `GpsFinder.kt` | app `locate/` | `DebugStatus`/`FieldRecorder` → `FinderLog`; `Friend` → `FinderMate`; `RelayClient` → `mailbox`; `LocationBook` → `sharedLocations`; the pin fix → `extraFixes`; age and confidence → core `GpsFixRule`; the "Server" status line built only in test builds |
| `LocatorEngine.kt` | app `locate/` | `DebugStatus`/`FieldRecorder` → `FinderLog`; constructor parameters `mateById`, `isSimulated`, `onBluetoothReading`, `onUwbReading`, `onBluetoothToggled`, `cantHear`; no `PhoneFinderBridge` registration; heading log → core `HeadingLog` |
| `PocketFinder.kt` | app `watch/` (package `watch` → `locate`, `internal` → public) | `DebugStatus` → `FinderLog`; constructor parameters `identity`, `mateById`, `isSimulated` |

**New:** `finder/build.gradle.kts`, `finder/src/main/AndroidManifest.xml` (empty), finder
`FinderMate.kt`, `FinderPlugins.kt`, `FinderLog.kt`, `Findable.kt`; app `FinderSetup.kt`; core
`FinderRules.kt` and its test `FinderRulesTest.kt`; this note.

**Changed in the app:** `MoshpointApp.kt` (installs the plug-ins first), `Friends.kt` (`Friend`
implements `FinderMate`), `MainActivity.kt` (makes the engine with the app's parts; registers it
with `PhoneFinderBridge`), `service/VisibilityService.kt` (drives `Findable`, same order; its
"asked us to light up" log line built only in test builds),
`watch/WatchFind.kt` (makes `PocketFinder` with the app's parts), `watch/PhoneFinderBridge.kt`
(comments only), `locate/RelayClient.kt` (its own private `hex()`).

**Build and CI:** `settings.gradle.kts` (`:finder`), `build.gradle.kts` and
`gradle/libs.versions.toml` (the library plugin, same AGP version), `app/build.gradle.kts` (depends
on `:finder`), `.github/workflows/android.yml` (the finder's lint report after the app's; a
report-only step after "Upload APK" comparing the merged manifest and the licence list with the
published main build, and checking a few of the finder's debug lines are not in the release APK;
`finder/build/reports` in the uploaded reports).

**Docs:** `docs/ARCHITECTURE.md` (modules, the finder's files, `FinderRules.kt`, debug builds),
`docs/ROADMAP.md` (the item's status), this note.

Not touched: `wear/`, every screen (`ui/`), the server, every string resource.
