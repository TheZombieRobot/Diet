# Wave 2c: battery

The battery items of [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) that don't need the server:
performance P0-3 (the finder's screen), P1-9 (GPS cadence), the server-independent part of
P0-2 (network hygiene), and the small radio wins from the P2 list. Details and estimates:
[audit/performance.md](audit/performance.md). Branch: `battery-wip` (local worktree, from
`ccr-5839ed7c-1q0ztj` at 1bafc2a). Not in scope: the batch, cursor and token endpoints,
rendering performance, Report/Block, billing and the server.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done: the whole list.** Item 1 (the finder's screen), item 2 (GPS cadence), item 3 (network
  hygiene), item 4 (small radio wins: the intro advert, the crowd relay advert, the scan PHY,
  Wi-Fi Aware, Light me up's time limit). Field tests: docs/FIELD_TEST_PLAN.md section 4h.
- **Next:** CI on this branch (the owner pushes it; nothing has been pushed from here), then the
  field tests in 4h on phones, against build 312. Expected screenshot result: every existing
  screenshot byte-identical (no screen or string changed).
- **Review closely:** the parts that can't be checked here (see "Risks" at the end). Each is one commit with its core rule and tests; this note and
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

## 2. GPS cadence (performance P1-9)

**Before:** `LocationUploader` asked for GPS and network fixes every 15 s for all of Live, though
it uploads only every 3 minutes while you stand still, and `HerePins.watchOwn` added its own 10 s
request while our "I'm here" pin stood. Indoors GPS hunts the whole time: about 15–30 mA.

**Now** (core `GpsCadence`, app `service/LiveCadence.kt`, `MyLocation.updates(highAccuracy)`):
- **Still:** Wi-Fi and cell positioning only (Android's network provider: "balanced power"),
  every 60 s. A phone without a network provider uses GPS at 60 s.
- **GPS and network every 15 s** (as before), only:
  - during `boost()`: a mate's "looking" advert was heard (5 minutes, refreshed each time);
  - while walking: Android's **significant motion** sensor fired in the last 2 minutes (it wakes
    the phone when walking starts and costs next to nothing; it fires once, so it's armed again
    each time), or the pin watch's own motion detector says we're walking;
  - for the first 2 minutes of Live or of the pin watch (a precise fix to start from);
  - always, on a phone without a significant motion sensor (it can't tell walking from
    standing with the screen off): the old cadence, so nothing gets worse there.
- **One request for both users:** the uploader and the pin watch take their positions from
  `LiveCadence.positions`, at the same cadence, so Android serves them with one GPS session; the
  extra 10 s request is gone. A change of cadence drops the old request and asks again.
- **The "I'm here" pin still clears itself** when you walk away: walking turns GPS on (motion),
  and the watch gets its footsteps and precise fixes; standing, it gets a vague fix a minute,
  which never clears a pin (core `HereWatch` gives vague fixes the benefit of the doubt).
  `GpsCadenceTest.thePinStillClearsWhenWeWalkAwayOnTheSlowerFixes` runs 20 minutes at the bar,
  then a walk.

Unchanged: the finder's own GPS (every 3 s while it's open), the map's (5 s while open), the
upload rules (`LocationUploader.publish`), the last-gasp position at 5% battery.

Trade-offs:
- **Your dot updates less often, and less precisely, while you stand still** (the audit's
  accepted cost): a Wi-Fi/cell fix (often 20–100 m) once a minute instead of GPS every 15 s.
  Uploads while still were every 3 minutes anyway. A mate close enough to hear your phone over
  Bluetooth turns GPS back on by looking for you (the fast path); a mate far away who opens the
  finder sees your last upload, as before, but from a vaguer fix if you haven't moved.
- **Walking is noticed a few seconds late** (significant motion needs some steps), and GPS needs
  a few seconds for its first fix after that. Walking away from a pin clears it within about a
  minute (the test: about 30 s of walking after GPS is back).
- **Dancing may count as walking** on some phones: GPS on more often, never less.

## 3. Network hygiene (the server-independent part of performance P0-2)

The protocol and the endpoints are unchanged; batching and cursors need wave 1's endpoints and
are not part of this wave.

- **Online means validated** (`setup/NetState`): a network counts only when Android says it
  reaches the internet *and* has validated it (`NET_CAPABILITY_VALIDATED`). Before, any network
  that claimed the internet counted, so a venue Wi-Fi behind a sign-in page, or one with nothing
  behind it, was tried on every lookup and upload, each waiting out a 5–8 s timeout with the
  radio on. Now nothing is tried there (`RelayClient.offline`), the courier treats the phone as
  without signal (messages go by Bluetooth, as with no network at all), and the moment Android
  validates a network the queue is flushed (`networkBack`, unchanged).
- **Lookups back off with jitter** (core `RelayBudget`): reading mailboxes (chat, pings, crew
  sync, the finder's relay polls) used to retry at its own pace however often the relay didn't
  answer; only background uploads held off. Now, after the **second** no-answer in a row, lookups
  wait 5 s, then 10, 20, and 30 s at most, each stretched by up to a quarter so a crowd doesn't
  retry in step. Any answer from the relay (to anything) or the network coming back clears it.
  Uploads, messages and safety pings keep their own pace (unchanged).

Trade-offs:
- **A network Android can't validate is never tried**, even if the relay would have answered
  there (a firewall that blocks only Android's check, a sign-in page not yet accepted). Messages
  wait for Bluetooth or a validated network instead. VPNs count: Android marks them validated.
- **After a relay outage, lookups can lag up to about 37 s** behind the relay coming back (a
  30 s wait plus jitter) unless the phone's network changes. The finder, with GPS mates far away,
  may show their positions that much later after an outage; one timeout on patchy signal holds
  nothing up.

## 4. Small radio wins (performance P2)

- **The crew intro advert** (app `crew/GroupSync`, core `IntroRadio.slow`): every 250 ms
  (`INTERVAL_MEDIUM`) for the first 30 minutes of the intro radio running (Live, or the app open
  before it), while the crew meets; then every second (`INTERVAL_LOW`). The interval is fixed when
  an advertising set starts, so the set is stopped and started again once, at the half hour.
  Intros only introduce crew mates (finding uses the finder's own advert), and the relay carries
  them too. Trade-off: a mate who joins late is heard a little less quickly by phones scanning
  at low power (their own advert is still fast for their first half hour, and gossip and the relay
  fill gaps).
- **The crowd relay advert** (finder `CrowdRelayRadio`, core `RelayAdvertRefresh`): it used to set
  its advertising data every second even when the bytes were the same (our own location with
  nobody else's to pass on). Now the bytes already on air stay there (the controller keeps
  sending them); they're set again when they change (another packet's turn, a new location, a
  crew message) and every 30 s anyway as a keep-alive: setting them gives the advert a new data
  id, which chips that report a repeat only once report again. What goes on air, and when, is
  unchanged.
- **The scan listens on the 1M PHY only** (finder `BleHub`): it listened on 1M and Coded
  (`PHY_LE_ALL_SUPPORTED`), but every advert the app sends is on 1M (crowd relay, intros and bump
  set 1M for both PHYs; the finder's and Live's adverts are legacy, always 1M). Listening on
  Coded too split the scan's time between the two. If anything ever advertises on Coded, this
  has to go back.
- **Wi-Fi Aware** (finder `Findable`, core `AwarePublish`): the visible phone used to publish for
  all of Live. Now it publishes from the first "looking" advert it hears (a mate's finder looking
  for us, the same moment the advert goes fast and GPS turns on), and stops again after 5 minutes
  without one. Trade-off: the looking mate's Wi-Fi distance arrives a few seconds later (once our
  low-power listen has heard their finder, then a second or two to attach and publish); Bluetooth
  and UWB distances are unaffected. Stopping after 5 minutes is this wave's choice (the list asked
  only to start it late); with it, one look early in the night doesn't keep it on all night.
- **Light me up has a time limit** (app `main/FinderState.setBeacon`, core `BeaconLimit`): it
  goes off by itself 10 minutes after it was switched on or the screen was last touched,
  whichever is later. Easy to extend: any touch on the screen restarts the 10 minutes, and
  tapping **Light me up** again starts it again; the limit is one constant. It still goes off when
  you leave the finder or the app stops, as before. Going off by itself looks exactly like
  tapping it off (the strobe, the torch and the advert flag stop; brightness goes back).

Tests: `IntroRadioTest.fastForTheFirstHalfHourThenEverySecond`, `RadioRulesTest` (the relay
advert's keep-alive, Wi-Fi Aware's window, Light me up's limit).

## Expected battery effect

Estimates (±50%, to confirm with field test 4h), for the audit's case: pocket, screen off, Live
on, crew of 5 nearby, own relay, LTE at a busy venue, 4,500 mAh, 4 h.

| | Before (build 312) | After this wave |
|---|---|---|
| The finder left open in a pocket | 350–600 mA (8–13%/h) | the screen sleeps at about 90 s plus the phone's timeout, or within a second of going into a pocket; the engine stops 20 s later |
| GPS and network location (Live) | 15–30 mA | 4–8 mA standing; as before while walking or while a mate looks |
| Mobile data | 60–120 mA | lower on dead or sign-in Wi-Fi and during relay outages (no timeouts on every lookup); otherwise unchanged until the batch endpoint (not in this wave) |
| Bluetooth and Wi-Fi Aware | 5–10 mA | 3–6 mA (intro advert at 1 s after 30 min, no Coded scanning, no idle Wi-Fi Aware publishing, fewer advert updates) |

So, for 4 h in a pocket with Live on: roughly 1–2% of the battery back from GPS and 0.5–1% from
the radios; the large win is the finder no longer holding the screen on (8–13% an hour avoided).
The audit's biggest remaining item, batching the uploads (P0-2), needs the server's batch
endpoint and is not part of this wave.

## Risks (for the reviewer)

Nothing here could be compiled locally (only core); CI will be the first compile.
- **Could stop the app compiling:** `main/FinderScreenOn.kt` (`repeatOnLifecycle` from
  lifecycle-runtime 2.8.7, `rememberUpdatedState`), `service/LiveCadence.kt` (`channelFlow` with
  `collectLatest` and `send`, `TriggerEventListener.onTrigger(TriggerEvent?)`), the new
  `highAccuracy` parameter of the finder module's `MyLocation.updates`, `advertise(…, slow)` in
  GroupSync.
- **Could slow finding when it matters:**
  - the finder's screen sleeping while someone holds it without touching it, with no mate within
    30 m (by design; check field test 4h-A);
  - a mate far away (out of Bluetooth range) looking for you while you stand still sees a
    Wi-Fi/cell position up to a minute old, not GPS (by design, P1-9);
  - the Wi-Fi Aware distance starting a few seconds later for a looking mate;
  - lookups waiting up to about 37 s after a relay outage before trying again;
  - a network Android won't validate is never used for the relay.
- **Behaviour to watch on phones:** the significant motion sensor (does it fire when walking
  with the phone in a pocket on Samsung/Xiaomi?), and the proximity sensor's readings in a pocket.
