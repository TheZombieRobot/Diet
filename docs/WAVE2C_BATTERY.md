# Wave 2c: battery

The battery items of [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) that don't need the server:
performance P0-3 (the finder's screen), P1-9 (GPS cadence), the server-independent part of
P0-2 (network hygiene), and the small radio wins from the P2 list. Details and estimates:
[audit/performance.md](audit/performance.md). Branch: `battery-wip` (local worktree, from
`ccr-5839ed7c-1q0ztj` at 1bafc2a). Not in scope: the batch, cursor and token endpoints,
rendering performance, Report/Block, billing and the server.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done:** item 1 (the finder's screen).
- **Next:** item 2 (GPS cadence), then 3 (network hygiene), then 4 (small radio wins), in that
  order. Each is one commit with its core rule and tests; this note and
  docs/FIELD_TEST_PLAN.md section 4h are updated with each.
- **Checked locally:** core tests (`gradle -q --offline :core:test` in a scratch build that
  includes only `:core`, as docs/WATCH.md describes). The app can't be built here (Google Maven
  is blocked): only CI compiles it. Nothing has been pushed and no CI has run on this branch.
- **Screens:** none changed, no strings added.

## The rules kept

- Finding a mate never gets worse when it matters: when someone is looking for you, or you're
  looking for them, the fast paths stay fast.
- Every rule is in `core`, with tests; the Android side only feeds it.

## 1. The finder's screen (performance P0-3)

**Before:** the finder held the screen on for as long as it was open (`view.keepScreenOn` in
FinderScreen). In a pocket that kept everything the finder runs going: the unfiltered fast
Bluetooth scan, the 50 Hz compass, the 20 Hz tick, GPS every 3 s, relay polls every 4 s, Wi-Fi
RTT and the animations, about 8–13% of the battery an hour.

**Now** (core `FinderAwake`, app `main/FinderScreenOn.kt`): the screen is held on

- for **90 s after the last touch** (any touch or key anywhere in the app: `MainActivity
  .onUserInteraction`; opening the finder counts as one, so does a notification that opens it);
- while a mate being found is **within 30 m** (any arrow with a distance under 30 m, with a
  direction or without), so it doesn't lock while you follow the arrow through the crowd, up to
  10 minutes after the last touch;
- **never in a pocket:** once the proximity sensor has read "near" for a second (read as Android
  reads it during calls: under 5 cm or the sensor's range). A thumb passing over it is shorter.

Then Android's own screen timeout applies. When the screen goes off the activity stops, and the
engine stops 20 s later, as it always did when leaving the finder (`FinderState.stopEngineSoon`).
Coming back (power button, unlock) lands on the finder still open (`finding` is unchanged) and
`onStart` starts the engine straight away; within the 20 s it never stopped. The arbiter keeps
its fixes across a stop, so arrows that are still fresh show at once. The rule is checked once a
second, only while the activity is started; the proximity sensor is registered only then too.

Trade-offs:
- **The screen may lock mid-search** if you hold the phone without touching it for 90 s and
  nobody is within 30 m (the audit's accepted cost). A tap keeps it on; the system dims it first.
- **On the table next to a mate** the screen stays on for up to 10 minutes after the last touch
  (then sleeps), rather than all night. Following someone 25 m away for over 10 minutes without
  touching the phone means it may dim then; a tap brings it back.
- **After the 90 s, the phone's own timeout** is added on top on most phones (Android keeps the
  screen on for its timeout after an app lets go), so "about 90 s" is 90 s plus that.
- **Light me up** keeps the screen on by itself (its own window flag), as before; it has its own
  time limit (item 4).
- **Phones without a proximity sensor** (some tablets) only have the touch and distance rules.
- **The watch:** when the phone's finder stops, the watch's find switches to the pocket finder,
  as it already did when the finder was left (`PhoneFinderBridge` checks every time).

Tests: `FinderAwakeTest` (90 s, the 30 m hold and its 10-minute cap, the pocket, the nearest
distance of the arrows, proximity readings).
