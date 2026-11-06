# Moshpoint

Find your mates at a gig. Open the app, tap a friend, and an arrow points you to them.

> **Temporary home.** This project is meant to live in its own private repo
> (`JoshWaveformLabs-Dev/moshpoint`). It's here for now because that repo can't be
> created yet. Move it across with full history when GitHub access is back (see
> "Moving to its own repo" below). The old Diet app docs are in `archive/diet-app/`.

- **Brief:** [`docs/BRIEF.md`](docs/BRIEF.md), the product brief, word for word.
- **How it works:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **What's done / next:** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **Testing on real phones:** [`docs/FIELD_TEST_PLAN.md`](docs/FIELD_TEST_PLAN.md); analyse recordings with `python3 tools/analyze_recording.py <file.csv>`

## Layout

| Path | What |
|---|---|
| `core/` | Pure Kotlin, no Android. All the "where does the arrow point" logic: picking the best method, spin-to-scan maths, Bluetooth distance, arrow colours, rotating privacy codes. Fully unit-tested. |
| `app/` | The Android app (Kotlin + Jetpack Compose): screens, UWB, Wi-Fi Aware, Bluetooth, GPS, crowd relay, background visibility service. |
| `server/` | The relay server: a tiny mailbox for sealed locations (Kotlin + Ktor). |
| `docs/` | Brief, architecture, roadmap. |
| `archive/diet-app/` | Previous project, kept for reference. |

## Building

Open the folder in **Android Studio** (Ladybug or newer) and press Run. You need:

- JDK 17+
- Android SDK 35
- Two real Android phones (Android 10+) for anything Bluetooth, UWB or compass. Use
  at least one with UWB and one without.

Core logic and server tests (no phone or Android SDK needed):

```sh
./gradlew :core:test :server:test
```

**Every push builds automatically** on GitHub Actions (`.github/workflows/android.yml`): it
runs the tests and produces a debug APK you can download from the run's page
(Actions → Android build → the run → Artifacts → `moshpoint-debug-apk`) and install
straight onto a phone.

### GPS mode needs the relay server

GPS sharing is off until the app is built with a server address:

```sh
./gradlew :app:assembleDebug -Pmoshpoint.server=https://your-server.example
```

For the automatic GitHub builds, set a repository **variable** (not a secret) called
`MOSHPOINT_SERVER` to the server's address (Settings → Secrets and variables → Actions →
Variables). Every build after that has GPS mode on.

Running the server (any host that runs Docker, e.g. Fly.io, Render, Railway):

```sh
docker build -f server/Dockerfile -t moshpoint-server .
docker run -p 8080:8080 moshpoint-server
```

Or locally without Docker: `./gradlew :server:run` (port 8080). Two phones on the same
Wi-Fi as your laptop can use `-Pmoshpoint.server=http://<laptop-ip>:8080` for testing
(debug builds allow plain http for this; release builds need https).

## Trying it on two phones (current build)

1. Install on both phones and allow the permissions. The top of the friends screen shows
   what the phone has, e.g. "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS".
2. Type your name at the top. Phone A taps **Show my QR**; phone B taps **Scan their QR**
   and then **Add friend**. Swap and do it the other way too.
   (No camera handy? **Share my code** sends it by message; paste the whole message in.)
   **Or as a gig group:** one phone taps **Start a gig group** and shows the QR; the
   other taps **Join (scan QR)**. Members appear in each other's gig group within a
   few seconds (needs Bluetooth 5 extended adverts, or the relay server).
3. Phone A: switch on **Visible to my mates** (or add the **Moshpoint** tile to Quick
   Settings and tap it; the notification has a **Stop being visible** button).
4. Phone B: tap phone A's name. Walk around. You should see the distance and warmer/colder.
   Press **Scan**, hold the phone flat on your chest and turn slowly: an arrow should appear.
5. **If both phones have UWB:** within about 50 m the arrow should lock on and the distance
   should be accurate to within a few cm. If the arrow points the mirror-image way, flip
   `AZIMUTH_SIGN` in `UwbFinder.kt`. Also try it with phone A's screen off and the app
   closed, to check UWB works from the background.

### Debug mode (test builds only)

Debug builds (the APK from GitHub Actions, or Run in Android Studio) have a **Debug**
button on the finder screen. Release builds don't: it's compiled out.

- **Methods:** every method with **ON/off** and **solo**. Solo one (e.g. Wi-Fi) to test it
  on its own; **all on** puts things back. Disabled methods still show their readings.
- **Per friend:** each method's last distance, bearing, age and trust score. The green
  `●` row is the one driving the arrow.
- **Technology status:** UWB (looking / visible), Wi-Fi Aware, Bluetooth scan and adverts,
  GPS accuracy, server, crowd relay, compass. Failures show in red.
- **Switch log:** every hand-over, e.g. `21:04:13  Sam: BLE_RSSI distance only -> UWB (12.4 m)`.

- **Field recording:** **● record** writes every raw reading to a CSV; **mark…** notes the
  real situation ("A 20 m, due north"); **share last** sends it. This is how the maths
  gets tuned to real phones.
- **Simulated friend:** on the friends screen, **Debug: add simulated friend** walks a
  pretend friend in from 200 m, producing realistic GPS/BT/Wi-Fi/UWB readings, so you can
  check everything with one phone. Simulator switches in the panel pretend this phone has
  no UWB / no Wi-Fi Aware / no data.

Each arrow also shows a small label of the method driving it (`UWB`, `Wi-Fi`, `BT`,
`GPS`, `crowd`, `scan`; `?` = unsure).

Debug logs: `adb logcat -s UwbFinder UwbResponder BleRanger BleBroadcaster CrowdRelay WifiAware MyLocation`

## Moving to its own repo

Once you can create `JoshWaveformLabs-Dev/moshpoint`:

```sh
git clone --branch ccr-5839ed7c-1q0ztj https://github.com/thezombierobot/diet moshpoint
cd moshpoint
git rm -r archive && git commit -m "Remove archived Diet docs"
git remote set-url origin https://github.com/JoshWaveformLabs-Dev/moshpoint.git
git push -u origin HEAD:main
```
