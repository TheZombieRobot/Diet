# Performance, battery and size audit (ccr 792cd68, 15 Nov 2026), condensed from the auditor's report

mA and % are estimates (±50%) to confirm on a phone. Assumes the app's own relay server, as in PLAY_STORE.md.

## P0
1. Live never turns off. Ending or expiring a crew (GroupSync.loadCrews 148, GroupSync.clear 379, MainActivity.leaveCrew 370) never stops VisibilityService (START_STICKY), and onResume starts it on crew nights (MainActivity 550). After the gig the phone keeps going: GPS/network every 15 s (LocationUploader.start 52), two BLE adverts plus a scan, Wi-Fi Aware, and uploads every 3 min. That's ~25–35 mA, or 13–19% of the battery a day. Fix: stop Live when the main crew ends (unless the user went live outside a crew), and cap it at 12 h with a notice. [S · yes]
2. The modem never idles. CrowdRelayRadio.handle (113) uploads every new relay packet at once, and each GPS fix makes a new packet (RelayCache.offer, CrowdRelay 65). ownBudget allows 600 requests/min (RelayClient 405). With a crew of 5 that's 10–20 PUTs/min per phone, on top of the 30 s sync (GroupSync 497) and the separate location and floor timers: a request every 3–5 s, so LTE stays active (~60–120 mA). Behind carrier NAT, many phones share the server's 2 PUT/s per IP (server Main 42), and a 429 also pauses chat and lookups. Lookups never back off on a network without internet (NetState 51, RelayBudget 156). Fix: upload each rotating id at most every ~2 min; one batched request per 60 s sync (needs a server batch endpoint); require VALIDATED networks and back off after repeated failures. [M · positions up to a minute later]
3. The finder keeps the screen on forever (FinderScreen 195). In a pocket that means the unfiltered fast scan (LocatorEngine 417), 50 Hz compass, 20 Hz tick, GPS every 3 s, relay polls every 4 s, Wi-Fi RTT and animations: ~350–600 mA (8–13%/h), plus pocket taps. Fix: keep the screen on only for ~90 s after a touch or while a mate is under 30 m, and release on the proximity sensor; onStop then stops the engine. [S · the screen may lock mid-search]

## P1
4. The venue map rebuilds every pin ~20 times a second. The map block reads engine.arrows (near =, MainActivity 1398), which change every 50 ms tick because the compass heading is in ArrowState (LocatorEngine 551). Each pass reruns FriendMap's AndroidView update (FriendMap 269): a new pinBitmap per mate (383), addImage and five setGeoJson calls. Fix: a `near` that changes only when a distance changes; cache pin bitmaps; skip unchanged GeoJSON. [S · no]
5. The finder recomposes every frame. Arrows and CrewRadar read animations during composition (FinderArrows 92, CrewRadar 132). MainActivity's finder block reruns at 20 Hz with two hash calls each time (803, 810). Per frame and arrow: two new Paths, three shaders and seven wide glow strokes (softGlow, Neon 243). GlowBackground paints three full-screen gradients a frame (Neon 104). No animated part has its own layer. Probably smooth on flagships, likely jank on low-end phones, ~100–300 mW while open. Fix: take the heading out of ArrowState and read it in the draw phase or graphicsLayer rotationZ; drawWithCache or a pre-rendered arrow; a layer per animated canvas; a static background. [M · no]
6. Heavy image and file work on the main thread. CaptureScreen.takePhoto (147–154) decodes and rotates full-resolution photos (12 MP: two 48 MB bitmaps, 200–400 ms freeze). Moments.refresh and add run on GroupSync's main-thread scope (530): decrypting a clip of up to 12 MB, two copies and a decode, 50–150 ms each and ~5× the clip size in memory. StoryScreen decodes the original in composition remember{} (336), up to ~50 MB. PhotoStore.init (36) decodes every saved face before the first screen, and old crews' faces are never deleted (clearGigGroup, Friends 186). Fix: capture off the main thread with a 2048 px ResolutionSelector; Dispatchers.IO for moments; produceState at ~2× screen size; lazy faces and orphan cleanup. [S each · no]
7. The Story decodes a whole gig at once. GigArchive.load (157) decodes every item through thumbnail() (272), keeping 2048 px camera-roll copies at 1024×768 (1.5 MB each). "Add from phone" preselects up to 200 photos (CameraRollUi 76): ~300 MB of bitmaps at every start that night or reopening, so likely killed on 3–4 GB phones. Fix: decode only visible items, at tile size, into a small cache. [M · no]
8. Sync downloads whole payloads every time. RelayClient.lookupHeld (134) has no cursor: each chat poll re-downloads up to 200 messages per daily mailbox, every 2 min while live (GroupSync 535) and ~16 s with chat open (MainActivity 1169), 10–30 MB/h for a busy crew. Moments.refresh (84) pulls every crew clip (up to 12 MB) over mobile data in the background. Fix: a `since` cursor; thumbnails in the background, full clips on tap or on Wi-Fi. [M · clips load on open]
9. GPS every 15 s for all of Live. LocationUploader.start (52) asks for GPS and network every 15 s but uploads only every 3 min while still (97). HerePins.watchOwn adds a 10 s request (225). Indoors GPS keeps hunting: ~15–30 mA. Fix: 60 s at balanced accuracy while still; 15 s GPS only during boost() (a mate is looking) or while walking. [M · your dot updates less often while you stand still]

