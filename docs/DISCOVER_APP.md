# Discover and hype: the app's half

Branch `claude/discover-app-h7v2rk` (from `ccr-5839ed7c-1q0ztj` at `350c9c8`). The server half is
merged: [DISCOVER_SERVER.md](DISCOVER_SERVER.md), wire format in [RELAY_API.md](RELAY_API.md)
section 12. The screens are the mock-ups in [design/discover/](design/discover/README.md).

## Status and next steps

_Handover, kept current at every push. A new session can resume from this section alone._

| Stage | State |
|---|---|
| 1. Hype group, for everyone | **done, CI green (run 328, `e7fb39b`)**: phone and watch debug and release builds, core and server tests, translations, screenshots. Core: message, rules, link, courier. App: `discover/HypeTickets.kt` (ticks, our toggle, daily re-post, the nudge), `discover/HypeData.kt` (the view, Get tickets), `ui/home/HypeGroup.kt` (the screen), crews store `tk`/`tks`. Screenshots `hypeGroup`, `hypeGroupTicked`, `smallPhoneHypeGroup`, `largeFontHypeGroup`, `smallPhoneLargeFontHypeGroup`, looked at (English, German at 130% on a small phone, Arabic). Field test 4k |
| 2. Plan a gig, free view | **done, CI green (run 329, `647c84f`).** `ui/home/PlanGig.kt`: the form state is hoisted (`PlanForm`), hand entry in the order who's playing, date and time, venue (optional, hint "Venue and town"); the quiet Moshpoint+ card for non-members (`Entitlements.plus` false); "What's in Moshpoint+" swaps the sheet to `PlusInfoContent` and back with what was typed kept ("coming soon", no billing). Screenshots `planGigFree`, `smallPhonePlanGigFree`, `largeFontPlanGigFree`, `plusInfo`, `smallPhoneLargeFontPlusInfo`, looked at (English, German, small phone) |
| 3. Smart search, members | **done, CI green (run 330, `0273934`).** `core/DiscoverRules.kt` (`DiscoverPlace` NZ island and nearest region, `ShowStart`, `TypedMatch`, the answer models; `DiscoverRulesTest`, 600 core tests pass), `discover/DiscoverClient.kt` (`suggest`, `coming`, 403/503 = closed; `DiscoverWhere`: country, region, kept regions), the search in `PlanGig.kt`, `GigSearch.kt` removed. Screenshots `smartSearch`, `smallPhoneLargeFontSmartSearch`, `smartSearchPicked` |
| 4. Coming up near you, members | **done, CI green (run 331, `105a8fd`)**: `discover/ComingUp.kt` (asking, chips, a relay's no remembered for a day, Planned ✓ via `DiscoverPlanned`), `ui/home/ComingUpCard.kt`, `NoCrewHero(comingUp = …)` (the free path's code is untouched), Plan it → `startPlannedCrew`. Screenshots `homeComingUpNearYou`, `homeComingUpTravel`, `smallPhoneHomeComingUpNearYou`, `largeFontHomeComingUpNearYou`, looked at |
| Polish after looking | run 332 (`387e69e`, green): the first search row's name was cut ("Ivory Ti…"; now the row's full width with ordinary line breaking: fixed); a travel show's distance was cut (now its own line: fixed). Then the search rows' second line used the home's measured `DotLineText`, so "3 shows in New Zealand" never breaks inside a word at 130%: in the run started with this commit |

**Last green CI run:** 332 (`387e69e`, all four stages and the first polish). The last polish
run is the one started by the commit that added this line.

