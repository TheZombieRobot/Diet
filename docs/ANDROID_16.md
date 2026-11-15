# Android 16 (API 36): what changed for Moshpoint, and what was checked

Google Play requires new apps and updates to target Android 16 (API 36) since 31 August 2026
(Wear OS: Android 15, API 35). Wave 2b (docs/WAVE2_PLAY.md) moved the app there. This note
records the toolchain change and every Android 16 behaviour change that could touch this app,
checked against the code. Sources: Google's "Behavior changes: apps targeting Android 16" and
"Behavior changes: all apps" pages (read 15 November 2026).

## The toolchain

| | Before | Now | Why |
|---|---|---|---|
| Phone `compileSdk` / `targetSdk` | 35 / 35 | **36 / 36** | Play's requirement |
| Watch `compileSdk` / `targetSdk` | 35 / 34 | **35 / 35** | Wear OS requirement (35) |
| `finder` module `compileSdk` | 35 | 36 | same as the app it's part of |
| Android Gradle plugin | 8.7.3 | **8.10.1** | API 36 needs 8.9.1 or later; 8.10 supports up to 36 and still runs on Gradle 8.11.1 |
| Gradle, Kotlin, Compose BOM | 8.11.1, 2.0.21, 2024.12.01 | unchanged | nothing needed them newer; unchanged Compose keeps every screenshot identical |
| Paparazzi | 1.3.5 | unchanged, plus a test-only `android.os.Build` | see below |
| MapLibre | 11.5.2 | **11.8.1** | 16 KB pages (see "16 KB page size") |

**Paparazzi on API 36.** Paparazzi 1.3.5 renders with layoutlib from Android 14 and, before
each test, copies the build values from layoutlib's own `android.os.Build` (renamed
`_Original_Build`) into the SDK's, matching nested classes by name. The API 36 SDK adds
`Build.VERSION_CODES_FULL`, which layoutlib's copy lacks, so every screenshot test failed
("Array contains no element matching the predicate", run 300). Newer Paparazzi (2.0.0-alpha02 and
later) ships a layoutlib that knows Android 16, but it also brings Compose 1.8 and a new renderer:
every one of the ~2,000 screenshots would change, and the "unchanged screens are identical" check
would mean nothing. So `app/src/test/java/android/os/Build.java` is API 36's public `Build`
without `VERSION_CODES_FULL`. Test classes come first on the test classpath, so it's the one
Paparazzi fills in, exactly as it did with API 35. It never reaches the app. Delete it when
Paparazzi is upgraded (a step of its own: re-record every screenshot and review the differences).

## Behaviour changes, one by one

### Orientation and resizability ignored at 600 dp and wider (apps targeting 36)
On displays whose smallest width is 600 dp or more (tablets, unfolded foldables, desktop
windows), Android 16 ignores `screenOrientation`, `resizeableActivity`, `minAspectRatio`,
`maxAspectRatio` and `setRequestedOrientation()`. `MainActivity`'s `screenOrientation="portrait"`
therefore no longer holds there: the app fills the whole window, in landscape too. Phones (under
600 dp) keep the lock.

- **Decision: no opt-out.** The opt-out (`PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`) only
  puts the app in compatibility mode and stops working when the app targets API 37.
- **Checked:** new screenshot tests draw the home and the finder on a 1280 × 800 dp landscape
  tablet, in every language (`tabletHomeMain`, `tabletFinderGroup`), and the location disclosure
  (`tabletDisclosure`). What they show is in "Results" in docs/WAVE2_PLAY.md.
- **Found (for the bug-fixing phase):**
  1. **The phone's compass arrow is 90° out in landscape on a large screen.**
     `finder/…/Compass.kt` turns the rotation vector into a heading in the device's own frame and
     never remaps it to the screen's (`SensorManager.remapCoordinateSystem` with the display's
     rotation). That was harmless with the portrait lock on phones (rotation always 0); on an
     unfolded foldable or a tablet held in landscape the flat-phone arrow now points 90° off. (A
     tablet whose natural orientation is landscape was already off under the old lock.) Fix:
     remap by the activity's display rotation while the finder is on screen; leave the pocket and
     watch paths in the device frame. Field test 4f-F.
  2. **Rotation now recreates MainActivity on large screens** (no `configChanges`), which closes
     the finder and drops dialogs. Wave 2a owns `configChanges` (PRODUCTION_AUDIT, reliability);
     until then, a confirmation waiting for an invite and the gig a photo pick is for are saved
     across it (`InviteState.save`, `StoryState.save`).

### Predictive back (apps targeting 36)
Back-to-home, cross-task and cross-activity animations are on by default; `onBackPressed()` is
no longer called and `KEYCODE_BACK` isn't dispatched.

