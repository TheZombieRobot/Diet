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
- [ ] Not live, phone in your pocket for ten minutes, at the venue: open **Map**. It may open
  on the ordinary view and move to the venue a few seconds later, once the phone has found
  itself. That one move is intended; note how long it took.
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

## 4b. Messages without signal (two phones, 20 min)

Crew messages should still get through with no internet at all, by hopping between crew
phones over Bluetooth, and go to the rest of the crew as soon as one phone has signal again.
How it works and why: `docs/BLUETOOTH_BACKUP.md`. This can be done at home or in the park;
do it again in a real dead spot (a basement bar, a packed venue) when you get the chance.

Set up, on both phones:

- [ ] Same crew, both **Go live**, crew chat open. Both on a test build from the same CI run.
- [ ] Debug → Technology status shows `Messages (Bluetooth): on`. If it says the phone can't
  carry messages, that phone has no Bluetooth 5 extended adverts: note the model and stop here.
- [ ] Settings → TESTING: **Force no internet** is off. Scroll to **Message routes**: this is
  the log to screenshot at the end. Each line is a message (first six characters of its id,
  the same on both phones) and what happened to it.

### The two-phone test: airplane mode with Bluetooth on

- [ ] On **both** phones: airplane mode **on**, then turn **Bluetooth back on** (leave Wi-Fi off).
- [ ] The chat shows an amber note on both: "No signal. Messages are passed to crew phones nearby over Bluetooth…".
- [ ] A sends a chat message. Under it: **Waiting for signal**, then **Sent nearby** once B has
  it (expect 5 to 20 seconds). It appears on B. Mark how long it took.
- [ ] B replies. Same again the other way. The reply sits below the message it answers on both phones.
- [ ] A long message (fill the box, 140 characters): it arrives whole.
- [ ] A taps a quick message (**On my way**): it shows the same states, and arrives on B.
- [ ] B puts the app in the background. A taps **Need help**: B gets the loud alert.
- [ ] A drops a meet-up pin on the map: it shows on B's map and plan card. A taps **Meet at the pin**: B's chat names the pin.
- [ ] Send five messages quickly from A. All five arrive on B, once each, in order (about one every 8 seconds).
- [ ] Walk apart until messages stop arriving. Mark the distance and what's in between. Send two
  more from A (they stay on **Waiting for signal**), walk back: they arrive by themselves within about a minute.
- [ ] While messages are going back and forth, B taps A's name: the arrow and distance still
  update as before (UWB too, if both phones have it). Mark anything that got worse.
- [ ] A: swipe the app away and open it again, still in airplane mode. Messages are still there
  with their states; nothing is sent twice.

Back on signal, one phone at a time:

- [ ] **B**: airplane mode **off**. B's own messages turn to **Sent**. Within about two minutes
  A's messages on A's phone (still in airplane mode, still near B) also turn from **Sent nearby**
  to **Sent**: B uploaded them and told A. B's Message routes show `uploaded for a crew mate`.
- [ ] If you have a third phone **C** in the crew, somewhere else and online: A's messages
  arrive on C now, though A still has no internet.
- [ ] **A**: airplane mode **off**. Everything says **Sent**. A's Message routes show no second
  `uploaded` for the messages B already sent.
- [ ] Screenshot Message routes on both phones.

### Quick version at a desk

- [ ] Instead of airplane mode: Settings → TESTING → **Force no internet** on both phones. The
  phone behaves as if it had no signal; Bluetooth carries on. Switch it off on one phone to
  see that phone upload for the other.

### Removing someone with no signal (needs three phones in one crew)

- [ ] All three in airplane mode with Bluetooth on. A removes C from the crew.
- [ ] A's chat says the crew gets its new key when phones next have signal. Within a couple of
  minutes B's chat says "This crew is getting a new key…".
- [ ] C sends a message: it does **not** show on A or B. C can't read what A and B send either.
- [ ] A and B back on signal: B moves to the new key by itself, and A and B can chat again. C stays out.

### Only the creator removes people (three phones, 10 min, with signal)

A makes a **new** crew (crews made before this build keep the old rule); B and C join it.

- [ ] On B, open C's options in the crew: no "Remove", just "Only the person who made this crew
  can remove people". B's crew QR has no "Reset invite".
