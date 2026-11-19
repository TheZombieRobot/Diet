# App code structure (the tidy-up)

How the `app` module's code is laid out, why, and how it got there. The tidy-up is **moves and
extractions only, with no behaviour change**: same logic, timings, thresholds, strings, colours,
layout and order of events. Branch: `claude/tidy-app-structure` (from `ccr-5839ed7c-1q0ztj`).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done (all six steps):** feature packages; MainActivity split into state holders, one
  launcher helper and screen composables; FriendsScreen's 76 parameters grouped into 8; the two
  1,000-line home files split by section; `ui/` split into feature folders; dead code removed
  (imports, declarations, parameters); the code that came out of MainActivity uses imports
  instead of fully qualified names. ccr merged up to 604ced4 (the production audit, docs
  only).
- **Proof so far:** CI run 291 (the moves and the MainActivity split, at edfc6cf) is green, with
  every screenshot (1,165 phone, 798 watch, all 21 language folders) byte-identical to ccr's and
  the merged manifest and licence list "same as the published main build". The final run on the
  branch head repeats all of it (see "Results").
- **Next step:** none for the tidy-up. Later steps are listed under "Later".
- **If ccr moves on:** merge it in; ccr's fixes to moved code land in the moved file (git
  follows the renames). A change ccr makes inside the old `MainActivity` needs porting by hand
  to the holder or composable named in "Where things moved".

## Before and after

| | ccr (792cd68) | this branch |
|---|---|---|
| `MainActivity.kt` | 1,647 lines; 30 `mutableStateOf` fields, 6 launchers, 41 functions | 302 lines; 0 state fields, 0 launchers, 10 functions (the lifecycle) |
| `FriendsScreen` | 76 parameters | 8 (`me`, `crew`, `gigs`, `scanned` and four action holders) |
| Files loose in `nz.waveformlabs.moshpoint` | 45 | 10, all named in the manifest |
| Five biggest files | MainActivity 1,647; HomeSections 1,062; HomeKit 1,045; GroupSync 888; VenueMaps 734 | GroupSync 905; VenueMaps 734; CrewChat 707; CrewChatUi 545; FinderScreen 526 |
| Biggest UI file | HomeSections 1,062 | CrewChatUi 545 |
| `ui/` | 31 files in one folder | 7 shared-kit files + 6 feature folders (39 files) |

## The structure

```
nz/waveformlabs/moshpoint/
  (root)       Only the classes Android knows by name (AndroidManifest.xml); they never move:
               MoshpointApp (+ Txt), MainActivity, ShareInviteActivity, ShareMomentActivity,
               CrewWidget, MediaFileProvider, GigWakeReceiver, ChatCheckReceiver,
               FollowCheckReceiver, MemoryReceiver; SpotLinkActivity (texted spots' App Link,
               declared in src/spotLinks/AndroidManifest.xml only for builds with a relay,
               docs/SPOT_LINKS.md)
  main/        MainActivity's helpers: HomeState, PermissionsState, FinderState, MapState,
               StoryState, ChatState, InviteState, CameraState (state holders); MainLaunchers
               (every activity result); MainScreen and the pieces it draws (CrewDialogs,
               HomeContent, FinderContent, NightDialogs, ChatOverlays, StoryOverlays, MapOverlay)
  crew/        GroupSync, Crews, CrewRekey, CrewStatus, CrewNotifications, Bump, FollowCheck
  chat/        CrewChat, ChatSync, OfflineMessages (the courier's phone side, chat and private)
  privatemsg/  PrivateMessages
  moments/     Moments, MomentFlow, ShareQuality
  gigs/        GigArchive, GigSearch, GigWake, Memories, NightStats
  safety/      GhostMode, TorchStrobe ("Light me up"), AppErrors, Housekeeping, Notices (Safety and
               EmergencyNumbers were removed with Need help, 16 November 2026: REMOVE_SAFETY.md)
  profile/     Identity, PhotoStore, AvatarSync, FacebookLogin
  friends/     Friend + FriendsRepository (Friends.kt), Friendship
  map/         Spots, LocationBook, HerePins
  setup/       SetupChecks, FinderSetup, NetState, SatelliteSwitch, MapNet
  sharing/     Sharing, PlanCardImage, TextMySpot
  debug/       DebugStatus, FieldRecorder
  locate/ service/ venue/ watch/   unchanged (already packages; several hold manifest classes)
  ui/          the shared kit: Theme, Neon, Buttons, Avatar, DefaultAvatars, Format, Qr
  ui/home/     FriendsScreen (+ FriendsScreenState: its grouped inputs), HomeSections (crew
               sections), HomeHeroes, HomeGigLists, HomePanels, HomeBar, HomeKit (type, text,
               icons), HomeButtons, HomeFaces, HomeSheets, BumpUi, PlanGig
  ui/finder/   FinderScreen, FinderStates, FinderArrows, CrewRadar, DebugPanel, PlaceFinderScreen
               (the finder on a texted spot, docs/SPOT_LINKS.md)
  ui/map/      MapScreen, FriendMap, VenueUi, HereUi
  ui/chat/     CrewChatUi, PrivateChatUi
  ui/moments/  StoryScreen, MomentsUi, CaptureScreen, CameraRollUi
  ui/settings/ SettingsScreen, PlusSettings, Acknowledgements, OnboardingScreen, OfflineDebug
```

