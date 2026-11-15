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
| 400 | This request can never work (bad id, bad size, a file that isn't sealed, a malformed batch). | Don't retry the same bytes. |
| 404 | Nothing there. | |
| 413 | Batch body over 512 KB. | Split it. |
| 429 | A limit. `X-Moshpoint-Limit` says which, `Retry-After` when to come back (seconds). | See below. |
| 503 | Try later: the relay is full, low on disk, shutting down, busy with uploads, or an outside service is unavailable. | Retry later; it's "no answer", not "refused". |

`X-Moshpoint-Limit` values:

- `client`: this install's (or, without a token, this address's) requests per second. Back off
  the whole client for `Retry-After` seconds.
- `address`: all tokened installs behind one address together (a very large venue). Same.
- `mailbox`: that one mailbox has been written too often, or a moments mailbox is full for the
  day. **Back off that mailbox only**; everything else carries on.
- `bytes`: this client's byte budget for the hour (records, uploads or downloads). Hold that kind
  of traffic for `Retry-After` seconds; messages and lookups can carry on.

Current builds only look at the status (any 429 pauses all their traffic for 5 to 30 s); the
header lets the next version pause only what's affected.

Request headers:

- `X-Moshpoint-Token: <token>` (optional, section 7). Without it a request is limited per address,
  as before. With a token we didn't issue (or after the secret was changed), the request still
  works, at the address's limits, and the answer carries `X-Moshpoint-Token: invalid`: ask for a
  new one.
- `Content-Length` on uploads. Files without one are still received, but the length lets the
  relay refuse an oversized or over-budget upload before it's sent.

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
Refused with `400` if the size is wrong or it isn't sealed (as photos). At most 500 files per id
(then `429 mailbox`).

`GET /v1/files/{id}?since=<unix seconds>` → `200` with one line per file, `<time> <name>`, newest
first (empty body if none).

`GET /v1/file/{id}/{name}` → `200` with the file (streamed, with `Content-Length`), or `404`.
Each file can be downloaded 500 times; after that it answers `404`.

## 6. Gigs and venues

`GET /v1/gigs/search?q=<words>&country=<ISO code>` → `200` with a JSON array of
`{"name","venue","city","country","startsAtSec","localWhen","source","lat"?,"lon"?}`, soonest
first, at most 30. Always answers within about 10 seconds (sources that are slower are left out).

`GET /v1/gigs/sources` → JSON array of the sources switched on.

`GET /v1/venue?q=<name>&box=<left,top,right,bottom>` → `200` `{"lat","lon","name"}`, `404` if
there's no such place, `503` if it can't ask right now (one Nominatim request a second for
everyone; a queue over 4 seconds is told to come back).

`GET /healthz` → `200 ok`.

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
- A cursor larger than anything the relay has handed out (it was replaced or restored) counts as
  `0`: you get everything again, and a new cursor.
- Cursors start from the time the store was created (about 1.8 × 10^15), so they are always
  bigger than zero; they fit in a signed 64-bit integer, and in a JSON number.

`POST /v1/heldsince`, body = 1 to 64 × `[id:16][since:8]` → `200` with
`[version = 1][count:1]` then, per id in order, a **get block**:

```
[status:1][next:8][count:2] then count × [len:2][record]     records oldest first
```

`status` is `0` (all new records are here; `next` is your new cursor) or `1` (MORE: the answer
filled up at 1 MB; `next` is the last record sent; ask again from it soon). Total answer at most
about 1 MB.

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
  (`400`) or size (`413`). It costs `1 + puts/8` against the write limit and `1 + gets/8`
  against the read limit (so one batch a minute is far inside any limit).
- Answers carry at most about 1 MB of records; gets past that say MORE.

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

Bytes per hour, per client (without a token: per address; with one: per install): records 64 MB /
8 MB · uploads (moments and photos) 2 GB / 300 MB. Downloads (moments and photos) count against
the address whoever asks, 4 GB an hour, and with a token also against the install, 512 MB.

Whole relay: byte caps per store (shares of the volume, see "Storage" in
[SERVER_PRODUCTION.md](SERVER_PRODUCTION.md)); 48 uploads received at once; each moment downloaded
at most 500 times.

The operator can scale every per-client limit with `LIMIT_SCALE` (e.g. `2` during a festival).

## 11. Adopting the new endpoints (wave 2, app side)

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
