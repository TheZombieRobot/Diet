# Roadmap

## Milestone 0: skeleton (this commit)
- [x] Project structure: `core` (pure Kotlin) + `app` (Android, Compose)
- [x] Method arbiter, spin-to-scan, BLE ranging, arrow style, rotating IDs, with unit tests
- [x] Finder screen: no-signal, per-friend arrows fading red → friend colour, distance, Scan
- [x] Friends list + gig group (in memory) and temporary code pairing
- [x] Background visibility service with rotating BLE advert, always-on setting, boot restore
- [ ] **First build in Android Studio + two-phone test** (not yet compiled: the SDK was unavailable where it was written)

## Milestone 1: works on two phones in a field
- [ ] Persist friends / secrets (DataStore + Keystore)
- [ ] Permission explainer screens; battery-optimisation exemption prompt
- [ ] UWB ranging (`androidx.core.uwb`) with BLE GATT handshake
- [ ] Wi-Fi Aware RTT distance
- [ ] Profile photos at arrow tips
- [ ] Tune RSSI + spin-scan constants outdoors

## Milestone 2: works at a gig
- [ ] Backend: accounts, friends, gig-group codes/QR, encrypted location sharing
- [ ] GPS + compass arrow (with magnetic declination)
- [ ] Crowd relay (BLE multi-hop, sealed location boxes)
- [ ] Battery work: adaptive advertising/scanning
- [ ] Real-crowd testing session; Samsung/Xiaomi background-kill testing

## Milestone 3: launch
- [ ] Crowd network (Find My-style), privacy review
- [ ] Register a Bluetooth SIG 16-bit UUID
- [ ] Trademark check for "Moshpoint" (IPONZ first)
- [ ] Play Store listing, privacy policy, data safety form
