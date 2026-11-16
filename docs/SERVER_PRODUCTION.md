# Relay server: production readiness

Branch `claude/relay-production-r7k2q` (from `ccr-5839ed7c-1q0ztj`). Scope: `server/`, `fly.toml`,
`render.yaml` (now removed), `server/Dockerfile` and server docs. The wire protocol for apps:
[RELAY_API.md](RELAY_API.md). Audit items covered: reliability P0-3 and P1-9, release P1-10,
P1-11, P1-12 and the server P2s, performance P0-2 and P1-8 (server side).

## Status and next steps

_Handover, kept current. Last updated: 15 Nov 2026, work complete on this branch._

**Done** (all on the branch, server tests passing locally and in CI):

- Durable storage on a Fly volume: SQLite (WAL) for location boxes and chat, files with atomic
  writes for moments and profile photos, retention sweeps, flush on shutdown. Survives restarts
  and `kill -9` (tested).
- Streaming uploads and downloads; a 48 MB heap takes five 12 MB uploads at once (tested in a
  separate JVM). Byte caps per store, bounded caches, JVM heap set from the VM's memory.
- Limits: `Fly-Client-IP` (proxy headers trusted only on Fly), generous per-address limits,
  per-mailbox limits, byte budgets, optional install tokens, no plain files, download caps.
- Gig and venue lookups no longer block request threads; timeouts on every outside call.
- New endpoints: `POST /v1/install`, `POST /v1/batch`, `POST /v1/heldsince` (cursors).
- Non-root container, `fly.toml` for one always-on Machine with a volume, Render dropped,
  masked logs.
- Docs: this file and [RELAY_API.md](RELAY_API.md).
- An independent review of the server code found 13 problems. All are fixed (most with a test;
  the shutdown drain checked by hand) except one that needed only a correction in this doc
  (see "Review" below).

**CI:** "Core + server tests" (which runs `:server:test`) passed on GitHub in run 295 (the
first full version); the branch's latest run checks the review fixes on top.

**Next:**

1. Merge this branch (it touches only `server/`, `fly.toml`, `render.yaml` (deleted), server
   docs, and a few lines of README and ARCHITECTURE pointing here).
2. Owner: deploy with the steps under "Deploy (owner)" below, then set `MOSHPOINT_SERVER`.
3. Wave 2 (app): adopt the token, batch and cursors (RELAY_API.md section 11) and the app-side
   items at the end of this file. Nothing in the app has to change for the hardened relay to
   work with today's test builds.

**Checked by hand here:** the installed server (`installDist`) started through
`docker-entrypoint.sh` as root drops to uid 10001, takes the volume over, runs with the heap flags,
answers, refuses a plain JPEG, and on SIGTERM finishes, checkpoints and closes the database; a
record put before the stop was there after the restart.

**Not verified here:** the Docker image itself wasn't built in this session (no Docker daemon);
the entrypoint uses only `stat`, `chown` and `setpriv`, which the `eclipse-temurin:17-jre` (Ubuntu)
image has. Fly facts and prices were checked by web search on 15 Nov 2026 (fly.io itself couldn't
be reached from this session): confirm prices on fly.io/docs/about/pricing before budgeting, and
watch the first `fly deploy` for warnings about `fly.toml` keys.

## What changed, and why

### Durability

Before: everything in memory, files in `/tmp`, `auto_stop_machines = "stop"` with
`min_machines_running = 0`, so any idle stop, deploy or crash wiped chat, pins, rosters and safety
pings the app had already shown as sent. The first `fly deploy` also made two Machines, each with
half the mailboxes.

Now:

- **One always-on Machine** (`auto_stop_machines = "off"`, `min_machines_running = 1`), deployed
  with `--ha=false`; `fly scale count 1` if a second one ever appears. Its volume is mounted at
  `/data`. On Fly the relay refuses to start if `/data` isn't a mounted volume (so a missing mount
  fails the deploy instead of silently losing data; `REQUIRE_VOLUME=0` overrides).
- **Mailboxes in SQLite** (`/data/relay.db`): table `box` (locations, crowd-relay packets, floor,
  pings, pins, rosters; 15 min, 64 per id) and `held` (chat, private messages, safety pings;
  72 h, 200 per id). WAL journal, `synchronous=NORMAL`: a write the relay has answered survives
  the process being killed. Only a power cut or a host failure could lose the last moments
  (`SQLITE_SYNC=FULL` fsyncs every commit, at some cost in throughput). One thread owns the
  database, so request threads never wait on the disk.
