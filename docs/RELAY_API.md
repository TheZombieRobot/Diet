# Relay API

The Moshpoint relay server (`server/`) is a dumb mailbox for sealed bytes. No accounts, no names,
no plain locations: phones post encrypted records under rotating ids and fetch each other's. This
is the complete reference for the app. How the server is run: [SERVER_PRODUCTION.md](SERVER_PRODUCTION.md).

- **Old endpoints** (sections 2 to 6) are exactly what test builds up to 289 use (`RelayClient`,
  `VenueLookup`, `GigSearch` in the app). Their bytes, statuses and limits on stored data are
  unchanged; `OldClientsTest` and `HeldMailboxTest` in the server pin them.
- **New endpoints** (section 7 on) are for the app's next version (wave 2): an install token,
  one batched request a minute, and cursors so a poll returns only what's new.

All numbers on the wire are big-endian. An **id** is 16 bytes: in a URL, 32 hex characters
(either case); in a body, the 16 raw bytes.

## 1. Answers and headers

| Status | Meaning | What the app should do |
|---|---|---|
| 200 / 204 | Done. | |
| 400 | This request can never work (bad id, bad size, a file that isn't sealed, a malformed batch), or its body was cut off (fewer bytes than its `Content-Length`). | Don't retry the same bytes (a cut-off body never reaches the phone anyway). |
| 403 | A Moshpoint+ feature (Discover, section 12) and this install isn't a member: body `members only`. | Show the Moshpoint+ card; don't retry. |
| 404 | Nothing there. | |
| 408 | An upload stalled for 30 s, or averaged under 4 KB/s after its first minute. | Retry later (the app counts 408 as "no answer"). |
| 413 | Batch body over 512 KB. | Split it. |
| 429 | A limit. `X-Moshpoint-Limit` says which, `Retry-After` when to come back (seconds). | See below. |
| 503 | Try later: the relay is full, low on disk, shutting down, busy (too many uploads or big answers at once), or an outside service is unavailable. Body `not configured` (Discover only): this relay has no keys for it. | Retry later; it's "no answer", not "refused". For `not configured`, hide Discover until the app next starts. |

`X-Moshpoint-Limit` values:

- `client`: this install's (or, without a token, this address's) requests per second, or more
  than 64 requests in progress at once from one address. Back off the whole client for
  `Retry-After` seconds.
- `address`: all tokened installs behind one address together (a very large venue). Same.
- `mailbox`: that one mailbox has been written too often, or a moments mailbox is full for the
  day. **Back off that mailbox only**; everything else carries on.
- `bytes`: a byte or upload budget for the hour (records, uploads or downloads; see section 10).
  Hold that kind of traffic for `Retry-After` seconds; messages and lookups can carry on.

Current builds only look at the status (any 429 pauses all their traffic for 5 to 30 s); the
header lets the next version pause only what's affected.

Request headers:

- `X-Moshpoint-Token: <token>` (optional, section 7). Without it a request is limited per address,
  as before. With a token we didn't issue (or after the secret was changed), the request still
  works, at the address's limits, and the answer carries `X-Moshpoint-Token: invalid`: ask for a
  new one.
- `Content-Length` on every body (the current app always sends it). A body that ends before its
  `Content-Length` (the connection dropped) is refused, never stored. Moments without one are
  still received, but then a cut-off upload can't be told from a whole one, and the length lets
  the relay refuse an oversized or over-budget upload before it's sent.

## 2. Location boxes (15 minutes)

Location packets, crowd-relay uploads, floor boxes, crew pings, the pin and crew lists (rosters).

`PUT /v1/box/{id}`, body = one sealed record of 16 to 255 bytes → `204`.

- Kept 15 minutes, at most 64 records per id; past 64 the oldest go.
- The same bytes again add no record: the old copy goes and the new one counts as newest.

`GET /v1/box/{id}` → `200` with `[len:1][record]` per record, newest first; `404` if none.