Why feature packages: a change to, say, crew chat used to mean finding `CrewChat.kt`,
`ChatSync.kt`, `OfflineMessages.kt` and `CrewChatUi.kt` among 76 files in two folders. Grouped by
feature, each area reads as a unit, and the root package says exactly what the system can start.

## How it was done, and why in this order

1. **Feature packages** (pure moves). Per package, one `git mv` commit (100% renames: the
   `package` line untouched, which Kotlin allows, so every commit still builds), then one commit
   that only changes `package` lines, imports and fully qualified names. The four receivers that
   shared a file with logic that moves were first extracted, unchanged, into their own files in
   the root package. First, because every later step then edits code in its final place.
2. **A thin MainActivity** (one extraction commit). See the equivalence notes.
3. **FriendsScreen's parameters** grouped (one extraction commit).
4. **The two big home files** split by section: one commit makes `PanelTitle` internal (it's
   shared by two sections), one moves whole declarations into the new files. No other UI file
   is over 600 lines.
5. **`ui/` feature folders**, as in step 1.
6. **Dead code**: unused imports, then unused declarations, then unused parameters, one commit
   each, each item proven unused (see "Dead code").

ViewModels are deliberately **not** part of this: a ViewModel survives rotation, which the
activity's fields don't, so moving state there changes behaviour (see "Later").

## Upgrade-safety rules (followed by every step)

Nothing the system or stored data refers to by name changes:

- Every class named in `AndroidManifest.xml` keeps its exact name and package (`.MoshpointApp`,
  `.MainActivity`, `.GigWakeReceiver`, `.ChatCheckReceiver`, `.FollowCheckReceiver`,
  `.MemoryReceiver`, `.CrewWidget`, `.MediaFileProvider`, `.ShareMomentActivity`,
  `.ShareInviteActivity`, `.service.VisibilityService`, `.service.VisibilityTile`,
  `.service.BootReceiver`, `.watch.WatchLinkService`, `.watch.WatchFinderService`,
  `.watch.WatchSyncStarter`). Their logic may move; the classes stay.
