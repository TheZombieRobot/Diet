# Discover: the relay's half

Branch `claude/discover-server-q4n8w2` (from `ccr-5839ed7c-1q0ztj`). Scope: `server/` and server
docs only. This is the server half of "Discover and hype" (ROADMAP.md): cached country lists,
smart-search suggestions and Coming up. The app half (search sheet, home card, hype group) comes
later. The screens it serves are in [design/discover/](design/discover/README.md), and the wire
format is in [RELAY_API.md](RELAY_API.md) section 12.

## Status and next steps

_Handover, kept current. Last updated: 16 Nov 2026._

**Done** (on the branch; the server tests pass locally, and CI runs them on the last push):

1. **Country lists.** A refresher builds each country's music shows for the next 12 months from
   Ticketmaster, SeatGeek and Bandsintown. It refreshes 4 times a day, and only for countries a
   member asked about in the last 7 days. It merges duplicates, scores every show, keeps the
   biggest 2,000 per country on the volume, and stays inside daily budgets per source that are
   counted on the volume.
2. **Popularity.** One 0–1 score from followers, venue size, tour dates and the source's own
   order, with unit tests.
3. **`GET /v1/discover/suggest`.** Acts whose name, or a word in it, starts with what was typed,
   biggest first, grouped near / elsewhere / worldwide. It works from one letter, with accents
   and "The …". It's cached per (country, prefix) and never calls a source.
4. **`GET /v1/discover/coming`.** The region, the whole country, or worth travelling for.
5. **Members only.** `EntitlementCheck` says no to everyone today (403). `MOSHPOINT_DISCOVER_OPEN=1`
   opens it for internal testing. A relay without keys answers 503 `not configured`.
6. **Tests.** `DiscoverUnitTest.kt` covers parsing each source's recorded sample, merging,
   popularity, prefixes and regions. `DiscoverTest.kt` covers lists, caching, budgets, the
   refresher, travel, small countries and the gate, and checks that no source is called while
   answering.

**Not done, in order:**

1. **Try it against the real APIs once the owner has keys.** Nothing here has called Ticketmaster,
   SeatGeek or Bandsintown: this session had no keys. The readers follow each API's documented
   response shape. The samples in `server/src/test/resources/discover/` are hand-made in those
   shapes, with made-up acts, not recordings. With keys, set `MOSHPOINT_DISCOVER_OPEN=1` on a
   **test** relay, ask `coming?country=NZ`, and check the log line
   `Discover: NZ list built, N shows (calls today: …)`. Then replace a sample with a real recorded
   answer (strip any key from it) if a reader needs fixing.
2. **Billing plugs into `EntitlementCheck`** (`DiscoverStore.kt`): verify the Play purchase and
   cache the answer per install. The routes already call it before anything else.
3. **The app** (about two sessions, ROADMAP.md): the search sheet calls `suggest` per keystroke and
   shows `ready: false` as "Getting the list…". The home card calls `coming`. The phone picks its
   region from `regions` (nearest middle, or the NZ island rule) and sends only that.
4. **Regional top-ups for big countries (later, if needed).** The US list is Ticketmaster's top
   1,000 plus SeatGeek's top 1,000, so a small state can look thin. Fix: for regions asked about,
   one extra Ticketmaster page filtered by `stateCode` a day.
5. **Speed (later, if needed).** `coming` for a small country, and `travel`, scan the lists on
   each request: a few milliseconds now, worth a cache if the lists grow.

**The owner must set** (production relay only, `fly secrets set`; never in the repo):

- `TICKETMASTER_KEY`, `SEATGEEK_CLIENT_ID`, `BANDSINTOWN_APP_ID`: the same keys gig search uses.
  Each one switches its source on. With none set, Discover answers 503 `not configured`.
  Bandsintown: check the commercial terms first (ROADMAP.md).
- **Never set `MOSHPOINT_DISCOVER_OPEN` on the production relay.** It opens a paid feature to
  everyone, and the relay logs a warning at start when it's on. It's for a test relay only,
  until billing lands.
- Optional: `DISCOVER_TM_PER_DAY` (default 3,000), `DISCOVER_SG_PER_DAY` (1,000),
  `DISCOVER_BIT_PER_DAY` (2,000), `DISCOVER_MAX_COUNTRIES` (40). Raise them when the sources
  raise the limits ("higher API limits before launch", ROADMAP.md).
- The free relay gets none of these, so it answers 503 (ROADMAP.md, Moshpoint+).

**To resume:** the code is in `server/src/main/kotlin/…/server/`:

