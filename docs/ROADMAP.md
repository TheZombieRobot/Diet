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
