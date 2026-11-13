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

**Where things stand:** stage 1 written and pushed, waiting for CI. Stages 2 and 3 designed (below),
not started.

| Stage | What | State |
|---|---|---|
| 1 | `:finder` library module in the build (`com.android.library`, namespace `nz.waveformlabs.moshpoint.finder`, its own `BuildConfig.TEST_BUILD`); the app depends on it. The plug-in API (`FinderMate`, `FinderPlugins`, `FinderLog`) and the app's side of it (`FinderSetup`, installed first in `MoshpointApp.onCreate`; `Friend` implements `FinderMate`). The five files with no app dependencies moved: `Ble`, `Capabilities`, `Compass`, `MotionDetector`, `MyLocation`. CI: the finder's own lint report; a report-only step that compares the merged manifest with the published main build | pushed, CI pending |
| 2 | The radios: `BleHub`, `BleBroadcaster`, `BleRanger`, `RadioWatcher`, `WifiAware`, `UwbFinder`, `UwbResponder` (from `service/`). `DebugStatus` calls become `FinderLog`; `Friend` parameters become `FinderMate`; `UwbFinder` gets a name lookup for its one log line | not started |
| 3 | `CrowdRelayRadio`, `GpsFinder`, `LocatorEngine`, `PocketFinder` (from `watch/`) and the new `Findable` (the being-findable work out of `VisibilityService`). The app passes its parts in: `MainActivity`, `VisibilityService`, `WatchFind` | not started |
| 4 | Pure logic that can live in `core` moves there, with tests (candidates below) | not started |
| 5 | `ARCHITECTURE.md` and `ROADMAP.md`; this note's file list and review list completed | not started |

**Exact next step:** read the stage-1 CI run (builds, release check, licences count, merged
manifest "same as the published main build", screenshots unchanged, finder lint), then stage 2.

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

## Pure logic for `core` (stage 4 candidates)

Only where the arithmetic can be moved exactly, with a test: `BleHub`'s scan-start budget (4 starts
in any 30 s, the refresh gap), `MotionDetector`'s walking test, `Compass`'s heading from the
rotation matrix, `MyLocation`'s "better fix" rule, `GpsFinder`'s confidence and age rules, the
engine's heading log (nearest heading within a second).

## Places where behaviour could conceivably differ (review these first)

Filled in as the stages land; each says why it is believed identical.

1. **Status lines and recordings go through `FinderPlugins`.** Installed first thing in
   `MoshpointApp.onCreate`. Only content providers run earlier (`WatchSyncStarter`, which posts to
   the main thread and touches no finder code), so no line is lost.
2. **Release builds strip the finder's debug text through the module's own constant**
   (`TEST_BUILD`, false for release) rather than the app's; the app's release check (five UI
   strings) is unchanged and still runs.
3. **Lint:** `:app:lintDebug` no longer sees the moved files (`checkDependencies = false`); CI now
   runs `:finder:lintDebug` too and prints its summary under "finder lint summary". Report only.

## Awkward on purpose (for later)

- The app keeps `implementation(libs.androidx.core.uwb)` although its UWB code moves out (the
  finder brings it): removing it changes nothing at runtime but was not needed for the move.

## Files moved or changed

Kept current with each stage.

- Moved to `finder/src/main/java/nz/waveformlabs/moshpoint/locate/`: `Ble.kt`, `Capabilities.kt`,
  `Compass.kt`, `MotionDetector.kt`, `MyLocation.kt` (unchanged).
- New: `finder/build.gradle.kts`, `finder/src/main/AndroidManifest.xml`, `FinderMate.kt`,
  `FinderPlugins.kt`, `FinderLog.kt`; app `FinderSetup.kt`; this note.
- Changed: `settings.gradle.kts`, `build.gradle.kts`, `gradle/libs.versions.toml` (the library
  plugin), `app/build.gradle.kts` (depends on `:finder`), `MoshpointApp.kt` (installs the
  plug-ins), `Friends.kt` (`Friend` implements `FinderMate`), `.github/workflows/android.yml`
  (finder lint; merged-manifest comparison, report only).
