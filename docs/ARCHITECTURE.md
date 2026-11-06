# Moshpoint architecture

## The one rule

The user taps a friend and sees an arrow. They never choose a method. Every locating
method runs at once, and a single arbiter decides what to draw.

```
 UWB ─────────┐
 Wi-Fi Aware ─┤
 BLE RSSI ────┤   Fix(friend, method,     ┌──────────────┐   ArrowState   ┌─────────────┐
 Spin scan ───┼──► bearing?, distance?, ──►│ MethodArbiter│──────────────►│ FinderScreen│
 GPS/server ──┤   confidence, time)       └──────────────┘  per friend    └─────────────┘
 Crowd relay ─┘                                  ▲
                                         compass heading
```

## core (pure Kotlin, unit-tested)

| File | Job |
|---|---|
| `Model.kt` | `Method` (with trust weight + how long a fix stays fresh), `Fix`, `ArrowState` (`NoSignal` / `DistanceOnly` / `Pointing`). |
| `MethodArbiter.kt` | Drops stale fixes. Takes direction from the best fix that has a bearing and distance from the best fix that has a distance, so a GPS arrow can still show a precise Wi-Fi Aware distance. Hysteresis stops flicking between methods. Flags low-confidence arrows as `unsure`, which brings up the Scan prompt. |
| `SpinScan.kt` | Spin to scan. Collects (compass heading, RSSI) while the user turns, then fits `rssi = a + b·cos(h − θ)` by least squares. θ is where the signal peaks, which is the friend's direction. It needs about 300° of the circle, and it reports "inconclusive" if the body shadow is too weak to read. |
| `RssiRanging.kt` | Log-distance path loss with smoothing. Turns BLE signal strength into a rough distance. The constants **must be tuned in a real crowd**. |
| `ArrowStyle.kt` | Arrow is red at 150 m or more and fades to the friend's colour by 10 m. Distance label text. |
| `Advert.kt` | The bytes in every Bluetooth advert: `[flags][rotating id][encrypted UWB block]`. The UWB block is how two phones set up UWB with no connection or server (below). Also `UwbSessionKeys`, which both phones use to derive the same UWB session id and key on their own. |
| `FriendRecord.kt` | Saved-friend format and share codes. Gig group members expire after 18 h. |
| `EphemeralId.kt` | Rotating 16-byte broadcast code = `HMAC-SHA256(secret, 5-min epoch)`. Friends who hold the secret recognise it; nobody else can link it over time. |
| `Geo.kt` | Distance and bearing between GPS points. Absolute bearing → arrow angle using the compass. |

## app (Android)

| File | Job |
|---|---|
| `locate/LocatorEngine.kt` | Owns the arbiter, compass and providers; exposes `arrows` and spin-scan progress to the UI. New providers plug in by calling `arbiter.submit(fix)`. |
| `locate/BleRanger.kt` | Scans for Moshpoint adverts, matches the rotating code against friends, decodes the UWB block, and reports RSSI. |
| `locate/BleBroadcaster.kt` | One BLE advert; used by visibility and by the finder's "I'm looking" advert. |
| `locate/UwbFinder.kt` | UWB on the looking phone (controller). One multicast session to every friend. |
| `service/UwbResponder.kt` | UWB on the visible phone (controlee). Joins a looking friend's session from the background service. |
| `locate/Compass.kt` | Rotation-vector sensor → heading. |
| `locate/Capabilities.kt` | Detects BLE / UWB / Wi-Fi Aware / compass / GPS. Phones will exchange this so both sides use a method they share. |
| `service/VisibilityService.kt` | Foreground service (type `connectedDevice`) that keeps the BLE advert going with the app closed and swaps the code every rotation. On UWB phones it also listens for lookers and runs `UwbResponder`. |
| `service/BootReceiver.kt` | Turns visibility back on after a reboot, only if the user chose "always on". |
| `ui/FinderScreen.kt` | No-signal state, one arrow per friend with avatar and distance, Scan flow. |
| `ui/FriendsScreen.kt` | Friends list, gig group ("End night" clears it), visibility switches, share-your-code pairing, long-press to remove. |
| `Friends.kt` | `FriendsRepository`: saved to `friends.tsv` in app-private storage. |

## Methods: status and plan

| # | Method | Status | Notes |
|---|---|---|---|
| 1 | GPS + compass via server | To do | Needs a backend (e.g. Supabase / Firebase). Phones upload location **encrypted to friends** while visible. Correct compass for magnetic declination. |
| 2 | Crowd relay over BLE | To do | Multi-hop: BLE extended adverts or GATT. Payload = sealed location box (see privacy). TTL + dedupe. |
| 3 | UWB | **Written, untested** | `androidx.core.uwb`, set up over BLE adverts (see below). Only between two UWB phones. |
| 4 | Wi-Fi Aware RTT | To do | `WifiAwareManager` + `WifiRttManager`. Distance only. |
| 5 | BLE RSSI | **Working** | Distance + warmer/colder. |
| 6 | Spin to scan | **Working** | Scan button. Maths tested; needs real-crowd tuning. |

## UWB set-up (no connection, no server)

UWB needs both phones to agree on addresses, a channel, a session id and a key before
ranging. Moshpoint does that through the adverts it is already sending:

1. **Visible phone** (controlee) opens a UWB scope and puts its 2-byte UWB address in its advert.
2. **Looking phone** (controller) opens a scope and advertises "I'm looking" with its address,
   channel and preamble.
3. Both UWB blocks are encrypted with a key from the sender's secret, so only friends can read them.
4. Session id and key = HMAC(**looking phone's secret**, its UWB address). Every friend of the
   looker has that secret, so both sides work them out alone.
5. The looker adds each friend it hears to one multicast session; the visible phone joins on
   hearing the looker. Results give distance and azimuth, which turn into the arrow.

Known limits: a visible phone can be in one UWB session at a time (a second looker gets
Bluetooth/GPS until the first goes quiet for 20 s). UWB azimuth only covers the front of the
phone, so an arrow behind you may need a turn to settle. Check whether the phone allows UWB
ranging from a background service. The azimuth sign (`UwbFinder.AZIMUTH_SIGN`) needs checking
on real phones.

## Privacy (built in from day one)

- Visibility is off by default, only the user turns it on, and a notification shows while it's on.
- The broadcast is a rotating HMAC code, never a fixed ID or name.
- **Crowd network (later):** a helper phone that hears a code attaches *its own* GPS and
  encrypts it to the owner's public key (X25519 + AES-GCM sealed box), keyed by the
  rotating code. It uploads it or relays it. Only the owner and their friends can open it.
  The helper can't link codes over time, so it never learns who it helped. This is the
  same model as Apple Find My / Tile.
- To do: per-group secrets so leaving a gig group revokes access; keys in the Android Keystore.

## Things to watch (from the brief)

- **Battery:** advertising is BALANCED at medium power. Next steps: adaptive intervals, scan
  duty-cycling when the screen is off, and only fast-scanning while the finder screen is open.
- **Crowds:** bodies absorb 2.4 GHz. Retune `RssiRanging` and `SpinScan` thresholds with real gig data.
- **Background limits:** foreground service + `START_STICKY`. Test on Samsung/Xiaomi/Oppo,
  which kill background apps hard, and prompt users to exempt the app from battery optimisation.
- **BLE UUID:** `Ble.SERVICE_UUID` is a placeholder 16-bit UUID. Register one with the Bluetooth SIG before release.
