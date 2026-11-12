# Play Store release checklist

Things to do before publishing Moshpoint on Google Play. Items marked **(you)** need your
accounts or decisions; the rest can be done in the repo.

## Before submitting

- [ ] **(you)** Trademark check for "Moshpoint" (IPONZ in NZ first; then AU/UK/US if launching there).
- [ ] **(you)** Google Play developer account.
- [ ] **(you)** Upload key: `keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload`,
      then add repository secrets `MOSHPOINT_KEYSTORE` (`base64 -w0 upload.jks`),
      `MOSHPOINT_KEYSTORE_PASSWORD`, `MOSHPOINT_KEY_ALIAS` (`upload`), `MOSHPOINT_KEY_PASSWORD`.
      Every CI run then also produces a signed `moshpoint-release-aab` artifact to upload to Play.
      Keep `upload.jks` and its passwords somewhere safe and never commit them.
- [ ] **(you)** Deploy the relay server (`fly deploy`, see README) and set `MOSHPOINT_SERVER`.
- [ ] Register Bluetooth SIG 16-bit UUIDs (or switch to 128-bit with extended adverts) to
      replace the placeholders `FFA7`, `FFA8`, `FFA9` in `Ble.kt`, `CrowdRelayRadio.kt`, `GroupSync.kt`.
- [ ] **(you)** Optional: set up "Continue with Facebook" (see `docs/FACEBOOK.md`); declare the Facebook SDK in the Data safety form (login only; analytics off).
- [ ] Raise `targetSdk` to the version Play requires at submission time.
- [x] Launcher icon: neon arrow + radar rings (adaptive, with monochrome for themed icons). Swap for a pro logo later if wanted.
- [ ] Host `docs/PRIVACY.md` at a public URL (fill in date and contact email).
- [ ] Real-world test session done and tuned (see `FIELD_TEST_PLAN.md`).
- [ ] **(you)** Watch app (optional at launch): in Play Console add the **Wear OS** form factor
      and upload the `wear` build to its own track, with round watch screenshots
      (`docs/screenshots/watch/` are a start). It has the same application id and must be signed
      with the same key as the phone app, or the two can't talk. Do the wrist test first
      (`FIELD_TEST_PLAN.md`, section 4c). See `WATCH.md`.
- [ ] Before the watch app is public: plug billing into `Entitlements.set(…)` (the one
      Moshpoint+ check), and confirm what Google states about how the Wear OS link between a
      phone and its watch is protected, so `PRIVACY.md` can say it in Google's words.

## Store listing (draft)

**Graphics** (in `docs/store/`): app icon `icon-512.png`, feature graphic `feature-1024x500.png`
(source `feature.html`, open in Chrome). Phone screenshots: use `docs/screenshots/` (updated by CI on every build)
or, better, real ones from the field test.

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
| Personal info (name, email, etc.) | Name: optional, from "Continue with Facebook" or typed; stays on device and in encrypted group intros. Email not collected. |
| Photos | Optional profile photo: end-to-end encrypted, visible only to the user's friends; the server can't view it. Deleted after 8 days unless refreshed. |
| App activity, device IDs, diagnostics | Not collected. |

## Sensitive permissions declarations

- **Foreground service (connectedDevice, location):** "Keeps the user findable by their
  friends while they've chosen to go live; shown with a persistent notification and a stop
  button."
- **Same service, messages without signal:** while live, the service also passes the crew's
  end-to-end encrypted messages between crew phones over Bluetooth when there's no internet.
  No new service type and no new runtime permission (`ACCESS_NETWORK_STATE` is added, which
  Android grants at install: it only tells the app whether there's a network).
- **Background location:** not requested (location is used only in a foreground service the user started).