- **Files on the volume**: moments in `/data/files/<id>/<name>`, photos in `/data/avatars/<id>`.
  Received into a temp file, flushed (`fsync`), renamed into place, directory flushed: a file is
  all there or not there. Half-received uploads are deleted at start.
- **Retention sweeps** every minute: boxes 15 min, chat 72 h, moments 24 h, photos 8 days, deleted
  from disk. Totals (counts and sizes only) are logged every 10 minutes.
- **Shutdown**: Fly sends SIGTERM (`kill_signal`). The relay drains first: new requests are
  answered `503` ("try later", which the app retries) while those in flight, an upload or a
  download, get up to 20 s to finish. Then Netty stops and the relay checkpoints and closes the
  database. `kill_timeout = 30s` leaves room. (Netty's own graceful stop waits for quiet, not for
  requests: without the drain, an upload in progress was cut off.) Checked by hand: SIGTERM
  2 s into a 10 s upload; the upload finished and was stored, and the process exited 11 s later.
- **Cursors**: every record has a sequence number. At every start the next one is raised to at
  least the clock in microseconds, so a store recreated empty or restored from an older snapshot
  never hands out a number below a cursor a phone kept (tested).

### Memory

- Uploads stream to disk in 64 KB chunks; downloads stream from disk. The relay never holds a
  file whole (old: 12 MB per upload in a ~100 MB heap).
- Photos moved from the heap (up to 256 MB) to disk. The only things in memory are the file
  lists (ids, names, sizes, times), the rate-limit buckets and SQLite's 32 MB page cache.
