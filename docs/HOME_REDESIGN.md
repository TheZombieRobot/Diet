# Home screen redesign: inventory, decisions, audit

The approved design is in `docs/design/home-redesign/` (five artboards; the `.html` files are
the source of truth for sizes). This file is the working record for building it:

1. **Inventory**: every element, state and action on the old home and where it goes. Nothing
   is lost.
2. **Decisions** made while building it.
3. **Audit**: every state, in every language, on a small phone and in a large font.
4. **Status and next steps**: a handover, kept current.

Code: `ui/FriendsScreen.kt` (the screen, its state and dialogs), `ui/HomeSections.kt` (the
sections), `ui/HomeKit.kt` (the new building blocks: glass buttons, button pair, face, icons,
sheets). Strings: `res/values*/strings_home_redesign.xml`.

## 1. Inventory

"Old" is the home before this change (`FriendsScreen.kt`, `HomeSections.kt` at `eac0d5d`).

### Always there

| Old element / action | Where it goes | Notes |
|---|---|---|
| Wordmark "moshpoint" (never shrinks or wraps, LTR in every language) | Header, left | Unbounded 800 26, "point" in pink with a glow. Sized in dp (a logo does not grow with the font size), forced left-to-right, one line. |
| — (new) | Header, right: **Need help** pill | Opens the existing `HelpDialog`. Nothing is sent on that tap. With no crew, a crew asleep until gig day, or while following from home, the dialog leaves out the crew alert and keeps the emergency contact text and the emergency numbers. |
| `LivePill` (Go live / Live / Live · ghost) | **Live row**: "Live" + switch + one explanation line | On: lime switch, "You're visible to your mates". Ghost: violet switch and label, "Ghost mode: off the map, findable up close". Off: grey, "Off: mates can't see you yet". The whole row is one switch for TalkBack (role Switch, with its state). Hidden while following from home (as before). |
| `home_hidden_hint` ("You're hidden from your crew…") | The Live row's off line | Same message, always next to the switch. |
| "One thing first" setup card (permission, then each setup issue, "N more") | Under the Live row, restyled | Same logic and the same one-tap fix; amber glass card, the button under the text so long words never squeeze it. |
| `HomeBar` (Crew, Map, Add, Story, Me) | Bottom bar, restyled to the design | Opaque, so nothing shows through; the list ends above it. Add is the raised gradient "+" (labelled "Add" for TalkBack). Me shows your photo or avatar and opens `SettingsSheet`. |
| `AddSheet` (+) | Same sheet, restyled | Crew QR (start a crew first if needed), Scan a QR / Paste invite, Bump phones, Plan a gig (no crew only), Send the app + invite, friend QR and Enter a code. |
| `SettingsSheet` (Me) | Unchanged | Opened from Me. |
| Manual code dialog ("Add with a code"), scanned-QR confirm | Unchanged | Same `scanned` → fill in → confirm flow. |
| Debug "add simulated friend" (test builds only) | End of the list | Same text, same `BuildConfig.TEST_BUILD && DebugStatus.showUi` guard (CI checks it is not in the release APK). |

### Tonight's crew

