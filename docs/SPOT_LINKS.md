# Texted spots open in Moshpoint, and five follow-ups

The owner's decisions of 19 November 2026, relayed by the session that started this one (all
six to do, in this order, each green in CI before the next). Branch: `claude/spot-links` (from
`ccr-5839ed7c-1q0ztj` at dad5a3f). Background: [REMOVE_SAFETY.md](REMOVE_SAFETY.md) (its
handover planned stage 5 part 2 and asked the open questions answered here).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 19 November
2026._

- **Item 1 (texted spots open in Moshpoint): done, green in CI:** run 355 (aaaf854), then run
  356 (856d390) with the place-row fix below; run 354 failed on the build script (see
  Decisions). Screenshots against dad5a3f's sets, by blob hash, after run 356: phone 2,215
  identical, none changed or gone, 105 new (the five `SpotSnapshotTest` shots of item 1 in 21
  languages); watch 546 identical. Reviewed in en, de, ar (right to left), ja, small phone and
  large font. Run 355's German small phone with large text showed Sam's spot as a column one
  letter wide beside Walk, Find and ✕; the map list's place rows now put their buttons on a
  line of their own under the text when the text's longest word wouldn't fit beside them
  (`ListRow` in `MapScreen.kt`). Run 356 changed only that shot, in 11 languages (de, en,
  en-rUS, es, es-rES, fr, in, it, nl, pl, pt), all readable now; the existing `mapScreen` shots
  stayed identical, so side by side is exactly as before wherever it fits.
- **Item 2 ("Heading home 🏠" as a plain quick ping): done, green in CI** (run 357, 12540f0).
  Screenshots against dad5a3f's sets: `textMySpot` and `smallPhoneLargeFontTextMySpot` changed
  in all 21 languages (the ping row scrolled to its end: Heading home now before Text my spot),
  nothing else; watch identical. Reviewed in en, de, ar (right to left), ja, small phone and
  large font: the chip reads in full, cyan like the other pings. Crew chat and Message crew
  shots that show the row from its start didn't change (the sixth chip is off screen there).
- **Item 3 (an older build's check-in reads as "<name> is heading home"): built, pushed for
  CI.** Core tests green locally (654; server 108), translations (both checks) and secrets pass.
- **Exact next step:** read item 3's run. No screenshot should change: no screenshot test shows
  an older build's check-in, and the strings removed were used only for it. Then push item 4.
  Items 4 to 6 are committed locally, one commit each, on top of item 3 (core 658, server 108
  with all of them); each goes up after the one before is green.
- **Last green run:** 357 (12540f0, item 2). Baseline for screenshot comparisons: dad5a3f's
  `ui-screenshots` and `ui-screenshots-watch`.

### The six items

1. Texted spots open in Moshpoint (stage 5 part 2). **Done: green in runs 355 and 356.**
2. "Heading home 🏠" back as a plain quick ping. **Done: green in run 357.**
3. An older build's check-in shown as "<name> is heading home". **Built; CI pending.**
4. Crew chat read over satellite. Built (local commit).
5. Text my spot and satellite in "What's in Moshpoint+". Built (local commit).
6. `WatchPings.followUp`: removed, as only Need help used it. Built (local commit).

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

## Decisions (with reasons)

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
3. **The App Link's manifest hasn't been built with a relay yet.** CI builds with the
   repository variable `MOSHPOINT_SERVER`, which is empty here, so its merged-manifest report
   (run 355) shows no `SpotLinkActivity`: the no-relay case, as intended. The first build with a
   relay should show `SpotLinkActivity` with the `https://<relay host>/spot` filter in its merged
   manifest (`aapt2 dump xmltree --file AndroidManifest.xml`, or Android Studio's Merged Manifest
   tab); field test 4o checks the link opens the app.
4. **The map's top bar on a small phone with large text** can squeeze its own title to nothing
   (seen in Polish in `smallPhoneLargeFontTextedSpotMap`: Pinezka, Wszyscy and Ja take the
   width). It was like that before these items (no earlier test drew that case) and isn't
   changed here; fix it the same way as the place rows?
