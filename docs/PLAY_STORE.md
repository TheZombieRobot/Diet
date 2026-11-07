# Play Store release checklist

Things to do before publishing Moshpoint on Google Play. Items marked **(you)** need your
accounts or decisions; the rest can be done in the repo.

## Before submitting

- [ ] **(you)** Trademark check for "Moshpoint" (IPONZ in NZ first; then AU/UK/US if launching there).
- [ ] **(you)** Google Play developer account.
- [ ] **(you)** Upload key: generate a keystore, then add `MOSHPOINT_KEYSTORE` (base64),
      `MOSHPOINT_KEYSTORE_PASSWORD`, `MOSHPOINT_KEY_ALIAS`, `MOSHPOINT_KEY_PASSWORD` as repository
      secrets so CI can build a signed release bundle (workflow step still to add).
- [ ] **(you)** Deploy the relay server (`fly deploy`, see README) and set `MOSHPOINT_SERVER`.
- [ ] Register Bluetooth SIG 16-bit UUIDs (or switch to 128-bit with extended adverts) to
      replace the placeholders `FFA7`, `FFA8`, `FFA9` in `Ble.kt`, `CrowdRelayRadio.kt`, `GroupSync.kt`.
- [ ] Raise `targetSdk` to the version Play requires at submission time.
- [ ] Replace the placeholder launcher icon with the real logo (adaptive + monochrome layers).
- [ ] Host `docs/PRIVACY.md` at a public URL (fill in date and contact email).
- [ ] Real-world test session done and tuned (see `FIELD_TEST_PLAN.md`).

## Store listing (draft)

**App name:** Moshpoint

**Short description (80 chars):**
Find your mates at gigs. Tap a friend, follow the glowing arrow.

**Full description:**
> Lost your crew in the mosh pit? Open Moshpoint, tap a mate, and a glowing arrow points
> straight to them, with the distance counting down as you close in.
>
> • Works up close and far away: UWB, Wi-Fi Aware, Bluetooth and GPS, picked automatically.
> • No signal at the venue? Locations hop phone to phone through the crowd.
> • One QR for the whole night: start a gig group, everyone scans, everyone can find everyone.
> • Spin to scan: no UWB? Turn on the spot and Moshpoint works out which way they are.
> • Private by design: no account, rotating codes, end-to-end encrypted locations. You're only
>   findable while you go live.

**Category:** Social (or Events). **Content rating:** Everyone / no user-generated content.

## Data safety form (answers)

| Question | Answer |
|---|---|
| Does the app collect or share user data? | **Collects:** approximate and precise location (only while live, encrypted end-to-end, deleted after 15 min). **Shares:** no. |
| Is data encrypted in transit? | Yes (HTTPS; locations are additionally end-to-end encrypted). |
| Can users request deletion? | Yes. Server data expires after 15 minutes automatically; on-device data is deleted with the app. |
| Location: purpose | App functionality (finding friends). Not used for ads or analytics. |
| Location: optional? | Required for the GPS/crowd features while live; the user controls when they're live. |
| Personal info (name, email, etc.) | Not collected. Display names stay on device and in encrypted group intros. |
| Photos | Not collected (friend photos stay on device). |
| App activity, device IDs, diagnostics | Not collected. |

## Sensitive permissions declarations

- **Foreground service (connectedDevice, location):** "Keeps the user findable by their
  friends while they've chosen to go live; shown with a persistent notification and a stop
  button."
- **Background location:** not requested (location is used only in a foreground service the user started).
