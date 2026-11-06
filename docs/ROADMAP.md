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
- [ ] Profile photos at arrow tips
- [ ] Tune RSSI + spin-scan constants outdoors

## Milestone 2: works at a gig
- [x] Relay server: encrypted location mailbox (`server/`, tested)
- [x] GPS + compass arrow with magnetic declination (written, untested)
- [x] Crowd relay: BLE extended adverts, sealed boxes, multi-hop (written, untested)
- [ ] Deploy the relay server and build the app with its URL
- [x] Add friends by QR code (show mine / scan theirs), name suggested from the QR
- [ ] Accounts / usernames; one-QR gig groups (needs the server)
- [ ] Battery work: adaptive advertising/scanning
- [ ] Real-crowd testing session; Samsung/Xiaomi background-kill testing

## Milestone 3: launch
- [ ] Crowd network (Find My-style), privacy review
- [ ] Register a Bluetooth SIG 16-bit UUID
- [ ] Trademark check for "Moshpoint" (IPONZ first)
- [ ] Play Store listing, privacy policy, data safety form