- **Checked:** the app never overrides `onBackPressed` or handles `KEYCODE_BACK`. Every in-app back
  (finder, map, chats, Story, camera, debug panel) is a Compose `BackHandler`, which goes through
  `OnBackPressedDispatcher` (activity 1.9.3 registers it with the platform's back callback), and
  every dialog handles back in its own window. So back works as before, with the system's
  animations at the edges. The QR scanner (zxing) and Facebook's login are their own activities:
  back simply closes them, as before.
- Not added: `android:enableOnBackInvokedCallback="true"` for older Android versions (it would
  change back on Android 13–15 for no gain).

### Alarms and jobs
- **Alarms:** Android 16 changes nothing in `AlarmManager`. The app's alarms (`GigWake`
  `setAndAllowWhileIdle`, `Memories` `set`, `ChatSync`/`FollowCheck` inexact repeating) are
  unchanged. (Wave 2a is adding a Doze-proof alarm for overdue check-ins.)
- **Jobs (all apps on Android 16):** new runtime quotas, the "abandoned job" stop reason, and
  `setImportantWhileForeground` ignored. The app uses no JobScheduler, WorkManager or
  DownloadManager, so none apply.
- **Fixed-rate scheduling (apps targeting 36):** at most one missed `scheduleAtFixedRate` run is
  made up. Not used (the app's timers are coroutine `delay` loops).

### Bluetooth
- **Bond-loss handling** (all apps) and the new `ACTION_KEY_MISSING` / `ACTION_ENCRYPTION_CHANGE`
  intents (apps targeting 36) are about bonded (paired) devices. Moshpoint never bonds or
  connects: it only advertises and scans. Not affected.
- **Scanning and advertising** are unchanged in Android 16.
- Separately, three of the four advert UUIDs moved to 128-bit ones (docs/BLUETOOTH_UUIDS.md).

### Intent redirection (all apps)
Android 16 blocks launching an `Intent` that arrived inside another app's `Intent` (a nested
intent in the extras) unless the app opts out with `removeLaunchSecurityProtection()`.

- **Checked:** the app never launches an intent it received. Its only `getParcelableExtra` reads a
  photo's `Uri` (`ShareMomentActivity`). Not affected, and no opt-out needed.
- **Related hardening done in wave 2b:** an invite from another app (Share → Moshpoint invite, or
  any app starting `MainActivity` with the invite extra) only opens a confirmation; nothing joins,
  adds or goes live without a tap (docs/WAVE2_PLAY.md, item 4). A photo shared to the app must be
  another app's `content://` address: `file://` and the app's own providers are refused, also
  when an app sends the moment extra straight to `MainActivity`.
- **Checked, left as is:** `MainActivity` must be exported (it's the launcher), so any app can
  start it with the extras the app's own notifications use. None of them goes live or sends
  anything: "find this mate" and "light up for this mate" need a friend's id, a random UUID no
  other app can know; "find crew", "open map" and "open chat" only open screens.

### The rest

| Change | Applies to | Moshpoint |
|---|---|---|
| Edge-to-edge can't be opted out of | target 36 | Already edge-to-edge since API 35 (`safeDrawingPadding`); the opt-out attribute was never used |
| `elegantTextHeight` ignored | target 36 | Compose text; no `TextView` relies on it |
| Health and fitness permissions replace `BODY_SENSORS` | target 36 | Not used (the pressure sensor needs no permission) |
| `MediaStore#getVersion()` unique per app | target 36 | Not used |
| App-owned photos pre-selected when access is limited | target 36 | Only applies to the media-permission picker; the app now uses the system photo picker and asks for no media permission |
| Ordered broadcast priority only within a process | all | No `android:priority` anywhere |
| Disruptive accessibility announcements deprecated | all | `announceForAccessibility` not used |
| Local network permission (opt-in testing on 16) | target 36 | Wi-Fi Aware is used for discovery and ranging only, with no sockets; the relay is on the internet |
| ART internal changes | all | No reflection into ART or non-SDK interfaces |
| 16 KB page size compatibility mode | all | Not needed: every 64-bit native library is 16 KB aligned (below) |

### 16 KB page size
Phones with 16 KB memory pages run a 4 KB-aligned app in a compatibility mode with a warning, and
Play blocks such updates from 1 February 2027. MapLibre 11.5.2's `libmaplibre.so` was 4 KB
aligned; 11.8.1 is the first 11.x that is 16 KB aligned (checked with `tools/check_16kb.py` on
both AARs), with no API change for the calls `FriendMap`, `MapScreen` and `VenueMaps` make, so
they needed no changes. CI now fails if any 64-bit native library in the release APK, the Play
bundle or the watch's release APK isn't 16 KB aligned (run 300: `libmaplibre.so`,
`libimage_processing_util_jni.so` (CameraX) and `libandroidx.graphics.path.so` all pass). The
32-bit copies don't need it (16 KB-page phones are 64-bit), as in Google's own check.

## Field test
Section 4f of docs/FIELD_TEST_PLAN.md: a shared invite with the app closed, the photo picker, the
disclosure before the prompt, predictive back in every overlay, and the home, finder and arrow on
a tablet or unfolded foldable in landscape.