`POST /v1/lookup`, body = 1 to 64 raw ids (`16 × n` bytes) → `200` with, for each id in order,
`[count:1]` then `[len:1][record] × count`, newest first. `400` for any other body size.

## 3. Crew chat (72 hours)

Chat lines, history bundles, private messages, and the safety pings (Need help, Check in, Home
safe) that are also posted here.

`PUT /v1/held/{id}`, body = 16 to 4,000 bytes → `204`. Kept 72 hours, at most 200 records per id,
same rules as boxes (the same bytes take one slot and count as newest).

`POST /v1/heldlookup`, body = 1 to 64 raw ids → `200` with, for each id, `[count:1]` then
`[len:2][record] × count`, newest first (all of them, up to 200). For only what's new since the
last look, use `POST /v1/heldsince` (section 8).

## 4. Profile photos (8 days)

`PUT /v1/avatar/{id}`, body = 28 to 49,216 bytes (`AvatarBox`: nonce + AES-GCM) → `204`. Replaces
that id's photo. `GET /v1/avatar/{id}` → `200` with the bytes, or `404`.

The body must be sealed: one that starts like an ordinary file (a JPEG, PNG, video, PDF, archive
or plain text) is refused with `400`. A sealed photo is refused by chance about once in 2.5
million; publishing it again (new nonce) goes through.

## 5. Moments (24 hours)

`PUT /v1/file/{id}`, body = one sealed file, 28 bytes to 12,000,000 bytes → `200` with the file's
name as text (`<unix seconds>-<hex>`). Streamed to disk: the relay never holds the file in memory.
Refused with `400` if the size is wrong, it was cut off, or it isn't sealed (as photos). At most
500 files per id (then `429 mailbox`). An upload that sends nothing for 30 s, or averages under
4 KB/s after its first minute, is dropped (`408`).

`GET /v1/files/{id}?since=<unix seconds>` → `200` with one line per file, `<time> <name>`, newest
first (empty body if none).

`GET /v1/file/{id}/{name}` → `200` with the file (streamed, with `Content-Length`), or `404`.
Each file can be downloaded in full 500 times; after that it answers `404`. Refused or cut-off
downloads don't count. There is no time limit on a download: a slow phone gets its clip.

## 6. Gigs and venues

`GET /v1/gigs/search?q=<words>&country=<ISO code>` → `200` with a JSON array of
`{"name","venue","city","country","startsAtSec","localWhen","source","lat"?,"lon"?}`, soonest
first, at most 30. Always answers within about 10 seconds (sources that are slower are left out).

`GET /v1/gigs/sources` → JSON array of the sources switched on.

`GET /v1/venue?q=<name>&box=<left,top,right,bottom>` → `200` `{"lat","lon","name"}`, `404` if
there's no such place, `503` if it can't ask right now (one Nominatim request a second for
everyone; a queue over 4 seconds is told to come back).

`GET /healthz` → `200 ok`.

Discover's suggestions and Coming up (Moshpoint+ only) are in section 12.

## 7. Install token (new)

`POST /v1/install` (empty body) → `200` with a token as text (44 characters, base64url).

- Ask once, at first start, and keep it. Send it as `X-Moshpoint-Token` on every request.
- With it, the install has limits of its own instead of sharing its address's with everyone
  behind the same carrier address (table in section 10).
- Asking is limited per address (60 at once, then one every 30 s): if refused (`429`), carry on
  without one and ask again later.
- It names nobody: it's 12 random bytes and a time, signed by the relay. It's only used as a key
  for limits, held in memory, never logged or stored.
- `X-Moshpoint-Token: invalid` in an answer means the relay no longer knows it: get a new one.

## 8. Cursors (new)

Every record the relay stores gets a sequence number that only grows. A **cursor** is "the last
sequence number I've seen in this mailbox". Asking with a cursor returns only the records that
arrived after it, **oldest first**, and a new cursor to keep.

