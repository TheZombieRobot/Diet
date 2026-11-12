# Moshpoint architecture

## The one rule

The user taps a friend and sees an arrow. They never choose a method. Every locating
method runs at once, and a single arbiter decides what to draw.

```
 UWB ─────────┐
 Wi-Fi Aware ─┤
 BLE RSSI ────┤   Fix(friend, method,     ┌──────────────┐   ArrowState   ┌─────────────┐
 Spin scan ───┼──► bearing?, distance?, ──►│ MethodArbiter│──────────────►│ FinderScreen│
 GPS/server ──┤   confidence, time)       └──────────────┘  per friend    └─────────────┘
 Crowd relay ─┘                                  ▲
                                         compass heading
```

## core (pure Kotlin, unit-tested)

| File | Job |
|---|---|
| `Model.kt` | `Method` (with trust weight + how long a fix stays fresh), `Fix`, `ArrowState` (`NoSignal` / `DistanceOnly` / `Pointing`). |
| `MethodArbiter.kt` | Drops stale fixes. Ignores GPS/crowd *directions* once a close-range method says the friend is under 20 m (GPS error is bigger than the gap there), so the user gets distance + a Scan prompt rather than a wrong arrow. Takes direction from the best fix that has a bearing and distance from the best fix that has a distance, so a GPS arrow can still show a precise Wi-Fi Aware distance. Hysteresis stops flicking between methods. Flags low-confidence arrows as `unsure`, which brings up the Scan prompt. |
| `SpinScan.kt` | Spin to scan. Collects (compass heading, RSSI) while the user turns, then fits `rssi = a + b·cos(h − θ)` by least squares. θ is where the signal peaks, which is the friend's direction. It needs about 300° of the circle, and it reports "inconclusive" if the body shadow is too weak to read. |
| `RssiRanging.kt` | Log-distance path loss with smoothing. Turns BLE signal strength into a rough distance. The constants **must be tuned in a real crowd**. |
| `ArrowStyle.kt` | Arrow is red at 150 m or more and fades to the friend's colour by 10 m. Distance label text. |
| `Advert.kt` | The bytes in every Bluetooth advert: `[flags][rotating id][encrypted UWB block][encrypted pressure, optional]`. The UWB block is how two phones set up UWB with no connection or server (below). Also `UwbSessionKeys`, which both phones use to derive the same UWB session id and key on their own. |
| `FriendRecord.kt` | Saved-friend format and share codes. Gig group members expire after 18 h. |
| `LocationBox.kt` | Seals a GPS fix (lat, lon, time, accuracy) with AES-GCM so only the owner's friends can open it. 29 bytes. Bound to the rotating id. |
| `CrowdRelay.kt` | `RelayPacket` (47-byte relay advert) and `RelayCache` (newest per id, hop limit, age limit, fair airtime). |
| `EphemeralId.kt` | Rotating 16-byte broadcast code = `HMAC-SHA256(secret, 5-min epoch)`. Friends who hold the secret recognise it; nobody else can link it over time. |
| `HeadingFilter.kt` | Compass smoothing on the unit circle: heavy for jitter, light during a real turn. |
| `FriendSimulator.kt` | Debug: a pretend friend producing realistic readings from every method (incl. body shadow for spin-scan). |
| `RecordLine.kt` | Debug: CSV format for field recordings (`tools/analyze_recording.py` reads it). |
| `QrPayload.kt` | What's in a Moshpoint QR code. |
| `Geo.kt` | Distance and bearing between GPS points. Absolute bearing → arrow angle using the compass. |

## app (Android)

