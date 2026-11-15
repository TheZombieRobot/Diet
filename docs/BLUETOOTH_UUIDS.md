# Bluetooth UUIDs (decision, 15 November 2026)

Moshpoint's four kinds of Bluetooth advert each carry service data under a UUID, and phones
pick out Moshpoint's adverts by it (BleHub's scan filters). Until now all four were 16-bit
values the Bluetooth SIG has never assigned to anyone: `0xFFA7`–`0xFFAA`. Another product may
already use them, and the SIG may assign them later. Changing a UUID after launch would split
old and new versions of the app, so it has to be settled before launch (audit/release.md, P1-16).

## Decision

| Advert | Kind | Was | Now |
|---|---|---|---|
| The finder's rotating code (every live phone; `Ble.SERVICE_UUID`) | **legacy** (31 bytes, every phone) | `0xFFA7` | **unchanged until the owner buys a SIG 16-bit UUID**, then that value |
| Crowd relay and crew messages without signal (`CrowdRelayRadio.RELAY_UUID`) | extended (Bluetooth 5) | `0xFFA8` | `E181BEB0-719E-4505-9666-DE4DF5920EA8` |
| Crew intros (`GroupSync.INTRO_UUID`) | extended | `0xFFA9` | `E181BEB0-719E-4505-9666-DE4DF5920EA9` |
| Bump to join (`Bump.UUID`) | extended | `0xFFAA` | `E181BEB0-719E-4505-9666-DE4DF5920EAA` |

The three new UUIDs are one random (version 4) UUID with the last byte set to the old 16-bit
value, so each is easy to match to what it replaced. They're Moshpoint's own: a random 128-bit
UUID needs no registration.

## Why: the bytes

A service-data field costs 4 bytes plus its data with a 16-bit UUID, and 18 bytes plus its data
with a 128-bit one (length, type, UUID).

- **The finder's advert must stay a legacy advert.** Every phone can send and hear those; only
  Bluetooth 5 phones handle extended adverts, and a phone that can't hear a friend's advert can't
  find them. A legacy advert holds 31 bytes. Moshpoint's data (core `Advert`) is 17 to 23 bytes:
  - 16-bit UUID: 4 + 23 = **27** bytes (30 if the phone adds the 3-byte flags field). Fits.
  - 128-bit UUID: 18 + 23 = **41** bytes; even the smallest advert (17 bytes) needs 35. **Doesn't fit.**

  Shrinking the data to make room (a 6-byte rotating code instead of 16) would change the
  finder's protocol, its crypto and the relay's mailboxes: far too big a change, and weaker.
  So this advert keeps a 16-bit UUID, and that UUID should be a registered one.
- **The other three are already extended-only adverts** (each checks
  `isLeExtendedAdvertisingSupported` and does nothing on phones without it), so the 14 extra bytes
  fit. The phone's limit (`leMaximumAdvertisingDataLength`) is 251 on most Bluetooth 5 phones and
  1650 on many:

  | Advert | Biggest data | With a 128-bit UUID | Check in the code |
  |---|---|---|---|
  | Crew intro (only the second form now) | 186 (`GigGroup.MAX_INTRO2_BYTES`) | 204 | `GroupSync`: needs 186 + 22 |
  | Crew message | 200 (`MessagePacket.MAX_SIZE`) | 218 | `OfflineMessages`: needs 200 + 22 (was + 8) |
  | Crowd relay location | 48 (`CrowdRelay.SIZE`) | 66 | well inside |
  | Bump invite | the invite text, ~300 | ~318 | `Bump`: invite ≤ limit − 22 (was − 8) |

  The "+ 22" is the 18-byte header and 4 spare, as the old "+ 8" was the 4-byte header and 4
  spare. A phone below a limit falls back as before (bump only receives; messages and intros go
  by the relay).

## The options considered

1. **128-bit UUIDs everywhere.** Free and collision-proof, but impossible for the finder's legacy
   advert (41 bytes > 31). Chosen for the three extended adverts.
2. **Extended advertising for the finder too.** Room for anything, but phones without Bluetooth 5
   adverts could no longer find or be found. Rejected: never break the advert.
3. **Register 16-bit UUIDs with the Bluetooth SIG.** The only clean way to keep the finder's
   advert legacy-sized. Needs SIG membership (Adopter level has no annual fee) and a one-off fee
   per UUID: US$3,750 since 2026 (the SIG's fee schedule; up to four per request, published within
   about 10 business days of payment, never expires). One is enough: the finder's.
   - A SIG company identifier with manufacturer data would be the same size and needs the same
     membership; a 16-bit service UUID keeps the code as it is.
4. **Keep the placeholders.** Works today, but a collision (another product on `0xFFA7`, or the
   SIG assigning it) would mix their adverts into ours. Ours are checked cryptographically, so
   nothing would be misread, but it isn't a value we have any right to. Only acceptable until the
   registered one arrives.

## Owner to-do

1. Join the Bluetooth SIG as an Adopter member (free) and request one 16-bit UUID for members
   (US$3,750), with Moshpoint's company details.
2. When it's published, replace `0xFFA7` in `finder/…/locate/Ble.kt` (`Ble.SERVICE_UUID`, one
   line), before launch. Everything that sends or scans the finder's advert reads that constant.
3. That change, like this one, splits versions: see below.

## Testers must all update together

Old and new builds don't hear each other's crew intros, crowd relay, crew messages without signal
or bumps (the UUIDs changed); finding each other (the finder's advert, still `0xFFA7`) and
everything over the internet still work across versions. Crew intros also go only in their second
form now (audit/release.md, P2): builds from before that form existed can't read them from the
relay either. So every tester should install the new test build before the next field test, and
again when the registered UUID replaces `0xFFA7`. After launch, never change a UUID again.