- Cursor `0` means "everything" (up to the mailbox's 64 or 200 records).
- Keep one cursor per mailbox id (or one per store, if every id you ask about was asked about
  last time too: the `next` returned is valid for every id in the answer).
- A record posted again (the same bytes) counts as arriving again, so it comes back once more.
  The app already drops duplicates by message id.
- A cursor larger than anything the relay has handed out counts as `0`: you get everything
  again, and a new cursor.
- At every start the relay raises its next number to at least the clock in microseconds (about
  1.8 × 10^15), so after a restore from an older snapshot new records still sort after every
  cursor a phone holds. Cursors fit in a signed 64-bit integer, and in a JSON number.

`POST /v1/heldsince`, body = 1 to 64 × `[id:16][since:8]` → `200` with
`[version = 1][count:1]` then, per id in order, a **get block**:

```
[status:1][next:8][count:2] then count × [len:2][record]     records oldest first
```

`status` is `0` (all new records are here; `next` is your new cursor) or `1` (MORE: the answer
filled up at 512 KB of records; `next` is the last record sent; ask again from it soon).

This replaces `/v1/heldlookup` for polling: a poll with nothing new costs 14 bytes per mailbox
instead of up to 200 messages.

## 9. Batch (new)

`POST /v1/batch`: several puts and gets in one request, so a phone can talk to the relay about
once a minute. Body at most 512 KB, 1 to 200 ops.

Request:

```
[version = 1][op count:1]
then per op: [type:1][length:2][payload: length bytes]

type 1  PUT_BOX    payload = [id:16][record: 16..255 bytes]      as PUT /v1/box
type 2  PUT_HELD   payload = [id:16][record: 16..4000 bytes]     as PUT /v1/held
type 3  GET_BOX    payload = [id:16][since:8]                    since 0 = everything
type 4  GET_HELD   payload = [id:16][since:8]
```

Answer `200`:

```
[version = 1][op count:1]
then per op, in the order sent:
  PUT_*         [status:1]
  GET_*         a get block (section 8): [status:1][next:8][count:2] + records oldest first
                (always the whole block, even with status BAD: next 0, count 0)
  unknown type  [status = 6] only
```

Statuses: `0` OK · `1` MORE (get: ask again from `next`) · `2` BAD (wrong size; never retry) ·
`3` MAILBOX (that mailbox is busy: retry it later) · `4` BYTES (this client's record budget:
retry later) · `5` FULL (the relay is full or low on disk: retry later) · `6` UNKNOWN (this relay
doesn't know that op type; ops carry their length so newer types can be skipped).

- Puts run first (each store's in one transaction, in the order sent), then gets, so a phone sees
  its own puts in the same answer.
- Each put is limited like the single request (mailbox write limit, byte budget). A refused put
  doesn't fail the batch.
- The whole batch is refused only by the client's request limit (`429`), a malformed body
  (`400`) or size (`413`). It costs one read as it arrives (before its body is read, so junk
  costs too), then one write per 8 puts (at least one if there are any) and one more read per
  8 gets. One batch a minute is far inside any limit.
- Answers carry at most 512 KB of records; gets past that say MORE.

Example: put a 29-byte location record under id `A` and read box `B` from the start.

```
01 02                                    version 1, 2 ops
01 00 2d  <A: 16 bytes> <29 bytes>       PUT_BOX, length 45
03 00 18  <B: 16 bytes> 00 00 00 00 00 00 00 00
                                         GET_BOX, length 24, since 0
answer:
01 02
00                                       PUT: OK
00 <next: 8 bytes> 00 01 00 1d <29 bytes>
                                         GET: OK, cursor, 1 record of 29 bytes
```

## 10. Limits

Requests (token bucket: burst, then per second):

| Who | Writes | Reads |
|---|---|---|
| No token, per address (IPv6: per /64) | 1,000, then 50/s | 1,000, then 50/s |
| With a token, per install | 120, then 2/s | 120, then 2/s |
| With tokens, all installs behind one address together | 20,000, then 500/s | (shared) |

Per mailbox, whoever writes: box 600 then 10/s · chat 120 then 2/s · moments 100 then one per 5 s ·
photos 20 then one a minute. Moments: 500 files per id.

Budgets per hour. Every request counts against its address's budget, token or not (so tokens
can't multiply what one address gets), and one with a token against its install's as well:

| Budget | Per address | Per install (with a token) |
|---|---|---|
| Record bytes (box and chat puts) | 64 MB | 8 MB |
| Upload bytes (moments and photos) | 2 GB | 300 MB |
| Uploads (moments and photos), by number | 600 at once, then 2,000 an hour | 100, then 200 an hour |
| Download bytes (moments and photos) | 4 GB | 512 MB |

At once: 64 requests in progress per address; 16 uploads per address and 64 in all; 128 big
answers (lookups, batches) being built and sent in all.

Whole relay: byte and file-count caps per store (shares of the volume, see "Memory" in
[SERVER_PRODUCTION.md](SERVER_PRODUCTION.md)); each moment downloaded in full at most 500 times.

The operator can scale every per-client limit with `LIMIT_SCALE` (e.g. `2` during a festival).

## 11. Adopting the new endpoints (wave 2, app side)

Done in wave 2c part 3: how each step was adopted, and the decisions made, are in
[WAVE2C_ENDPOINTS.md](WAVE2C_ENDPOINTS.md).

In `RelayClient` and the courier, in this order (each step works on its own):

1. **Token.** At first start `POST /v1/install`, keep the token in prefs, send
   `X-Moshpoint-Token` on every request to our own relay. On `X-Moshpoint-Token: invalid`, drop
   it and ask again (at most once an hour).
2. **429 by kind.** Read `X-Moshpoint-Limit`: `mailbox` holds only that mailbox; `bytes` holds
   only uploads (or downloads); `client`/`address` hold everything for `Retry-After` seconds.
   Missing header (an older relay): today's behaviour.
3. **Chat cursors.** Replace `lookupHeld` (`/v1/heldlookup`) with `/v1/heldsince`, keeping a
   cursor per mailbox id with the crew's state. Records come oldest first now (the courier reads
   the old answer backwards to get that order). On status MORE, ask again.
4. **One batch a minute.** The 60 s sync becomes one `/v1/batch`: every queued location, floor
   and crowd-relay packet (each rotating id at most once per batch, newest copy), queued
   pings, chat and pins as puts; the crew's box ids, ping id, pin id and chat ids as gets with
   their cursors. Need help still goes at once, on its own (`PUT /v1/held` and `/v1/box`).
5. **Moments.** Upload with `Content-Length` (HttpURLConnection's `setFixedLengthStreamingMode`).
   A `400` for a photo means "reseal and try again" (the 1-in-2.5-million false match).
6. **Budgets.** `ownBudget` in `RelayClient` can then drop its 600 requests a minute to about 10.

Older relays (none in use once the hardened relay is deployed) answer the new endpoints `404`;
fall back to the old ones on `404`.

## 12. Discover (new, Moshpoint+ only)

Smart search and "Coming up near you" (ROADMAP.md, "Discover and hype"). Both answer only from
the relay's cached country lists, never with a call to a listing service, so they're fast enough
to call on every keystroke. How the lists are built: [DISCOVER_SERVER.md](DISCOVER_SERVER.md).
The phone sends its country and at most its region, never where it is.

Each request is checked in this order:

1. `429`: the usual limits; each request counts as one read.
2. `403 members only`: not a Moshpoint+ member. Today everyone gets this unless the relay runs
   with `MOSHPOINT_DISCOVER_OPEN=1` (internal testing only).
3. `503 not configured`: this relay has no listing-service keys. The free relay never has them.
4. `400 bad country` / `400 bad q`.

**A show** is a JSON object:

```json
{"id": "3f9c0a1b2c3d4e5f", "artist": "Ivy Lanes", "name": "Ivy Lanes: The Long Way Home Tour",
 "date": "2027-03-13", "time": "19:30", "startsAtSec": 1804919400, "venue": "Spark Arena",
 "city": "Auckland", "region": "north", "country": "NZ", "lat": -36.84794, "lon": 174.77783,
 "tickets": "https://www.ticketmaster.co.nz/…", "image": "https://…", "kind": "arena", "score": 0.867}
```

- `date` and `time` are local to the venue. `time` is missing when it hasn't been announced.
  `startsAtSec` is approximate, for sorting only.
- `id` is the same for the same show from any source and from one refresh to the next.
- `kind` is one of `stadium`, `festival`, `outdoor`, `arena`, `theatre`, `club` or `unknown`.
- `score` runs from 0 to 1: bigger shows score higher.
- `lat` and `lon` are the venue's. They're missing when no source gives them.
- `tickets` is the official ticket page: the seller's own, or Bandsintown's link to it.

### `GET /v1/discover/suggest?country=NZ&q=i&region=north&limit=10`

| Parameter | |
|---|---|
| `country` | Required. ISO 3166-1 alpha-2, in either case. |
| `q` | Required. What's been typed: one letter or more. Case and accents don't matter. Matches the start of an act's name or of any word in it ("beat" finds The Beatles). |
| `region` | Optional. In New Zealand: `north`, `south`, `North Island`, `South Island`, or the phone's region name (`Auckland` is north). Elsewhere, an `id` or `name` from a `coming` answer's `regions` (US `CA` or `California`). |
| `limit` | Per group, 1–30. Default 10. |

`200`:

```json
{"country": "NZ", "q": "i", "region": "north", "ready": true, "updatedAtSec": 1794819600,
 "near": [{"artist": "Ivy Lanes", "score": 0.867, "image": "https://…", "shows": 1, "countryShows": 2, "next": {show}}],
 "elsewhere": [{"artist": "Inkwell", "score": 0.536, "image": "", "shows": 1, "countryShows": 1, "next": {show}}],
 "worldwide": [{"artist": "Indigo Static", "score": 0.839, "image": "https://…", "shows": 1, "next": {show}}]}
```

- `near` is acts with a show in the region. For a small country (Belgium, the Netherlands,
  Switzerland and so on) it's everything in the country and just over the border.
- `elsewhere` is the rest of the country. With no `region` (or one the relay doesn't know),
  everything in the country is here.
- `worldwide` is acts with no show in the country.
- Each group is biggest first, and an act is listed once, in the nearest group it has a show in.
- `shows` counts the act's shows in that group. `countryShows` counts all of them in the country.
  `next` is the soonest show in that group.
- `region` is the region understood (`null` if none).
- `ready: false` means this country's list is still being built (the first ask for it starts
  that). The groups are empty: say "Getting the list…" and ask again in about 30 seconds.
  `updatedAtSec` is when the list was built.

### `GET /v1/discover/coming?country=NZ&region=north&scope=near&limit=50`

The next 12 months, biggest first.

| Parameter | |
|---|---|
| `country` | Required, as above. |
| `region` | Optional, as above. |
| `scope` | `near` (default): the region; for a small country, the country and just over the border; with no known region, the whole country. `country`: the whole country. `travel`: worth travelling for, meaning big shows (stadiums, festivals, venues for 15,000 or more, or score 0.7 or more) in other countries within 3,000 km (3–4 hours' flight) of the region's middle or the country's. |
| `limit` | 1–200. Default 50. |

`200`:

```json
{"country": "NZ", "scope": "near", "region": "north", "ready": true, "updatedAtSec": 1794819600, "total": 4,
 "shows": [{show}, …],
 "regions": [{"id": "north", "name": "North Island", "shows": 4, "lat": -38.33, "lon": 174.78},
             {"id": "south", "name": "South Island", "shows": 2, "lat": -42.41, "lon": 172.95}]}
```

- With `scope=travel`, each show also has `km`: its distance from the region's (or country's)
  middle.
- `regions` lists the country's regions, so the phone can pick its own (the nearest middle; in
  New Zealand, the island). It then sends only the `id`, never its location.
- `total` counts every show in the scope. `shows` holds the first `limit`.

