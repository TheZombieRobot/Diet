# Roadmap

## Milestone 0: skeleton (this commit)
- [x] Project structure: `core` (pure Kotlin) + `app` (Android, Compose)
- [x] Method arbiter, spin-to-scan, BLE ranging, arrow style, rotating IDs, with unit tests
- [x] Finder screen: no-signal, per-friend arrows fading red → friend colour, distance, Scan
- [x] Friends list + gig group (in memory) and temporary code pairing
- [x] Background visibility service with rotating BLE advert, always-on setting, boot restore
- [ ] **First build in Android Studio + two-phone test** (not yet compiled: the SDK was unavailable where it was written)

## Milestone 1: works on two phones in a field
- [x] Save friends between sessions (app-private file); gig group expires after one night
- [ ] Encrypt saved secrets with an Android Keystore key
- [x] Missing-permission banner with reasons; battery-optimisation prompt when going visible
- [x] UWB ranging (`androidx.core.uwb`), set up through BLE adverts. Written, **not yet tested on phones**
- [x] Share-your-code button, remove friend, "End night" for the gig group
- [x] Wi-Fi Aware RTT distance (written, untested)
- [x] GitHub Actions: core + server tests and a debug APK on every push
- [x] Friend photos at arrow tips (set per friend; syncing needs accounts)
- [ ] Tune RSSI + spin-scan constants outdoors (field recorder + `tools/analyze_recording.py` are ready)
- [x] Debug mode: live tech status, method on/off/solo, switch log, field recorder, simulated friends
- [x] Visual design (Claude design canvas) and app restyled to it: theme, bundled fonts, finder + friends screens
- [x] Quick Settings tile; Stop button on the visibility notification; adaptive launcher icon

## Milestone 2: works at a gig
- [x] Relay server: encrypted location mailbox (`server/`, tested)
- [x] GPS + compass arrow with magnetic declination (written, untested)
- [x] Crowd relay: BLE extended adverts, sealed boxes, multi-hop (written, untested)
- [ ] Deploy the relay server (`fly deploy`, see README) and set the `MOSHPOINT_SERVER` repo variable
- [x] Add friends by QR code (show mine / scan theirs), name suggested from the QR
- [x] One-QR gig groups: members introduce themselves over BT5 adverts (and the server); no accounts needed
- [ ] Accounts / usernames; syncing photos
- [x] Battery: slow advert unless a friend is looking; finder scans fast only while open
- [ ] Battery: measure a full night; duty-cycle the listen scan with the screen off
- [ ] Real-crowd testing session; Samsung/Xiaomi background-kill testing

## Milestone 3: launch
- [ ] Crowd network (Find My-style), privacy review
- [ ] Register a Bluetooth SIG 16-bit UUID
- [ ] Trademark check for "Moshpoint" (IPONZ first)
- [ ] Play Store listing, privacy policy, data safety form

## Decided next (November 2026)

Agreed with the owner; build in this order. Where this differs from [PRODUCT.md](PRODUCT.md)
(e.g. the venue map), this section wins.

### 1. Messages without signal (Bluetooth backup): about 3–5 days
- Crew chat, quick pings ("On my way", "All good", "Need help") and pins send as normal; the
  app picks the route. No separate Bluetooth mode.
- Routes: the internet first. With no signal, straight to crew phones in Bluetooth range
  (Google Nearby Connections), hopping through other crew phones; the first phone back on
  signal uploads it for everyone else. Duplicates dropped.
- Pings and pins are tiny, so they also ride the crowd relay through any Moshpoint phone.
- Each message shows how it went: **Sent** / **Sent nearby** / **Waiting for signal**.
- Text only. Listens only while you're live. End-to-end encrypted and signed with the crew keys.
- Not doing: venue-wide chat hopping through strangers' phones (unreliable, battery).

### 2. Venue map: two map systems (about 4–6 days, +2–3 for the second map, +1–2 for on-demand delivery)
- **Free, everyone:** today's free street map (MapLibre + OpenFreeMap / OpenStreetMap). Costs
  nothing at any number of users.