- `res/xml` (widget info, file provider paths, data extraction rules), PendingIntent and alarm
  targets, intent actions and `EXTRA_` keys (they stay in `MainActivity`'s companion), request
  codes, SharedPreferences file names and keys, files and folders on disk, anything
  serialised, and notification channel ids: unchanged (they are string literals, and no string
  literal changed). No class is stored by name (no `Serializable`/`Parcelable` of our own, no
  `javaClass.name` or `Class.forName`); WorkManager isn't used. The saved-instance key
  `photoFor` is unchanged.
- Screenshot tests keep their class names and packages (Paparazzi names files after them).

## How it was checked

- **Locally** (the app can't compile here: Google Maven is blocked), after every commit: a
  type-check of core, finder and the app (main and tests) with plain `kotlinc` and no Android
  jars. Android names don't resolve, so the check compares the errors about **our own**
  declarations (unresolved project symbols, visibility, wrong or missing arguments) with the
  same check on ccr; any new one is a mistake. A second, name-based check confirms every use of
  a project top-level name is visible where it's used (same package or imported), extension
  functions included. Extractions were also compared line by line (normalised for the new
  holder prefixes) with the code they came from.
- **CI** on the branch: debug and release builds of the app and the watch, all tests,
  translations, licences, the R8 debug-text check and every screenshot; then every screenshot
  in every language folder compared with ccr's `ui-screenshots`/`ui-screenshots-watch`, and the
  log of "Merged manifest and licence list, compared with the published main build".

## Results

- **Run 291** (edfc6cf: all feature packages and the MainActivity split): green, app and watch.
  Screenshots: 1,165 phone and 798 watch images, 21 language folders each, all byte-identical
  to ccr's sets (`ui-screenshots` for 43b4b1f, the code this branch started from). Manifest:
  "merged manifest: same as the published main build"; licences: "same as the published main
  build (126 libraries)"; no finder debug text in the release APK.
- **Final run** (the branch head): see the report sent with this branch; the same checks.

## Equivalence notes (one per non-trivial extraction)

- **Receivers to their own files:** the class bodies are byte-for-byte the same; only the file
  they sit in changed (same package, same name).
- **State holders (main/*State.kt):** each of MainActivity's 30 snapshot-state fields moved
  with its initial value to the holder for its area; the holders are created in MainActivity's
  constructor, before the launchers, and die with it: the same lifetime as the fields. Every
  function moved with its body unchanged except `this@MainActivity` → the activity and a field →
  its holder's field (checked: line for line the same after that substitution).
- **`mySecret`, `myCode`, `phoneSummary`:** were locals in onCreate captured by the UI; now
  `HomeState` fields assigned at the same three points in onCreate, before `setContent`.
- **MainLaunchers:** registers pickPhoto, takeSelfie, cameraForSelfie, then constructs
  MomentFlow (its six), then mediaPerms, scanQr, askPermissions: exactly the old field order, so
  every launcher keeps its registration position (Android routes a result to a recreated
  activity by it). FacebookLogin still registers in onCreate.
- **setContent → MainScreen and its pieces:** the same composables in the same drawing order.
  Every extracted function is `@NonRestartableComposable` (no restart scope, never skipped), so
  its state reads belong to the scope they were read in before, and it recomposes exactly when
  the inline code did. The early `return@MoshTheme` for the welcome is unchanged.
- **`FinderContent`'s `val engine = a.finder.engine`:** the engine is assigned once in onCreate
  and never again, so reading it once per composition is the same object every lambda saw.
- **onWindowFocusChanged:** `super` first, then the old body (now `InviteState
  .offerClipboardInvite`), as before.
- **FriendsScreen's grouped inputs:** plain (non-data) classes holding exactly the old
  parameters with the old defaults. A new instance on each draw always counts as changed, as
  the old fresh `toSet()` argument did, so FriendsScreen recomposes when it used to. The body
  differs only by the group prefix on each reference (checked line for line). Arguments are now
  evaluated group by group rather than in the old order; all are reads with no effect on each
  other (the only side effect, `Identity.signer` creating a crew's signing key on first use,
  happens once whichever read reaches it first, and `canRemoveCrewMates` is still read before
  `crewQrPayload`). The tests pass the same names and values (checked pair by pair).
- **Home files split:** whole declarations moved unchanged; private helpers moved with their
  only users (`ClosingEmoji` with `FaceTile`); `PanelTitle` became internal in its own commit.
- **Unused parameters removed:** every caller passed a plain variable or property read, so no
  argument expression with an effect was dropped.

## Dead code

Removed, each with no reference anywhere in the app (code, tests, resources, manifest; core,
finder and wear can't see app code):
- 24 unused imports (names that appear nowhere in the file's code; delegate/operator imports
  and imports a KDoc link uses were kept);
- `WatchLink.sendNow`, `PhoneFinderBridge.tracks`, `Friendship.hasAsked`,
  `RelayClient.wouldSend`, `FacebookLogin.logout` (no Log out button calls it; restore it from
  history if one is added), `Mosh.Red`/`Green`/`VisibleBg`/`VisibleLine`/`VisibleText`, and an
  unused local in FinderScreen;
- parameters never read: `CrewChat.tick(c)`, `PrivateMessages.takesPart(c, …)`,
  `Friendship.crewEntryFor(c, …)`, `VenueMaps.cleanUp(om, …)`, `InviteState.shareApp(code)` and
  `shareCode(code)`.

Resources: a reference scan of `res/` against main code, XML and the manifest found nothing
unused, so none were removed. Android lint's three UnusedResources warnings aren't in `res/`
(probably the build-generated Facebook values, which belong to the build files, out of scope).

## Where things moved (for the audits in docs/audit/, which cite ccr at 792cd68)

| Was | Now |
|---|---|
| `MainActivity.handleInvite`, `pasteInvite`, the clipboard offer in `onWindowFocusChanged`, `crewQr`, `withRelay`, `shareGroup`, `shareApp`, `shareCode`, `ensureCrew`; fields `showQr`, `showGroupQr`, `qrCrew`, `scanned`, `clipInvite`, `bumping` | `main/InviteState.kt` |
| `MainActivity.setVisibility`, `leaveCrew`, `nightEnded`, `shouldCalm`, `powerSaveReceiver`, `facebook`; fields `visibleToMates`, `onboarded`, `calmMotion`, `alwaysOn`, `myName`, `homeNow`, `planGig`, `recap`, `handover`, `handoverEndsNight` | `main/HomeState.kt` |
| `MainActivity.missingPermissions`, `fixPermissions`, `refreshSetupIssues`, `radioReceiver`, `permissions` (now `requested`); fields `missing`, `askBattery`, `setupIssues` | `main/PermissionsState.kt` |
| `engine`, `finding`, `beaconOn`, `pendingStop`, `torch`, `setBeacon`, `stopEngineSoon`, `nudge`, `shareRecording`, `handleFindCrew`/`FindMate`/`LightRequest` | `main/FinderState.kt` |
| `openMap`, `closeMap`, `mapFirstFix`, `venueViewFor`, `lookForCrewFromMap`, `mapFeed`, `showMap`, `mapVenue`, `mapEngine` | `main/MapState.kt` |
| `startRoll`, `findOnPhone`, `addFromPhone`, `saveToPhone`; `showStory`, `archiveGig`, `archiveItems`, `rollGig`, `rollFound`, `rollAdding` | `main/StoryState.kt` |
| `openChat`, `closeChat`, `openPrivateFrom`, `messageMate`, `canMessageMate`, `sharePlanCard`; `showChat` | `main/ChatState.kt` |
| `selfie`, `photoFor`, the photo picker / selfie callbacks | `main/CameraState.kt` |
| the six `registerForActivityResult` launchers (and where MomentFlow is created) | `main/MainLaunchers.kt` |
| the `setContent` body: dialogs over everything / the welcome / the home and finder switch | `main/MainScreen.kt`, `main/CrewDialogs.kt` |
| the FinderScreen block (incl. the debug panel) / the FriendsScreen block | `main/FinderContent.kt` / `main/HomeContent.kt` |
| plan a gig, bump, invite on the clipboard, the night recap | `main/NightDialogs.kt` |
| crew chat and private chat overlays (incl. the 8 s / 20 s polls while open) | `main/ChatOverlays.kt` |
| the Story and a past gig's Story | `main/StoryOverlays.kt` |
| the map overlay (incl. `near =` and the 15 s clock) | `main/MapOverlay.kt` |
| `MainActivity.onCreate`/`onResume`/`onStart`/`onStop`/`onDestroy`/`onNewIntent` | still `MainActivity.kt`, same statements in the same order |
| a loose file `X.kt` in `nz/waveformlabs/moshpoint/` | its feature folder (see "The structure"); the four receivers stay in the root package |
| `ui/X.kt` | `ui/home/`, `ui/finder/`, `ui/map/`, `ui/chat/`, `ui/moments/` or `ui/settings/` (see "The structure"); `HomeSections.kt`/`HomeKit.kt` sections in the files named there |

The feature design notes (PRIVATE_MESSAGES.md, IM_HERE.md, VENUE_MAP.md, WATCH.md,
HOME_REDESIGN.md and others) name files as they were when each feature was built; the files
kept their names, and this table says where they are now. ARCHITECTURE.md's table is updated.

## Found while moving, not changed (behaviour kept as it is)

- **A crash on a cold start from "Share → Moshpoint invite".** onCreate handles the shared
  invite before it creates the finder engine. A crew invite for tonight goes live
  (`setVisibility(true)` → `refreshSetupIssues()` → `engine.capabilities`), and the engine
  isn't there yet: `UninitializedPropertyAccessException`, unless Bluetooth permission is
  missing (then it asks instead). On ccr it's in `MainActivity.onCreate`; here it's the same
  order in the same place. For the reliability fixes (it sits next to release P0-5's invite
  handling).

## Later (deliberately not done here)

- **ViewModels** for the holders in `main/`: changes what survives rotation (the audit's
  reliability item 7 wants that), so it's a behaviour change and gets its own step and testing.
  The holders already group the state the way a ViewModel per area would.
- **Splitting the big logic objects** (`GroupSync` 905 lines, `VenueMaps` 734, `CrewChat` 707):
  each is one `object` with private state shared across the file, so a split needs visibility
  changes and real design, not moves; the brief limited splits to UI files.
- **Composables taking `MainActivity`:** the pieces in `main/` take the activity to reach the
  holders, as the inline code reached its fields. Passing holders or state instead is cleaner,
  but changes what each piece reads, so it belongs with the ViewModel step.
- Performance, battery, reliability and release changes: the audits own those (docs/audit/).
