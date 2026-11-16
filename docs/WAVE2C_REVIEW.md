# Wave 2c part 3: independent review of the networking change

An independent review of merge `17caa74` (wave 2c part 3, branch `claude/wave2c-endpoints`,
`8024c86..156f3f7`): the app's adoption of the relay's new endpoints (install token, 429 by
kind, chat cursors, one batch a minute, moments with `Content-Length`, clips on Wi-Fi). Design:
[WAVE2C_ENDPOINTS.md](WAVE2C_ENDPOINTS.md). Branch: `claude/wave2c-review`, from
`ccr-5839ed7c-1q0ztj` at `17caa74`.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Stage:** F1 and F2 fixed (failing core test committed first, then the fix; all 639 core
  tests pass locally). F3 and F4 confirmed by reading, not yet tested or fixed. Not yet pushed
  for CI: the app change in F1 (`RelayClient.queue`) is checked only by CI's compile.
- **Exact next step:** F3 (the batch budget): failing core test, then fix. Then F4 (the cursor
  copy across relays). Then one CI run without `[skip ci]`, and compare the screenshots.
- **Last green CI run:** none on this branch yet (the merged work's last green run is 341).

## Findings

| # | Area | Finding | State | Evidence |
|---|---|---|---|---|
| F1 | Batch flusher | A put with `Timing.MINUTE` into an empty queue never wakes `RelayClient`'s flusher: `queue()` nudges only for `SOON`, and the flusher sleeps in `nudges.receive()` while nothing is due. With no crew sync taking the puts (no crew, or a dormant crew: friends finding each other), location shares, floor boxes and crowd-relay packets stay queued after the first batch until something else nudges. | **fixed** (`87e1dff` failing test, `ed34c86` fix) | `RelayClient.kt:683-687` (no nudge for MINUTE), `:702-705` (sleeps until a nudge); `GroupSync.syncServer` is the only other taker |
| F2 | Safety | Need help, Check in and Home safe wait for a courier upload slot. The courier allows 2 own uploads in flight (`Courier.MAX_IN_FLIGHT`); with batches a non-safety upload holds its slot until its batch answers (up to 60 s, 90 s at most). Two such uploads in flight (a pin and an "I'm here" re-posted every 10 minutes, or messages retried after coming back on signal) hold Need help back for up to a minute: it is queued behind a batch. | **fixed** (`2cd3017` failing test, `4ba8aa2` fix) | `Courier.kt:643-652` (`if (free <= 0) break`), `OfflineMessages.upload` (`sendBatched` waits for the batch), `RelayClient.BATCH_WAIT_MS` |
| F3 | Budget | With batches, our relay's local budget drops to 30 requests a minute, but it counts every request, not only the background traffic the batch replaced: `AvatarSync.fetchFriends` asks up to 2 photos per friend in a row every 6 hours (15 friends without this week's photo fill the minute), the Story downloads up to 12 moments, the open chat polls about 11 times a minute. A full minute refuses the batch itself (`THROTTLED`): the courier then holds every upload 30 s to 2 min, the sync's lookups and the finder's polls get no answer. | confirmed by reading | `RelayClient.batchBudget` (30, `requestReserve = 0`), `RelayBudget.refusalLocked`, `AvatarSync.kt:78-81`, `Courier.onUploaded` (THROTTLED) |
| F4 | Cursors | `HeldMirror` is keyed by mailbox id only, not by relay. A phone moved to another relay (a test build's Settings, a crew's invite) keeps the old relay's cursors and records. The relay only resets a cursor above its own top; one whose store started after the other's (every restart raises its numbers to the clock in microseconds) takes the old cursor as valid and sends only newer records, so the copy mixes the two relays: the old relay's messages read as on the new one, and helpers don't upload them there. | confirmed by reading | `RelayClient.heldSince` (`keys = ids.map { it.hex() }`), `MailboxStore.since` (`asked > top` only), `MailboxStore` init (floor = clock µs) |

## How this was checked

- core and server tests: a scratch Gradle build of only `:core` and `:server`, Maven Central only
  (as docs/WATCH.md describes).
- The app compiles only in CI.
