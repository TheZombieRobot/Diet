# "I'm here" pin: decisions

Step 3 of "Decided next (November 2026)" in [ROADMAP.md](ROADMAP.md). At a gig you long-press
your exact spot on the map (say the bar on level 2) and choose **I'm here**. Your face jumps to
that spot on your crew's maps, radars and finders, replacing your rough GPS dot, with the floor.
It clears itself when you walk away or after 20 minutes, and your live dot comes back.

Decisions were made without stopping to ask, as instructed. Each is recorded here with the
reason, so it can be changed later. **Nothing here has run on a real phone yet.**

## Status and next steps

_Handover, kept current at every push. Branch `claude/im-here-pin-k3v9tq`, started from
`ccr-5839ed7c-1q0ztj` at `dffb9ce`._

| Step | State |
|---|---|
| 1. This note: a decision for each hard problem | done |
| 2. Core: the message, `HereRule`, `HereBook`, `HereWatch`, the pinned floor, the courier carrying it, `Method.HERE_PIN` in the arbiter, with tests | not started |
| 3. App: sending and clearing, receiving, map / radar / finder, the walk-away watcher | not started |
| 4. `strings_here.xml` in English and 19 languages | not started |
| 5. Screenshot tests (`HereSnapshotTest`, own package) | not started |
| 6. Field test (two phones), roadmap, architecture and privacy notes | not started |
| 7. CI green, report sent | not started |

**Exact next step:** step 2, starting with `GigGroup.sealHere` / `openHere` and `HereRule` in
core, then their tests.

How to work on it:

- `core` and `server` tests run here with a scratch Gradle settings file that includes only
  `:core` and `:server` and points its version catalogue at `gradle/libs.versions.toml` (the
  Android modules can't be built in this container: Google's Maven host is blocked). The app and
  the watch are compiled, tested and drawn by CI on every push (about 13 minutes).
- CI commits changed screenshots back to the branch: `git pull --rebase` before pushing.

## What you see

- **Sending.** Long-press the map (or tap **Pin** for where you are now). The dialog that offers
  **Crew meet-up** and **Just for me** now offers **I'm here** first. Nothing to type.
- **Your crew** sees your face at that spot instead of your GPS dot, with "pinned 3 min ago"
  under your name, and "↑ Upstairs" / "↓ Downstairs" when the spot is on another floor from
  them. On the crew radar and in the finder the arrow points at the spot, with the same note.
- **You** see your pin in the map's list of places ("You're here · 3 min ago") with ✕ to clear
  it. Pinning again moves it.
- **It goes away** when you walk away from it, when you change floor, after 20 minutes, when you
  clear it, or when you pin somewhere else. Then your live dot comes back on everyone's map.
- No notification, no chat line: it only changes where your face is drawn.

## Decisions on the hard problems

### 1. The message

**Checked in the code:** the meet-up pin is a signed `Rally` in the ping key with AAD "rally";
pings use AAD "ping"; control messages (have, receipt, retired) use the `mp2` envelope, which
has its own key and AAD, so builds older than it can't open it at all. `Courier.open` tries
`openPing`, then `openRally`; anything else is remembered as "not a message" and ignored. Over
Bluetooth, `Courier.handle` opens envelopes first and ignores types it doesn't know.

**Decision: a new envelope type, `ENV_HERE = 4`, signed by the sender.**

- Body: `[ver:1][flags:1][minutes:1][lat:4][lon:4][pressure:2] [pub:33][sig:64]`, lat/lon in
  1e-7 degrees, pressure in the floor code's 2-pascal units (`Baro`, 0xFFFF = none). Flag bit 0
  is **clear** (then lat, lon and pressure are 0 / none). Whole envelope: 144 bytes, one
  Bluetooth packet, so it can cross strangers' phones (only whole packets do).
- The time is the envelope's own (sender's clock). **The signature covers** `"mp-here1"`, this
  crew's signing tag (as the pin's signature does), the time and every body field before the
  key, so no crew mate can move, re-date or replay someone else's pin.