## P2 (all S)
- The scan listens on 1M and Coded PHYs (BleHub 182) but nothing sends Coded: use PHY_LE_1M.
- The intro advert runs at 250 ms all night (GroupSync 862): drop to 1 s after 30 min.
- The visible advert is BALANCED at high power (Findable 74), not the "~1 s, low power" ARCHITECTURE.md describes.
- The relay advert re-sends identical data every second (CrowdRelayRadio 174).
- Wi-Fi Aware publishes for all of Live (Findable 95): start it on the first "looking" advert.
- Scan callbacks allocate per result (BleHub.dispatch 78, EphemeralId.matches 50, VisibilityService 72): build one id→mate map per rotation.
- Uploads disconnect() without reading the response (RelayClient 101), so connections aren't reused.
- ChatCheckReceiver has no timeout (ChatSync 245). Light me up has no time limit.

## Size
- MapLibre's native library is ~2/3 of the 29 MB debug APK (19.8 MB: arm64 11.4, armeabi-v7a 8.4), stored uncompressed (minSdk ≥ 23).
- Fonts 1.8 MB: five weights, not subset, duplicated in wear.
- The rest is code and resources.arsc: 20 app languages plus ~90 from libraries.
- R8 is already on in debug and release (release saves under 1 MB more). isShrinkResources is off.
- Wins: ship an AAB (each phone gets its own ABI, arm64 download ~9–11 MB est.); isShrinkResources plus localeFilters (0.5–1.5 MB); subset fonts (~1.1 MB); leave out the Facebook SDK when it isn't configured (0.5–1 MB); per-ABI APKs for testers.

## Battery estimate
Pocket, screen off, Live on, crew of 5 nearby, own relay, LTE at a busy venue, 4,500 mAh battery, 4 h:

| | Now | After fixes |
|---|---|---|
| Mobile data | 60–120 mA | 15–30 mA |
| GPS and network location | 15–30 mA | 4–8 mA |
| CPU wake-ups | 8–15 mA | 4–8 mA |
| Bluetooth and Wi-Fi Aware | 5–10 mA | 3–5 mA |
| Total | 90–175 mA, ~8–16% (2–4%/h) | 25–50 mA, ~2–4% |

Biggest wins: #2 batching (4–8% back per gig); #1 Live auto-off (13–19%/day after the gig); #9 GPS (1–2%); #3 the finder screen (avoids 8–13%/h in the worst case).

## Done well
One shared, budgeted, filtered low-power scan while visible; the finder engine stops 20 s after leaving; no wake locks or exact alarms; waiting crews stay silent; watch finds are leased and capped; batched pressure readings; RelayBudget counts only answered requests, backs off with jitter and skips while offline; Battery Saver freezes animations; picked photos decode off the main thread; the home faces strip is a keyed LazyRow; R8 on every build; x86 libraries excluded (~23 MB saved).

## Outside scope
GigSearch.viaServer uses RelayClient.serverUrl (GigSearch 42) instead of the build's server, so with no server set in the app, gig search silently returns nothing.