| File | What's in it |
|---|---|
| `Discover.kt` | The service: demand, the refresher, the answers |
| `DiscoverSources.kt` | URLs and the readers for each source |
| `DiscoverModel.kt` | `Show`, `Fold` (matching) and `ShowMerge` |
| `Popularity.kt` | The score |
| `Regions.kt` | Regions, centres and distances |
| `DiscoverStore.kt` | Config, `EntitlementCheck`, budgets, the act cache and the files |

The routes are in `Main.kt`. Run `./gradlew :server:test`. In this session Google's Maven was
blocked, so the root build (which loads the Android plugin) couldn't configure. The tests ran
through a server-only Gradle build (a settings file that includes only `:server`, kept outside
the repo). CI runs the normal build.

## How it works

```
member asks (suggest / coming) ──► demand: country → last asked (and its neighbours, lightly)
                                         │
refresher (every minute, if due) ◄───────┘
  │  Ticketmaster: 5 pages × 200, most relevant first, next 12 months
  │  SeatGeek (US, CA): 10 pages × 100, by its score
  │  Bandsintown: followers, tour size, tour dates for the biggest acts (once a day each)
  ▼
merge duplicates → score → keep the biggest 2,000 → DATA_DIR/discover/lists/NZ.json
                                         │
answers ◄────────────────────────────────┘  (from memory; never a source call)
```

### Sources

| Source | Asked for | Covers | Per call |
|---|---|---|---|
| Ticketmaster Discovery `events.json` | `countryCode`, `classificationName=music`, the next 12 months, `sort=relevance,desc` | North America, UK/IE, most of Europe, AU/NZ, more | 200 shows; no deeper than the 1,000th |
| SeatGeek `events` | `venue.country`, `taxonomies.name=concert`, the next 12 months, `sort=score.desc` | US, Canada | 100 shows |
| Bandsintown `/artists/{name}` | One act | Worldwide | Followers (`tracker_count`), upcoming shows count, picture |
| Bandsintown `/artists/{name}/events` | One act's upcoming shows | Worldwide | All of them |

Bandsintown has no "shows in a country" search, so it's used per act. The refresher looks up
the biggest acts in each list (and, for a country the other two don't cover, the biggest acts
anywhere). Their followers and tour size feed the score, and their shows join the list of
whatever country they're in. This is how Japan or Korea get a list from touring acts.

Each source's fields become a `Show`: act, name, local date and time, venue, city, region,
country, coordinates, the official ticket link, a picture, venue kind and capacity, followers,
tour dates and the source's order. Cancelled and postponed shows, and dates still to be
announced, are skipped.

### Country lists

- **Who gets one.** A country a member asked about in the last 7 days gets a full list, refreshed
  every 6 hours (4 times a day). Its neighbours within 3,000 km get a short list (one page, no
  Bandsintown lookups, the biggest 300), refreshed every 12 hours. The short lists serve "worth
  travelling for" and small countries' "near". A country nobody asks about makes no calls and
  leaves memory. Its file is deleted after 30 days.
- **New countries first.** The first ask for a country wakes the refresher, and a list never
  built goes before the stalest. The answer meanwhile says `ready: false`, and the app asks again
  in about 30 seconds.
- **Merging duplicates.** The same act on the same local date, in the same city or at venues
  within 30 km, is one show. A VIP package Ticketmaster lists as its own event is merged too.
  - Names, venue and city come from Ticketmaster, then SeatGeek, then Bandsintown.
  - The ticket link and picture come from the seller's own page first (Ticketmaster), then
    Bandsintown's link to the seller, then SeatGeek.
  - The other fields are filled in from whichever source has them.
  - Bandsintown regions given as names ("New South Wales") take another source's code ("NSW").
- **The cap: the biggest 2,000 shows per country.** Why 2,000:
  - Ticketmaster serves at most 1,000 results per search, and SeatGeek adds at most 1,000 more in
    the US and Canada, so no country's merged list is much bigger than 2,000 before trimming.
  - New Zealand-sized countries list a few hundred to 1,500 music shows a year, so the cap only
    ever trims the biggest markets, and there it drops the smallest shows.
  - It bounds the relay: about 1 MB a country on the volume and about 2 MB in memory, so 40 full
    lists and 80 short ones stay near 100 MB of a 1 GB Machine.
- **On the volume** (`DATA_DIR/discover/`, each file written whole and then renamed into place):
  - `lists/NZ.json`: one per country, rewritten at each refresh.
  - `acts.json`: Bandsintown acts, at most 3,000 acts and 50,000 shows.
  - `state.json`: who asked when, and today's call counts.

  After a restart the lists are read back, not rebuilt, and today's call counts carry on.