- [ ] On A, both are there. A removes C: C's crew stops working for C, and B's chat says A
  removed C. B and A can still chat.
- [ ] A ends the night while B is still in the crew: A is asked "Who looks after the crew now?"
  and picks B. B's chat says A handed the crew to them; B now sees "Remove" and "Reset invite".
- [ ] A friend shares B's crew invite onward and it still works; a hand-edited invite with a
  different creator (ask for a test link) is refused.

### What to send back for this part

- Message routes screenshots from every phone, and the field recording if one was running
  (message lines are in it, marked `msg`).
- Phone models, and for each: did it say `Messages (Bluetooth): on`?
- Time from sending to **Sent nearby**, the distance where it stopped working, and anything
  that arrived twice, out of order, or not at all.
- Battery % before and after, if you kept this going for more than half an hour.

## 4c. On the wrist (Wear OS watch, 45 min)

The watch app puts the arrow, the buzzes and Need help on your wrist while the phone stays in
your pocket. How it works and why: `docs/WATCH.md`. Nothing here has run on a real watch
before this test, so expect surprises and write them down.

Names: **W** = you, wearing the watch, with phone **B** (the looking phone). **A** = your mate's phone.

Set up:

- [ ] Watch app installed (steps at the end of `docs/WATCH.md`). The watch build and phone B's
  build must be from the **same test release**.