- **Moshpoint+:** satellite venue view from Mapbox. Mapbox bills per monthly user of its map,
  so only subscribers count: the first 25,000 free, then about $4 per 1,000 a month
  (third-party figures; confirm at signup). The Mapbox part is an on-demand module
  (Play Feature Delivery), so the free app doesn't grow.
- Not Google Maps: its terms don't allow offline downloads, so it would go blank when the
  venue's data dies.
- At a gig, Map opens zoomed into the venue, whether one mate is there or the whole crew.
  No extra buttons.
- Mates on the map: UWB mates placed exactly around you; Bluetooth-only mates by distance;
  GPS mates as pins. Precision comes from UWB/GPS, not from the map.
- Upstairs/downstairs: compare phones' pressure sensors, tuned automatically while mates are
  together; an "↑ Upstairs" tag on their face. Phones without the sensor just get no tag.
- **Automatic offline download** when anyone creates or joins the crew (the venue's location
  is already in the crew and its invite link):
  - Street map: 2 km around the venue (~2–3 MB).
  - Satellite (Moshpoint+): 500 m around the venue (~10 MB); 1 km for festival sites (~40 MB).
    Sizes are estimates; measure on a real venue.
  - When: gig today or tomorrow → any connection. Days away → street map now; satellite on
    Wi-Fi, else mobile data on the morning of the gig. Roaming or Data Saver → street map now;
    satellite on Wi-Fi, or "Download now (10 MB)" on the crew card.
  - Street map first, satellite second; resumes if interrupted; the crew card says "Venue map
    saved for offline ✓"; deleted a few days after the gig. Replaces "Save this area".
  - Gigs typed in by hand: look the venue up by name; if not found, download around you on
    arrival.
  - Each phone downloads its own copy (map terms don't allow sharing them between phones).
- Needs: a Mapbox account and access token.
- **Status: the free half is built, not yet tried on real phones.** Decisions, tests and
  what's left: [VENUE_MAP.md](VENUE_MAP.md). Two changes from the plan above. The saved street
  map is a small pack the app builds itself (about 3–5 MB): MapLibre's own offline download
  turned out to be 18 MB a venue, nearly all fonts. And a mate heard only by Bluetooth gets no
  pin, because there's no direction to draw; the list under the map says how close they are.
  Mapbox, satellite and Moshpoint+ are not started.

### 3. "I'm here" pin: about 1–2 days
- Long-press your exact spot → "I'm here". Your face moves there (with the floor) on the crew's
  maps and radars, replacing your rough GPS dot.
- Clears itself when you walk away or after about 20 minutes.
- Travels over the internet, Bluetooth to crew nearby, and the crowd relay. Meet-up pins get
  the same Bluetooth routes.

### 4. Private messages: about 2–3 days
- Tap a mate → "Message Sam". Internet normally; Bluetooth when nearby with no signal.

### Small items
- UWB places go to the mate you're focused on first, then the nearest.

### Moshpoint+ (paid)
- Satellite venue map, offline.
- Watch app: arrow on the wrist, buzzes for warmer/colder, watch-face and tile info, wrist pings.
- One purchase covers phone and watch. Never paywall safety: "Need help" (phone or wrist) is free.

### Later
- **Before launch:** move the finder engine out of the gig code (the watch and any spin-off
  need it).
- **Watch app (Wear OS):** a `wear` module in this repo (same app ID and signing key), after
  launch and the field test. Write a spec first; build the base in one long session with the
  most capable coding model, then iterate. Test on a used Galaxy Watch4–6 (has a compass);
  Pixel Watch 3/4 only for watch-side UWB / Channel Sounding experiments.
- **Bluetooth Channel Sounding** (Android 16 ranging API): precise distance on newer phones,
  after launch.
- **Construction-site version:** a separate brand on the same core, after launch.
- **Age rating 16+/17+.** Not for children; no kids or school version (law and safety).

## Product plan

Features beyond these milestones, the design audit, connectors and big ideas: see [PRODUCT.md](PRODUCT.md).
