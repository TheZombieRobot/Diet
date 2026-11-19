# Texted spots open in Moshpoint, and five follow-ups

The owner's decisions of 19 November 2026, relayed by the session that started this one (all
six to do, in this order, each green in CI before the next). Branch: `claude/spot-links` (from
`ccr-5839ed7c-1q0ztj` at dad5a3f). Background: [REMOVE_SAFETY.md](REMOVE_SAFETY.md) (its
handover planned stage 5 part 2 and asked the open questions answered here).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 19 November
2026, 04:35 UTC._

- **All six items are done, each green in CI before the next:** item 1 in runs 355 and 356
  (aaaf854, 856d390), item 2 in 357 (12540f0), item 3 in 358 (9db9044, on a second attempt
  after an unrelated flaky server test, open question 5), item 4 in 359 (b39bc3d), item 5 in
  360 (9a9e279), item 6 in 361 (9825008).
- **Screenshots, the whole branch against dad5a3f's sets, by blob hash:** phone 2,151
  identical, none gone; 105 new, item 1's (`textedSpotMap`, `smallPhoneLargeFontTextedSpotMap`,
  `textedSpotFinder`, `smallPhoneLargeFontTextedSpotFinder`, `textedSpotFinderWaiting`, each in
  21 languages); 64 changed: `textMySpot` and `smallPhoneLargeFontTextMySpot` in 21 languages
  (item 2: Heading home in the ping row), `plusInfo` in 21 and `smallPhoneLargeFontPlusInfo` in
  Arabic only (item 5: the two new rows). Watch: 546 identical. Every other screen is
  unchanged, the map screen's own shots included.
- **Exact next step:** nothing left of the six. For the owner: the open questions below (2 and
  3 before a build with a relay ships), and the field tests for these items (FIELD_TEST_PLAN
  4f A, 4m, 4n, 4o, 4p, and 4k B step 4).
- **Last green run:** 361 (9825008, item 6). The branch head after it is this handover
  ([skip ci]). Baseline for screenshot comparisons: dad5a3f's `ui-screenshots` and
  `ui-screenshots-watch`.

### The six items

1. Texted spots open in Moshpoint (stage 5 part 2). **Done: green in runs 355 and 356.**
2. "Heading home 🏠" back as a plain quick ping. **Done: green in run 357.**
3. An older build's check-in shown as "<name> is heading home". **Done: green in run 358.**
4. Crew chat read over satellite. **Done: green in run 359.**
5. Text my spot and satellite in "What's in Moshpoint+". **Done: green in run 360.**
6. `WatchPings.followUp`: removed, as only Need help used it. **Done: green in run 361.**

### Item 1: what was built

