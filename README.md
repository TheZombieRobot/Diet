# Moshpoint

Find your mates at a gig. Open the app, tap a friend, and an arrow points you to them.

> **Temporary home.** This project is meant to live in its own private repo
> (`JoshWaveformLabs-Dev/moshpoint`). It's here for now because that repo can't be
> created yet. Move it across with full history when GitHub access is back (see
> "Moving to its own repo" below). The old Diet app docs are in `archive/diet-app/`.

- **Brief:** [`docs/BRIEF.md`](docs/BRIEF.md), the product brief, word for word.
- **How it works:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **What's done / next:** [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Layout

| Path | What |
|---|---|
| `core/` | Pure Kotlin, no Android. All the "where does the arrow point" logic: picking the best method, spin-to-scan maths, Bluetooth distance, arrow colours, rotating privacy codes. Fully unit-tested. |
| `app/` | The Android app (Kotlin + Jetpack Compose): screens, Bluetooth broadcasting/scanning, compass, background visibility service. |
| `docs/` | Brief, architecture, roadmap. |
| `archive/diet-app/` | Previous project, kept for reference. |

## Building

Open the folder in **Android Studio** (Ladybug or newer) and press Run. You need:

- JDK 17+
- Android SDK 35
- Two real Android phones (Android 10+) for anything Bluetooth, UWB or compass. Use
  at least one with UWB and one without.

Core logic tests (no phone or Android SDK needed):

```sh
./gradlew :core:test
```

## Trying it on two phones (current build)

1. Install on both phones and allow the permissions. The top of the friends screen shows
   what the phone has, e.g. "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS".
2. Phone A: tap **Share my code** and send it to phone B (any messenger). Phone B does the same back.
3. On each phone, under **Add someone**, paste the other person's message (the whole message is fine) and give them a name.
4. Phone A: switch on **Visible to my mates**.
5. Phone B: tap phone A's name. Walk around. You should see the distance and warmer/colder.
   Press **Scan**, hold the phone flat on your chest and turn slowly: an arrow should appear.
6. **If both phones have UWB:** within about 50 m the arrow should lock on and the distance
   should be accurate to within a few cm. If the arrow points the mirror-image way, flip
   `AZIMUTH_SIGN` in `UwbFinder.kt`. Also try it with phone A's screen off and the app
   closed, to check UWB works from the background.

Debug logs: `adb logcat -s UwbFinder UwbResponder BleRanger BleBroadcaster`

## Moving to its own repo

Once you can create `JoshWaveformLabs-Dev/moshpoint`:

```sh
git clone --branch ccr-5839ed7c-1q0ztj https://github.com/thezombierobot/diet moshpoint
cd moshpoint
git rm -r archive && git commit -m "Remove archived Diet docs"
git remote set-url origin https://github.com/JoshWaveformLabs-Dev/moshpoint.git
git push -u origin HEAD:main
```