**Every other screenshot unchanged:** checked after each run by comparing file hashes of this
branch's `ui-screenshots-claude-discover-app-h7v2rk` with `ui-screenshots` (`git fetch
--depth=1 --filter=blob:none` both, then `git ls-tree -r` and compare): run 328, 1,963 shared
files identical, 105 new; run 329, 1,963 identical, 210 new; run 330, 273 new; run 331, 357 new
(17 new tests in 21 languages); run 332 the same: none of the 1,963 existing ones changed.

**Exact next step:** check the polish run (builds green, `smartSearch` first row, the travel
tiles); nothing else is open in the four stages. After that: the field test (section 4k of
FIELD_TEST_PLAN.md), the server's `app_id` strip (below), and the owner's call on showing Coming
up under a sleeping crew.

**How to work on it:**

- Core tests run here with a scratch Gradle build that includes only `:core` (Google's Maven is
  blocked, so the Android modules can't configure). In a scratch folder: a
  `settings.gradle.kts` with Maven Central (Google's mirror first), the version catalogue
  `from(files("<repo>/gradle/libs.versions.toml"))`, `include(":core")` and
  `project(":core").projectDir = file("<repo>/core")`; a `build.gradle.kts` with
  `plugins { alias(libs.plugins.kotlin.jvm) apply false }`; the repo's `gradle/wrapper` and
  `gradlew`. Then `./gradlew -q :core:test`.
- Only CI builds the app (about 13 minutes). It commits changed screenshots back to the branch:
  `git pull --rebase` before pushing. Work-in-progress commits carry `[skip ci]`.
- Strings: everything new goes in `strings_discover.xml`, in all 20 `values` folders. Check with
  `for d in app/src/main/res/values-*/; do python3 tools/check_translation.py "$d"; done` and
  `python3 tools/check_translation.py --same-languages app/src/main/res wear/src/main/res`.

## Decisions

Made without stopping to ask, as instructed. Each has its reason, so it can be changed later.

### Stage 1: the hype group

**"Got my ticket" is a new signed crew message, `ENV_TICKET = 5`** (`GigGroup.sealTicket`,
`openTicket`, `ticketOf`), modelled on "I'm here" (docs/IM_HERE.md):

- Body `[ver:1][flags:1]` (flag 1 = has a ticket), then the sender's key and signature. The
  signature covers `"mp-ticket1"`, the crew's signing tag, the time and the fields, so no crew
  mate can tick, untick or re-date for someone else. 128 bytes sealed: one Bluetooth packet.
- **Newest per mate wins** (`TicketRule`, the meet-up pin's rule): unticking is just a newer
  message with the flag off. A time more than 5 minutes ahead of the receiver's clock is refused,
  so nobody can lock their tick.
- **Older builds can't misread it.** It's an `mp2` envelope: builds before the envelope can't
  open it; builds with it ignore a type they don't know (checked in `Courier.handle`), and
  `ChatSync` on older builds tries ping, history and direct on it, and all three fail.
- **Carried by the courier** as `KIND_TICKET`, like chat: uploaded to the crew's chat mailbox
  (fetched for every crew, main and Up next, by `ChatSync`), passed between crew phones over
  Bluetooth, re-signed with the same id when the crew moves to a new key. **Not** through
  strangers' phones (the crowd relay): a tick is never urgent, and chat doesn't go that way
  either. The relay keeps a chat mailbox 72 hours and phones read today's and yesterday's, so
  each phone **posts its latest tick again once a (UTC) day** while the gig is still to come
  (`TicketRule.repostDue`). One tiny record per mate per day; a mate back after a week offline
  sees everyone's ticks at once.
- `TicketBook` keeps the newest tick per mate (saved as text), `TicketNudge.due` says when the
  crew's maker hears "everyone's got a ticket": once, only the maker, only with two or more in
  the crew (owner's answer 4).

**The ticket link travels with the crew's details, signed by its maker.** "Sent with the crew's
plan, signed like the rest" was read as: it goes wherever the crew's name, date and venue go
(the invite link and QR, the saved crew), and it's signed.

- `GigGroup.tickets` + `ticketsSig`: the owner (the crew's maker; every planned crew is owned)
  signs `"mp-tickets1"` + the link. `GigGroup.ticketLink` is the link only if that signature
  checks against the crew's owner key. A forwarded invite with a swapped link joins the crew but
  shows no Get tickets. A crew with no owner can't have one.
- Invites carry it as `&tk=<link>&tks=<signature>` (older builds ignore unknown fields).
- Free mates see Get tickets too (owner's answer 3): the link came with the invite, no key call.
- **What counts as a link** (`TicketLink.clean`): https only (never `http:`, `javascript:`,
  `intent:`, files), a real host, no user name or password, at most 300 characters, and
  **key-like query parameters dropped** (`app_id`, `apikey`, `key`, `token`, …).
  Bandsintown's ticket links carry the caller's `app_id`, and the relay passes `tickets` through
  as the source gave it (found while building this; see "For the server" below). Without this,
  the relay's Bandsintown app ID would spread in every crew invite.
- Hand-typed gigs have no ticket link (the free form in FreeView.png has no field for one); a
  link comes from a picked show (stages 3 and 4).

**The countdown** is calendar days by the phone's own calendar (`Countdown.daysUntil`): 117 from
16 Nov 2026 to Sat 13 Mar 2027, "tomorrow" late the night before, never negative.

**The screen** (`HypeGroupBody`, shown instead of the old Coming up view when the main crew
sleeps and you're not following from home; followers keep the old view):

- The countdown is the headline, number in the brand gradient; "tomorrow" and "tonight" reuse
  the existing countdown strings. Under it, "4 in the crew · wakes up on the day".
- The show card's art is drawn from the brand colours, mixed by the show's name: no artwork is
  fetched (no picture host to allow, nothing to cache, and the same on every phone).
- The date line is "Sat 13 Mar · 7:30 pm", not the mock's "doors 7:00 pm": the app knows when
  the show starts, not when the doors open.
- Faces use the crew strip (`CrewTiles` with `tickets`): a lime ring and "Got my ticket ✓", or
  no ring and "No ticket yet". Nobody is dimmed (the crew is asleep, not missing).
- Chat row: the newest chat line and its sender's face; Invite mates opens the crew's invite.
- Every existing screenshot is unchanged: the new view needs `HomeCrew.hype`, which the tests
  only set in the new ones (the old `homeComingUp` is now the followers' view).

### Stage 2: Plan a gig, free view

- **Who's playing, then the date and time, then the venue** (owner's answer 6), in the design's
  fields (`PlanField`: label inside a rounded box; hint "Venue and town"). The form's state is
  hoisted into `PlanForm`, so "What's in Moshpoint+" can replace the sheet's contents and Back
  returns with everything typed still there.
- **The quiet Moshpoint+ card** shows only when `Entitlements.plus` is false: no price, no Upgrade
  button, only "What's in Moshpoint+". Today `Entitlements.plus` is true for everyone (no billing,
  docs/WATCH.md), so the free view appears once billing lands, or with the test build's
  Moshpoint+ switch off (`WatchDebugTools`).
- **"What's in Moshpoint+"** lists smart search, Coming up, offline venue maps and the watch
  (ROADMAP.md, Moshpoint+), then "COMING SOON: Moshpoint+ isn't on sale yet", and what stays free.
- The sheet is now the home's own `MoshSheet` (the design's colour and handle) instead of a
  plain Material sheet; no existing screenshot showed it.

### Stage 3: smart search (members)

- **Who gets it:** `Entitlements.plus` and a relay to ask. The old gig search
  (`/v1/gigs/search`, `GigSearch.kt`) is gone from the app: it used the relay's listing keys
  for everyone, and "anything on API keys is members only". The relay keeps the endpoint for
  older builds.
- **As you type:** 250 ms after the last letter; a new letter restarts the `LaunchedEffect`,
  which cancels the ask before it (`runInterruptible` around the request).
- **403 or 503:** the search box goes away for that sheet and the hand form stays, with no
  message (the brief's "quietly"). No signal: "Couldn't search right now. Type it in below
  instead." `ready: false`: "Getting the list…", asked again every 30 s while the sheet is open.
- **What's sent:** `country` (the mobile network's country, else the SIM's, else the language
  setting's) and `region`: in New Zealand the island worked out on the phone from its last
  known position (`DiscoverPlace.nzIsland`, the relay's own line through Cook Strait);
  elsewhere the nearest middle among the `regions` a Coming up answer listed (kept in
  `discover` prefs). Never the position.
- **Rows:** a round art in the show's colours, the name with what was typed in cyan
  (`TypedMatch`: start of the name or of a word, case and accents aside), then "3 shows in New
  Zealand · next Sat 13 Mar, Auckland" or "40 shows worldwide · next Fri 9 Apr, Tokyo". The mock
  says "nearest" for worldwide; the relay's `next` is the soonest, so the app says "next".
- **Picking a show fills the plan** (`PlanForm.fill`): the act's name, the date and time, "venue,
  town", the venue's position (no lookup needed) and the ticket link, shown as "Ticket link:
  tickets.example.com" with ✕ to drop it. The planner checks it and taps Start the crew.
- **When it starts** (`ShowStart`): a show in the phone's own country uses its local date and
  time read in the phone's time zone (exact where the country has one zone; in the US or
  Australia the crew may wake an hour or two off, but the time shown is the venue's). Abroad,
  the relay's `startsAtSec`. No time announced: 8 pm, which the planner can change.
- "Type your own gig" is pinned under the list (the list scrolls above it); it clears the search
  and shows the hand form.

### Stage 4: Coming up near you (members)

- **Where:** the No crew state only (owner's answer 1), under Start a crew, wider than the page
  margins as drawn. For members it replaces the Plan a gig row (its search button opens that
  sheet); free users keep the row and never see the card (answer 2).
- **A 403 or 503** (search or Coming up) is remembered for a day (`DiscoverClient.noteClosed`):
  no card and no search box until then, so nothing flashes up and goes away on each start. That
  matters now: `Entitlements.plus` is true for everyone until billing, and the production relay
  says "members only" to everyone, so today every phone sees the free path's hand form (without
  the Moshpoint+ card) and the Plan a gig row.
- **Asking:** `ComingUp` asks `coming` for the chip that's on (`near`, `country`, `travel`) with
  the country and at most the region, as for search. In a country it hasn't seen, the first
  answer lists its regions; the phone picks its own and asks once more. Answers are kept an hour
  per chip; `ready: false` is asked again every 30 s.
- **The strip:** date badge (from the venue-local date), act, venue, town (and "2,150 km away"
  for worth travelling for), and Plan it. The far edge fades; the chips wrap onto two lines.
- **Plan it** starts the planned crew straight away with the show filled in (name, start,
  venue and position, ticket link) and shows its invite, as Plan a gig does.
- **Planned ✓** (answer 5): a show this phone made a crew for (`DiscoverPlanned`: show id →
  crew id, dropped when the crew ends) says "Planned ✓"; tapping it opens that crew's chat.

**For the owner (found while building):** a planned crew becomes the home's main crew when
there's no crew tonight, so the home then shows its hype group, not "No crew tonight", and the
Coming up card goes with it. "Planned ✓" is therefore only seen when the No crew state shows
while a planned crew exists in Up next. If the card should stay visible while a crew sleeps,
it could go under the hype group (the README's open question 1, alternative).

### Translations

All 52 new strings are in `strings_discover.xml` in every `values` folder, written with the
terms each `docs/i18n/*.md` guide fixes for crew, mates, gig and venue (Crew/Freunde/Konzert in
German, grupo/amigos in Spanish, galera/show in Brazilian Portuguese, geng in Indonesian,
クルー/仲間/ライブ in Japanese, 小队/小隊 in Chinese, الشلة/أصحاب in Arabic, and so on). New
words, for a native speaker's read:

- **ticket:** Ticket (de, nl), boleto (es) and entrada (es-ES), billet (fr), biglietto (it),
  ingresso (pt), bilet (pl, tr), biljett (sv), tiket (id), vé (vi), บัตร (th), チケット (ja),
  티켓 (ko), 票 (zh), टिकट (hi), تذكرة (ar).
- **"Got my ticket ✓"** is said by the mate, in the first person where the language allows
  ("Hab mein Ticket ✓", "J'ai mon billet ✓"); Japanese uses チケット確保 (secured), the usual
  fan phrase.
- **"Moshpoint+"** is never translated. Section kickers ("NEAR YOU", "WORLDWIDE") are in
  capitals where the script has them, and "ELSEWHERE IN %s" becomes "ELSEWHERE · %s" in
  languages where the preposition would change with the country's name (de, fr, it, nl, pl,
  pt, tr).

### For the server (not changed here: app-only branch)

- `DiscoverSources.kt` keeps Bandsintown's offer URL as the show's `tickets`. Bandsintown's
  links include `app_id=<the relay's app ID>`, so every member's phone receives the relay's
  app ID. The app strips it before a link goes anywhere, but the relay should strip it too
  (the same parameter list as `TicketLink.clean`).