- [ ] Phone B: in the same crew as A, **Go live**, battery set to **Unrestricted**. A is live too.
- [ ] Phone B: Settings → **Show debug info** on (you'll want the TESTING switches later), and
  start a field recording as usual.
- [ ] Open Moshpoint on the watch. The crew list should show A with "live" and a distance.
  How long did that take? Note the watch model and its Wear OS version.

### A. True north (open space, A 50–100 m away, phone B in your pocket)

- [ ] Tap A on the watch and hold your wrist flat. An arrow should appear within a few
  seconds. Does it point at A? Mark the truth on phone B's recording.
- [ ] Turn slowly through a full circle. The arrow should stay on A all the way round. (This
  part is the watch's own compass; the phone isn't involved.)
- [ ] Take phone B out, open its finder on A and hold it normally. Do the two arrows agree to
  within about 15°? If they differ by a steady 20° or so, one of them is using magnetic north
  and the other true north: note which is right.
- [ ] If your watch can be worn flipped (buttons on the other side), flip it in its settings.
  If the arrow now points exactly backwards, that's a known risk: note the watch model.
- [ ] Stand next to something steel or a big speaker. How far does the arrow swing? Does
  "Move your wrist in a figure 8" show, and does doing it fix the arrow?

### B. Wrist position

- [ ] Tilt the watch towards your face the way you'd normally read it. The arrow should stay.
- [ ] Keep tilting. Somewhere around 45–50° it should give way to the distance and "Hold your
  wrist flat", and come back a moment after you level out. Too fussy, too loose, or about right?
- [ ] Let your arm hang for five seconds, then raise it. How long until the arrow is live again?

### C. Phone in the pocket (walk towards A)

- [ ] Further than about 20 m: an arrow (from GPS). Walk towards A.
- [ ] Closer than about 20 m the arrow should go, leaving the distance: green and "Keep going
  this way" while it shrinks, pink and "Turn around" while it grows. At what distance did it switch?
- [ ] If both phones have UWB: take phone B out, open its finder and hold it normally. The
  watch arrow should come back and agree with the phone's. Put the phone away: it goes again
  within a couple of seconds.
- [ ] Mark any moment the watch showed an arrow that was plainly wrong. The whole design is
  meant never to do that.

### D. Buzzes (don't look at the watch; somewhere loud is ideal)

- [ ] Walking towards A: single ticks that get quicker. Can you feel the difference between
  about 100 m, 30 m and 5 m?
- [ ] Wrist flat, turn to face A: two quick ticks, once. Turn well away and back: again.
- [ ] Walk away from A: one long buzz, again every six seconds or so while you keep going. The ticks stop.
- [ ] Reach A (under 3 m): short, short, long. The watch says "You found A" and the finding
  stops by itself, on the watch and on the phone.
- [ ] Could you tell the patterns apart without looking? Which ones got confused? Was it ever
  buzzing so much it was annoying, or so little you thought it had stopped?
- [ ] Put the watch on silent, then Do Not Disturb, then power saving. The buzzes should stop
  each time and the finder should say "Buzzes are off on this watch".

### E. The phone's side, and battery

- [ ] While the watch is finding, phone B shows a notification: "Finding A for your watch" with
  **Stop**. Leave the finder on the watch: the notification should go within about 15 seconds.
- [ ] Find again, then tap **Stop** on the phone's notification. The watch says "Stopped on
  your phone" with **Find again**.
- [ ] Mid-find, turn Bluetooth off on phone B. The watch arrow should dim within a few
  seconds, then two long buzzes and "Phone out of reach" by about ten seconds. Bluetooth back
  on: does it pick up again by itself?
- [ ] Start a find, lower your wrist and leave it. It should end by itself after 15 minutes
  ("Stopped to save battery"). Check the phone's notification has gone too.
- [ ] Battery: watch % and phone % before and after 15 minutes of finding with your wrist up
  about half the time.
- [ ] Battery when idle: a day with the watch app installed but not opened. Is Moshpoint's
  share of the phone's battery any different from before? (Phone Settings → Battery.)
- [ ] The hard case: phone B **not** live, Moshpoint swiped away, phone in your pocket. Tap A
  on the watch. Expected: "Open Moshpoint on your phone". If it just works instead, good: note
  the phone model and Android version either way.

### F. Need help and quick messages

- [ ] Crew list → **Need help** → hold. It ticks every half second for two seconds. Let go
  early once: nothing should be sent.
- [ ] Hold all the way. A's phone gets the Need help alert; the watch says "Sent to your crew"
  with one long buzz. How long from letting go to A's alert?
- [ ] Tap **I'm OK now**. A sees "All good".
- [ ] Swipe Moshpoint away on phone B (app closed), then send Need help from the wrist again.
  It must still arrive.
- [ ] The sleepy phone: phone B not live, Moshpoint closed, screen off and untouched in your
  pocket for 20 minutes (long enough for Android to start saving battery). Then Need help from
  the wrist. Did it say "Sent to your crew", or "Not sent yet"? If "Not sent yet", how long
  until it went, and did the wrist change by itself? Note whether Moshpoint's battery setting
  on that phone is Unrestricted.
- [ ] Phone B in airplane mode with Bluetooth turned back on, A standing next to you and
  live: hold Need help. Expected within a few seconds: "Sent nearby", and A's phone alerts.
- [ ] Same, but A far away: "Not sent yet · Waiting for signal" with the stutter buzz. Now
  turn airplane mode off while that screen is still showing. It should change to "Sent to your
  crew" with the long buzz, by itself. Did it? How long did it take?
- [ ] Leave phone B behind (out of Bluetooth range) or switch it off: hold Need help → "Not
  sent · Your phone is out of reach".
- [ ] **On my way** and **All good** from the crew list: A sees each one; the watch flashes "Sent".
- [ ] Free means free. On phone B: Settings → TESTING → **Moshpoint+ (watch app)** off. The
  watch should show its Moshpoint+ screen instead of the crew, and tapping a mate or a quick
  message should do nothing useful. **Need help must still be there and must still arrive on
  A's phone.** Turn Moshpoint+ back on afterwards.

### G. Tile and watch face

- [ ] Add the **Crew status** tile and the **Nearest mate** complication (install steps, step 10).
- [ ] With A live and near: the complication shows A's name and distance, or "1/1"-style
  counts on a small slot. The tile lists the crew with Need help at the bottom.
- [ ] A goes hidden. How long until the tile and the watch face catch up? (The watch face may
  lag a few minutes: it is only redrawn when the phone sends news, and not more than once
  every five minutes.)

### What to send back for this part

- Watch model and Wear OS version; phone B's model and Android version.
- For A to D: where the arrow was wrong and by how much, the distance where the arrow gave
  way to distance-only, and which buzzes you could and couldn't tell apart.
- For E: the battery numbers, and what happened in the "not live, app closed" case.
- For F: the times, and a photo of the watch for anything that wasn't the expected screen.
- Text that runs off the round screen or reads oddly in your language: a photo and the language.

## 4d. "I'm here" (two phones, 30 min)

You long-press your spot on the map and choose **I'm here**: your face moves there on your
crew's maps, radars and finders, with the floor, until you walk away or 20 minutes pass. How it
works and why: `docs/IM_HERE.md`. Best done in a building with two floors and a stairwell (a
mall, a library, the venue itself), with a bit of open ground outside.

Set up: A and B in the same crew, both **Go live**, a field recording running on B. Both
phones' **Debug → Technology status** should show a `Floors` line with a pressure reading, if
the phones have the sensor. Stand side by side for half a minute first, so the floor
calibration happens (as in 3b E).

### With signal

- [ ] A opens the map, long-presses the spot A is standing on, and taps **I'm here** (first in
  the dialog). A sees "Your crew can see where you are", and **You're here** at the top of the
  map's list, with ✕.