| File | Job |
|---|---|
| `locate/LocatorEngine.kt` | Owns the arbiter, compass and providers; exposes `arrows` and spin-scan progress to the UI. New providers plug in by calling `arbiter.submit(fix)`. |
| `locate/BleRanger.kt` | Scans for Moshpoint adverts, matches the rotating code against friends, decodes the UWB block, and reports RSSI. |
| `locate/BleBroadcaster.kt` | One BLE advert; used by visibility and by the finder's "I'm looking" advert. |
| `locate/UwbFinder.kt` | UWB on the looking phone (controller). One multicast session to every friend. |
| `service/UwbResponder.kt` | UWB on the visible phone (controlee). Joins a looking friend's session from the background service. |
| `locate/GpsFinder.kt` | GPS mode: fetches friends' sealed boxes from the server and the crowd-relay cache, then works out bearing and distance. |
| `locate/RelayClient.kt` | HTTP client for the relay server. |
| `locate/CrowdRelayRadio.kt` | Extended-advert broadcast and scan for crowd relay. |
| `locate/WifiAware.kt` | Wi-Fi Aware publish/subscribe + RTT ranging. |
| `service/LocationUploader.kt` | While visible: seals our GPS for the crowd relay and the server. |
| `locate/Compass.kt` | Rotation-vector sensor → heading. |
| `locate/Capabilities.kt` | Detects BLE / UWB / Wi-Fi Aware / compass / GPS. Phones will exchange this so both sides use a method they share. |
| `service/VisibilityService.kt` | Foreground service (type `connectedDevice`) that keeps the BLE advert going with the app closed and swaps the code every rotation. On UWB phones it also listens for lookers and runs `UwbResponder`. |
| `service/BootReceiver.kt` | Turns visibility back on after a reboot, only if the user chose "always on". |
| `ui/FinderScreen.kt` | No-signal state, one arrow per friend with avatar and distance, Scan flow. |
| `ui/FriendsScreen.kt` | Friends list, gig group ("End night" clears it), visibility switches, share-your-code pairing, long-press to remove. |
| `Friends.kt` | `FriendsRepository`: saved to `friends.tsv` in app-private storage. |

## Methods: status and plan

| # | Method | Status | Notes |
|---|---|---|---|
| 1 | GPS + compass via server | **Written** | Visible phone seals its GPS (`LocationBox`) and posts it to the relay server under its rotating id. The looking phone fetches it, opens it, and points the arrow with the compass, corrected to true north. Needs a server URL at build time. |
| 2 | Crowd relay over BLE | **Written** | Sealed locations hop phone to phone using Bluetooth 5 extended adverts (47 bytes). Each hop keeps the newest copy per id, re-sends with one fewer hop (max 6), and uploads to the server if it has signal. |
| 3 | UWB | **Written** | `androidx.core.uwb`, set up over BLE adverts (see below). Only between two UWB phones. |
| 4 | Wi-Fi Aware RTT | **Written** | Visible phone publishes the `moshpoint` service with its rotating id; the looking phone subscribes and measures round-trip time about once a second. Distance only. |
| 5 | BLE RSSI | **Written** | Distance + warmer/colder. |
| 6 | Spin to scan | **Written** | Scan button. Maths tested; needs real-crowd tuning. |

"Written" means the code is in and compiles in CI. None of it has been tried on real phones yet.

## Relay server (`server/`)

A dumb mailbox. `PUT /v1/box/{rotating id}` stores a sealed record for 15 minutes;
`POST /v1/lookup` fetches several ids in one go. No accounts, no names, no plain
locations, and ids rotate every 5 minutes, so the server can't follow anyone.
In-memory, single instance: fine for testing and a first launch. See the README for deploying.

## Messages without signal

Crew chat, quick pings and the meet-up pin still get through with no internet. The reasons
for each choice are in [BLUETOOTH_BACKUP.md](BLUETOOTH_BACKUP.md); this is the map of the code.

A message is sealed and signed once by its author. The same bytes then go by whichever
route works:

```
 author ─┬─► relay server (when there's signal) ─────────────► every crew phone
         ├─► Bluetooth adverts ─► crew phones in range ─► the first one back on signal uploads it
         └─► pings and pins only: any Moshpoint phone, 4 or 5 hops (the crowd relay)
```