- **Core:** `SpotText.message(…, server, name)`: with a relay of our own, the text's link is
  `SpotLink.build` (our link, the sender's first name after the spot); with none, the Google
  Maps link as before; the plain coordinates either way (`SpotTextTest`). `SpotLink.keep`: the
  texted spots kept on the phone (the same spot once, the newest 20). `PlaceRule` (`Place.kt`)
  and `Method.PLACE`: the finder's reading for a place from our own GPS fix (bearing, distance,
  a GPS confidence with the spot's own 10 m slack, stamped with the fix's time so it ages with
  it), with `PlaceRuleTest` (6 tests: the arrow turns with the compass, rough close up, ages with
  our fix, only real places, a mate's methods never touch it).
- **Finder module:** `PlaceFinder` and `FinderPlace`: GPS and compass only, through a
  `MethodArbiter` of its own, true north with the declination, the distance steadied as for a
  mate. `LocatorEngine` is untouched.
- **App:**
  - `TextMySpot.message` passes `BuildConfig.MOSHPOINT_SERVER` and the user's name.
  - The App Link: `SpotLinkActivity` (root package, a trampoline like `ShareInviteActivity`)
    with an `android:autoVerify="true"` filter for `https://<relay host>/spot`, in
    `app/src/spotLinks/AndroidManifest.xml`. `app/build.gradle.kts` works out the host from the
    build's server (a plain https address, the same test `SpotLink` makes), puts it in the
    `spotLinkHost` manifest placeholder, and adds that manifest to every variant with AGP's
    `variant.sources.manifests.addStaticManifestFile` only when there is one. No server: the
    activity and its filter are not in the manifest at all.
  - Opening: `MapState.openSpotLink` parses the link again (any app can start MainActivity
    with the extra), keeps it as a saved place (`Spots.addTexted`, stored with `"x": true`; your
    own spots are saved exactly as before) and opens the map looking at it and at you
    (`MapState.openMapOn`, `MapScreen(focusOn, focusKey)`). A link that doesn't parse: a toast,
    "Moshpoint can't read a spot from this link.", and nothing else.
  - The map: the texted spot is drawn with the meet-up pin (`placeBitmap(true)`), labelled with
    the sender's name or "Texted spot". In the list: the pink mark, "Texted spot" under a name,
    and **Find** where your own spots have Ride (Walk and ✕ as for any place).
  - The finder: `FinderState.findPlace` (from the map's Find) starts the `PlaceFinder`, stops
    the mate engine and Light me up, and the finder shows `PlaceFinderScreen`, a screen of its
    own made of the finder's pieces: the arrow with the meet-up pin at its tip
    (`Arrows(places = …)`), the distance, Locked/Rough with the GPS wording, "Waiting for GPS…"
    before a fix, "Show on map". Every way into the finder for mates now goes through
    `FinderState.lookFor`, which lets a place go first.
  - Strings: `strings_spot.xml`, 4 new (`spot_link_texted`, `spot_link_broken`,
    `spot_finder_waiting`, `spot_finder_waiting_help`), in all 20 languages.
  - Screenshot tests (`SpotSnapshotTest`, 21 languages): `textedSpotMap`,
    `smallPhoneLargeFontTextedSpotMap`, `textedSpotFinder`, `smallPhoneLargeFontTextedSpotFinder`,
    `textedSpotFinderWaiting`.
- **Docs:** FEATURES, ROADMAP, RELAY_API (section 13, the app's side), FIELD_TEST_PLAN (4o),
  PRIVACY, ARCHITECTURE, CODE_STRUCTURE, FINDER_MODULE.

### Item 2: what was built

- **The chip:** "Heading home" is back in the ping row (`PingBar`), after All good and before
  Text my spot, a plain cyan ping like the others: it turns into "Sent ✓" and nothing follows.
  It sends kind 6 (`GigGroup.Ping.GOING_HOME`), which every build shows as "Heading home 🏠" with
  the ordinary crew notification. The label is build 312's own `home_ping_heading_home`, restored
  in all 20 languages with its reviewed translations.
- **The proof** (`OlderBuildsTest`, 4 tests): a "Heading home" sealed by the code at 75fe2fb opens
  here with every field; this build seals it in the same layout, field for field; this build
  treats it exactly like On my way; and build 312's own rules, frozen in the test, show it as a
  quick ping and never give it to its check-in tracker.
- **How build 312 was checked:** its core (75fe2fb, unchanged) was compiled and run on pings this
  build sealed. Kind 6: opened, QUICK, shown, the ordinary notification while fresh, carried two
  hours, and its `CheckIns.onPing` returned false (no deadline, nobody overdue six hours later).
  Kind 8 (Check in): SAFETY, taken by `CheckIns`, the sender called overdue after its 45 minutes.
  A new number (15): UNKNOWN, not shown at all. Its app does the same: `GroupSync.onPing` feeds
  every ping to `CheckIns.onPing`, which returns at once for anything but 8 and 9; kind 6 goes to
  the chat as "Heading home 🏠" and to the ordinary crew channel (only Need help used the urgent
  one).

### Item 3: what was built

- **Core:** `PingPolicy.shownAs(kind)`: an older build's Check in (8) is shown as Heading home
  (6); every other kind as itself. `OlderBuildsTest.anOlderBuildsCheckInIsShownAsHeadingHome`
  opens build 312's own check-in (45 minutes) and checks it.
- **App:** every place that words a ping goes through it: the notification title
  (`GroupSync.pingTitle`: "Jo is heading home"), the crew card's line (`pingText`: "is heading
  home"), the chat bubble (`CrewChatUi.quickLine`: "Heading home 🏠") and `CrewChat.quickText`.
  The three strings only the check-in used (`crew_quick_check_in`, `crew_ping_check_in`,
  `crew_ping_title_check_in`) are removed from all 20 folders; no new wording was needed.
- **Unchanged:** the message itself. It's still kept, carried and passed on as it came (its
  minutes included), handled as an ordinary ping (`PingPolicy.Group.OLDER_BUILDS`).

### Item 4: what was built

- **Core:** `SatelliteRule.chatInBatch` (over satellite, for a member who switched it on: the chat
  is read in the batch; any other network: never) and `SatelliteRule.chatCrews` (when the chat
  doesn't fit in the batch's 150 reads: tonight's crew first, the others in turn, never half a
  crew). `SatelliteRuleTest`, 4 new tests (13 in all), including that the chat's own poll never
  goes over satellite and the batch at most every two minutes.
- **App:**
  - `ChatSync`: the poll split into `mailboxes` (which ids, in order) and `read` (what to do with
    the answer), unchanged; `satelliteMailboxes` (over satellite only) and `readFromBatch` use
    the same two.
  - `RelayClient.syncWithChat`: the crew sync's batch with `GET_HELD` ops for those mailboxes
    after its own `GET_BOX` ops, from the chat's cursors (`HeldMirror`, under the same lock as
    `/v1/heldsince`), so the next normal poll carries on from where the batch left off. A chat
    mailbox that answers MORE gets the rest in the next batch. If any chat mailbox couldn't be
    read, none of the chat is used that time.
  - `GroupSync.syncServer`: over satellite it asks `ChatSync` for the mailboxes and uses
    `syncWithChat`; on any other network it calls the chat poll and `sync` exactly as before.
- **Docs:** FEATURES, ROADMAP, RELAY_API (section 11), FIELD_TEST_PLAN 4n.

### Item 5: what was built

- **"What's in Moshpoint+"** (`PlusInfoContent` in `ui/home/PlanGig.kt`) gets two rows after the
  watch: **Text my spot** (the chat icon) and **Use satellite when there's no signal** (a new
  `HomeIcons.Satellite`, drawn in the same line style). Their titles are the features' own names
  (`spot_text`, `satellite_data`), so the page says exactly what Settings says; the two lines under
  them are new (`plus_info_spot_text`, `plus_info_satellite_text`), in all 20 languages, using each
  language's own words for crew and mates.
