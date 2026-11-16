# Wave 2c, part 3: the app adopts the relay's new endpoints

The app side of [RELAY_API.md](RELAY_API.md) sections 7 to 11 (install token, 429 by kind,
cursors, batch), plus moments uploads and clips on Wi-Fi: the audit's biggest remaining battery
items, performance P0-2 (the mobile radio never idles) and P1-8 (chat polls re-download
everything; clips come over mobile data). Parts 1 and 2: [WAVE2C_BATTERY.md](WAVE2C_BATTERY.md),
[WAVE2C_PERF.md](WAVE2C_PERF.md). Branch: `claude/wave2c-endpoints`, from
`ccr-5839ed7c-1q0ztj` at 8024c86. Field tests: [FIELD_TEST_PLAN.md](FIELD_TEST_PLAN.md) section 4l.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done and green:** step 1, the install token (CI run 336 on 23c8ef5: phone and watch builds,
  core and server tests, every screenshot byte-identical).
- **In CI:** step 2, 429 by kind (run 337, 0d79328).
- **Pushed, each with its own CI run, queued in order after 337:** steps 3, 4, 5 and 6, one
  commit each, each pushed on its own so each gets its own run. Why not one at a time after the
  previous was green: this session may stop at any moment, and work that isn't pushed is lost
  with the container; pushing each step as its own head still checks every step in its own
  run, in order. The branch head is green once all the runs are.
- **Exact next step:** follow the runs in order (337, then the one for each step). For each
  green one, compare its screenshots (below) and note it in the table. If one is red: the
  later runs contain that step too, so fix it on the branch head (one commit, pushed without
  `[skip ci]`) and check that run. Then the final report.
- **Last green CI run:** 336 (23c8ef5, step 1).
- **Screenshots:** run 336: all 2,320 phone and 798 watch images identical to `ui-screenshots`
  and `ui-screenshots-watch` (git blob hashes). Expected the same for every step: no screen or
  string changes. How to check after a run:
  `git fetch origin ui-screenshots ui-screenshots-claude-wave2c-endpoints ui-screenshots-watch ui-screenshots-watch-claude-wave2c-endpoints`,
  then compare `git ls-tree -r` of each pair.
- **Checked locally before every push:** core and server tests (scratch Gradle build with only
  `:core` and `:server`, Maven Central only, as docs/WATCH.md describes), `tools/check_secrets.py`,
  and a type-check of the app with plain `kotlinc` against core, with small stubs for
  `SystemClock`, `BuildConfig`, `Base64`, `SharedPreferences` and `Context`: `RelayClient.kt`
  has no errors at all, and every other file touched has exactly ccr's set of errors (all
  Android names that don't resolve here), apart from `NetState`'s use of `NetworkCapabilities`.

## The steps (RELAY_API.md section 11's order; each one works on its own)

| Step | What | Core rule (tests) | Status |
|---|---|---|---|
| 1 | Install token | `InstallToken` (`InstallTokenTest`) | green, run 336 |
| 2 | 429 by kind | `RelayHolds`, `RelayBudget` pause (`RelayHoldsTest`) | in CI, run 337 |
| 3 | Chat cursors (`/v1/heldsince`) | `HeldMirror`, `RelayWire`, `RelayEndpoints` (`HeldMirrorTest`) | pushed, CI queued |
| 4 | One batch a minute; budget lowered | `BatchPlan`, `RelayWire` (`BatchPlanTest`, `AppRequestFixtureTest`; server `AppRequestsTest`) | pushed, CI queued |
| 5 | Moments: `Content-Length`, reseal on 400 | `Reseal` (`MomentRulesTest`) | pushed, CI queued |
| 6 | Clips on Wi-Fi | `MomentFetch` (`MomentFetchTest`) | pushed, CI queued |

## Rules kept (from the brief)

