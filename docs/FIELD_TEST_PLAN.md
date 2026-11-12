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

### What to send back for this part

- Message routes screenshots from every phone, and the field recording if one was running
  (message lines are in it, marked `msg`).
- Phone models, and for each: did it say `Messages (Bluetooth): on`?
- Time from sending to **Sent nearby**, the distance where it stopped working, and anything
  that arrived twice, out of order, or not at all.
- Battery % before and after, if you kept this going for more than half an hour.

## 5. What to send back

- The CSV recordings (debug panel → **share last**; older ones are in the share list too).
- Screenshots of anything odd, especially the debug panel at that moment.
- Which phones (make/model) were A and B.
- Quick notes: what felt good, what felt wrong, what was confusing.

## Known limits going in

- GPS mode only works if the app was built with a relay server address.
- Friend photos are set by you on your phone; they don't sync between phones yet.
- The crowd relay needs lots of Moshpoint users nearby to help at all.
- The Bluetooth IDs and all the distance constants are first guesses until this test.
- Messages without signal need Bluetooth 5 extended adverts on both phones, and both phones
  live. One phone sends about one message every 8 seconds this way. Chat only hops between
  crew phones; quick messages and the pin also pass through strangers' Moshpoint phones.
  None of the timings have been measured on real phones yet: this test is the first.
