# Wave 2a: safety and the Live state

Launch blockers 1–3 of [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and the reliability items that go
with them (reliability P0-1, P0-2, P0-4, P1-5 to P1-8, then P2; performance P0-1).
Branch: `claude/wave2-safety-k7m3p9` (from `ccr-5839ed7c-1q0ztj`).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done (code):** items 1–8 below, and P2 items 1–3 and part of 8 (see "P2").
- **Core tests:** `SafetyRulesTest` (28 tests) plus `CheckIns.nextCheckSec`; all core tests pass
  locally (scratch Gradle build that includes only `:core`, as docs/WATCH.md describes).
- **App tests:** `RadarLogicTest` (the radar crash); screenshot tests for every new UI state in
  `ScreensSnapshotTest` (so in all 21 language folders).
- **Translations:** `strings_safety.xml` in all 20 values folders; `crew_help_alerted`
  ("Crew alerted ✓", the misleading label) removed from every language.
- **CI:** see "CI runs" at the end.
- **Next:** if CI is red, fix the compile errors it lists (`grep '^e: ' build.log` step). Then the
  P2 items still open (below), in order. Before the final run, merge `origin/ccr-5839ed7c-1q0ztj`.
- **If ccr moves on:** the shared files touched here are small, local edits: `AndroidManifest.xml`
  (configChanges, one receiver, MY_PACKAGE_REPLACED), `GroupSync` (sendPing's result, check-in
  alarms, Live on crew change), `MainActivity` (onResume reconcile, BackgroundChecks at start),
  `HomeState.setVisibility`, `MainScreen` (one line: `AppNotices(a)`).

## What changed, item by item

### 1. Need help says what the outbox knows (reliability P0-2)
- **Before:** "Crew alerted ✓" the moment it was tapped, even with the alert only queued (not
  live, no signal: nothing carries it). Texting and calling failed silently with no app for them.
- **Now** (`ui/chat/HelpUi.kt`, moved out of CrewChatUi): the alert row shows **Sending…**,
  **Not sent yet** (with the reason, and **Go live** when not being live is why), **Sent nearby**,
  **Sent to your crew**, or **Not sent** (the outbox refused it or gave up; tap to try again).
  While nobody has it, it points at texting and calling ("both work without mobile data"). It's
  a polite live region, so TalkBack reads each change.
- **The model is the watch's** (`PingOutcome`), mapped from the outbox state by core
  `HelpRules.outcomeOf`, forward only (`HelpRules.next` = the outbox's own `OutboxState.mayMove`).
- `GroupSync.sendPing` returns a `PingResult` (id + `PingOutcome`: NO_CREW, FAILED when
  `OfflineMessages.post` refuses, else where it starts). Safety pings (Need help, Check in, Home
  safe) are *followed* in `OfflineMessages` (`follow`/`followedState`, Compose state, by message
  id) from before they're posted, so no word from the courier is missed and it doesn't depend
  on which crew's chat is in memory. `GroupSync.lastHelp` is the last Need help sent.
- Opening Need help again within 30 min shows that alert's state (no second alert by accident);
  a tap only sends when nobody has it (`HelpRules.maySend`).
- `Safety.callEmergency` returns false when nothing can dial; both failures show a message under
  their button that stays (not a toast).
- WatchPings is unchanged (it already reported honestly).

### 2. Overdue check-in on time, with every app closed (reliability P0-4)
- `crew/CheckInAlarm.kt` + `CheckInAlarmReceiver` (root package, in the manifest, not exported).
- **A mate's check-in:** one `setAndAllowWhileIdle(RTC_WAKEUP)` alarm (no exact-alarm permission)
  for core `CheckIns.nextCheckSec` (just after the earliest deadline + grace, or a late check-in's
  settle time), set again whenever the check-in state changes (`saveCheckIns`) and at every load.
  When it fires: load the crew, `pollPingsNow` (the chat mailbox keeps Home safe for days) with a
  20 s cap, then `checkOverdue`, then plan the next alarm.
- `checkOverdue` is also called from `ChatSync.runInBackground` (the hourly check).
- The alert goes on the high-importance **crew_help** channel (`CrewNotifications.overdue`), so
  muting chat doesn't mute it.
- **Your own check-in:** a reminder ("Home yet?") 5 min before your deadline (core
  `CheckInReminder`; halfway for very short ones), on the help channel, with **I'm home safe** on
  the notification. Tapping it sends Home safe, waits up to 12 s for the outbox, and if it isn't
  out yet the reminder says "Not sent yet…". Your own check-in now survives a restart (prefs
  `myCheckIn`/`myCheckInSent`; `myCheckIn` is in `longKeys` so Up next keeps its type).

### 3. The Live state (reliability P0-1, performance P0-1)
- `service/LiveControl.kt`; rules in core `LiveRules` / `LiveSession`.
- **Two facts kept apart:** `VisibilityPrefs.isVisible` = Live is meant to be on;
  `VisibilityService.isRunning` (+ `runningState` for Compose) = it really runs.
- **Foreground:** `MainActivity.onResume` calls `LiveControl.reconcile`: meant on but not running
  → start it again; if it can't start → off in the app + notice "You're no longer live".
- **Updates:** `BootReceiver` handles `MY_PACKAGE_REPLACED` (manifest): background checks re-armed
  and Live restored if it was on (the update isn't you switching it off). After a **reboot** Live
  comes back only with "Stay live after a restart"; otherwise it's marked stopped (not your
  choice, so a crew tonight still puts you live when the app opens).
- **Refused in the background** (Android 12+): the service no longer gives up quietly:
  `LiveControl.couldNotStart` posts "You're no longer live" (tap opens the app, which starts it
  again); on screen it's an in-app notice and the switch goes off.
- **Off by itself** (checked by the service every minute, and when the main crew changes):
  - the crew it was switched on for has ended (expired, ended, left, back asleep) and no other
    crew is on now → off, quietly (the crew's own "is over" notification says it);
  - switched on with no crew on → stays on (only the cap applies), but joins a crew that comes on
    while it's live (going live, then making the crew is the usual order);
  - two crews the same night (Switch) → follows the main crew;
  - after **12 hours**, whatever the crew → off + "Still at the gig?" (notification, then the
    in-app question **Go live** / **Not now** when opened). That crew doesn't go live by itself
    again (`VisibilityPrefs.cappedCrew`); a later crew does. "Stay live after a restart" doesn't
    change the cap: it's about restarts.
  - Going off by itself uses `markStopped` (never `user_hid`), so the next crew goes live as usual.
- **Tile:** shows `isRunning`, refreshed (`requestListeningState`) when the service starts or stops.
  Its start can't crash any more: if Android refuses, it opens the app.
- **Notification:** with Bluetooth off the title is "Bluetooth is off: mates can't find you up
  close" instead of "You're live"; refreshed when Bluetooth is toggled.
- **Never an intent that goes live:** every notice opens the app plainly; going live is a tap.
- WatchFind's "can locate in the background" check uses `isRunning`, not the flag.

### 4. Background checks (reliability P1-5)
- `crew/BackgroundChecks.rearm`: on boot, after an update, and at app start (MainActivity.onCreate):
  loads the crew (which sets GigWake's alarm and the check-in alarms), the hourly chat check, and
  the followers' check.
- Never pushed back: core `AlarmPlan.next` keeps a planned time (saved in prefs `alarms`); a lost
  one runs soon (2 min chat, 1 min followers).
- **Followers' 15-minute check:** a `setAndAllowWhileIdle(RTC_WAKEUP)` alarm, set again each time
  it runs (`FollowCheck.ranNow`). The chat check stays an inexact hourly alarm (now RTC).

### 5. Full storage (reliability P1-6)
- `safety/AppErrors`: `guard` for writes, `handler(name)` = a logging `CoroutineExceptionHandler`,
  `failed` (logs; on ENOSPC tells you once via `Notices.storageFull`).
- Guarded: `FriendsRepository.save`, `Moments.unpackClip` (a failed clip write is deleted, the
  thumbnail still shows), `PhotoStore.save` (the photo still shows), `GigArchive.keep` failures
  reported. `OfflineMessages.save` no longer hides failures: the courier stays dirty, the write is
  retried every 30 s (not every tick), and a full disk is reported.
- Every long-lived scope has the handler: GroupSync, OfflineMessages, ChatSync, CrewChat,
  CrewRekey, PrivateMessages, HerePins, VenueMaps, Floors, AvatarSync, Friendship, WatchPings,
  WatchSync, WatchFind, FieldRecorder, CheckInAlarm, the two receivers' scopes, the live service's
  own scope, and the finder module's CrowdRelayRadio (a plain log there).
- **"Storage full" once:** core `StorageNotice` (once, again only a day later). On screen: an
  in-app notice; in the background: a notification on the new "Live and storage notices" channel.

### 6. Recreation no longer closes the finder (reliability P1-7)
- `android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|density|uiMode|fontScale|keyboard|keyboardHidden|navigation"`
  on MainActivity. Compose redraws for all of them.
- **Locale decision: not included.** A language change (rare: Settings, or the per-app language)
  still recreates the activity. Reason: strings computed outside Compose and kept (for example
  `home.phoneSummary`, made once in onCreate, or the live notification's crew line) would
  otherwise stay in the old language. `Txt` itself reads resources on every call and keeps no
  strings, so it's correct either way; but recreating is the only way to be sure nothing anywhere
  is stale, and a language change mid-find is very unlikely. `layoutDirection` follows locale, so
  it's left out too.
- **MomentFlow's clip:** the path of a clip being recorded is saved (prefs `moments/pending_clip`)
  and read back if Android closed the app while the camera app had it.

### 7. CrewRadar (reliability P1-8)
- `clampOrCentre` replaces the four `coerceIn` calls: the middle when the range is empty (a radar
  smaller than its label). Same result as before whenever there's room.

### 8. Remote crash and memory risks
- `Moments.unpackClip`: the size check no longer adds (`n > data.size - 8`), so a crafted size
  can't overflow past it and crash every crew phone.
- `PhotoStore.setShared`: mates' photos are decoded with `inSampleSize` (at most 2048 px on the
  long side, no bigger than needed for 256 px).

### P2 (in the order given)
1. **Done:** CrowdRelayRadio catches `IllegalStateException` (Bluetooth going off mid-advert)
   and starts a new set later; the tile's start can't throw.
2. **Done:** ChatCheckReceiver's work has a 45 s limit.
3. **Done:** `GigArchive.keep` writes the photo whole (tmp + rename) and indexes a kept photo
   whose line is missing, so a crash in between no longer leaves it out of the Story.
4. Open: Courier.restore and PrivateBook.restore should migrate instead of dropping everything
   when SAVE_VERSION changes.
5. Open: FriendRecord.parse drops crew mates added more than 18 h ago.
6. Open: a forward clock jump makes loadCrews end the crew.
7. Open: LocationBook accepts timestamps from the future.
8. Open: nothing cleans up gigs/, cache/clips or expired chat files.

## New UI (screens changed on purpose)
All new; no existing screen should change by a pixel.
- `helpBeforeAlert`, `helpSending`, `helpNotSentYet`, `helpSentNearby`, `helpSent`, `helpNotSent`,
  `helpWaitReasons`, `smallPhoneLargeFontHelpNotSentYet`: the Need help dialog's contents.
- `noticeNoLongerLive`, `noticeStillAtTheGig`, `noticeStorageFull`,
  `smallPhoneLargeFontNoticeNoLongerLive`: the app's own notices.
- Not drawable in tests: the notifications (live with Bluetooth off, "You're no longer live",
  "Still at the gig?", "Home yet?", storage full, overdue on the help channel).

## Field tests added
docs/FIELD_TEST_PLAN.md, section **4f**: Need help with no signal; an overdue check-in with the
app closed (and the reminder's I'm home safe); Live after an update, a force-stop and with
Bluetooth off; Doze (adb force-idle, followers' check); Live switching itself off (End night,
12 h by moving the clock); nothing closes the finder (dark mode, font, split screen, the clip).

## CI runs
- Run 301 (19c4289): the first compile check, before the translations.