- **Safety is never batched, delayed or limited.** Need help, Check in, Home safe and overdue
  alerts go at once, on their own, exactly as before: `BatchPlan.route` sends `RelayUse.SAFETY`
  alone; `RelayHolds` never holds safety; the lowered budget never counts it
  (`safetyAlwaysHasRoom`). `BatchPlanTest.needHelpDoesNotWaitForTheBatch` drives the real
  courier: Need help (and its durable chat copy) starts uploading the moment it's posted while a
  batch is 30 s away, and no batch ever carries it. The last-gasp location at 5% also goes alone.
- **The free path keeps working.** No build needs `MOSHPOINT_SERVER`. With no server built in,
  the app uses ntfy.sh exactly as before: tokens, cursors and batches are only ever used with
  our own relay (`RelayEndpoints.usable` is false for a blank base; the token is never asked for
  or sent there). Every new endpoint falls back to the old one on `404` (an older relay).
- **Old and new builds keep talking** (build 312 and this one in one crew): message formats are
  unchanged; only how they travel changes. Batch puts land in the same mailboxes, as the same
  records, as single puts (server `AppRequestsTest` checks a batch's gets read back exactly what
  `/v1/lookup` answers).
- **No screen changes, no new strings.**
- **Decisions in core**, as pure rules with tests; the app only feeds them.

## Step 1: install token (RELAY_API.md sections 7 and 11.1)

Core `InstallToken` (the rule) and `RelayClient` (the requests).

- Asked for at first start (`RelayClient.init`), in the background: nothing waits for it.
  Kept in the `relay` prefs (`token`), with the relay it came from.
- Sent as `X-Moshpoint-Token` on every request to **that** relay: mailboxes, lookups, moments,
  photos, reports, and venue lookups and Discover when they ask the same relay
  (`RelayClient.sign`). Never to ntfy.sh, never to another relay (a test build switched to a
  crew's relay asks that one for its own).
- Asked again at most once an hour after any answer that wasn't a token (`429`, an older relay's
  `404`, junk), counted across restarts (saved), so a crash loop can't become an ask per start.
  An ask that got no answer (no signal, a 5xx from the host) may be tried again after a minute.
- `X-Moshpoint-Token: invalid` in any answer drops it; the next ask follows the hourly rule.
- Only a well-formed token (44 base64url characters) is kept or sent: nothing else from an
  answer goes into a header.

Why per relay: a token is only meaningful to the relay that signed it; sending it elsewhere
would earn an `invalid` and a pointless ask, and tells another relay nothing it should know.

## Step 2: 429 by kind (RELAY_API.md sections 1, 10 and 11.2)

Core `RelayHolds` reads `X-Moshpoint-Limit` and `Retry-After`; `RelayClient.exchange` tags every
request with its kind of traffic (record puts, uploads, downloads, reads) and its mailbox.