- [ ] Within a minute B's map shows A's face on that spot (not on A's GPS dot), with
  "pinned just now" under A's name, and the same in B's list. Mark how long it took.
- [ ] B opens the finder for A from 30 m or more away: the arrow points at the spot; with A
  alone, the chip under it says "Pinned 1 min ago". With the whole crew, A's bubble on the
  radar has a small pink "pinned … ago" pill.
- [ ] **Floors:** A pins a spot upstairs and stays there; B stays downstairs. B's map and finder
  show "↑ Upstairs" on A's face. B walks up to A's floor: the tag goes away. B walks back down:
  it comes back. Mark when each happened.
- [ ] B walks to within about 10 m of A: the finder hands over from the pin to Bluetooth (and
  UWB if both phones have it), as it would for a GPS arrow. With UWB, A's face on B's map moves
  to where UWB puts A.
- [ ] A taps ✕ beside **You're here**: within a minute A's face goes back to A's GPS dot on B's
  map.

### It clears itself

- [ ] **Walking away:** A pins, waits a minute, then walks away briskly. B's map: A's face
  leaves the spot. Mark how far A had walked when it cleared (expected: 30 m and more beyond
  the GPS accuracy, about 40 to 60 m outdoors; more indoors).
- [ ] **Standing still:** A pins indoors and stays put for 20 minutes (chat, dance on the spot).
  It must not clear early. At 20 minutes it clears on its own on both phones.
- [ ] **Changing floor:** A pins upstairs, then takes the stairs down and stays near the spot
  (right under it). It clears within about a minute of reaching the other floor.

### No signal

- [ ] Both phones: airplane mode **on**, then Bluetooth back **on** (as in 4b). A pins:
  B's map shows it within about 20 seconds (by Bluetooth). Message routes on A show the
  `I'm here` message going on air; on B, `in by Bluetooth`.
- [ ] A walks away until it clears: B gets the clear the same way. Then A pins again from
  out of Bluetooth range, walks back into range: B gets the new pin.
- [ ] A pins with B out of range and stays out of range for 25 minutes: when they meet, B never
  shows the pin (it ran out).
- [ ] B back on signal first: A's pin reaches the relay through B (B's routes: `uploaded for a
  crew mate`), and a third phone C elsewhere sees it.

### Who sees it

- [ ] A third phone **following from home** (a follow-along invite): it keeps showing A's usual
  dot, never the pin. It has no **I'm here** in its dialog.
- [ ] A phone in a different crew (or an older build in the same crew) shows nothing new and
  nothing odd: no "pinged the crew", no meet-up pin moving.
- [ ] A watch on B (if you have one, as in 4c), B finding A from a pocket: the wrist arrow
  points at the pinned spot.

### What to send back for this part

- B's field recording, screenshots of B's map and finder with A pinned, and Message routes on
  both phones.
- For each "clears itself" test: cleared or not, and when (distance walked, minutes).
- Whether the floor tag was right for the pinned spot, and how long it lasted.

## 4e. Private messages (two phones, a third for one test, 30 min)

Tap a crew mate, **Message Sam**: a one-to-one chat only the two of you can read, over the
internet or, with no signal, over Bluetooth through crew phones nearby. How it works and why:
`docs/PRIVATE_MESSAGES.md`.