- **When a source fails** or its budget runs out part way, a list is never swapped for one less
  than half its size, or for nothing. The old list stays, and the country is tried again in 30
  minutes.

### Budgets (the maths)

Daily counts are kept per source, per UTC day, on the volume. Calls are spaced out too:
Ticketmaster 4 a second (its limit is 5), SeatGeek and Bandsintown 2 a second.

- **Ticketmaster: 5,000 calls a day per key (free tier), and Discover uses at most 3,000.**
  - A full list takes 5 calls (5 pages × 200 = Ticketmaster's 1,000-result limit), 4 times a day:
    **20 calls a day per country**.
  - A short list takes 1 call, twice a day: **2 a day per neighbour**.
  - At the caps (40 full countries, 80 neighbours): 40 × 20 + 80 × 2 = **960 calls a day**.
  - That leaves at least 2,000 a day for gig search (`/v1/gigs/search`, cached 10 minutes).
- **SeatGeek** is for the US and Canada only: 10 pages × 4 refreshes × 2 countries = **80 calls a
  day**, plus 2 a day for each short list. The budget is 1,000.
- **Bandsintown**:
  - Each act is looked up at most once a day, whichever country it's in.
  - A lookup is 2 calls (1 if Bandsintown doesn't know the act), for at most 150 acts per full
    refresh, biggest first.
  - At the caps that could be 40 × 150 × 2 = 12,000 calls a day, so the **2,000-a-day budget is
    what limits it**: about 1,000 acts a day, the biggest first.
  - Bandsintown publishes no number, so this is deliberately modest. Raise
    `DISCOVER_BIT_PER_DAY` once its terms say what's allowed.

### Popularity

One score from 0 to 1 per show, from signals that work worldwide (`Popularity.kt`):

| Signal | Weight | Scale |
|---|---|---|
| Followers (Bandsintown trackers) | 40% | log: 1 k = 0.43, 100 k = 0.71, 1 M = 0.86, 10 M or more = 1 |
| Venue size or kind | 30% | stadium 1, festival 0.9, park or showground 0.85, arena 0.8, theatre 0.5, unknown 0.35, club 0.2. A known capacity overrides the name (40 k+ = 1, 15 k = 0.85, 5 k = 0.65, 2 k = 0.5, 800 = 0.35, less = 0.2) |
| Tour dates (the act's upcoming shows) | 15% | log: 1 = 0.15, 10 = 0.52, 30 = 0.74, 100 or more = 1 |
| The source's own order | 15% | its first result 1, falling to 0 at its 1,000th |

- **A missing signal neither helps nor hurts.** If a show lacks one (an act Bandsintown doesn't
  know, a show only Bandsintown lists), the other signals share its weight.
- **Venue kind** comes from words in the venue's name: "Stadium" and "Field" are stadiums,
  "Arena" and "Centre" arenas, "Theatre" and "Hall" theatres, "Bar" and "Hotel" clubs. Checks run
  in that order, so "Park Theatre" is a theatre. Five or more acts on one bill, or "Festival" in
  the name, makes it a festival.
- **Tour dates** is the larger of the act's shows in the list, Bandsintown's upcoming count and
  SeatGeek's `num_upcoming_events`.
- **Examples:**
  - Ivy Lanes at Spark Arena (1.25 M followers, 52 dates, Ticketmaster's first result) scores 0.867.
  - Iron Harbour at Sky Stadium (unknown to Bandsintown) scores 0.786.

### Suggestions

- **Matching.** Both sides are folded: lower case, accents off, letters and digits only. An act
  matches if its name, or any word in it, starts with what was typed. This covers:
  - **One letter:** "i" finds Ivy Lanes.
  - **Accents:** "ko" finds Kōtuku Sound, and "Beyoncé" finds Beyonce.
  - **"The …":** "beat" finds The Beatles, and "Beatles, The" is read as "The Beatles".
  - **Several words:** "hot chili" finds Red Hot Chili Peppers.
  - **Names without spaces:** "acdc" finds AC/DC.
  - **Korean:** a first consonant ("ㅇ") finds its syllables (아이유).
- **Groups:**
  - `near`: shows in the phone's region. For a small country, everything in it and just over the
    border.
  - `elsewhere`: the rest of the country. When the phone sends no region, everything in the
    country goes here.
  - `worldwide`: acts with no show in the country, from every other list and from Bandsintown
    tour dates.

  Each group is biggest first. An act appears once, in the nearest group it has a show in.
- **The cache.** Matches are worked out once per (country, prefix) and kept until any list
  changes, at most 20,000 at a time (least recently used go first). The region only splits a
  cached answer into groups. "i" in New Zealand is looked up once and then served to everyone.
- **Never a source call.** The answers read the lists in memory. Asking only records demand and,
  for a new country, wakes the refresher.

### Regions

The phone sends its country and at most its region, never where it is (`Regions.kt`).

- **New Zealand: North or South Island.** A plain line of latitude fails at Cook Strait: Nelson
  (41.27°S) is further north than Wellington (41.29°S), and Picton is level with Wellington.
  The line runs from 40.0°S 172.0°E (west of Farewell Spit) to 42.0°S 175.6°E (south-east of
  Cape Palliser), and south-west of it is the South Island. Tested on 14 towns. A venue without
  coordinates goes by its region's name (Canterbury is south, Hawke's Bay north). The phone may
  send `north`, `south`, `North Island`, or its region's name (`Auckland`).
- **Small countries** have no regions: "near" is the whole country plus shows in other lists
  within 250 km of its middle (an evening's drive or train). The small countries are Belgium,
  the Netherlands, Luxembourg, Switzerland, Austria, Denmark, Ireland, Portugal, Czechia,
  Slovakia, Slovenia, Croatia, Hungary, the Baltics, Israel, Lebanon, the Gulf states, Singapore,
  Hong Kong, Macau and the microstates.
- **Everywhere else: the source's state or region.** That's a code where one is given (US `CA`,
  Australia `NSW`), else the name. The phone may send either, in any case. A region nobody lists
  falls back to the whole country.
- **No region data at all** (some countries' venues carry none): only "whole country". The phone
  still sorts by its own location.
- **`regions` in each `coming` answer** lists the country's regions with their middles, so the
  phone can pick the nearest one itself.

### Worth travelling for

These are big shows in another country, within 3,000 km of the region's middle (or the
country's). That's about 3–4 hours' flight: a jet covers about 800 km an hour, plus getting up
and down. For example, Auckland to Sydney is 2,150 km and London to Lisbon 1,600 km. A show is
big if it's at a stadium, a festival or a big outdoor site, at a venue for 15,000 or more, or
scores 0.7 or more. They come from the neighbours' short lists and Bandsintown tour dates,
biggest first, each with its distance in km.

### Members only

- **The check.** `EntitlementCheck` (`DiscoverStore.kt`) is the relay's one Moshpoint+ check for
  keyed endpoints. Each request goes through these in order:
  1. The usual rate limit, as for any read (429).
  2. `members only` (403).
  3. `not configured` (503, on a relay without source keys).
  4. Bad input (400).
- **Today it says no to everyone.** `MOSHPOINT_DISCOVER_OPEN=1` (exactly `1`) opens it, for
  internal testing only. Billing replaces it with purchase verification.

### Privacy

- The relay keeps, per country only, when someone last asked: no ids, tokens or addresses.
- What was typed is never stored or logged. It's only a cache key in memory.
- Logs show country codes and counts.
- The source keys only ever go into the URLs sent to the sources, which are never logged.
  `LogPrivacy` hides any key that ever is.

## Decisions

| Decision | Why |
|---|---|
| **Lists per country, refreshed on a timer, not a search per keystroke** | One letter is a whole country's worth of acts. No source answers that fast, or that often, within a free tier. A list a few hours old is fresh enough for shows months away. |
| **Demand decides which countries get lists** | Most of the world's countries will never be asked about. Refreshing only those asked about in the last week keeps a quiet country at zero calls. |
| **Short lists for neighbours** | "Worth travelling for" and small countries' "near" need their neighbours' big shows, not every show. One page twice a day is 2 calls. |
| **Ticketmaster sorted by relevance** | With a 1,000-result limit, the 1,000 most relevant are the ones worth keeping, and their order is one of the popularity signals. |
| **Bandsintown per act, shared by every country** | It has no country search. Looking up each act once a day for every list it's in makes the budget go furthest, and its tour dates fill countries the others don't cover. |
| **Cache per (country, prefix), split by region at answer time** | The cache holds one entry per country and prefix rather than one per region. |
| **`ready: false`, not 404 or 503, while a first list is built** | The request was fine and the app has something to show ("Getting the list…"). It just asks again. |
| **403 before 503** | Non-members learn nothing about a relay's configuration, and members learn that a relay has no keys. |