- `client` / `address`: everything waits the relay's `Retry-After` (`RelayBudget.settle(…,
  pauseMs)`), stretched by up to a quarter so a crowd doesn't come back in step, with no growing
  back-off on top. Missing or garbled: the relay's own default (5 s); never over 15 minutes.
- `mailbox`: only that mailbox waits (10 s by default); every other request carries on.
- `bytes`: only that kind of traffic waits (record puts, uploads or downloads: the kind of the
  request that hit it; 60 s by default); lookups and the rest carry on.
- No header (an older relay, or the public one): the old pause, exactly as before.
- Safety pings are never held by any of this (they still get through the old whole-client pause
  once every 10 s, as before).
- The caller still sees `THROTTLED`; the courier's own reaction to it (holding its uploads 30 s
  to 2 min, Need help retrying every 15 s) is unchanged. Decision: changing the courier's
  pacing wasn't needed for the radio to idle, and keeps its tested safety behaviour as it is.

## Step 3: chat cursors (RELAY_API.md sections 8 and 11.3)

`RelayClient.lookupHeld` asks `POST /v1/heldsince` with a cursor per mailbox, so a chat poll with
nothing new costs 14 bytes a mailbox instead of up to 200 messages (P1-8: 10 to 30 MB an hour
for a busy crew).

- **Callers still get the whole mailbox, newest first**, exactly as `/v1/heldlookup` gave it.
  Core `HeldMirror` keeps each mailbox the way the relay keeps it: new records after the old,
  the same bytes posted again moved to newest, 200 at most. Decision: the courier counts on
  seeing everything in a mailbox (what's on the relay, how full today's mailbox is, whether a
  crew mate's upload really landed); keeping that contract means ChatSync, the courier and
  every reader are untouched. `HeldMirrorTest` checks the copy always reads exactly like the
  relay's whole mailbox, against a model of the relay's store.
- MORE (an answer full at 512 KB) asks again at once, up to 20 asks a poll.
- A cursor the relay doesn't know (it was replaced, or another relay) comes back as
  everything with a `next` below what was asked: the copy starts again from that answer.
- In memory only, at most 4 MB (least recently used mailboxes go first; never one the poll is
  reading); a mailbox not asked about for 6 hours is forgotten. Forgetting is always safe: the
  next ask is from cursor 0, everything, as before. So every start of the app begins with one
  full fetch. Decision: saving the copy to disk would add writes and a format to migrate for a
  saving of one request per start.
- One chat poll at a time (a mutex), so answers to two polls never cross.
- `404`, `405` or `400` (the relay can't read what we sent), or an answer we can't read: the old
  `/v1/heldlookup` for an hour, then the new one is tried again (core `RelayEndpoints`).

## Step 4: one batch a minute (RELAY_API.md sections 9, 11.4 and 11.6)

The crew sync (`GroupSync.syncServer`) becomes one `POST /v1/batch` a minute
(`RelayClient.sync`), instead of a lookup every 30 s plus a request for every location fix,
crowd-relay packet (10 to 20 a minute in a crowd), floor box and intro.

- **What goes in** (core `BatchPlan`):
  - **replaceable puts**, each rotating id at most once per batch, the newest copy: location
    shares (`LocationUploader`), crowd-relay packets (the finder's `CrowdRelayRadio`, through
    `FinderSetup`'s mailbox, unchanged), floor boxes (`Floors`), crew intros (`GroupSync`);
  - **the courier's crew messages that aren't safety** (chat, quick pings, pins, private
    messages, "I'm here", helpers' uploads), each one: none replaces another;
  - **the sync's mailbox reads**: intros, the pin, pings and every crew mate's box, read whole
    (`since` 0). Decision: these boxes are small and their ids rotate every 5 minutes, so a
    cursor saves little; read whole, every reader (the courier's pin and ping views included)
    sees exactly what `/v1/lookup` gave. The server test checks the batch's gets, read
    backwards, are byte for byte `/v1/lookup`'s answer.
  - Gets first (they're why the sync asks), then the oldest puts that fit (200 ops, 512 KB);
    what doesn't fit goes straight after.
- **When:** the sync's batch once a minute; otherwise `RelayClient`'s flusher sends what's
  waiting a minute after the oldest put (no crew, a dormant crew). **Sooner when someone is
  waiting:** our position while a mate is looking for us (the finder's "looking" advert boosts
  the uploader), or a message just written (within 10 s of `OfflineMessages.post`): within
  1.5 s, taking everything else waiting with it.
- **Never in a batch:** safety (Need help, Check in, Home safe: `PingPolicy.use` is SAFETY), and
  the last-gasp location at 5% battery: at once, on their own, as before. Chat lines rewritten
  by older paths (`CrewChat`'s history bundle, rekey notices, Friendship) still go alone too.
- **Answers:** a put's status goes back to the courier (OK = sent, BAD = refused, MAILBOX and
  BYTES = held as after a 429, FULL = as a 503); locations wait for the next batch when the batch
  got no answer, unless a newer copy is waiting or they're over 10 minutes old. The courier's
  messages aren't put back: the courier decides when to retry, as before. A message waits at
  most 90 s for its batch, then the courier is told "no answer".
- **Older relay:** `404`, `405`, `400`, `413` or an unreadable answer: everything waiting goes
  the old way at once, one request each, and the old lookups for an hour (`RelayEndpoints`).
- **Budget (11.6):** with batches, our relay's budget drops from 600 requests a minute to 30.
  Decision: not "about 10": the finder polls our relay every 4 s while it's open (15 a minute),
  which must never be held back. Safety never counts against it (`safetyAlwaysHasRoom`); the
  public relay's budget is unchanged. Without batches (an older relay) the old 600 stands.
- **Sync interval:** 60 s with batches (was 30 s on our relay), unchanged without them.
- **The app's bytes against the real relay:** core `AppRequestFixtureTest` builds a sync batch
  and a chat poll with the app's own code and checks them against
  `server/src/test/resources/app-requests.txt`; server `AppRequestsTest` sends that file to the
  real relay and checks every put lands and every get reads it back. Decision: a fixture, not a
  dependency: the server's Docker build copies only `server/` and includes only `:server`, so
  `server` can't depend on `core`.
- Chat polls (`ChatSync`) stay on `/v1/heldsince` (step 3), timed with the sync: they run in the
  same second as the batch, so the radio still wakes once a minute. Decision: folding them into
  the batch saves one request in the same radio wake, at the cost of rewriting ChatSync's flow.

## Step 5: moments uploads (RELAY_API.md section 11.5)

- Every PUT to our own relay streams with `setFixedLengthStreamingMode`: the length goes first,
  a 12 MB clip is no longer copied whole in memory, and the relay can refuse an oversized or
  over-budget upload before it's sent.
- A `400` for a moment or a profile photo means its sealed bytes happened to start like an
  ordinary file (about once in 2.5 million): sealed again (a new nonce) and sent once more
  (core `Reseal`). A second `400` is a real refusal.

## Step 6: clips on Wi-Fi (performance P1-8)

A moment is one sealed file (RELAY_API.md section 5): its listing gives only when it was posted,
and nothing in it, not even a clip's first frame, can be opened until the whole file is here.
So what the board needs to show a moment exists is the whole file for a photo, and nothing
smaller for a clip. Core `MomentFetch`:

- **In the background on a metered network** (the crew sync, every 2 minutes): photos, and
  anything else up to 2 MB. A bigger one (a clip) stops as soon as the answer's `Content-Length`
  says so, before any of it is read (or at 2 MB without one), and isn't asked for again in the
  background until the phone is on an unmetered network.
- **When the Story is open** (tapped to watch; `Moments.refreshNow`) **or on an unmetered
  network** (`NetState.unmetered`): everything, as before.
- **Data saver keeps its meaning:** how big the photos and clips we share are. It doesn't change
  what we download.
- Trade-off (the audit's accepted cost, "clips load on open"): a clip shared while you're on
  mobile data shows up, and notifies (if it's still under 15 minutes old), when you open the
  Story or reach Wi-Fi.

## Expected effect

For the audit's case (pocket, screen off, Live on, crew of 5, own relay, LTE, 4 h): requests to
the relay drop from one every 3 to 5 s to about one moment a minute when the radio wakes (the
batch, plus a chat poll every 2 minutes and the moments list in the same second), so LTE can
idle between minutes: mobile data from 60 to 120 mA towards the audit's 15 to 30 mA. Chat polls
download only what's new; clips wait for Wi-Fi. To confirm with FIELD_TEST_PLAN.md section 4l.

## Risks (for the reviewer)

- Nothing in `app` can be compiled here (Google Maven is blocked): CI is the first compile.
- **Positions up to a minute later** while nobody is looking for you (the audit's accepted
  cost); a mate looking for you gets yours within a couple of seconds, as before.
- **Chat and pings you write** go within about 1.5 s plus the request (they used to start at
  once). Safety goes at once, as before.
- **Helpers' uploads and pin refreshes** wait for the minute's batch.
- **The courier's "the relay isn't answering" rule** (45 s since the last answer) now sees
  answers once a minute: one failed batch right before a sync can show messages as waiting for
  Bluetooth until the next answer, up to a minute.
- **An older relay** (none in use once the hardened relay is deployed) costs one refused request
  an hour per new endpoint, then everything goes the old way.
- **Cursors in memory only:** every start of the app downloads the chat mailboxes once, as
  every poll used to.
