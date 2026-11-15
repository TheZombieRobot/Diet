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
  choices and doubts). The Live switch's name is a noun (a name, not a verb) in every language:
  where "live" reads as a livestream another word is used: ja 位置シェア, ko 위치 공유,
  pl Widoczność, tr Görünürlük (not the word the setup card uses for the phone's Location
  setting, which was the first choice), th มองเห็นได้, vi Hiển thị (not Chia sẻ, as in
  Share photos), zh 在线 / 在線 (the first choice, 上线 / 上線, is a verb). Every text that names
  the switch uses that name, English included ("with Live on", "turn on Live"); verb phrases
  such as "go live" stay where they read naturally. Japanese crew chat on the home is チャット,
  so its pair fits side by side.
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
- **A face's distance** uses the finder's label ("8 m", "4.5 m", "25 ft"): the map's label
  rounds down to tens, so a mate 8 m away read "0 m"; this is also the number the finder shows
  when the face is tapped.
- **Past gigs strip** shows the latest eight Polaroids (See all has every one), all as tall as
  the tallest, so a two-line caption doesn't make one stick out.
- **Long labels on the big gradient button** shrink by up to 3 sp to stay on one line, then
  wrap. Other buttons wrap to two lines (or the pair stacks) rather than shrink, so a large
  font setting is respected.
- **Status bar**: the home pads itself below the status bar (`statusBarsPadding`), which only
  does anything when the app draws edge to edge (Android 15 with target SDK 35). The old home
  had no padding there.
- **Scan a QR** keeps the existing `home_scan_qr` wording ("Scan a QR") rather than the
  mock-up's "Scan QR code", so the add sheet and the home say the same thing.
