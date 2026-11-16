# Discover and hype: the app's half

Branch `claude/discover-app-h7v2rk` (from `ccr-5839ed7c-1q0ztj` at `350c9c8`). The server half is
merged: [DISCOVER_SERVER.md](DISCOVER_SERVER.md), wire format in [RELAY_API.md](RELAY_API.md)
section 12. The screens are the mock-ups in [design/discover/](design/discover/README.md).

## Status and next steps

_Handover, kept current at every push. A new session can resume from this section alone._

| Stage | State |
|---|---|
| 1. Hype group, for everyone | **written, first CI run pending.** Core: message, rules, link, courier (595 core tests pass locally). App: `discover/HypeTickets.kt` (ticks, our toggle, daily re-post, the nudge), `discover/HypeData.kt` (the view, Get tickets), `ui/home/HypeGroup.kt` (the screen), crews store `tk`/`tks`, `strings_discover.xml` (20 folders, checker OK), screenshot tests `hypeGroup`, `hypeGroupTicked`, `smallPhoneHypeGroup`, `largeFontHypeGroup`, `smallPhoneLargeFontHypeGroup`, field test 4k |
| 2. Plan a gig, free view | not started |
| 3. Smart search, members | not started |
| 4. Coming up near you, members | not started |

**Last green CI run:** none yet on this branch.

**Exact next step:** check the CI run for the stage 1 push (compile, then the screenshot step's
log for failing tests, then look at the new pictures on `ui-screenshots-claude-discover-app-h7v2rk`),
fix, then stage 2.

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

### For the server (not changed here: app-only branch)

- `DiscoverSources.kt` keeps Bandsintown's offer URL as the show's `tickets`. Bandsintown's
  links include `app_id=<the relay's app ID>`, so every member's phone receives the relay's
  app ID. The app strips it before a link goes anywhere, but the relay should strip it too
  (the same parameter list as `TicketLink.clean`).