Set up: A and B in the same crew, both **Go live**, each in the other's crew tiles on the home
screen. A third phone C in the same crew for the "nobody else" test. **Settings → TESTING →
Message routes** open on the phones you're watching.

### With signal

- [ ] On A's home screen, hold B's face (or tap ⋯): **Message B** is first. Tap it: an empty
  thread with "Private · only you two can read it" and the 🔒 note. Send "hello from A". It shows
  **Sending…**, then the time (sent).
- [ ] Within a minute or two B gets a notification, "A · private", with the text. B's tile for A
  wears a small **1**. Tapping the notification opens the thread; the **1** goes.
- [ ] B replies from the thread; with both threads open, messages arrive within about 20
  seconds (8 with our own server). Mark the times.
- [ ] From the finder: A taps B's tile on the home screen (the finder opens on B): **Message B**
  is under B's name, with B's unread count. It opens the same thread.
- [ ] **Nobody else:** C sees nothing at all: no notification, no thread, no count, and C's
  crew chat has no new line. C's Message routes may list it as `carried for someone else`.
- [ ] **Lock screen:** lock B, set Android to hide sensitive notification content (Settings →
  Notifications → on the lock screen), send from A: B's lock screen says only "Moshpoint ·
  Private message". Unlock: the name and text are there.
- [ ] **Mute:** B opens A's thread, taps **Mute**: the note "Muted on this phone…" shows. A
  sends three messages: they appear in B's thread, but B gets no notification and no count. B
  taps **Unmute**: the next one notifies again. A's phone shows nothing different throughout.

### No signal

- [ ] Both phones: airplane mode **on**, then Bluetooth back **on** (as in 4b). A sends to B:
  A sees **Waiting for signal**, then **Sent nearby** within about 20 seconds; B is shown it (by
  Bluetooth). A's routes: `private …: on air`; B's: `in by Bluetooth`.
- [ ] A sends to B with B out of Bluetooth range: **Waiting for signal**. B walks back into
  range: it arrives, and A's line turns **Sent nearby**.
- [ ] **Through a crew phone:** A and B far apart, C between them, all with no signal. A sends
  to B: C carries it (C is never shown it) and passes it on when it meets B.
- [ ] **First back on signal:** after the test above, C turns airplane mode off first: C
  uploads it (`uploaded for a crew mate`). Then A gets signal: A's line turns **Sent**, and A
  doesn't upload it again (A's routes show no `uploaded` for it).
- [ ] **Not through strangers:** a phone that is in no crew with A or B, between them: nothing
  crosses it (B never gets the message until a crew phone or signal brings it).

### Who and when

- [ ] A phone **following from home** in the same crew: no **Message** option anywhere, and it
  never gets a private message.
- [ ] B is removed from the crew by its creator (with signal): B's thread on A's phone goes, and
  B can't send to A any more (nothing arrives). The thread between A and C stays.
- [ ] **End night** on A: A's private threads go with the crew. They're not in Your gigs.

### What to send back for this part

- Screenshots of a thread on both phones, a notification, the locked-phone notification, and
  Message routes on all three phones during the no-signal tests.
- For each test: worked or not, how long each message took, and anything confusing in the words.

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
- Messages without signal need Bluetooth 5 extended adverts on both phones, and both phones
  live. One phone sends about one message every 8 seconds this way. Chat only hops between
  crew phones; quick messages and the pin also pass through strangers' Moshpoint phones.
  None of the timings have been measured on real phones yet: this test is the first.
- The watch app has never run on a real watch. Its tilt limits (40° and 50°), buzz timings,
  the 20 m point where a pocketed phone stops giving an arrow, and the 15-minute cap are first
  guesses. Finding from the pocket needs the phone live (or its app open) on Android 14 and newer.
- "I'm here" has never run on a phone. Its numbers are first guesses: 20 minutes, walking away
  = 30 m beyond the GPS accuracy after 10 s of footsteps, a floor change = 0.3 hPa, and the
  weather allowance for the pinned spot's floor (3 m an hour). Its walk-away check only runs
  while the app is open or you're live.
- Private messages have never run on a phone. Each is two Bluetooth packets (about 11 seconds on
  air), only crew phones carry them, and a crew mate on an older build never sees them.