- **Line breaking** on the home goes through `HomeType` (Mosh's text styles with
  `HomeBreak`): phrase-based breaking (Korean wraps at spaces, Japanese between phrases, on
  Android 13+), strict kinsoku (no small kana or closing mark at a line's start), and the
  high-quality breaker (no single word or character alone on a last line where it can help);
  face captions and button labels use the balanced variant. The home's files use it, which
  includes the ping bar the crew chat also shows; the other screens keep Mosh's styles.
- **Two buttons side by side** stack when a label's longest word can't fit in half the width
  (`WholeWordsText`), instead of breaking inside a word ("Crew-Cha|t", "クルーチャ|ット").
- **" · " lines** (`dotLine`): each short part stays whole and the dot ends a line; Arabic uses
  a bullet " • ", because a middle dot beside Arabic digits reads as a zero ("٣ ·" as ٣٠).
  A part stays whole only while it fits on one line of the width it gets (`DotLineText`,
  measured): at 200% "Kliknij znajomego, by szukać" wraps between words, not "znajome / go".
- **Face captions** of several words are as wide as the face (70 dp) so neighbours don't run
  together; a single long word may use the tile's 76 dp; up to three lines, with "…" as a last
  resort.
- **Translations touched for typesetting only**: Polish home strings have a no-break space after
  one-letter words (a, i, o, u, w, z), Chinese ones have word joiners in a few places (了。,
  邀请, 朋友, 显示, the quoted ＋ button), Japanese keeps 見えています whole the same way, and
  Arabic's "9+" badge is "٩+". No wording changed. Word joiners matter where Android has no
  phrase breaking: before Android 13, and in the screenshot renderer.
- **From the review of `ad9a3e9`**: the faces keep a steady order (re-sorted when someone
  joins or leaves, goes live or not, or moves to another distance band; never while a finger
  is on the strip); Need help moves to its own row when even its longest word can't fit beside
  the wordmark (a small phone with a large font), and bottom-bar labels may take two lines;
  "Remove someone" is a clear red (`Mosh.Alarm`, also the emergency call's), while the crew
  menu's End the night stays pink as designed; Need help offers the crew alert only when
  someone is in the crew or following; the recap's End the night resets the night's stats and
  says so only once you've actually left (a cancelled handover keeps them).
- **Very large fonts (200%)**: small labels in tight places (a face's name and caption, the
  bottom-bar tabs) grow with the font setting up to 1.5 times (`capScale`), like Android's own
  non-linear scaling of large text, so they never break inside a word; everything else grows
  fully. The distance under a live face is fitted in one measured pass (the finder's `FitText`
  shrinks frame by frame, which a screenshot catches half way). The Live row's line goes under
  the switch when there's no room beside it for its longest word (for Chinese and Japanese, six
  characters stand in for a phrase). The four tab labels share one size: the font setting's,
  made smaller (down to the normal size, never below) while a word doesn't fit its tab, so
  ストーリー stays whole at 130% on a small phone; a number keeps its word in every script
  (`\p{Nd}`, so Arabic-Indic digits too).
- **Shared pieces fixed on the way**: `FitText` (finder) no longer multiplies an unspecified line
  height (it threw); the violet unread badge on faces (private messages) shows the phone's
  digits; a story Polaroid's caption keeps its own direction (Unicode isolate), so "Front row!!"
  doesn't become "!!Front row" in Arabic.

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

Rounds: English was compared with the five artboards first (side by side, same scale). Then
every language was looked at in four groups (de nl sv fr it; es es-rES pt pl tr in; ar hi th
vi; ja ko zh-rCN zh-rTW en-rUS), each picture checked against the English one, zoomed where
text was tight, and the tall `homeWhole` read in slices. Findings were checked on the pictures,
fixed, re-rendered, and looked at again until nothing was left. A blank (one flat colour) or
missing picture means a crash and is checked for on every run: an exception inside a lazy
row's item is thrown during layout, which Paparazzi saves as a blank frame instead of failing.

**Spain's Spanish (es-rES)** can't be rendered by Paparazzi: given `es-rES` (or `b+es+ES`) it
takes `values-es`, so the es-rES pictures are the plain Spanish ones (the same on the main
branch's screenshots; a phone does pick `values-es-rES`). It was checked by comparing every
home string with Spanish: 26 differ, none by more than 5 characters, and each longer one sits
where text wraps or has room ("En directo" by the switch, "Introducir un código" in a button
that wraps between words).

**Fixed for every language** (found in English or in several languages at once): two crashes
that left most home states unrendered (the Up next date tile's weekday pattern; `FitText` and a
style without a line height, which on a phone would have crashed every crew-tonight home);
a face 8 m away said "0 m"; live faces sat 2 dp lower than the rest; Past gigs Polaroids had
uneven heights; a flare caption left its emoji alone on a line; See all could be narrower than
48 dp; the home didn't pad itself below the status bar on Android 15; the big gradient button
wrapped long labels at full size; the tall test's English used the wrong plural ("1 years ago").
Line breaking on the home now suits every script (`HomeType`: phrase breaking, strict kinsoku,
the high-quality breaker; balanced for captions and button labels), parts of a "·" line stay
whole with the dot at a line's end (`dotLine`), a number keeps its unit, and two buttons side
by side stack rather than break a label inside a word.

**Results** (after round 2, checked again on the final renders; one row per state, one column
per language: "OK" or what was fixed in that state and language; contact sheets of every row
in `docs/design/home-redesign/audit/<state>.png`):

| State | en | en-rUS | de | fr | es | es-rES | it | pt | nl | sv | pl | tr | in | vi | th | hi | ar | ja | ko | zh-rCN | zh-rTW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `homeMain` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: · read as 0 | fixed: クルーチャット split | OK | OK | OK |
| `homeNotLive` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: · read as 0 | fixed: クルーチャット split | OK | OK | OK |
| `homeGhost` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: · read as 0 | fixed: クルーチャット split; line breaks | fixed: line breaks | fixed: line breaks | fixed: line breaks |
| `homeCrewMenu` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | fixed: one-letter word ending a line | OK | OK | OK | OK | OK | fixed: · read as 0 | fixed: line breaks | fixed: line breaks | OK | OK |
| `homeNoCrew` | OK | OK | fixed: line began with · | OK | OK | as es ¹ | OK | OK | fixed: "2 / maanden" split | OK | OK | OK | fixed: "Riverside / Park" split | OK | OK | OK | OK | OK | fixed: line breaks | fixed: line breaks; 了。 alone | fixed: line breaks; 了。 alone |
| `homeFirstTime` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | fixed: one-letter word ending a line | OK | OK | OK | OK | OK | fixed: picture off screen | OK | fixed: line breaks | OK | OK |
| `homeComingUp` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | fixed: captions ran together | fixed: one-letter word ending a line | fixed: caption broke mid-word | OK | OK | OK | OK | OK | OK | fixed: line breaks | OK | OK |
| `homeFollowing` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | fixed: caption lost a word | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: クルーチャット split; line breaks | fixed: line breaks | fixed: line breaks; quoted ＋ button split | fixed: line breaks; quoted ＋ button split |
| `homeNobodyYet` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | fixed: one-letter word ending a line | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK |
| `homeLongName` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: · read as 0 | fixed: クルーチャット split | OK | OK | OK |
| `homeOneMate` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: クルーチャット split | OK | OK | OK |
| `homeBigCrew` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | fixed: emoji alone | OK | OK | OK | OK | OK | OK | fixed: · read as 0; face badge in Latin digits | fixed: クルーチャット split; line breaks | OK | OK | OK |
| `homeFriendsList` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: 了。 alone | fixed: 了。 alone |
| `homeAddSheet` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | fixed: one-letter word ending a line | OK | OK | fixed: button label uneven | OK | OK | fixed: · read as 0; button label uneven | fixed: line breaks | OK | fixed: line breaks; 邀请 split | OK |
| `upNext` | OK | OK | fixed: line began with · | OK | OK | as es ¹ | OK | fixed: "Dock / 4" split | fixed: "2 / maanden" split | OK | OK | OK | fixed: "Riverside / Park" split | OK | OK | OK | fixed: 9+ in Latin digits | OK | OK | OK | OK |
| `smallPhoneHomeMain` | OK | OK | fixed: Crew-Chat broke mid-word | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: · read as 0 | fixed: クルーチャット split | OK | OK | OK |
| `smallPhoneHomeNoCrew` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | fixed: line breaks | OK | OK | OK |
| `largeFontHomeMain` | OK | OK | fixed: Crew-Chat broke mid-word; number apart from unit | OK | OK | as es ¹ | fixed: hint split inside a part | fixed: number apart from unit; hint split inside a part | OK | fixed: hint split inside a part | fixed: hint split inside a part | OK | fixed: hint split inside a part | OK | OK | OK | fixed: · read as 0 | fixed: クルーチャット split; line breaks | fixed: line breaks | OK | OK |
| `largeFontHomeNoCrew` | fixed: venue split | OK | OK | fixed: date tile tight; button label uneven | fixed: venue split | as es ¹ | OK | fixed: venue split | OK | OK | fixed: Up next line cut short; one-letter word ending a line | fixed: venue split | fixed: venue split | OK | OK | OK | OK | fixed: line breaks | fixed: line breaks | fixed: line breaks | fixed: line breaks |
| `homeWhole` | fixed: "1 years ago" | OK | fixed: line began with ·; memories card wrapping | fixed: memories card wrapping | OK | as es ¹ | OK | OK | fixed: "2 / maanden" split; memories card wrapping | fixed: memories card wrapping; emoji alone | OK | OK | fixed: See all beside wrapped title; "Riverside / Park" split; wrapped title cramped | fixed: time split; memories card wrapping | OK | fixed: memories card wrapping | fixed: chevron, caption order, · read as 0; face badge in Latin digits; memories card wrapping | fixed: クルーチャット split; line breaks | OK | OK | OK |
| `venueCard` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | fixed: captions ran together | OK | fixed: caption broke mid-word | OK | OK | OK | OK | OK | OK | fixed: line breaks | fixed: line breaks; quoted ＋ button split | fixed: line breaks; quoted ＋ button split |
| `venueLines` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK | OK |
| `privateOptions` | OK | OK | OK | OK | OK | as es ¹ | OK | OK | OK | fixed: captions ran together | OK | fixed: caption broke mid-word | OK | OK | OK | OK | fixed: face badge in Latin digits | OK | fixed: line breaks | OK | OK |

¹ es-rES: Paparazzi renders Spain's Spanish as plain Spanish (see above); checked by comparing
its strings with es.

Left as they are, on purpose: Japanese and Chinese body text breaks between two characters
inside a sentence (normal typesetting there; on Android 13 and later Japanese also breaks
between phrases, which the screenshot tool doesn't do); a Japanese flare caption longer than its
face ("🔥 バーカウンター 🍺") wraps inside the word; Thai "ขอความช่วย / เหลือ" wraps the Need
help pill at a word boundary on the 360 dp phone; a heading half under the bottom bar at the end
of a short phone's screen is just where the scroll stops; test data typed in English ("2:15 am",
"Sat 14 Dec, 8:00 pm") stays English. Out of scope: the Story screen's own header in Arabic
still has a middle dot beside a number ("٤ · …").

## 4. Status and next steps

Handover (kept current; newest first):

- **Now:** the owner's review of `ad9a3e9` (items 1–13) is done in code; this commit adds the
  fixes from checking run 286's screenshots (200% and the small phone at 130%): width-aware
  " · " lines, one fitted size for the tab labels, digits in every script keep their word,
  word joiners for 朋友/显示/見えています, Japanese Live line under the switch at 200%. Next:
  let CI render; check hugeFontHomeMain (en, de, pl, ja), smallPhoneLargeFont* (every
  language), homeMain/homeGhost/homeNoCrew/upNext (every language); then regenerate the
  contact sheets (`tools/contact_sheet.py`, one per state incl. the three new tests) and the
  results table in section 3, set this entry to finished with the green run, and send the
  owner's session the short report (branch, green run, what changed).
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
  Step 3: the audit, two rounds over every state in every language plus the small phone and the
  large font (section 3: what was fixed, the results table, the contact sheets).
- **Next:** nothing on the redesign itself. Worth a look on a phone (screenshots can't show
  it): Japanese phrase breaking (Android 13+), Spain's Spanish strings (see section 3), the
  status bar padding on Android 15. Out of scope, noticed on the way: the Story screen's
  header in Arabic has a middle dot beside a number ("٤ · …"); Swedish `main_eyebrow` strings
  still say "DITT GÄNG"; `docs/i18n/vi.md` says "kèo" where the files say "kế hoạch"; other
  screens still say "Go live".