- Readers parse the fields they know and ignore anything after them (still covered by the
  signature), so a later version can add fields without a new type.
- **Message id**: SHA-256 over `"mp-here1"`, the signer's key, the time and the signed fields,
  first 8 bytes (like `messageId` and `pinId`): the same for every copy and route, and the same
  after the crew moves to a new key and the courier signs it again.
- **Older builds can't misread it.** Builds before the courier never open an `mp2` envelope
  (other key, other AAD): nothing happens. Builds with the courier open it, find a type they
  don't know and ignore it (checked in `Courier.handle`); they still pass the packet on through
  the crowd relay like any other. On the relay it sits in the meet-up pin's mailbox, where both
  kinds of older build try `openRally` on each record, fail, and move on (checked in
  `GroupSync.syncServer` and `Courier.accept`). A test seals one and runs it through each.
- **Newest per sender wins**, judged by the sender's time with `HereRule.accepts`, which is
  `PinRule`'s rule: a time more than 5 minutes ahead of the receiver's clock is refused, so
  nobody can lock their pin in place with a far-future time. A clear is a message like any
  other: newer than the pin, so it wins.
- **Carried by the courier** like the meet-up pin: kind `KIND_HERE`, ranked with pins (after
  safety pings), uploaded to the **pin mailbox** (the crew's daily rally id: kept 15 minutes,
  fetched with everything else every 30 to 55 seconds, so it costs no extra request), and
  re-posted every 10 minutes while it lasts and the app is open or live (two uploads for a
  20-minute pin; the ping mailbox would have needed four or five). Over Bluetooth it goes with
  4 or 5 crowd hops while it lasts, then none. The courier keeps only the newest per sender per
  crew, our own included, and never pushes our own out of a full queue.
- Why not a new ping kind: older builds with the courier would show it as an unknown ping
  ("pinged the crew") or, before the allowlist, worse. Why not the meet-up `Rally`: it has no
  room for a floor, an end time or "clear" that older builds wouldn't misread as the crew's
  meet-up point.

### 2. Floors

**Checked in the code:** floors are never sent, only pressure. Each phone keeps, per mate, a
calibration (the two sensors' offset, measured while side by side) that ages, and compares
**same-moment** readings so the weather cancels (`FloorTracker.update`, readings up to 2 minutes
old). A tag needs `max(2.5 m, 1.5 m + 2σ)`.

**Decision: the pin carries the sender's pressure at the pinned spot, taken when they pin it.**
Each receiver works out the spot's floor relative to itself (`PinnedFloor` in core):

- height of the spot above me = `Baro.heightAboveM(my pressure now, pin pressure + our
  calibration offset)`. My pressure **now**, so walking up to the spot's floor makes the tag go
  away, as it should.
- The weather has moved since the pin was taken, and nothing at the spot measures it any more
  (the sender may have moved). So the uncertainty grows with the pin's age, on top of the
  calibration's own: `σ = √(σ_calibration² + (0.05 m/min × age)²)`, and the same tag rule
  (`max(2.5 m, 1.5 m + 2σ)`, kept down to 60% of that). A normal 3.5 to 4 m storey shows for the
  pin's whole 20 minutes in ordinary weather; a fast-moving front (1 hPa an hour) still can't
  produce a false tag in that time; past σ = 2 m there's no tag.
- **Never the sender's later pressure.** If the sender goes downstairs the pin is cleared
  (problem 4); until the clear arrives, receivers still show the spot's own floor.
- No tag when: the sender's phone has no pressure sensor (no pressure in the pin), this phone
  has none, there's no calibration with that mate tonight, or it has aged out.
- Why not the sender's live pressure as a weather reference while they stay on that floor: it
  would be more exact, but it mixes two readings with different routes and ages, and is wrong
  exactly when it matters (the clear lost, the sender elsewhere). Simpler and honest wins.

### 3. Where the finder uses it

**Checked in the code:** `MethodArbiter` scores each method's newest fix as precision ×
confidence × freshness, takes the direction from the best direction-giving fix and the distance
from the best fix with a distance, ignores GPS-style bearings (`GPS_SERVER`, `CROWD_RELAY`) once
a close-range method says under 20 m, and keeps the current method unless another beats it by
0.1. `GpsFinder` turns "their GPS vs mine" into fixes every 4 to 15 seconds; `PocketFinder` (the
watch, phone in a pocket) builds its own `GpsFinder`; the phone's own finder reaches the watch
through `PhoneFinderBridge.latestFixes`, which lists every `Method`.

**Decision: a new method, `HERE_PIN` (precision 0.65, fixes last 40 s, gives a direction).**

- The fix is made in `GpsFinder.poll` (so the phone's finder and the watch's pocket finder both
  get it, with no extra work for the watch) from **my** GPS position to the pin: bearing and
  distance by geometry. Confidence: `(1 − (my accuracy + 5 m) ÷ distance)` clamped to 0.1..1,
  like a GPS fix but with only one phone's error (the spot itself is exact; 5 m is the finger on
  the map), times an age factor from 1.0 when pinned to 0.85 at 20 minutes (`HereRule.fix`).