- **Docs:** FEATURES (Plan a gig), ROADMAP, FIELD_TEST_PLAN (Plan a gig, step 4), DISCOVER_APP.

### Item 6: what was done

- **`WatchPings.followUp` removed,** with what only it used: `Taken.following`, the coroutine
  scope, `FOLLOW_FOR_MS` and its call to `WatchSync.start` (which it needed to see Compose state
  with no screen up). The phone now answers each wrist ping once per try, as the watch's quick
  pings have always used it. `PingOutcome.improvesOn` stays: `WatchPings.note` uses it so a
  retry's answer never goes backwards (sent, then "not sent yet").
- **Docs:** WATCH.md (problem 8: one answer per try), REMOVE_SAFETY.md (its open questions,
  each marked with the item that answered it).

## Decisions (with reasons)

### Item 6

- **Removed, because only Need help used it.** On the watch, only Need help's screen
  (`SosActivity.onLater`, removed with it) ever listened for a later answer: in build 312
  (75fe2fb) and in this build, `Pings.send` takes the first answer for its request and stops
  listening, and `FindSession` ignores ping answers. An older watch's Need help can't start a
  follow-up either: this phone refuses that kind before taking it. So the later messages went
  to no one.

### Item 5

- **The features' own names as titles:** a member then finds them in Settings under the same
  words. Only the descriptions are new.
- **Text my spot's line mentions the free receiving end** ("Mates with Moshpoint get an arrow to
  it"), since that's what makes it worth sending; still no price and no Upgrade button.

### Item 4

- **In the crew sync's batch, not a batch of its own:** over satellite a batch goes at most every
  two minutes, so a second one for the chat would halve how often each goes. One exchange
  carries the crew's messages both ways.
- **The same cursors** as the chat's own poll (`/v1/heldsince`), so nothing is read twice when
  normal signal comes back.
- **Everything the chat poll reads, as text:** each crew's chat mailbox and private mailbox (and
  a rekeyed crew's old ones for a day). Photos and clips are files of their own and never go
  over satellite.
- **Reads only:** the chat poll's periodic re-posts (the pinned plan, history copies, "joined")
  don't run over satellite; what the crew writes still goes up in the batch.
- **All or nothing per batch:** the courier is only told about mailboxes really read, so a
  failed read can't make it think a message is missing from the relay.

### Item 3

- **Build 312's own words for Heading home,** already in all 20 languages, rather than new
  wording ("Heading home 🏠 (30 min)" was the other option in REMOVE_SAFETY.md): the minutes
  promised a check-in that nobody waits for any more.
- **One rule in core** (`shownAs`), so the bubble, the card and the notification can't disagree.

### Item 2

- **Kind 6, not 8 or a new number.** Build 312 shows 6 as a plain ping in its own words; 8 would
  start its overdue timer and alarm; a new number would never show there at all. 6 is also what
  build 312 itself sent for Heading home without a timer ("Just tell them"), so nothing on the
  wire changes.
- **Cyan, in the row, no dialog:** it's a ping like the others now, so it looks and behaves like
  them. Text my spot stays last (violet: it leaves the app).

### Item 1