- Byte caps per store, as shares of the volume (read at start, so extending the volume raises
  them): boxes 3%, chat 12% (both counted with 64 bytes' overhead per record), moments 45%,
  photos 15% (files counted in whole 4 KB blocks, as the disk stores them), the rest headroom for
  SQLite and the WAL. On a 20 GB volume: 0.6 / 2.4 / 9 / 3 GB. File counts are capped too
  (moments 30%, photos 20% of the volume's likely inodes, one per 16 KB), so tiny files can't use
  up the inodes. Writes are also refused while the volume has under 3% free (at least 256 MB, at
  most 1 GB).
- Big answers are bounded: at most 128 lookups or batches are being built and sent at once (then
  `503` "busy"), chat lookups are written a mailbox at a time, batch answers stop at 512 KB, and
  one address can have at most 64 requests in progress. A client that stops reading is dropped
  after 30 s (`responseWriteTimeoutSeconds`). Without these, a few hundred stalled lookups could
  exhaust the heap (the review reproduced it on a small heap).
- A full store answers `503` ("try later") and **keeps what it accepted**; nothing is dropped
  before its time. (The old file and photo stores dropped the oldest, which let anyone push out a
  crew's moments.)
- Gig search cache: at most 2,000 searches, least recently used out first. Venue cache: 20,000.
- JVM: `-XX:MaxRAMPercentage=60` (600 MB heap on 1 GB, 1.2 GB on 2 GB), 96 MB for Netty's
  buffers, `-XX:+ExitOnOutOfMemoryError` (Fly restarts it rather than it limping on). Set in
  `server/build.gradle.kts`; `JAVA_OPTS` overrides.

### Limits and abuse

- **Who the client is**: `Fly-Client-IP`, which Fly's proxy sets; from the internet the app's
  port is only reachable through that proxy. (Fly's private network can reach it too, since the
  JVM's `0.0.0.0` listens on IPv6 as well, but only the owner's own Machines and WireGuard peers
  are on that network.) Proxy headers are believed only on Fly (`TRUST_PROXY=fly`, the default
  when `FLY_APP_NAME` is set); elsewhere the connection's own address is used. The old code
  trusted the first `X-Forwarded-For` entry, which the client writes. IPv6 addresses count by
  their /64.
- **A venue behind one carrier address works**: per-address limits are now 1,000 requests at
  once, then 50 a second for writes and 50 for reads (the old ones were 2 and 1 a second), which
  covers a few hundred phones of the current version behind one address (tested: 300 such phones
  for a minute, plus 1,000 tokened phones, no refusals).
- **Per mailbox**, whoever writes: box 600 then 10/s, chat 120 then 2/s, moments 100 then one per
  5 s and 500 files a day, photos 20 then one a minute. This is what stops one mailbox from being
  flooded, whatever the addresses.
- **Budgets per hour**, charged to the address for every client and, with a token, to the
  install as well (so tokens can't multiply what one address gets): record bytes 64 MB per
  address / 8 MB per install; upload bytes 2 GB / 300 MB; uploads by number 2,000 / 200 (bursts
  of 600 / 100); download bytes 4 GB / 512 MB. Anything refused or cut off gives back what it was
  charged.
- **Uploads**: 16 at once per address, 64 in all; one that sends nothing for 30 s, or averages
  under 4 KB/s after its first minute, is dropped (`408`, which the app retries), so a trickle
  can't hold the slots. A body shorter than its `Content-Length` is refused, never stored.
- **Install tokens (optional)**: `POST /v1/install` gives a token signed with
  `MOSHPOINT_TOKEN_SECRET` (12 random bytes and a time; nothing about the person). With it, an
  install gets limits of its own (120 then 2/s) instead of sharing its address's, under a ceiling
  per address (20,000 then 500/s); the install's own limit is checked first, so one client over
  it can't use up what its address shares. Without it, everything works as before at the per-address
  limits. Asking for tokens is limited per address (60, then one every 30 s), so an address can't
  mint thousands. A bad or old token is ignored (address limits) and the answer says
  `X-Moshpoint-Token: invalid`. Rotating the secret invalidates every token at once (abuse plan).
- **Not free file hosting**: uploads must look sealed. A file that starts like a JPEG, PNG, GIF,
  WebP, MP4/MOV/HEIC, WebM/MKV, MP3, Ogg, PDF, zip, 7z, rar or plain text is refused. Each moment
  can be downloaded in full 500 times, then answers `404` (refused or cut-off downloads don't
  count). Files go after 24 h. Together that leaves nothing worth sharing a link to.
- **What's left**: many addresses together can still fill the moments store (then new moments
  wait until old ones expire, at most 24 h) or the photo store (8 days). The caps keep the disk
  safe and nothing accepted is lost; watch the totals in `fly logs`, and if it happens, raise the
  volume or lower `LIMIT_SCALE`, and rotate the token secret if tokens are being abused. The
  limiters track at most 200,000 keys each; past that (only under attack) new keys go untracked.
- **Answers**: `429` carries `X-Moshpoint-Limit` (client, address, mailbox, bytes) and
  `Retry-After`; current builds only read the status, the next version can pause just what's hit.
- **Knob**: `LIMIT_SCALE=2` doubles every per-client limit (e.g. for a festival weekend).

### Blocking

`GET /v1/gigs/search` and `GET /v1/venue` used to run blocking HTTP and `Thread.sleep` on Ktor's
request threads (up to 3 × 8 s), stalling everything on one CPU. Now:

- Gig sources are asked at the same time with the JDK client's async calls, each within 8 s, the
  whole search within 10 s (the app waits 12 s); at most 8 searches go out at once. A hanging
  source is left out (tested).
- The venue queue (one Nominatim request a second for everyone) waits with a coroutine `delay`,
  not a thread; the request is async with an 8 s timeout. Tested with a dozen waiting lookups
  while other requests are answered at once.

### Container and operations

- The JVM runs as user `relay` (uid 10001). The entrypoint starts as root only to hand the
  volume to that user (Fly mounts it owned by root), then drops privileges with `setpriv`.
- `/healthz` unchanged (`ok`).
- Logs: no request bodies, URLs, ids, tokens or addresses are ever logged, and every line,
  exceptions included, goes through a mask that hides anything shaped like an id, a token or an
  IP address (`LogPrivacy`, tested). Netty's connection errors (which name addresses) are off.
  Request failures log only the kind of exception.
- Render: dropped (decision below).

## Review

After the first version, an independent review read the code against the app's `RelayClient`
and ran experiments on the built server. What it found, and what changed:

| Finding | Fix |
|---|---|
| A 30 s idle-read timeout cut off any download taking over 30 s (a regression: slow phones never got clips) | Removed; uploads have their own stall and rate limits instead |
| Stalled `/v1/heldlookup` requests could exhaust the heap | Per-address in-flight cap, a global cap on big answers, chat answers written record by record, a 30 s write timeout |
| A failure creating an upload's temp file leaked an upload slot | Created inside the `try`; tested |
| A cut-off upload was stored and served as if whole | Refused when fewer bytes arrive than `Content-Length` says; tested against the real server |
| Refused and cut-off downloads used up a file's 500 downloads | Counted only when sent in full; tested |
| Tokens multiplied an address's byte budgets; no per-address upload concurrency or minimum rate; tiny files could use up inodes | Address ceilings for every budget, upload counts, 16 uploads per address, stall and rate limits, files counted in 4 KB blocks, file-count caps |
| Ktor's own shutdown hook cut the grace period to 1 s / 5 s | The relay drains requests in flight itself (up to 20 s) before Netty stops; checked by hand with SIGTERM mid-upload |
| A tokened client over its limit drained its address's shared bucket | The install's limit is checked first; tested |
| A photo's length could come from the index while a new photo replaced it | Length from the opened file; writes and deletes per id serialised |
| Cursors could skip records after a restore from an older snapshot | Sequence raised at every start; tested |
| "Listens on IPv4 only" was wrong (the JVM's `0.0.0.0` is dual-stack) | Corrected above; only the owner's own private network can reach it that way |
| Disk flushes ran on Ktor's request threads (one on a 1-CPU Machine) | Moved to `Dispatchers.IO`; sweeps delete files outside the index lock |
| Malformed batches cost nothing; a BAD GET's answer was one byte; a failed rollback could commit | Charged before the body is read; a BAD GET gets a whole block; the connection is reopened instead |

## Decisions

| Decision | Why |
|---|---|
| **SQLite for mailboxes, files for moments and photos** | Many small records with per-id order, dedup and trimming: SQLite does it in a few statements with crash safety built in. 12 MB files stream best as files. |
| **One database thread** | One connection, no locks, no busy errors; a few thousand writes a second is far more than needed, and reads with cursors are tiny. |
| **`synchronous=NORMAL`** | Survives the process being killed (crashes, OOM, kill -9: tested). `FULL` only adds protection against host power loss, at a cost per write. |
| **A full store refuses instead of dropping old data** | "Accepted messages must survive." The app treats `503` as "try later". Caps are sized so only abuse or a far bigger crowd reaches them. |
| **Render dropped** (render.yaml removed) | Its free plan sleeps (wakes slower than the app's 5–6 s timeouts) and has no disk, so it loses messages by design. A paid Render with a disk would work, but two hosts means two sets of proxy-trust and limit settings to keep right. The Dockerfile runs anywhere with a disk at `DATA_DIR` (see "Running elsewhere"). |
| **Fly snapshots kept 1 day** | Fly snapshots volumes daily. A day's snapshot protects chat and moments from a host failure; keeping it short keeps encrypted copies around no longer than needed. The privacy policy should say so (owner to-do). |
| **Generous per-address limits now, tokens later** | Today's test builds can't send tokens, and a venue can be one carrier address. Tokens give each phone its own limit once the app sends them. |
| **Cursors oldest first** | A cursor is a position in a log: oldest first lets an answer stop part way (MORE) without skipping anything. |
| **Batch ops carry their length** | A newer app can send op types an older relay doesn't know; it answers UNKNOWN for those and does the rest. |
| **VM: shared-cpu-1x / 1 GB now, performance-1x / 2 GB for festivals** | Shared CPUs are throttled to a small baseline once their burst allowance is spent; a festival's steady load can do that. The heap follows the VM's memory, so resizing needs no other change. |

## Deploy (owner)

Everything runs from the repo root on a computer with `flyctl` (`fly auth login` first). A payment
method is needed. **Never** put secrets in `fly.toml` or the repo: `fly secrets set` only.

**First deploy**

```sh
# 1. The app (the name must be unique on Fly; if it's taken, change `app` in fly.toml).
fly apps create moshpoint-relay

# 2. Secrets. The token secret signs install tokens; the contact is for Nominatim's usage policy.
fly secrets set --stage MOSHPOINT_TOKEN_SECRET=$(openssl rand -hex 32) MOSHPOINT_CONTACT="you@example.org"
#    Optional gig search keys (each one switches its source on). Production (Moshpoint+) relay
#    only: they also switch on Discover (docs/DISCOVER_SERVER.md). The free relay gets none.
#    Never set MOSHPOINT_DISCOVER_OPEN here: it opens Discover to everyone (internal testing only).
fly secrets set --stage TICKETMASTER_KEY=... BANDSINTOWN_APP_ID=... SEATGEEK_CLIENT_ID=...

# 3. Deploy ONE Machine. This also creates the 20 GB volume from fly.toml's [mounts].
fly deploy --ha=false

# 4. Check: one Machine, one volume, attached to it.
fly status
fly volumes list
#    Two Machines? `fly scale count 1`, then `fly volumes list` again and destroy the volume that
#    has no Machine attached (`fly volumes destroy <id>`), never the attached one.
#    "No volume" error on deploy? `fly volumes create moshpoint_data --region syd --size 20`, deploy again.

# 5. Smoke test.
curl https://moshpoint-relay.fly.dev/healthz        # ok
fly logs                                            # "Moshpoint relay listening on port 8080. Relay: box 0 records ..."
```

Then set the GitHub repository variable `MOSHPOINT_SERVER` to `https://moshpoint-relay.fly.dev`
(Settings → Secrets and variables → Actions → Variables). The next build uses it; test builds stop
falling back to ntfy.sh.

**Already deployed with the old fly.toml?** `fly scale count 1`, then `fly deploy --ha=false`.
The old relay kept nothing on disk, so there's nothing to move.

**Size and cost** (US$, checked by web search on 15 Nov 2026; Fly raised memory to $6 per GB a
month from 1 Oct 2026; confirm at fly.io/docs/about/pricing):

| | Machine | Volume 20 GB ($0.15/GB) | Egress | About |
|---|---|---|---|---|
| Testing and early launch: `shared-cpu-1x`, 1 GB (in fly.toml) | ~$6.70 | $3.00 | small | **~$10 / month** |
| Festival crowds: `performance-1x`, 2 GB | ~$33 | $3.00 | ~$10 per 10,000-phone weekend | **~$40–50 / month** |

Egress is $0.04/GB to Asia-Pacific and Oceania ($0.02 North America and Europe, $0.12 Africa and
India). Snapshots: $0.08/GB-month past the first 10 GB (one day kept, so a few GB). Rough use per
phone per gig night: under 5 MB of relay traffic once the app batches, plus moments
(~20 MB per phone for a crew sharing 20 photos). To move to the festival size, change `[[vm]]` in
`fly.toml` to `size = "performance-1x"`, `memory = "2gb"` and `fly deploy` (always change it in
fly.toml: a deploy resets the size to what fly.toml says). The Machine restarts (about 20 s; the
app retries and nothing is lost).

**Billing alerts.** Look on the organisation's Billing page (`fly.io/dashboard/<org>/billing`)
for budgets or alerts and set them (e.g. at US$25, US$50 and US$100 a month). If there are none,
Fly has no hard spending cap (as far as could be checked): look at the running invoice weekly, and
daily during a festival. The relay's own guards bound what one abusive address can cost:
downloads 4 GB an hour (about US$0.16 an hour of egress), uploads 2 GB an hour into capped
stores.

**Day to day**

| Task | Command |
|---|---|
| Deploy a change | `fly deploy` (one Machine: about 20 s without the relay; phones retry). Not during a gig. |
| Logs | `fly logs` (totals every 10 minutes; never ids or addresses) |
| Shell on the Machine | `fly ssh console` (data in `/data`) |
| Bigger volume | Grows by itself (80% full → +5 GB, up to 60 GB); or `fly volumes extend <id> --size 40`. Caps follow at the next start. |
| Snapshots | `fly volumes snapshots list <id>`; restore: `fly volumes create moshpoint_data --snapshot-id <snap> --region syd`, then move the Machine to it (destroy the old Machine, `fly deploy --ha=false`). |
| More room for a crowd | `fly secrets set LIMIT_SCALE=2` (doubles every per-client limit) |
| Abuse with tokens | `fly secrets set MOSHPOINT_TOKEN_SECRET=$(openssl rand -hex 32)` (every token stops working; apps fall back to address limits and get new ones) |

**Environment variables** (set by `fly.toml` `[env]` or `fly secrets set`):

| Name | Default | |
|---|---|---|
| `DATA_DIR` | `/data` in the image | Where everything is kept. Must be on the volume. |
| `TRUST_PROXY` | `fly` on Fly, else `none` | `fly` (Fly-Client-IP), `last-forwarded` (one proxy that appends to X-Forwarded-For), `none` |
| `MOSHPOINT_TOKEN_SECRET` | made once, kept in `/data/install-token.key` | Secret, 32+ characters. Set it, so tokens survive a lost volume. |
| `MOSHPOINT_CONTACT` | `nz.waveformlabs.moshpoint` | Email or web page for Nominatim. Set it before real users. |
| `MOSHPOINT_GEOCODER` | Nominatim | Another `/search` address, or `off` |
| `TICKETMASTER_KEY`, `BANDSINTOWN_APP_ID`, `SEATGEEK_CLIENT_ID` | unset | Gig search sources (secrets) |
| `LIMIT_SCALE` | 1 | Multiplies every per-client limit |
| `BOX_MAX_MB`, `HELD_MAX_MB`, `FILES_MAX_MB`, `AVATARS_MAX_MB` | 3/12/45/15% of the volume | Byte caps |
| `SQLITE_SYNC` | `NORMAL` | `FULL` to fsync every write |
| `REQUIRE_VOLUME` | on (on Fly) | `0` lets it start on Fly without a mounted volume |
| `JAVA_OPTS` | | Extra JVM flags |
| `PORT` | 8080 | |

**Running elsewhere.** `docker build -f server/Dockerfile -t moshpoint-server .` then
`docker run -p 8080:8080 -v moshpoint-data:/data moshpoint-server`. Behind one proxy that appends
the client's address to `X-Forwarded-For`, set `TRUST_PROXY=last-forwarded`; otherwise leave it
(the connection's address is used). Without Docker: `./gradlew :server:run` (data in a temp
folder unless `DATA_DIR` is set).

## Privacy

What the relay holds: encrypted records under rotating ids (15 min / 72 h), encrypted moments
(24 h) and photos (8 days), on the volume, deleted when they expire; Fly's snapshot of the volume
for one day. In memory only: rate-limit buckets keyed by address and install token, forgotten when
idle. Never logged: bodies, URLs, ids, tokens, addresses, search words.

Owner to-do for docs/PRIVACY.md (not changed here): "deletes everything after 15 minutes" is true
of the live store; add that encrypted backups of the relay's disk are kept one day; moments stay
24 h (the app says "a few hours"); optional install tokens are random and only used for limits.

## App-side follow-ups (wave 2)

Server support is in place for all of these; the app changes are for later sessions:

- Adopt `/v1/install`, `/v1/batch` and `/v1/heldsince` (RELAY_API.md section 11): one request a
  minute (performance P0-2) and chat polls that return only what's new (P1-8).
- Read `X-Moshpoint-Limit`: pause only the mailbox (or the uploads) a 429 is about.
- Send `Content-Length` on uploads (`setFixedLengthStreamingMode`), and reseal a photo refused
  with 400.
- The courier should re-upload our own safety pings found missing (reliability P0-3).
- ~~Release builds must fail when `MOSHPOINT_SERVER` is empty (release P1-8, android.yml).~~
  Dropped by the owner (15 November): free users run on another, limited relay (ROADMAP.md).
- ~~`GigSearch.viaServer` should use `RelayClient.shareableServer` (release P1-9).~~ Done in
  wave 2b (docs/WAVE2_PLAY.md, item 6).
- ~~In release, ignore an invite's `r=` unless it is our own relay (release P0-5).~~ Done in
  wave 2b: release builds follow `r=` only to one of `RelayClient.ownRelays` (item 4).
- ~~Settings' relay field still shows `https://moshpoint-relay.onrender.com` as its example
  (`SettingsScreen`); Render is gone, so use the fly.dev address.~~ Done in wave 2b.
- Treat `408` from an upload as "try later" (it already does: `RelayClient` counts 408 as no answer).

Outside this scope, noted for later (CI, android.yml): signing secrets reach every branch;
actions are pinned by tag, not SHA; the finder check only reports. A CI step that builds the
server's Docker image would catch Dockerfile mistakes before a deploy.