- **Ranking:** a pin beats their live GPS and the crowd relay (0.65 against 0.5 and 0.4) for its
  whole life, because their face is drawn at the pin on the map and the arrow must agree. It
  also beats spin-to-scan (0.45) and walk-and-watch (0.4). **UWB up close still wins** (1.0, and
  0.95 confidence), and Wi-Fi Aware's distance beats the pin's up close.
- **The close-range rule is kept:** `HERE_PIN` joins `GPS_LIKE`, so its bearing is ignored once
  UWB, Wi-Fi Aware or Bluetooth says the mate is under 20 m (my GPS error is bigger than the gap
  there). Its distance still counts, and its confidence collapses by itself when my accuracy is
  as big as the distance.
- **As it ages** the score falls a little (never below their GPS), and the arrow is marked
  unsure (Scan prompt) by the same rule as any other when the score gets low. Expired or
  cleared: no more fixes, and within 40 seconds the arbiter is back on GPS.
- **The watch** gets it without extra work: from the phone's finder through the bridge, and
  from `PocketFinder`'s own `GpsFinder`. Two small edits keep it right there: `HERE_PIN` is in
  `WristDirections.POSE_FREE` (its bearing is geometry, as right in a pocket as in the hand;
  a test fails if a direction method is in neither list), and it has its own number (8) in the
  watch protocol. An older watch reads 8 as "no method", which it only uses for display.

### 4. Clearing

**Decision: the sender's phone clears it; every receiver also drops it on its own.**

- **Walking away** (`HereWatch`, core): our pin is cleared when
  - GPS puts us more than **30 m** from the spot beyond the fix's own accuracy (accuracy counts
    up to 60 m; worse fixes are ignored), **and** the motion detector (`MotionDetector`, the
    accelerometer's footstep bounce) has seen at least 10 seconds of walking since the pin was
    set. GPS drifts 30 m indoors while you stand at a bar; you don't drift footsteps. A phone
    without an accelerometer needs 60 m.
  - or the pressure sensor says we **changed floor**: our pressure moved 0.3 hPa (about 2.5 m)
    from the pin's, measured against a reference that follows slow weather while we stay put
    (weather moves at most a few hundredths of a hPa a minute; stairs and lifts move 0.3 hPa in
    under a minute). GPS can't tell the bar on level 2 from the toilets under it.
- The watcher runs only while our pin stands and the app is open or we're live (the times our
  location is shared anyway). With the app closed and not live, the pin simply runs out.
- **Clear** = a new signed message with the clear flag, stamped after the pin, carried and
  uploaded like the pin, and valid until the pin it clears would have run out.
- **Receivers drop it themselves** at `time + minutes`, judged by the **sender's** time with two
  skew limits: a time more than 5 minutes ahead of the receiver's clock is refused outright, and
  no message lasts more than 30 minutes whatever it says. So a fast clock can stretch a pin by
  at most 5 minutes, and a pin that arrives late (carried by Bluetooth for a while) is shown only
  for what's left of it, or not at all. A slow sender clock is helped by stamping with the
  crew's message clock (never earlier than the newest message seen).
