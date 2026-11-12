# Moshpoint field test plan

A checklist for the first real-world testing session. Work through it in order: each
stage builds on the one before. Allow 2–3 hours for the whole thing.

**The single most useful thing you can do:** keep a field recording running on the
*looking* phone, and press **mark…** whenever you know the truth (how far away your mate
really is, which way they really are, what's in between). Send me the CSV afterwards.
That's what lets the distance and direction maths get tuned to real phones and real crowds.

---

## 0. Before you go

- [ ] Two phones, both charged. Ideally **one with UWB and one without** (UWB: Pixel 6 Pro / 7 Pro / 8 Pro / 9 Pro / Fold, Samsung Galaxy S21+/Ultra and newer Ultras/+ models, some Z Folds).
  Check: the top of the friends screen shows "This phone: UWB, ..." if it has it.
- [ ] Install the debug APK on both (GitHub → Actions → latest green "Android build" run → Artifacts → `moshpoint-debug-apk`).
- [ ] Open the app on both. Go through the welcome and tap **Allow** on step 2, accepting **every** permission. If a "Moshpoint still needs" box shows later, tap **Allow**.
- [ ] Bluetooth **on**, Wi-Fi **on** (doesn't need to be connected), Location **on**, on both.
- [ ] Battery optimisation: when you **Go live**, accept the prompt and set Moshpoint to "Unrestricted" / "Don't optimise".
- [ ] Add each other with **Show my QR** / **Scan their QR** (both ways round), or start a crew with **Start a group** and have the other phone **Join a group**.
- [ ] Optional: long-press each other → **Set photo**.
- [ ] Name or "stay live after restart" later: the sliders button top-right on the home screen.
- [ ] Turn on battery saver for a minute: the glows and sweeps should hold still (calm motion) but the arrow still swivels.
- [ ] Note the battery % on both phones and the time.

Names below: **A** = the phone being found (visible). **B** = the phone looking.

## 1. One phone warm-up (5 min, simulated friend)

On either phone, no second person needed:

- [ ] Friends screen → **Debug: add simulated friend** → tap "Sim 1".
- [ ] The arrow should appear (GPS, hot pink), get closer over ~2 min, glow into the friend's colour, and switch methods as it comes in: debug label `GPS` → `UWB` (or `Wi-Fi`/`BT` on a non-UWB phone).
- [ ] Turn on the spot: the arrow should swivel smoothly and keep pointing the same real-world way.
- [ ] Tap **Debug**. Check the method table updates, and the switch log shows hand-overs.
- [ ] In the debug panel, set the simulator to **UWB ✗** and **restart walk**: should fall back to Wi-Fi/BT distance with no arrow when close. Press **Scan**, turn a full circle: the ring should fill, the phone buzzes, and an arrow appears.
- [ ] Try **data ✗**: far away readings should come from `crowd` instead of `GPS`.
- [ ] Let the sim walk in under 3 m: the **You found them** confetti screen should pop, with a buzz. **Keep the arrow** dismisses it until they wander >8 m away.
- [ ] Watch the animations: smooth arrow swivel (no jumps through 180°), rolling distance, radar while searching, running neon border on the live card. Note anything that stutters and on which phone.

Anything wrong here is a UI/logic bug, not a radio problem: screenshot it.

## 2. Two phones, open space (30 min)

Somewhere open: a park or field. On **B**: Debug → **● record**.

- [ ] A: tap **Go live**. A notification should appear on A.
- [ ] B: tap A's name.

### 2a. Bluetooth distance
- [ ] Start 2 m apart. Debug panel on B: `BT` row should show a distance and update.
- [ ] Walk apart in steps: **2, 5, 10, 20, 40 m**. At each, wait 10 s, then **mark…** with the real distance, e.g. `A 10 m`.
- [ ] Note where BT drops out entirely (mark it: `BT lost ~xx m`).

### 2b. Wi-Fi Aware (if both phones support it: look for `Wi-Fi Aware (looking)` in Technology status)
- [ ] Same steps as 2a, watching the `Wi-Fi` row. It should be much steadier than BT.

### 2c. UWB (only if *both* phones have UWB)
- [ ] Within 20 m, facing A: B's arrow should lock on (`UWB` label, steady) and distance should be within ~10 cm.
- [ ] **Direction check:** if B's arrow points the mirror-image way (A is to your left, arrow points right), the azimuth sign needs flipping. Mark it: `UWB arrow mirrored`.
- [ ] Turn so A is behind B: UWB direction should drop (no `bearing` in the UWB row), distance should stay.
- [ ] Mark the distance where UWB starts and stops working.

### 2d. Spin to scan
- [ ] Stand 10 m from A. In the debug panel tap **solo** on `Scan` (so only the scan gives direction).
- [ ] Press **Scan**, hold B flat on your chest, screen out, turn slowly (~10 s per full turn).
- [ ] Mark the result: `scan: A really at 2 o'clock, arrow said ...`.
- [ ] Repeat 3× at 10 m and 3× at 25 m. Then **all on**.

### 2e. GPS mode (only if the build has a relay server, see README "GPS mode")
- [ ] Walk 150–300 m apart. B should show a red `GPS` arrow pointing roughly at A.
- [ ] Walk towards A; it should hand over to BT/Wi-Fi/UWB as you get close.

On **B**: **■ stop**, then **share last** and send me the CSV.

## 3. Background and battery (1 hour, can overlap with 4)

- [ ] A: live, then **close the app** (swipe away) and **lock the screen**. Put it in a pocket.
- [ ] B: after 2 min, 10 min, 30 min: can B still see A? (`BT scan (looking)` in Technology status shows when it last heard A.)
- [ ] Toggle Bluetooth off and on on A. B should see A again within ~30 s.
- [ ] After 1 hour, note battery % on A (visible all hour) and B. Mark it in a recording.

## 3b. Venue map: the saved map, the venue view, upstairs/downstairs

Nothing in this section has run on a real phone yet (it was built where no phone or map could
be run), so expect the first pass to find things. What was decided and why:
[VENUE_MAP.md](VENUE_MAP.md).

You need: two phones, **A** and **B**. For part D both need UWB. For part E both need a
pressure sensor (most Pixels and Galaxy S phones have one): Debug → Technology status →
`Floors` says `this phone has no pressure sensor` if it hasn't. And a building with stairs.

### A. The map saves itself (at home, 10 min)
- [ ] On mobile data (not Wi-Fi), B: **Add** → **Plan a gig** → tap a real gig in the search,
  ideally at a venue within a kilometre or two of where you are. (No search box in your build?
  Type it in, as in the last step of this part.) The crew card should say "Saving the venue
  map… 40%" and then "Venue map saved for offline ✓", usually in well under a minute.
- [ ] **Write down the size:** Debug → Technology status → `Venue map` says
  `saved <position>: N tiles, X KB`. Expected: 15–35 tiles, 2,000–4,500 KB. This number is
  the one estimate in the design that could only be guessed; tell me what you get for two or
  three different venues (a city-centre one will be the biggest).
- [ ] A: join with the invite. A's crew card should show the same line by itself.
- [ ] Interrupt it: start a crew for a gig in another city, and switch on airplane mode while
  the line still shows a percentage. It should change to "Venue map: waiting for a connection".
  Airplane mode off: it should carry on within a minute and finish.
- [ ] **The proof.** Airplane mode on. Open **Map** (with a venue near you, you're already
  inside the saved area; otherwise drag to the venue): streets, street names and the venue's
  building should all be there, in each look (tap **Bright** / **Night** / **Dark**). Zoom
  right in, and out until the venue's suburb fills the screen. Screenshot anything blank, any
  missing names, any look that doesn't load.
- [ ] Still in airplane mode, drag a few kilometres away from the venue: the map should run
  out (blank or blurry). That's right: only 2 km each way is saved.
- [ ] Airplane mode off, close the map and open it again: back to the normal online one (some
  names in bold or italics again is the giveaway).
- [ ] A gig typed in by hand: **Plan a gig** → **Who's playing**, and under **Where** a real
  venue with its city (e.g. "Spark Arena, Auckland") → **Start the crew**. The button should say
  "Finding the venue…" for a moment, then the card should save a map as above. Check on the map
  that it found the right place. Then try a made-up venue ("Dave's shed"): the card should say
  "Venue map saves when you get there" (or, on the gig's own day, it saves the area around you).
- [ ] Storage: Android Settings → Apps → Moshpoint → Storage, before and after saving three
  venues. Expect about 5 MB for the first and 2–4 MB for each one after.

### B. No venue: "when you get there" (10 min, anywhere outdoors)
- [ ] B: a quick crew for tonight with no venue (**Add** → **Start a crew + show QR**),
  outdoors with a GPS fix. Within a minute or two the card should go from "Venue map saves
  when you get there" to saving, then saved: the 2 km around where you're standing.
- [ ] Mark it in a recording if it saves while you're in a moving car or bus (it shouldn't).

### C. The map opens on the venue (at the venue, gig day)
The rule: it's the gig's day (from 3 hours before the start), and **your** phone is within
400 m of the venue.
- [ ] At home on gig day, or at the venue on another day: **Map** opens as it always has
  (everyone fitted on screen).
- [ ] At the venue, within 3 hours of the start: **Map** opens zoomed into the venue, about one
  block across, with you on it. A mate who is still at home is off screen; **All** brings
  everyone back.
- [ ] Walk 600 m away, close the map and open it again: back to the ordinary view.
- [ ] Leave the map open and walk around: it must never move by itself.
- [ ] Mark anything wrong: `map opened on the venue at home`, `venue view too wide`,
  `venue view centred on the wrong building`.

### D. Mates placed by UWB (both phones UWB; open space first, then indoors)
- [ ] At the venue (wherever part C works), A goes live. B opens **Map** and holds the phone up,
  pointing at A from 5–15 m. Within a few seconds A's face should jump from their GPS spot to
  a spot measured from yours. The list under the map shows the measured distance (`6 m`).
- [ ] **Which way:** is A drawn on the correct side of you? Stand so A is due north of you
  (use the street grid): A's face should be straight up the map from your dot. Mark it:
  `UWB map: A really north, drawn east`. If it's mirrored left-to-right, say so; that is one
  sign to flip.
- [ ] Turn your back on A: the face goes back to the GPS spot after about 10 seconds (UWB only
  sees in front of the phone). Correct, but tell me if it feels wrong in use.
- [ ] Walk around A in a circle, phone pointed at them: their face should stay put on the
  map while your dot moves round it. If instead A's face swings about, the compass is the
  problem: note where you were (near a stage, steel barriers, a car).
- [ ] With A on Bluetooth only (another phone with no UWB): no face is drawn for them at the
  venue, and the list says how close ("Close · …"). That's deliberate: we don't know which way.

### E. Upstairs / downstairs (both phones with a pressure sensor, a building with stairs)
B records throughout (**● record**), and you **mark…** every time someone changes floor:
`A upstairs now`, `both ground floor`. The recording keeps both phones' pressure, which is
what the thresholds get tuned from.
- [ ] Both live, stand together for 30 seconds, phones within a metre. Debug → the log should
  say `Floors: calibrated with A by UWB` (or `by Bluetooth`), and Technology status → `Floors`
  shows something like `1013.20 hPa, A +0.1 m ±0.4`.
- [ ] A goes up one full storey. Within about half a minute B should show **↑ Upstairs** on
  A's face: in the finder (on the arrow, the crew radar and the strip) and on the map. `Floors`
  should read about `+3 m`. A's own phone should show B as **↓ Downstairs**. Mark how long it took.
- [ ] A comes back down: the tag goes within about half a minute.
- [ ] Half a flight, a mezzanine, a few steps up to a stage or a tiered stand: there should
  be **no** tag. Mark each one with the real height if you can guess it.
- [ ] A upstairs directly above B, under 3 m apart in a straight line: the finder must **not**
  show "You found them".
- [ ] A lift or a long staircase, 3 or more floors: still one tag (we only say up or down).
- [ ] **Drift, the important one.** After calibrating, stay on the same floor as each other
  but apart (different rooms) for as long as you can: an hour or more, ideally a whole gig.
  The `Floors` row should stay near `0 m` the whole time. Mark the reading every 20–30 minutes
  (`same floor, Floors says +0.6`). A false tag while you're on the same floor is the failure
  that matters most: mark the time.
- [ ] Doors and weather: mark when a big door opens next to one phone, when the air
  conditioning kicks in, when one of you steps outside.
- [ ] A phone with no pressure sensor in the crew: nobody sees a tag for it and it shows
  none, and nothing else changes.
- [ ] Out of Bluetooth range (only with a build that has our own relay server): the tag
  should still appear, later (up to a minute).

### F. Afterwards
- [ ] Four days after the gig, open the app: Android Settings → Apps → Moshpoint → Storage
  should have gone back down (the saved map is deleted 3 days after the gig ends).
- [ ] If you ever used the old **Save this area** button: a week after installing this
  build its 18 MB downloads are removed too.

### What to send back for this part
- The `Venue map` size line for each venue you saved, and how long saving took.
- Screenshots of the map in airplane mode, in each look.
- A recording (**share last**) that covers a floor change and a long stretch on the same floor,
  with your marks.
- For part D: which way A really was, and where the map drew them.

## 4. Crowds (the real test)

At a gig, a busy bar, a crowded street, a sports game. Anywhere packed with people.

- [ ] B recording, A visible somewhere in the crowd, ideally 20–50 m away.
- [ ] Can B find A using only the app? How long did it take? Mark the start and when you found them.
- [ ] Mark what was in the way: `through the crowd`, `A behind the bar`, `upstairs`.
- [ ] Try spin-to-scan in the crowd (bodies all around change the signal a lot).
- [ ] If mobile data drops: does `Crowd relay` in Technology status show packets heard? (It only helps once lots of people use the app, but it shouldn't break anything.)

## 5. What to send back

- The CSV recordings (debug panel → **share last**; older ones are in the share list too).
- Screenshots of anything odd, especially the debug panel at that moment.
- Which phones (make/model) were A and B.
- Quick notes: what felt good, what felt wrong, what was confusing.

## Known limits going in

- GPS mode only works if the app was built with a relay server address.
- The venue map's numbers are first guesses: the size of a saved map, what height counts as a
  floor (2.5 m), how fast a calibration goes stale (0.3 m an hour), and how close counts as
  "together" for calibrating (2 m by UWB, 1.5 m by Bluetooth).
- Upstairs/downstairs between phones out of Bluetooth range needs our own relay server.
- Friend photos are set by you on your phone; they don't sync between phones yet.
- The crowd relay needs lots of Moshpoint users nearby to help at all.
- The Bluetooth IDs and all the distance constants are first guesses until this test.