| Old element / action | Where it goes | Notes |
|---|---|---|
| Eyebrow TONIGHT / COMING UP / FOLLOWING | Crew header eyebrow | Same strings. |
| Crew name (`groupName`, else "Your crew") | Crew header title, Unbounded 28 | Wraps to 3 lines before it shortens (a long name is the test `homeLongName`). |
| "＋ Invite" button | Crew menu (⋯): **Invite more mates** → crew QR | The QR screen still has "send an invite" for mates who can't scan. |
| — (new) | ⋯ **Crew options** button next to the name | Opens the crew menu sheet. |
| — (new) | Count line "5 in the crew · 3 live" | Plurals. "Live" counted only on a crew that's on tonight. |
| `crewWhen` ("Sat 14 Dec, 8:00 pm · Spark Arena") | Under the count line | Planned gigs. |
| `VenueMapLine` (offline venue map) | Under `crewWhen` | Same rule: in a crew, not following. |
| Start-a-crew naming dialog | Kept | Shown when there is no quick start (`onQuickCrew == null`). |
| `CrewTiles` | **Faces row**, a horizontal strip that runs off the screen edge | Live first, then nearest; then the most recently seen; never-seen last. Live: lime ring + glow, distance in Unbounded lime. Not live: dimmed face, last-seen time (or "not sharing yet", or "phone died" in pink). Low battery (≤ 20 %) as a small line under the status. Flare notes ("🔥 Bar time 🍺") as a small amber line. Private-message unread badge on the face. Tap = find that mate; long-press = options. Rings and glows have room to draw (never clipped). |
| Mate options dialog (message privately when `canMessage`, keep as friend, set / remove photo, remove with confirmation, owner-only removing) | Same dialog, same rules, reached by long-press on any face (crew row, friends strip) and by the ⋯ on each row of the friends list | Unchanged behaviour. |
| `home_tap_mate_hint` | Under the faces row | Says long-press exists. |
| Find everyone / "Find Sam" (one mate) | Big gradient button under the faces | Wraps to two lines (and grows) in a language where it can't fit on one. |
| `CheckInBanner` + "I'm home safe" | Under Find everyone | Restyled (violet glass). |
| `CrewActions` (Chat with unread, falling back to `MessageSheet`; Camera) | **Crew chat** (unread badge) + **Share photos**: two equal glass buttons | Crew chat opens the crew chat, or `MessageSheet` when there is no chat (as before). Share photos = `onShareMoment`. The pair grows to two lines, or stacks, when a language can't fit them side by side. |
| `ChatPill` (crew chat bar + pinned plan) | Crew chat button (above) + **pinned plan line** ("📌 Sound desk after the encore") in the activity block | Tapping the plan opens the crew chat. |
| Meet-up row ("★ Meet-up: Sound desk · Map ›") | **Meet-up line** (pin icon) at the top of the activity block | Tapping it opens the map (as before). |
| `PingFeed` (latest crew alert) | Under the meet-up title, or its own line when there's no meet-up | "Alex is on their way · 2 min ago"; a help alert in pink. Tapping it opens the map. |
| `MomentStrip` (tonight's photos + camera) | **The story** strip (Polaroids) when there are photos tonight, with See all | Tap a photo or See all = open the story (as before). Taking a photo = Share photos. The Story tab is always there too. |
| Followers line ("Family can follow… Share ›" / "Following from home: Mum") | Sharing moves to the crew menu (**Share the night with family**). When someone is following, a small line under the count says who ("Following from home: Mum") | "Nobody is followed without knowing" still holds. |
| End the night / Cancel this crew / Stop following (`onClearGigGroup`) | Crew menu, last row, in pink | Same callback: the night recap first. The recap's "End the night" now goes through the owner handover (as the QR screen's End the night always did): an owner leaving a crew others are still in picks who takes over. |
| Reset invite (was only on the crew QR screen) | Crew menu: **Reset the invite** (owner only, with the same confirmation) | Once-a-night crew action; still on the QR screen too. |

### Crew states

| Old state | New |
|---|---|
| Crew tonight with mates | Main artboard: header, faces, Find everyone, check-in, chat / photos pair, activity block, story strip. |
| Crew nobody has joined yet (`InlineCrewQr`, else "Show crew QR") | Crew header, then the QR right on the screen with "No camera? Send the invite", then the chat / photos pair. |
| Coming up / asleep (`crewSleeping`) | COMING UP header, when, venue map line, the asleep text (violet), faces (dimmed, options on long-press, no find), the QR, Crew chat (full width), activity block. Crew menu: Invite, Share with family, Reset, **Cancel this crew**. |
| Following from home | FOLLOWING header, when, follower text, faces with "at the venue" notes (no find, no options), check-in banner, the last three alerts, **See the story** (primary), Crew chat + **Where are they?** (map). Asleep: "You'll see them here once the gig starts." No Live row; Need help without the crew alert; crew menu: **Stop following** only. |
| No crew ("Find your mates tonight", Invite mates, Plan a gig, Scan / Paste) | **No crew** artboard: "No crew tonight", Start a crew for tonight, Plan a gig row, JOIN A CREW: Scan QR / Paste invite. Then Up next, Memories, Past gigs, Friends. |
| — (new) brand-new user (no crew, friends, past gigs or up next) | **First time** artboard: radar picture, "Find your mates in the crowd", Start a crew, Scan / Paste, "Plan a gig for another night". |