- **Newer always wins:** each phone remembers the newest time it has seen from each sender
  (`HereBook`, saved), so an old pin arriving late can't come back after a clear.
- Pinning again replaces the old pin (newest per sender). Leaving the crew, or the crew ending,
  drops everything with it.

### 5. The map and the radar

**Checked in the code:** `MapScreen` places each mate by `VenuePlacement.spot` (UWB exact,
else their GPS, else nowhere) and builds `MapPin`s with a caption; long-press opens a dialog
with **Crew meet-up** (`GroupSync.setRally`) and **Just for me** (`Spots.add`); the meet-up pin
and saved spots are listed with ✕. `CrewRadar` draws the finder's arrows (so it follows the
arbiter) with floor pills; `FinderScreen` shows a chip under a single arrow.

**Decision:**

- **Long-press dialog:** a third button, **I'm here**, first, shown when you're in a crew that's
  awake and you're not following from home. The name field is for the other two.
- **Placement:** `VenuePlacement.spot` gains the pin: **UWB exact > pin > GPS > nowhere**. UWB
  is a measurement of where they are this second; the pin is where they told you, better than
  any GPS dot. A pinned mate is never merged into a crowd bubble (the spot is exact).
- **The note:** the pin's caption is "📍 3 min ago" (under the name, on the map and in the
  list), and the floor tag on the face is the spot's floor (problem 2).
- **Radar and finder:** the arrow already follows the arbiter, so it points at the pin. The
  radar draws a small "📍 3 min" pill under a pinned mate's face (beside the floor pill); the
  finder's chip says "Pinned 3 min ago" while the pin is driving the arrow, and the crew strip
  wears the pin's floor tag.
- **Your own pin:** listed at the top of the map's places, "You're here · 3 min ago", with ✕.
  That is the only new control. No new modes, screens or buttons elsewhere.
- **Notifications:** none. A pin only changes where a face is drawn.

### 6. Several crews; following from home

- **A pin belongs to one crew:** sealed with that crew's key, posted to that crew's mailbox,
  kept in that crew's book. "I'm here" always goes to the **main crew** (the one the map and the
  finder show). Up next crews are asleep (no Bluetooth, no location) and for another night.
- When another crew becomes the main one, the old crew's pins aren't shown any more; our own pin
  there keeps running out on its own (at most 20 minutes) and its watcher still clears it if we
  walk away.
- **People following from home don't see it.** Their map keeps showing your usual dot. The pin
  is a finding tool for people at the venue: it says exactly where you're standing, and someone
  at home can't come to that spot. Followers hold the crew key, so this is the app not showing
  it, not cryptography; the sender's words ("your crew") stay true. Followers can't send one
  either (they aren't at the gig).

### 7. Privacy

- Sealed with the crew key in the `mp2` envelope and signed with the sender's crew signing key,
  like the meet-up pin. Only crew phones can open it; nobody in the crew can forge or move
  someone else's.
- **Nothing new on air:** a 144-byte version 2 packet in the relay's existing advertising set,
  with a random 4 or 5 starting hops: the same size range as a ping or a meet-up pin. No sender
  id, no crew tag, no mailbox id. On the relay it goes to the crew's existing daily pin mailbox.
- Pressure is already shared with the crew (advert and floor box); here it rides inside the
  sealed message.
- The walk-away watcher reads GPS, the accelerometer and the pressure sensor on the phone only,
  and only while your own pin stands.

## Known limits

- Indoors, the walk-away check depends on GPS, which can be 50 m out: walking 20 m to another
  bar may not clear the pin. The floor check and the 20-minute limit bound the damage.
- A receiver that never gets the clear shows the pin until it runs out (at most 20 minutes,
  25 with a fast sender clock).
- The pinned floor is only as good as tonight's calibration with that mate, as for live tags.
- The arrow to a pin comes from your own GPS: under 20 m it gives way to Bluetooth and UWB.
