# Venue map (free part): decisions

The free half of step 2 in [ROADMAP.md](ROADMAP.md) "Decided next (November 2026)": the venue
map on today's free map (MapLibre + OpenFreeMap). No Mapbox, no satellite.

Decisions were made without stopping to ask, as instructed. Each one is recorded here with the
reason, so it can be changed later. **Nothing here has run on a real phone yet**: this sandbox
cannot build the Android app (Google's download host is blocked), so the core logic is
unit-tested here, the app is compiled and screenshot-tested by CI, and the rest is in
[FIELD_TEST_PLAN.md](FIELD_TEST_PLAN.md).

## Status and next steps

**Paused on 11 November 2026, part-way through step 6.** Everything written is committed and
pushed. This section is the handover: what is done, what is only written, and what to do next.

| Step | State |
|---|---|
| 1. This document | done |
| 2. Core logic + unit tests (floor maths, at-the-gig rule, placement, map plan, floor record, advert pressure) | **done, green in CI.** `Floors.kt`, `FloorBox.kt`, `Venue.kt`, `VenueMapPlan.kt`, `Advert.kt` in `core`; 159 core tests |
| 3. App: automatic offline venue map, crew card line, "Save this area" removed; server `/v1/venue` | **done, builds in CI** (debug and release). `venue/VenueMaps.kt`, `VenueStyle.kt`, `VenueLookup.kt`, `ui/VenueUi.kt`; server `VenueLookup.kt` with 8 tests |
| 4. App: map opens on the venue at the gig; UWB mates placed around you | **done, builds in CI** (run 192, commit `74d00fd`). `MapScreen.kt`, `FriendMap.kt`, `LocatorEngine.uwbSpots`, `MainActivity.openMap` |
| 5. App: upstairs/downstairs tags (barometer, sharing, calibration) | **done, builds in CI** (same run). `venue/Floors.kt`; tags in the finder and on map pins |
| 6. Strings in 19 languages; app tests in their own classes | strings **done** (CI's translation check passes). Tests **written, not yet seen passing**: see below |
| 7. Field test section; privacy, architecture and roadmap notes | field test **drafted** (`FIELD_TEST_PLAN.md` section 5); the other notes **not started** |

Nothing has run on a real phone. The app can't be built where this was written (no Android
SDK), so the app code has only ever been compiled and tested by CI.

### What was in progress when it paused

Commit `7c86b6a` added two test files under `app/src/test/java/nz/waveformlabs/moshpoint/venue/`:

- `VenueLogicTest.kt` (6 tests: style rewriting, the pack style, font addresses, reading
  Nominatim's answer). These pass in a scratch JVM build with the real `org.json`, the same
  library version `app/build.gradle.kts` now adds for tests. Not yet seen passing in CI.
- `VenueSnapshotTest.kt` (screenshots). **Never compiled or run.** In every language:
  `venueCard` (home with the offline-map line), `venueLines` (the line's four states),
  `venueFinder` (crew radar and strip with floor tags). English only
  (`VenueMoreSnapshotTest`): `venueUpstairs`, `venueClose`, `venuePins`, `venueMapList`. The
  per-language classes are named `Lang_<xx>` in their own package, because CI's file naming
  looks for `_Lang_<xx>_`; the pictures land in `docs/screenshots` as `venueCard.png`,
  `de-venueCard.png` and so on.

CI run 195 was building that commit when work stopped.

### Next steps, in order

1. **Read the result of the newest CI run on this branch.** The screenshot step is allowed to
   fail without turning the run red (`continue-on-error`), so open the log of "Screenshots of
   every screen" and look for `=== failing screenshot tests ===`, or for `e: ` lines if the
   test file doesn't compile. Fix what it says. Likely trouble: a wrong parameter name in the
   `FriendsScreen` / `MapScreen` / `FinderScreen` calls in `VenueSnapshotTest.kt`.
2. **Look at the pictures** CI commits to `docs/screenshots` (`venue*.png`, and the `de-`,
   `ar-`, `ja-`, `en-rUS-` copies). Things to check, none seen yet: the tag on a face in the
   finder's strip (it sits 6 dp over the bottom of the face and may crowd the name under it,
   and "↓ Downstairs" is wider than the face); the tag on the big arrow and on radar bubbles;
   the pin faces in `venuePins`; long card lines in German, Polish and Thai.
3. **Finish the field test section** (`FIELD_TEST_PLAN.md`, section 5). Its button names
   were checked against the strings; the timings in 5e (half a minute for a tag, a minute
   over the relay) are reasoned from the code, not measured.
4. **Notes not started:** a venue-map paragraph in `ARCHITECTURE.md`; pressure, venue lookup
   and map downloads in `PRIVACY.md`; mark the free half of step 2 in `ROADMAP.md`.
5. **One design point found late, undecided.** The pressure in the Bluetooth advert is only
   refreshed when it has moved 0.06 hPa (half a metre) and at most every 15 seconds, so the
   value a mate hears can be up to half a metre stale. That puts up to 0.5 m of error into a
   calibration, where the maths assumes 0.4 m (UWB). Options: refresh at 0.03 hPa, or refresh
   whenever a mate is within calibrating distance. Refreshing restarts Bluetooth advertising
   (`BleBroadcaster.update` stops and starts it), so don't do it much more often than now
   without a phone to test on.
6. Optional: a floors summary in `tools/analyze_recording.py` (rows `baro`, `baro_mate`,
   `baro_cal` are already in the recordings; the tool ignores them today).
7. **Done means** (from the task): CI green; the unit tests above; the screenshot tests; the
   field test. Then report: what was built, that nothing has run on a phone, the 18 MB
   finding and the pack built instead, and that venue lookups without our own relay server
   go straight to Nominatim and stop for good if it ever turns the app away.

### How to work on it

- Branch `claude/venue-map-offline-placement-l4e5pc`, started from `ccr-5839ed7c-1q0ztj` at
  `88d7877`. Push only there. No pull request unless the owner asks.
- CI (`.github/workflows/android.yml`) runs on every push, takes about 12 minutes, and commits
  changed screenshots back to the branch, so `git pull --rebase` before each push.
- `core` and `server` tests run anywhere with Gradle and a JDK. The `app` module needs the
  Android SDK.
- Another session is building Bluetooth messaging: new strings only in `strings_venue.xml`,
  and keep out of `GroupSync.kt`, `CrowdRelay.kt` and `LocationBox.kt` (untouched so far).

## What you see

- **Crew card:** one line. "Saving the venue map… 40%", then "Venue map saved for offline ✓".
  If the venue's position isn't known: "Venue map saves when you get there". With no
  connection: "Venue map: waiting for a connection". Nothing to tap.
- **Map at the gig:** opens zoomed into the venue. Mates still at home are off screen; **All**
  shows everyone, as before.
- **Mates:** a mate found by UWB sits exactly where they are around you. A mate sharing GPS is a
  pin, as today. A mate you only hear by Bluetooth has no pin (we don't know which way they
  are); the list under the map still says how close they are.
- **Floors:** "↑ Upstairs" or "↓ Downstairs" on a mate's face, on the map and in the finder,
  when both phones have a pressure sensor and we're sure. Otherwise no tag.
- **Gone:** the "Save this area for no signal" button.

## 1. Offline download

### The problem found: the standard download is 18 MB, not 2–3 MB

MapLibre's built-in "offline region" was what "Save this area" used. Measured for this work:

- It downloads **every font file the map style names**: 130 files for each of the style's fonts.
  The Bright style names three fonts, so 390 files, **17.9 MB**. Night and Dark name one:
  5.8 MB. (Sizes from the font set the styles use, OpenMapTiles fonts v2.0. Most of it is rare
  Chinese characters.) The map tiles themselves, 2 km around a venue, are only about 2–4 MB.
- It cannot be told to skip fonts. And skipping them is not safe: if one label on a map tile
  needs a font file the phone doesn't have, MapLibre draws **nothing at all** for that tile
  until the file arrives (checked in MapLibre's source, version 11.5.2, the one the app ships).
- OpenFreeMap's map address always points at this week's data. A phone that saved last week's
  tiles and then looked at the map once online would ask for this week's tiles at the gig, and
  find none.

### Decision: a small pack we build ourselves

For each venue the app saves a **venue pack**:

| Part | What | Size |
|---|---|---|
| Map tiles | A 4 km × 4 km square centred on the venue (2 km each way), zoom 12 to 14. Zoom 14 is the most detailed data there is; the map draws closer views from it. About 15–35 tiles. | 2–4 MB (estimate) |
| Icons | The map's icon sheet. | 0.2 MB |
| Fonts, basic | One font, the 8 files covering Latin, Greek and Cyrillic letters and punctuation. | 0.34 MB, first venue only |
| Fonts, other alphabets | The same font's 48 files for Arabic, Hebrew, Indian scripts, Thai and the rest. Chinese, Japanese and Korean characters are drawn by the phone and need no download. | 1.8 MB, first venue only |
| Map looks | Bright, Night and Dark, each rewritten to use this pack. | 0.15 MB |

- **First venue: about 3–5 MB. Later venues: about 2–4 MB.** These are estimates; the tile part
  must be measured on a real venue (field test).
- Basic fonts download straight away on any connection. Other alphabets download straight away
  only if the phone's language needs them; otherwise they wait for Wi-Fi (or any connection
  that isn't metered). Until they arrive, street names in those alphabets are simply not drawn.
- The pack is **pinned to one week's map data**, so it can't go stale against itself.
- MapLibre still does the tile download and keeps the files (one "offline region" per venue),
  so pausing, resuming and storage are its tested code, not ours. We fetch the small files
  (looks, fonts) ourselves and hand them to MapLibre's store.

How it works, for whoever maintains it:

1. Fetch OpenFreeMap's tile index (`https://tiles.openfreemap.org/planet`) and note this week's
   tile address, e.g. `.../planet/20261104_001001_pt/{z}/{x}/{y}.pbf`.
2. Fetch the three styles. In each: replace the tile index with that fixed address, point fonts
   at a private address (`https://offline.moshpoint.invalid/fonts/{fontstack}/{range}.pbf`;
   `.invalid` can never exist on the internet), and make every label use one font, named `mp`.
   Save the three results as files; the map loads them with `Style.Builder().fromJson()`.
3. Fetch the font files and store them under the private address with
   `OfflineManager.putResourceWithUrl()`: real bytes for the files we have, a valid empty file
   for the other ranges. Every one of the 130 ranges then answers from the phone, so no tile
   can be held up waiting for a font. A copy of the real files is kept in the app's own folder
   so later venues need no font download.
4. Store a tiny style under `https://offline.moshpoint.invalid/pack/<version>.json` (tiles,
   icons, fonts, one label layer) and create a MapLibre offline region from it. MapLibre finds
   the style and fonts already stored, downloads the tiles and icons, and pins all of it so
   its cache clean-up never removes it.
5. The region reports complete: the pack is saved.

Our own map layers (faces, pins, labels) use font `mp` while a pack style is showing; with the
normal online style they use "Noto Sans Regular" as before. This matters: a label asking for a
font the pack doesn't have would make the faces vanish.

### When the saved pack is used

- **At the gig** (see section 3), and **whenever the phone has no internet**: the map uses the
  pack for the look you've chosen. Everything comes from the phone, so it works with full bars
  and no data, the usual gig failure.
- Otherwise the map is the normal online one, exactly as today.
- Differences while the pack is showing: one font weight (no bold or italic names), and
  alphabets not yet downloaded are missing from labels.

### When it downloads

- **When a crew is created or joined**, for the main crew and every "Up next" crew, straight
  away, on any connection. Not for people following from home (they aren't going).
- **Resume:** the work is a list of steps that can each be repeated safely. It restarts from the
  first unfinished step when the app opens, when a crew changes, when the connection comes back,
  when you go live, and on the gig-day wake-up. MapLibre continues a half-done tile download
  where it stopped.
- It runs while the app is open or you're live (the existing foreground service). There is no
  separate background downloader: at 3 MB it normally finishes while the QR code is still on
  screen, and adding Android's WorkManager library for this wasn't worth the risk untested.

### Where the venue is

1. **The crew already has it** (gig search, or it came in the invite). Used as is.
2. **Typed in by hand:** when you tap "Start crew", the app looks the venue name up once (up to
   4 seconds, the button says "Finding the venue…"). If found, the position goes into the crew,
   so the invite carries it and nobody else needs to look it up. Followers get "at the venue"
   for typed gigs as a side effect.
3. **Not found, or no venue typed:** "download around you when you arrive". Because there is no
   venue position to arrive at, arriving is defined by you staying put (section 3). Until then
   the crew card says "Venue map saves when you get there".

A joined crew that has a venue name but no position (made by an older app, or the maker's
lookup failed) does its own single lookup, kept on that phone only.

### Venue lookup and Nominatim's usage policy

The lookup uses OpenStreetMap's Nominatim. Its policy, and how each point is met:

| Policy | What the app does |
|---|---|
| At most 1 request per second, in total for the whole app | One request per hand-typed gig per phone, and normally one per gig for the whole crew. Requests are queued at least 1.1 s apart. With our own relay server, the server queues everyone's requests at 1 per second. |
| Identify the app (no stock User-Agent) | `Moshpoint/<version> (nz.waveformlabs.moshpoint)` from the app; `Moshpoint-relay` plus a contact from the server. |
| No auto-complete | Looked up once, on "Start crew". Never while typing. |
| Cache results | Kept 30 days (not-found: 1 day), on the phone and on the server. |
| Show attribution | OpenStreetMap is credited on the map and in Acknowledgements; Nominatim is added there. |
| "Apps must be able to switch service at our request without a software update" | With our own relay server the app asks **the server** (`GET /v1/venue`), and the server asks Nominatim, so the service is changed on the server (`MOSHPOINT_GEOCODER`). Without our own server the app asks Nominatim directly and **stops for good the first time Nominatim answers 403 or 429**, which is how they turn an app away. |

That last row is the weak point: before a public launch the relay server must be deployed
(already on the roadmap), so all lookups go through it. Direct lookups are fine for test builds
with a handful of users.

To help pick the right "The Forum", the request includes a rough box around the phone (whole
degrees, about 200 km) as a preference, not a limit.

A wrong match is caught by the arrival rule: if at gig time you're settled more than 1.5 km from
every saved area, the app saves the area around you as well.

### Limits, storage, clean-up

- A pack is refused if its square would need more than 120 tiles (it never should: this guards
  against a bad position).
- At most 6 venue packs are kept; the gig furthest in the past goes first.
- Each crew: the venue's area plus at most 2 "around you" areas.
- **Deleted 3 days after the gig ends** (the crew's end time). If you leave or cancel the crew
  sooner, 3 days after that. Deleting removes our files and un-pins MapLibre's; MapLibre then
  drops them as its ordinary 50 MB map cache fills.
- Areas saved with the old "Save this area" button (18 MB each, and there was never a way to
  remove them) are deleted 7 days after this version first runs.
- OpenFreeMap's public server has no limit on requests and needs no key; it asks for
  attribution, which MapLibre shows on the map. A pack is roughly 40 small requests plus the
  tiles, about what browsing the same area would cause. Each phone downloads its own copy.

## 2. Mates on the map

- **UWB:** your phone measures distance and angle to the mate. Their spot = your GPS position +
  that distance along (compass heading + UWB angle). If your GPS is 10 m out, you and every
  UWB mate shift together by the same 10 m: who is where around you stays right. A compass
  error turns the whole group around you; it can't swap two mates. Used when the reading is
  under 10 seconds old and has an angle (UWB only gives one for mates in front of the phone).
- When we know a mate is on another floor, the distance along the ground is worked out from the
  straight-line distance and the height difference.
- **GPS:** a pin, as today, from the last location they shared. Mates standing together still
  merge into one bubble; UWB-placed mates never merge (their spots are exact).
- **Bluetooth only, or UWB with no angle:** no pin. Their row in the list shows the distance
  band ("Close · under 10 m"), which is all we honestly know.
- UWB only runs while someone is looking. So while the map is open at the gig the finder
  engine runs for the whole crew, and stops 20 seconds after the map closes (the existing rule).
  A mate's phone can answer one looking phone at a time (existing limit).

## 3. "At the gig"

**You are at the gig when all of these are true:**

1. The crew is the main crew, it is awake (from 3 hours before the start; "tonight" crews
   straight away) and has not ended. You are not following from home.
2. The venue's position is known (from the crew, or looked up).
3. Your phone's last position is under 5 minutes old and within **400 m** of the venue, allowing
   for how unsure the position is (up to 150 m of allowance). 400 m is the distance the app
   already uses for "at the venue" on crew tiles.

It is about **you**, not the crew: if you're at home and your mates are at the gig, the map
behaves as it always has. So the map can only go to the venue when you are standing at it, on
gig day. It is checked when the map opens; an open map never jumps by itself.

**The venue view:** fits the venue, you, and mates within 400 m of the venue, never wider than
zoom 16 (about 1 km across) and never closer than zoom 18.5.

Crews with no venue position (a quick "tonight" crew, or a typed venue that wasn't found) have
no venue to open on, so the map fits everyone as today.

**Arriving, when the venue position isn't known** (only used to decide where to save a map):

- First area: as soon as the crew is awake and the phone has a position good to 100 m and isn't
  moving at vehicle speed. For a "tonight" crew that is normally the moment it's created.
- Another area: when you've stayed within 150 m for 5 minutes, more than 1.5 km from every
  area already saved for this crew.

## 4. Upstairs / downstairs

### Sharing pressure without touching the location box

The location box (`LocationBox`, 30 bytes) and the crowd-relay packet are **not changed**.
Pressure travels two other ways:

1. **In the Bluetooth advert every live phone already sends.** Two extra bytes after the UWB
   block, scrambled with the same key stream as the UWB block, marked by flag bit `0x80`. The
   advert grows from at most 21 to at most 23 bytes; the limit is 27. Older apps ignore the
   flag and the extra bytes (checked against their decoder). Works with no signal, and it is
   exactly what calibration needs: both pressures at the same moment, while the phones are side
   by side.
2. **A separate small record on our own relay server**, the "floor box": 19 bytes, sealed like a
   location, posted under its own rotating mailbox id (a different id from the location's, so
   older apps never see it). For mates out of Bluetooth range. **Only with our own relay
   server.** On the free public relay (ntfy.sh) every phone is limited to about 200 messages a
   day and 8 requests a minute, which location sharing already uses; floors must never cost a
   location update. There, floors work over Bluetooth only.

Formats:

- Pressure value: whole number of 2-pascal steps (`round(Pa / 2)`, 16 bits, up to 1310 hPa).
  One step is about 17 cm of height.
- Advert: `[flags][id:16][UWB block: 0, 2 or 4][pressure:2]`, pressure present when
  `flags & 0x80`.
- Floor box: `[time:4][AES-128-GCM(pressure:2, reserved:1) + tag:12]`. Mailbox id = first 16
  bytes of `HMAC-SHA256(secret, "moshpoint-floor-id" ‖ epoch)`. Key = first 16 bytes of
  `HMAC-SHA256(secret, "moshpoint-floor-box")`. Nonce = id[0..8] ‖ time. The id is bound in.
- Not sent in ghost mode over the relay (ghost mode means nothing goes on the map). The advert
  keeps it, as ghost mode keeps Bluetooth finding.
- Later, once the crowd-relay work lands, the floor box can ride it as its own packet type.

### The maths

Height of a mate above you, from two pressures taken at the same time:

`height = 8581 m × ln(my pressure ÷ their pressure)` (about 12 Pa, 0.12 hPa, per metre).

What goes wrong, and what is done about it:

| Problem | Size | Answer |
|---|---|---|
| Each phone's sensor reads a bit differently | Up to ±1–2 hPa between two phones: 8–16 m, several floors | **Calibrate per pair of phones.** While two mates are together, the difference between their readings is their sensors' offset. It is remembered and subtracted afterwards. |
| Weather | Up to 1–3 hPa an hour | Affects both phones at the same place equally. Readings are compared **at the same moment** (within 90 seconds; your own pressure history is used to line them up), so it cancels. |
| The offset drifts (phones warm up) | About 1 m over a night, unknown until measured | The calibration **ages**: uncertainty starts at 0.4 m (UWB) or 0.7 m (Bluetooth) and grows 0.3 m an hour. |
| Doors, air conditioning, squeezing the phone | Spikes of 0.1–1 hPa for a few seconds | Median of the last 8 seconds of readings. |
| Tiers, ramps, mezzanines | 0.5–2 m | Below the floor threshold: no tag. |

**Together** (the moment to calibrate): UWB says 2 m or less for 4 seconds, or Bluetooth's
distance estimate says 1.5 m or less for 20 seconds. During that time the difference between
the two phones' readings must stay within 0.12 hPa (1 m): two people on a staircase don't count.
The offset is the median difference. A Bluetooth calibration cannot replace a UWB one less than
an hour old if they disagree by more than 2 m (Bluetooth through a thin floor could fool it).
An offset over 4 hPa is treated as a broken sensor and ignored.

**What counts as a floor:** a tag appears when the height difference is at least
`max(2.5 m, 1.5 m + 2 × uncertainty)` and goes away below 60% of that, so it doesn't flicker.

| Since calibrating (UWB) | Uncertainty | Tag needs |
|---|---|---|
| Just now | 0.4 m | 2.5 m |
| 2 hours | 0.7 m | 2.9 m |
| 4 hours | 1.3 m | 4.0 m |
| 6 hours | 1.8 m | 5.2 m |

So a normal 3 m storey shows for about two hours after you were last together, a tall venue
balcony for about four, and after six and a half hours (uncertainty over 2 m) there is no tag
until you meet again. Meeting again recalibrates by itself. All of these numbers are first
guesses to be tuned from field recordings.

No tag when: either phone has no pressure sensor, you've never been together tonight, their
reading is over 2 minutes old or yours over 1 minute, or the calibration has aged out.

The tag is relative to **you**: if you're upstairs and they're on the ground floor, it says
"↓ Downstairs". Each phone works out its own tags; nothing about floors is sent, only pressure.

The pressure sensor reads once a second, batched so it doesn't wake the phone, while you're
live or the app is open. The advert is updated when your pressure has moved by 0.5 m, at most
every 15 seconds.

## 5. Other apps, older versions, shared files

- **Older app versions keep working.** They ignore the advert's extra flag and bytes, never
  look in the floor mailbox, and read a venue position from an invite as they always have.
- `LocationBox.kt`, `CrowdRelay.kt` (the relay packet): **not touched.** `GroupSync.kt`: not
  touched; crew changes are noticed by watching its public state.
- Small edits to shared files, each a line or two: `Advert.kt` (pressure bytes, flag `0x80`,
  the top bit, so a new flag from the Bluetooth-messaging work would naturally take `0x20`),
  `VisibilityService.kt` (start/stop the pressure sensor; pressure in the advert),
  `LocatorEngine.kt` (hand UWB and Bluetooth readings to the floor logic; expose UWB readings
  to the map), `MainActivity.kt` (wiring).
- New text only in `strings_venue.xml`. The old "Save this area" strings are removed from
  `strings_find.xml` in every language, in a commit of their own.
- New screenshot tests are in their own class, `VenueSnapshotTest`.
- The relay server gains one endpoint, `GET /v1/venue?q=`, used only for the venue lookup.

## 6. Privacy

- Pressure is not a location. In the advert it is scrambled per 5-minute code like the UWB
  block; someone nearby with a radio could see that an unnamed phone's pressure changed, not
  whose phone it is. In the floor box it is sealed for your mates only.
- A typed venue name, and a rough box around you, go to OpenStreetMap's Nominatim (or to our
  relay server, which asks Nominatim). No name, no id.
- Map downloads go from the phone straight to OpenFreeMap, as map viewing already does.

## 7. Not done, on purpose

- Mapbox, satellite, Moshpoint+, on-demand delivery: the paid half, later.
- A venue marker on the map: the venue's position can be 100 m off; the map already shows the
  building.
- Floors for a phone with no sensor by borrowing a nearby mate's reading.
- Floor numbers ("2nd floor"): we only know up or down relative to you.
- Downloading with the app closed and not live.