- **No server, no filter, literally.** The App Link lives in its own manifest that's added to the
  build only with a relay. A disabled `<activity-alias>` (the plan in REMOVE_SAFETY.md) would
  still be in the manifest with a made-up host, and Android may try to verify it.
- **A trampoline activity,** as for shared invites: the link opens Moshpoint in its own task
  rather than inside the texting app, and only a link that parses is handed on. MainActivity
  parses it again, because any app can start MainActivity with the extra.
- **The place finder is separate from the mate finder.** A place can't be heard by any radio, so
  `PlaceFinder` uses GPS and the compass only: no Bluetooth scan, UWB or Wi-Fi Aware, and no
  "I'm looking" advert (which would make mates' phones speed up their adverts for nothing).
  `LocatorEngine` and the mate finder screens are unchanged; the finder module still knows
  nothing about gigs (`FinderPlace` is an id, a name and two numbers).
- **The same arrow rules as a mate's GPS arrow,** through `MethodArbiter`: rough when our GPS
  error is as big as the gap, gone when our fix is too old. `Method.PLACE` scores like an "I'm
  here" pin (0.65, 40 s).
- **`Method.PLACE` has watch wire number 9,** following HERE_PIN's 8 (the protocol test wants a
  number per method). The watch only ever asks for mates, so it's never sent; an older watch
  would read it as "no method", which it uses for display only.
- **Find only on texted spots,** as decided. The place finder would work for your own spots and
  the meet-up pin too (open question 1).
- **Texted spots are saved places,** kept until removed, so the arrow works later with no data.
  The same spot opened again is kept once; at most 20, the oldest go first, so links can't fill
  the phone.
- **The build script imports `URI` and `Locale`.** In a Gradle Kotlin script, `java.` at the
  top level is the project's `java` extension, so `java.net.URI(…)` didn't compile (run 354).
- **Place rows wrap their buttons only when they must.** Side by side is unchanged for every
  phone where the text's longest word fits next to the buttons; below that (German, small
  phone, large text) the buttons go under the text at the row's end, so a name is never a
  one-letter column.
- **The link is untrusted:** strict parsing in core (our host, `https`, `/spot`, no query, plain
  decimals in range, not 0,0, a name of letters, digits, spaces, `'` and `-` only, at most 24),
  shown only as plain text, and opening it does nothing but save and show the spot.

## Open questions

1. **Find for your own spots and the meet-up pin?** The place finder works for any place; only
   texted spots have Find, as decided. Adding it elsewhere changes the map list for those rows.
2. **The relay must be deployed with `/spot` and `/.well-known/assetlinks.json` before a build
   with that relay ships** (owner to-do; an older relay answers 404, though the text's plain
   coordinates still work). Play's signing key's fingerprint goes in `MOSHPOINT_APP_CERTS`.
3. **Answered (docs/LAUNCH_PREP.md, item 3):** CI now merges the release manifest with a made-up
   relay and without one on every push, and checks the activity and its filter are there exactly
   with a relay. The original question: **The App Link's manifest hasn't been built with a relay yet.** CI builds with the
   repository variable `MOSHPOINT_SERVER`, which is empty here, so its merged-manifest report
   (run 355) shows no `SpotLinkActivity`: the no-relay case, as intended. The first build with a
   relay should show `SpotLinkActivity` with the `https://<relay host>/spot` filter in its merged
   manifest (`aapt2 dump xmltree --file AndroidManifest.xml`, or Android Studio's Merged Manifest
   tab); field test 4o checks the link opens the app.
4. **Answered (docs/LAUNCH_PREP.md, item 5):** yes, the place rows' rule; only that screenshot
   changed, in the 8 languages it cut. The original question: **The map's top bar on a small
   phone with large text** can squeeze its own title to nothing
   (seen in Polish in `smallPhoneLargeFontTextedSpotMap`: Pinezka, Wszyscy and Ja take the
   width). It was like that before these items (no earlier test drew that case) and isn't
   changed here; fix it the same way as the place rows?
5. **Answered (docs/LAUNCH_PREP.md, item 4):** the relay now gives each report a later time part
   than the last (`ReportStore.add`), so the list is always in the order they came; the test is
   unchanged. The original question: **A flaky server test:** `ReportTest.aReportIsStoredAndTheOwnerCanListAndDeleteIt` posts two
   reports and expects the newer first, but a report's id is its arrival millisecond and a
   random part (`ReportStore.add`), and the list is sorted by id: two reports in the same
   millisecond come back in either order. It failed once here (run 358's first attempt) with
   nothing changed in the server. Fix in the server's own work: a counter within the
   millisecond in the id, or the test waiting a millisecond between the two.
