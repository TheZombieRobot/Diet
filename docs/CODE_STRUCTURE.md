# App code structure (the tidy-up)

How the `app` module's code is laid out, why, and how it got there. The tidy-up is **moves and
extractions only, with no behaviour change**: same logic, timings, thresholds, strings, colours,
layout and order of events. Branch: `claude/tidy-app-structure` (from `ccr-5839ed7c-1q0ztj`).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done:** the plan (this file). Step 1, feature packages: the four manifest receivers have
  their own files in the root package; the other 39 loose files are in `crew/`, `chat/`,
  `privatemsg/`, `moments/`, `gigs/`, `safety/`, `profile/`, `friends/`, `map/`, `setup/`,
  `sharing/` and `debug/` (one `git mv` commit and one package/imports commit each).
- **In progress:** step 2, the thin MainActivity.
- **Next step:** CI on the moves (the first push without `[skip ci]`), then step 2.
- **Local check (the app can't build in the container):** `docs/CODE_STRUCTURE.md` → "How each
  step is checked".

## Where things were (measured on ccr at 792cd68)

- `MainActivity.kt`: 1,647 lines; 30 `mutableStateOf` screen-state fields, 6 activity-result
  launchers (plus 6 in `MomentFlow`, 1 in `FacebookLogin`), 41 functions; it wires every screen
  by hand. `FriendsScreen` takes 76 parameters.
- 45 files (8,300 lines) loose in `nz.waveformlabs.moshpoint`: crew sync, chat, private
  messages, photos, safety, gig archive, Facebook login and more; 37 of them `object`s.
- `ui/` is 31 files and 9,700 lines; `HomeSections.kt` and `HomeKit.kt` are about 1,050 lines each.

## Target structure

```
nz/waveformlabs/moshpoint/
  (root)       Only the classes Android knows by name (AndroidManifest.xml). They never move:
               MoshpointApp (+ Txt), MainActivity, ShareInviteActivity, ShareMomentActivity,
               CrewWidget, MediaFileProvider, GigWakeReceiver, ChatCheckReceiver,
               FollowCheckReceiver, MemoryReceiver
  main/        MainActivity's helpers: one state holder per area, the activity-result
               launchers, and the composables that lay the screens out
  crew/        GroupSync, Crews, CrewRekey, CrewStatus, CrewNotifications, Bump, FollowCheck
  chat/        CrewChat, ChatSync, OfflineMessages (the courier's phone side, chat and private)
  privatemsg/  PrivateMessages
  moments/     Moments, MomentFlow, ShareQuality
  gigs/        GigArchive, GigSearch, GigWake, Memories, NightStats
  safety/      Safety, EmergencyNumbers, GhostMode, TorchStrobe ("Light me up")
  profile/     Identity, PhotoStore, AvatarSync, FacebookLogin
  friends/     Friend + FriendsRepository (Friends.kt), Friendship
  map/         Spots, LocationBook, HerePins
  setup/       SetupChecks, FinderSetup, NetState
  sharing/     Sharing, PlanCardImage
  debug/       DebugStatus, FieldRecorder
  locate/ service/ venue/ watch/   unchanged (already packages; several hold manifest classes)
  ui/          the shared kit: Theme, Neon, Buttons, Avatar, DefaultAvatars, Format, Qr
  ui/home/     FriendsScreen and the home's pieces (HomeKit, HomeSections, split by section),
               CrewRadar, BumpUi, PlanGig
  ui/finder/   FinderScreen, FinderStates, FinderArrows, DebugPanel, OfflineDebug
  ui/map/      MapScreen, FriendMap, VenueUi, HereUi
  ui/chat/     CrewChatUi, PrivateChatUi
  ui/moments/  StoryScreen, MomentsUi, CaptureScreen, CameraRollUi
  ui/settings/ SettingsScreen, Acknowledgements, OnboardingScreen
```

Why feature packages: today a change to, say, crew chat means finding `CrewChat.kt`,
`ChatSync.kt`, `OfflineMessages.kt` and `CrewChatUi.kt` among 76 files in two folders. Grouped by
feature, each area reads as a unit, and the root package says exactly what the system can start.

## The order of the work, and why

1. **Feature packages** (pure moves). Each package is one `git mv` commit (100% renames, the
   `package` line untouched: Kotlin doesn't require folders to match packages, so every commit
   still builds), then one commit that only changes `package` lines and imports. Manifest
   classes that share a file with logic that moves (`GigWakeReceiver` in `GigWake.kt`, etc.)
   are first extracted to their own file in the root package. First because every later step
   then edits code in its final place, and moves are the easiest to check.
2. **A thin MainActivity** (extractions). State holders, plain classes owned by the activity
   (created with it, gone with it: the same lifetime as today's fields), one per area: home,
   finder, map, story, chat, camera/moments, invites/QR, permissions. The launchers move to one
   helper, **registered in exactly today's order** (Android routes a result back to a recreated
   activity by registration order). The `setContent` body moves to composables in `main/`,
   declared `inline` so their code runs in the same recomposition scope as today (identical
   recomposition, so nothing that is redrawn today stops being redrawn). Target: about 300 lines.
3. **FriendsScreen's 76 parameters** become a few immutable state classes and action holders
   (extraction), so call sites read clearly. Defaults stay exactly as today.
4. **Big UI files**: `HomeSections.kt` and `HomeKit.kt` split by section (pure moves of whole
   declarations between files); then any other UI file over about 600 lines with a clean seam.
5. **ui/<feature> packages** (pure moves, as in step 1).
6. **Dead code**: only what is provably unused (no reference anywhere, including tests and
   resources' users), one commit per kind.

ViewModels are deliberately **not** part of this: a ViewModel survives rotation, which today's
activity fields don't, so moving state there changes behaviour. It's the natural next step after
this one, done on its own (see "Later").

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
  serialised, and notification channel ids: unchanged (they are string literals, and the
  string literals don't change). No class is stored by name (no `Serializable`/`Parcelable` of
  our own, no `javaClass.name` or `Class.forName`); WorkManager isn't used.
- Screenshot tests keep their class names and packages (Paparazzi names files after them).

## How each step is checked

- **Locally** (the app can't compile here: Google Maven is blocked): a type-check of core,
  finder and the app with plain `kotlinc` and no Android jars. Android names don't resolve, so
  the check compares the errors that mention **our own** declarations (unresolved project
  symbols, visibility, wrong or missing arguments) with the same check on ccr; any new one is a
  mistake. A second, name-based script checks that every use of a project top-level name in a
  file is visible there (same package or imported), which also covers extension functions.
- **CI** on this branch: debug and release builds of the app and the watch, all tests,
  translations, licences, and every screenshot. Then every screenshot, in every language
  folder, compared pixel by pixel with ccr's (`ui-screenshots`), and the merged manifest and
  licence list compared with the published main build (report-only step in the workflow).

## Equivalence notes (one line per non-trivial extraction)

_Filled in as each extraction lands._

## Later (deliberately not done here)

- **ViewModels** for the state holders in `main/`: changes what survives rotation, so it's a
  behaviour change and gets its own step and testing.
- Performance, battery, reliability and release changes: separate audits own those and come
  after this.
