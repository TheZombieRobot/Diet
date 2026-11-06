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
- [ ] Open the app on both and allow **every** permission. If a red "Moshpoint still needs" box shows, tap **Allow**.
- [ ] Bluetooth **on**, Wi-Fi **on** (doesn't need to be connected), Location **on**, on both.
- [ ] Battery optimisation: when you switch visibility on, accept the prompt and set Moshpoint to "Unrestricted" / "Don't optimise".
- [ ] Type your names at the top. Add each other with **Show my QR** / **Scan their QR** (both ways round).
- [ ] Optional: long-press each other → **Set photo**.
- [ ] Note the battery % on both phones and the time.

Names below: **A** = the phone being found (visible). **B** = the phone looking.

## 1. One phone warm-up (5 min, simulated friend)

On either phone, no second person needed:

- [ ] Friends screen → **Debug: add simulated friend** → tap "Sim 1".
- [ ] The arrow should appear (GPS, red), get closer over ~2 min, fade to the friend's colour, and switch methods as it comes in: debug label `GPS` → `UWB` (or `Wi-Fi`/`BT` on a non-UWB phone).
- [ ] Turn on the spot: the arrow should swivel smoothly and keep pointing the same real-world way.
- [ ] Tap **Debug**. Check the method table updates, and the switch log shows hand-overs.
- [ ] In the debug panel, set the simulator to **UWB ✗** and **restart walk**: should fall back to Wi-Fi/BT distance with no arrow when close. Press **Scan**, turn a full circle: the ring should fill, the phone buzzes, and an arrow appears.
- [ ] Try **data ✗**: far away readings should come from `crowd` instead of `GPS`.

Anything wrong here is a UI/logic bug, not a radio problem: screenshot it.

## 2. Two phones, open space (30 min)

Somewhere open: a park or field. On **B**: Debug → **● record**.

- [ ] A: switch on **Visible to my mates**. A notification should appear on A.
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

- [ ] A: visible on, then **close the app** (swipe away) and **lock the screen**. Put it in a pocket.
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