### Below the crew

| Old element / action | Where it goes | Notes |
|---|---|---|
| Up next (`UpNextRow`: name, when, countdown, venue, mates, unread, plan, following) | **Up next** heading + rows with a date tile (weekday and day in the phone's language and calendar style) | Line 2: mates (or "Following from home", or "Invite your mates") · countdown · venue. Line 3: the pinned plan. Unread badge, chevron (mirrored right-to-left). Tap = that crew's chat (as before). No date: a calendar icon in the tile. |
| Memories card ("Remember last year?") | Kept, restyled (amber glass, Polaroid thumbnail) | Tap = open that gig. |
| Your gigs list (`PastGigs`, `onOpenGig`) | **Past gigs** Polaroid strip + **See all** (a sheet with the full list as rows) | Caption in Permanent Marker, date and counts under it. |
| Friends list rows (Find tag, ⋯, tap = find, long-press = options) | **Friends** strip (faces, live ring) + **See all** | Tap = find, long-press = options. See all opens a list where every friend has a visible ⋯ (options, including remove), as the owner asked. |
| Empty friends text | Friends heading + the same text | Not on the first-time screen (empty sections are hidden there). |

## 2. Decisions

- **Faces "live"** = shared a spot in the last 3 minutes and not a dying phone's last spot
  (the old tile went lime at the same 3 minutes).
- **Count line** counts mates (the faces you see), not you.
- **Live switch name**: a new string, because several languages used a "you're sharing" form
  for the old pill (ja, ko, pl, tr, th, vi, zh), which reads wrong next to a switch that is off.
  Texts elsewhere that say "Go live" (nudge, finder help, offline hint) still read correctly
  and were left alone.
- **Need help** reuses the "Need help" ping label (`home_ping_need_help`): it opens the same
  dialog. In languages where it is long it gets smaller to stay on one line, and wraps to two
  lines before it would ever push the wordmark.
- **No crew alert from Need help** when there is no crew, the crew is asleep until gig day, or
  you follow from home. Emergency contact and numbers stay.
- **Story strip** instead of the old moment strip: a section of its own (one section per row),
  only when there are photos tonight.
- **Friends empty text** stays as the Friends section's content, except on the first-time
  screen.
- **One list, not lazy**: the home is a scrolling column (friends are a strip now, so the list
  is short); the tall test renders the same column.
- **The tall "whole home" test** uses its own test class (`HomeTallSnapshotTest`, with every
  language) so it can be saved at full resolution: Paparazzi otherwise shrinks every picture to
  1000 px, which would make a tall screen unreadable.
- **Translations**: `strings_home_redesign.xml` in every folder, from each language's
  vocabulary in `docs/i18n/<lang>.md` (each doc has a new "Home redesign" section with the
  choices and doubts). The Live switch's name is a noun in every language: where "live" reads as
  a livestream the location-sharing word is used (ja 位置シェア, ko 위치 공유, pl Lokalizacja,
  tr Konum, th การแชร์, vi Chia sẻ, zh 上线 / 上線).
- **Strings deleted** (no longer used anywhere, removed from every folder): `home_go_live`,
  `home_live`, `home_live_ghost`, `home_hidden_hint`, `home_tile_with_battery`, `home_chat`,
  `home_chat_unread`, `home_camera`, `home_chat_subtitle`, `home_crew_chat_unread`,
  `home_upnext_invite`, `home_upnext_mates`, `home_find`, `home_find_mates_tonight`,
  `home_find_mates_text`, `home_invite_mates_tonight`, `home_scan_invite`, `home_invite`,
  `home_family_can_follow`, `home_share`, `home_meet_up`, `home_map_link`,
  `home_where_are_they`, `home_up_next`, `home_your_gigs`, `home_friends`, and the old moment
  strip's `find_the_story_eyebrow`, `find_see_it_all`.
- **New colours** are Mosh tokens in `Theme.kt` (glass fill and line, hairline, sheet, bar,
  lilac, scrim, Polaroid paper and ink), not literals.

## 3. Audit

How: CI renders every test in every language and pushes the set to the branch
`ui-screenshots-claude-home-redesign` (one folder per language). Each picture was looked at
for: text cut off at an edge or vertically (th, hi, vi, ar especially); text shortened with "…"
where the whole text matters; overlaps (text over faces, icons, the ⋯ button, other text);
button labels that wrap badly or spill (the two side-by-side buttons must both fit, else wrap
to two lines or stack); right-to-left (ar): mirrored layout, faces running off the left edge,
chevrons flipped, the wordmark still "moshpoint"; rings and glows never cut off; spacing as in
the HTML (24 dp side margins, the section gaps), even rhythm; touch targets of at least 48 dp.
Small phone = `DeviceConfig.NEXUS_5` (360 dp); large font = font size 130%.

Contact sheets (every language of one state on one picture) are in
`docs/design/home-redesign/audit/`, made with `tools/contact_sheet.py`.

Results: not recorded yet (see Status).

## 4. Status and next steps

Handover (kept current; newest first):

- **Now:** CI run 276 (commit `fc1981d`) rendering the screenshots. Run 274 built everything
  (translations, core and server tests, debug and release app) but its screenshots showed two
  bugs, both fixed: the Up next date tile built its weekday from the locale's best pattern,
  which for a lone weekday is the stand-alone `ccc` that `java.text.SimpleDateFormat` rejects
  off the phone (every home with an Up next row failed to render, except in French); and
  `FitText` multiplied an unspecified line height, which throws, so every crew-tonight home
  crashed while laying out the faces strip (a blank grey frame in the screenshots: an
  exception inside a lazy row's item is thrown during layout, which Paparazzi doesn't report
  as a failure; on the phone it would have crashed). Next: when run 276's screenshots land,
  fetch `ui-screenshots-claude-home-redesign`, check none is blank or missing, then audit
  (English first against the design, then every language).
- **Done:** Step 1 (inventory, above). Step 2 code, compiling in CI: `Theme.kt` tokens,
  `HomeKit.kt` (new), `HomeSections.kt` and `FriendsScreen.kt` (rewritten),
  `HelpDialog(onAlertCrew = null)` in `CrewChatUi.kt`, `MomentStrip` removed (`MomentsUi.kt`),
  MainActivity: `onResetInvite`, `startsAtSec` for Up next, the recap's End the night goes
  through the owner handover, and leaving the main crew refreshes Past gigs. Strings:
  `strings_home_redesign.xml` in all 20 folders (translated, checker clean), 28 old home
  strings deleted from every folder, three texts that named "Your gigs" now name Past gigs.
  Tests: `ui/HomeFixtures.kt` (made-up data), the home tests in `ScreensSnapshotTest`
  (homeMain, homeNotLive, homeGhost, homeCrewMenu, homeNoCrew, homeFirstTime, homeComingUp,
  homeFollowing, homeNobodyYet, homeLongName, homeOneMate, homeBigCrew, homeFriendsList,
  homeAddSheet, upNext, smallPhoneHomeMain/NoCrew, largeFontHomeMain/NoCrew),
  `home/HomeTallSnapshotTest.kt` (homeWhole, full resolution, every language) and unit tests
  in `HomeLogicTest`. Venue and private-message tests updated for the new crew header and faces.
- **Next:** Step 3, the audit: every state in every language, small phone and large font;
  fix, re-render, repeat until clean; then fill in section 3 (one row per state, one column
  per language) and commit one contact sheet per state to `docs/design/home-redesign/audit/`
  (`python3 tools/contact_sheet.py <screenshots dir> docs/design/home-redesign/audit <test>...`).
  Last: a green CI run and the report to the owner's session.