| File | Job |
|---|---|
| `core/Courier.kt` | All the delivery logic: the outbox, messages carried for crew mates, duplicates (by message id), the states Waiting / Sent nearby / Sent, what to upload and when, what to put on air. Plain synchronous code with the clock passed in, so `CourierSimTest` steps several phones through a night. |
| `core/MessagePacket.kt` | Version 2 of the relay packet (a sealed message instead of a location; older phones drop it), fragments for long chat lines, `MessageRelay` (what a stranger's phone passes on, and its limits), `RelaySchedule` (whose turn it is in the relay's one advertising set). |
| `core/MessageRules.kt` | Small rules, each tested: `MessageClock` (order), `PinRule`, `PingPolicy` (staleness per kind; Need help is never dropped), `OutboxState` (states only move forward), `IntroForms`. |
| `core/CheckIns.kt` | Check in / Home safe by the sender's clock, whatever order they arrive in. |
| `core/RekeyPolicy.kt` | Who may move a crew to a new key, and which notice a phone follows. In a crew with an owner (`GigGroup.owned`: its key is a hash of the creator's key and a salt), only the owner, to a key bound to an owner. |
| `core/RelayBudget.kt` | The relay's daily and per-minute limits; only charged when the relay answers. |
| `core/GigGroup.kt` | `messageId` (one id for every copy of a message), the signed pin, the `mp2` envelope for receipts and summaries, the intro form with no constant prefix. |
| `app/OfflineMessages.kt` | Connects the courier to the phone: uploads through `RelayClient` to the mailbox valid at that moment, packets in and out through `CrowdRelayRadio`, arrivals and states into `CrewChat` and `GroupSync`. Also the test builds' route log. |
| `app/NetState.kt` | Whether the phone has a network at all, so nothing is tried (or charged) without one. |
| `app/locate/CrowdRelayRadio.kt` | The relay's advertising set now takes turns between locations and message packets. |
| `app/ui/OfflineDebug.kt` | Test builds: the "Force no internet" switch and the message route list in Settings. |

Rules to keep when changing any of it:

- One id per message (`GigGroup.messageId`), used everywhere. Never match on the sealed bytes.
- Carriers pass on the bytes as sealed. Only the author signs.
- The message radio is switched on in `VisibilityService.begin()` and off in `onDestroy()`,
  nowhere else. No new advertiser, scan or foreground service.
- `Courier` and `CrewChat` are main-thread only.
- A new crew key never arrives by Bluetooth, only from the relay.
- Logic that must not break goes in `core` with a test: only `core` and `server` tests can fail CI.

## UWB set-up (no connection, no server)

UWB needs both phones to agree on addresses, a channel, a session id and a key before
ranging. Moshpoint does that through the adverts it is already sending:

1. **Visible phone** (controlee) opens a UWB scope and puts its 2-byte UWB address in its advert.
2. **Looking phone** (controller) opens a scope and advertises "I'm looking" with its address,
   channel and preamble.
3. Both UWB blocks are encrypted with a key from the sender's secret, so only friends can read them.
4. Session id and key = HMAC(**looking phone's secret**, its UWB address). Every friend of the
   looker has that secret, so both sides work them out alone.
5. The looker adds each friend it hears to one multicast session; the visible phone joins on
   hearing the looker. Results give distance and azimuth, which turn into the arrow.

Known limits: a visible phone can be in one UWB session at a time (a second looker gets
Bluetooth/GPS until the first goes quiet for 20 s). UWB azimuth only covers the front of the
phone, so an arrow behind you may need a turn to settle. Check whether the phone allows UWB
ranging from a background service. The azimuth sign (`UwbFinder.AZIMUTH_SIGN`) needs checking
on real phones.

## Venue map (saved map, the venue view, upstairs/downstairs)

The decisions and the reasons are in [VENUE_MAP.md](VENUE_MAP.md). Where the code is:

| File | Job |
|---|---|
| core `VenueMapPlan.kt` | What a saved venue map is: the 2 km square, tile counts and limits, which font files to fetch, when it is deleted. `ArrivalPlanner`: when to save the area around you instead (no venue position). `VenueQuery`: a typed venue name, tidied for looking up. |
| core `Venue.kt` | `AtGig`: gig day and this phone at the venue, and what the venue view fits. `VenuePlacement`: where a mate goes on the map (measured by UWB: exactly; sharing GPS: a pin; otherwise nowhere). |
| core `Floors.kt` | Pressure to height, calibrating a pair of phones while they are side by side, a calibration that ages, what counts as a floor, and when to refresh the pressure in the advert. |
| core `FloorBox.kt` | The 19-byte sealed pressure record for mates out of Bluetooth range, under its own rotating mailbox id. `LocationBox` and the relay packet are unchanged. |
| app `venue/VenueMaps.kt` | Saves, uses and deletes venue maps. MapLibre's offline region downloads and keeps the tiles; the map looks and fonts are fetched here and put into MapLibre's store. Also publishes the crew card's line. |
| app `venue/VenueStyle.kt` | Rewrites OpenFreeMap's map styles to use only what a saved map holds (one week's tiles, one font). Text in, text out, so it is tested on the JVM. |
| app `venue/VenueLookup.kt` | Finds a typed venue once, through the relay server (`GET /v1/venue`) or, without one, OpenStreetMap's Nominatim within its usage policy. |
| app `venue/Floors.kt` | Reads the pressure sensor, puts our pressure in the advert (and, with our own relay, the floor box), feeds mates' readings to the core tracker, and holds the tags the screens show. |
| app `ui/VenueUi.kt` | The crew card's line and the floor tag. |
| server `VenueLookup.kt` | The lookup endpoint: at most one Nominatim request a second for everyone, cached for a month, switched or turned off with `MOSHPOINT_GEOCODER`. |

Three things worth knowing before changing any of it:

- **The saved map is not MapLibre's stock offline download.** That fetches every font file a
  style names (18 MB for the Bright look), and a map tile draws nothing until all of its fonts
  have answered. The app builds a small pack instead: tiles pinned to one week's data, one
  font, and an answer (real or empty) stored for every font range. While a saved map is
  showing, the app's own map labels must use that font too (`MapStyle.labelFont`).
- **Pressure never touches the location box or the relay packet.** It rides in two extra
  advert bytes (flag `0x80`) and, on our own relay only, in the separate floor box. Older
  versions ignore both.
- **Nothing here has run on a phone.** The app can't be built without the Android SDK; CI
  compiles it, runs the unit tests and draws the screenshots. The field test is section 3b
  of [FIELD_TEST_PLAN.md](FIELD_TEST_PLAN.md).

## "I'm here" pin

Long-press your spot on the map, **I'm here**: your face moves there on the crew's maps,
radars and finders, with the floor, until you walk away or 20 minutes pass. Decisions and
reasons: [IM_HERE.md](IM_HERE.md).

| File | Job |
|---|---|
| core `GigGroup.kt` | `Here`, `sealHere` / `openHere`: the signed message in the `mp2` envelope (type `ENV_HERE`), which older builds can't open or misread. |
| core `Here.kt` | `HereRule` (newest per sender, the future cap, the end judged by the sender's clock, the finder's fix), `HereBook` (each sender's standing pin, and the newest time seen from each so an old pin can't come back), `HereWatch` (walking away: GPS plus footsteps, or a change of floor). |
| core `Floors.kt` | `FloorTracker.pinned`: the pinned spot's floor from the pressure in the pin, with the weather's possible drift added as it ages. |
| core `Courier.kt` | Carries it as `KIND_HERE`: newest per sender, in the pin mailbox, re-posted while it lasts, crowd hops while it lasts, re-signed after a rekey. |
| core `Model.kt`, `MethodArbiter.kt`, `Venue.kt` | `Method.HERE_PIN` (beats GPS, never UWB up close; ignored for direction under 20 m like GPS), `VenuePlacement.spot` with the pin (UWB > pin > GPS). The watch gets it through `WristDirections.POSE_FREE` and watch code 8. |
| app `HerePins.kt` | The main crew's pins as Compose state; sets and clears ours through `OfflineMessages`; takes arrivals from `GroupSync.syncServer` and `OfflineMessages.deliver`; runs the walk-away watcher while ours stands. |
| app `locate/GpsFinder.kt` | Makes the `HERE_PIN` fixes, so the phone's finder and the watch's pocket finder both have them. |
| app `ui/MapScreen.kt`, `CrewRadar.kt`, `FinderScreen.kt`, `HereUi.kt` | The face on the spot with "pinned 3 min ago", your own pin with ✕, **I'm here** first in the drop-a-pin dialog, the radar pill, the finder chip. |

## Private messages

Tap a crew mate, **Message Sam**: a one-to-one chat only the two of you can read, by the relay
or, with no signal, by crew phones nearby. Decisions and reasons:
[PRIVATE_MESSAGES.md](PRIVATE_MESSAGES.md).

| File | Job |
|---|---|
| core `GigGroup.kt` | `sealPrivate` / `openPrivate` / `privateOuterOf`: an `mp2` envelope of type `ENV_PRIVATE` holding `[ver][id][ephemeral key][sealed part]`; the sealed part (sender key, signature, text) opens only with the recipient's crew signing key; always 352 bytes. `privateIdForDay`: the crew's private mailbox. |
| core `CrewKeys.kt` | `agree(…, label)`: the same ECDH, hashed with a label of its own. |
| core `Private.kt` | `PrivateRule` (ids, the 73-hour limit), `PrivateBook` (one thread per crew mate, replays dropped by id, messages held until their sender turns out to be a crew mate, unread, mute, forward-only states, saving). |
| core `Courier.kt` | Carries them as `KIND_PRIVATE` to `Box.PRIVATE`, like chat: crew phones only, no crowd hops, receipts, helpers never past 180 records; `Message.pm` is set only on the phone it's for; `Host.resealPrivate` after a rekey. |
| app `PrivateMessages.kt` | The books on the phone, sending, arrivals (from `ChatSync.pollAll` through the courier, and from `OfflineMessages.deliver`), who counts as a crew mate, notifications, mute, the thread on screen. |
| app `ui/PrivateChatUi.kt` | The thread (the crew chat's `ChatLine` bubbles) and `UnreadBadge`. Entry points: the crew mate's options (`FriendsScreen`) and the finder (`FinderScreen`). |

Rules to keep: a private message is sealed to its recipient, so not even its sender's courier can
open it (the app seals it again from its thread when needed); nothing that says who it's from or
for ever goes outside the sealed part; the recipient's phone carries and confirms it exactly like
any other crew phone.

## Watch app (Wear OS companion)

The phone does the finding; the watch does the pointing and the buzzing. The decisions and the
reasons are in [WATCH.md](WATCH.md). Where the code is:

| File | Job |
|---|---|
| `core/watch/WristArrow.kt` | The arrow maths: the watch's own compass plus the declination the phone sends gives true north; the tilt gate (arrow only within 40° of flat, held to 50°); how old a reading is without comparing clocks; when an arrow is only "rough". |
| `core/watch/WristDirections.kt` | Which methods' directions still mean anything with the phone in a pocket (GPS and crowd relay do; UWB, spin scan and walk don't unless the phone is held as a finder), then the ordinary `MethodArbiter` over what's left. |
| `core/watch/BuzzPlan.kt` | Which buzz to play and when: ticks that quicken as you close in, "facing them", "wrong way", "found", "lost the phone". Never more than one second of motor in ten. Also the two-second hold for Need help. |
| `core/watch/WatchProtocol.kt`, `WatchState.kt`, `FindLease.kt`, `WatchGate.kt`, `WristDistance.kt`, `WristText.kt` | The versioned messages between phone and watch, the crew status the watch shows, the lease that keeps the phone finding only while the watch asks, the one rule for what Moshpoint+ covers (never Need help), distances in the watch's units, how text may wrap on a small round screen. |
| `wear/` | The watch app (Compose for Wear OS): crew list, finder, Need help, the tile and the watch-face complication, the compass, the buzzer, the foreground service that holds a find. Same application id and signing key as the phone app. |
| `app/…/watch/WatchLinkService.kt` | The phone's listener on the Wear Data Layer. Play services starts it when the watch speaks, app open or not. |
| `app/…/watch/WatchFind.kt`, `PocketFinder.kt`, `WatchFinderService.kt`, `PhoneFinderBridge.kt` | Finding for the watch: a cut-down finder that works with the screen off and the phone in a pocket, inside a foreground service that stops when the watch stops asking. If the phone's own finder is running, the watch is fed from it through a read-only bridge instead. |
| `app/…/watch/WatchPings.kt` | Quick messages and Need help from the wrist, through `GroupSync.sendPing`. The watch is told what the outbox says: sent, sent nearby, or not sent yet. |
| `app/…/watch/WatchSync.kt`, `Entitlements.kt` | Pushes crew status and faces to the watch when they change (never polled), and the one Moshpoint+ check. |

- The watch gets only what its screen shows: names, colours, small faces, distances, a
  bearing. No keys and no coordinates leave the phone, and nothing the watch does adds an
  identifier to anything on the air.
- CI builds the watch app (debug and release), draws every watch screen on a small and a large
  round watch in every language, and publishes `moshpoint-watch.apk` next to the phone build.
  The field test is section 4c of [FIELD_TEST_PLAN.md](FIELD_TEST_PLAN.md).

## Privacy (built in from day one)

- Visibility is off by default, only the user turns it on, and a notification shows while it's on.
- The broadcast is a rotating HMAC code, never a fixed ID or name.
- **Crowd relay (now):** the visible phone seals its *own* GPS for its friends. Helpers only
  pass on ciphertext under a rotating id.
- **Crowd network (later, at scale):** a helper phone that hears a code attaches *its own*
  GPS and encrypts it to the owner's public key (X25519 + AES-GCM sealed box), keyed by the
  rotating code. This covers people whose phone has no GPS fix. Only the owner and their
  friends can open it. The helper can't link codes over time, so it never learns who it
  helped. This is the same model as Apple Find My / Tile.
- To do: per-group secrets so leaving a gig group revokes access; keys in the Android Keystore.

## Debug builds

Everything below is behind `BuildConfig.DEBUG` and stripped from release builds (CI checks):
`DebugStatus` (live status hub), `DebugPanel` (method on/off/solo, readings, tech status,
switch log), `FieldRecorder` (CSV recordings + ground-truth marks), simulated friends.

## Things to watch (from the brief)

- **Battery:** a visible phone advertises slowly (~1 s, low power) and listens with a
  low-power scan. When it hears a friend's "looking" advert it speeds up to fast (~100 ms)
  for 90 s. The finder only scans fast while its screen is open (stops 20 s after leaving).
  GPS shares every 15 s / 5 m. Still to try: duty-cycling the listen scan with the screen off.
- **Crowds:** bodies absorb 2.4 GHz. Retune `RssiRanging` and `SpinScan` thresholds with real gig data.
- **Background limits:** foreground service + `START_STICKY`. Test on Samsung/Xiaomi/Oppo,
  which kill background apps hard, and prompt users to exempt the app from battery optimisation.
- **BLE UUID:** `Ble.SERVICE_UUID` is a placeholder 16-bit UUID. Register one with the Bluetooth SIG before release.
