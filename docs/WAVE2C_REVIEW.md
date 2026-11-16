# Wave 2c part 3: independent review of the networking change

An independent review of merge `17caa74` (wave 2c part 3, branch `claude/wave2c-endpoints`,
`8024c86..156f3f7`): the app's adoption of the relay's new endpoints (install token, 429 by
kind, chat cursors, one batch a minute, moments with `Content-Length`, clips on Wi-Fi). Design:
[WAVE2C_ENDPOINTS.md](WAVE2C_ENDPOINTS.md). Branch: `claude/wave2c-review`, from
`ccr-5839ed7c-1q0ztj` at `17caa74`.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Stage:** F1 to F6 fixed, each with its failing core test committed first (all 644 core
  tests pass locally; `RelayClient.kt` type-checks locally against core with small Android
  stubs; the `OfflineMessages.kt` changes (F5, F6) are checked only by CI). F6 was asked for by
  the session that started this review: the owner's rule, safety is never limited on the free
  tier. CI run 343 (head `82a3105`, F1 to F4): core and server tests, both app builds and all
  watch screenshots green; the phone screenshots were still rendering. The run on the head
  after `a6f49f8` checks F1 to F6.
- **Exact next step:** when that run ends: both jobs green, then compare the screenshots:
  `git fetch origin ui-screenshots ui-screenshots-claude-wave2c-review ui-screenshots-watch
  ui-screenshots-watch-claude-wave2c-review` and `git ls-tree -r` of each pair (every blob hash
  the same). Then send the report to the session that started this review.
- **Last green CI run:** none on this branch yet (the merged work's last green run is 341).

## Findings

| # | Area | Finding | State | Evidence |
|---|---|---|---|---|
| F1 | Batch flusher | A put with `Timing.MINUTE` into an empty queue never wakes `RelayClient`'s flusher: `queue()` nudges only for `SOON`, and the flusher sleeps in `nudges.receive()` while nothing is due. With no crew sync taking the puts (no crew, or a dormant crew: friends finding each other), location shares, floor boxes and crowd-relay packets stay queued after the first batch until something else nudges. | **fixed** (`87e1dff` failing test, `ed34c86` fix; `BatchPlanTest.everyPutForTheMinuteGoesWithinAMinuteWithNoCrewSync`) | `RelayClient.kt:683-687` (no nudge for MINUTE), `:702-705` (sleeps until a nudge); `GroupSync.syncServer` is the only other taker |
| F2 | Safety | Need help, Check in and Home safe wait for a courier upload slot. The courier allows 2 own uploads in flight (`Courier.MAX_IN_FLIGHT`); with batches a non-safety upload holds its slot until its batch answers (up to 60 s, 90 s at most). Two such uploads in flight (a pin and an "I'm here" re-posted every 10 minutes, or messages retried after coming back on signal) hold Need help back for up to a minute: it is queued behind a batch. | **fixed** (`2cd3017` failing test, `4ba8aa2` fix; `BatchPlanTest.needHelpDoesNotWaitBehindMessagesAlreadyInTheBatch`) | `Courier.kt:643-652` (`if (free <= 0) break`), `OfflineMessages.upload` (`sendBatched` waits for the batch), `RelayClient.BATCH_WAIT_MS` |
| F3 | Budget | With batches, our relay's local budget drops to 30 requests a minute, but it counts every request, not only the background traffic the batch replaced: `AvatarSync.fetchFriends` asks up to 2 photos per friend in a row every 6 hours (15 friends without this week's photo fill the minute), the Story downloads up to 12 moments, the open chat polls about 11 times a minute. A full minute refuses the batch itself (`THROTTLED`): the courier then holds every upload 30 s to 2 min, the sync's lookups and the finder's polls get no answer. | **fixed** (`3f8b264` failing test, `56b46a0` fix; `BatchPlanTest.aBackgroundBurstNeverStarvesTheBatchOrTheFinder`). Now `RelayBudget.withBatches()`: 120 a minute (the relay's sustained rate per install), background at most 90 | `RelayClient.batchBudget` (30, `requestReserve = 0`), `RelayBudget.refusalLocked`, `AvatarSync.kt:78-81`, `Courier.onUploaded` (THROTTLED) |
| F4 | Cursors | `HeldMirror` is keyed by mailbox id only, not by relay. A phone moved to another relay (a test build's Settings, a crew's invite) keeps the old relay's cursors and records. The relay only resets a cursor above its own top; one whose store started after the other's (every restart raises its numbers to the clock in microseconds) takes the old cursor as valid and sends only newer records, so the copy mixes the two relays: the old relay's messages read as on the new one, and helpers don't upload them there. | **fixed** (`2e81d6b` failing test, `12bfee6` fix; `HeldMirrorTest.aPhoneMovedToARelayThatStartedLaterReadsOnlyThatRelay`). `HeldMirror.relay(base)` drops the copy when the relay changes | `RelayClient.heldSince` (`keys = ids.map { it.hex() }`), `MailboxStore.since` (`asked > top` only), `MailboxStore` init (floor = clock µs) |
| F5 | Latency | A message just written can't start while two older messages waiting for the minute's batch hold both courier upload slots (back on signal with a queue, or the pin and an "I'm here" re-posted every 10 minutes while the app is open). It starts only when their batch goes (up to a minute), and by then it no longer counts as just written, so it waits for the next minute's batch too: up to two minutes, where the design promises a couple of seconds. | **fixed** (`ab7f8ea` failing test, `1efdd4a` fix; `BatchPlanTest.aLineJustWrittenGoesWithinSecondsEvenWithBothSlotsInTheBatch`). `OfflineMessages.post` calls `RelayClient.hurry()` (core `BatchPlan.hurry`): what's waiting goes within a couple of seconds, taking the slots' messages with it | `OfflineMessages.post`/`upload` (`soon` only within 10 s of the post), `Courier.planUploads` (2 slots) |
| F6 | Safety on ntfy.sh | The owner's rule is that safety is never limited on the free tier. On ntfy.sh a Need help, Check in or Home safe could wait up to a minute for the minute's room: the public budget's 8 requests a minute had none kept for safety (`RelayClient.waitForRoom`, then a refusal and the courier's 15 s retry), and safety uploads queued on `OfflineMessages`' `uploads` lock behind other uploads waiting for room. | **fixed** (`941b7a1` failing test, `a6f49f8` fix; `RelayBudgetTest.aSafetyPingNeverWaitsForTheMinuteOnThePublicRelay`, `BatchPlanTest.eachSafetyPingSendsWhatThePublicRelayKeepsRoomFor`). `RelayBudget` keeps 2 requests a minute for safety (one safety ping: its ping and its durable copy); everything else and each of its shares get 2 less (6 in all, background 4, uploads 4, look-ups still 2); the minute stays 8, inside ntfy.sh's 12. Safety no longer waits on the `uploads` lock. The tests that pinned the old shares now pin these. Our relay: `withBatches` unchanged (safety never counts there); without batches the 600 a minute keeps 2 for safety too, which changes nothing in practice | `RelayBudget.refusalLocked`, `roomInMs`; `OfflineMessages.upload`; `CheckIns` (order doesn't matter) |

## Checked and refuted (not bugs)

| Area | Checked | Why it holds |
|---|---|---|
| Deadlocks | `batchSend` (coroutine mutex) around one batch; `batchLock` (monitor) only around `BatchPlan`, `waiters` and `nextKey`, never across a suspension; `OfflineMessages.uploads` now only around non-batched sends | No path takes `uploads` then `batchSend` or the reverse; `answer()` completes deferreds outside `batchLock`; `sendAlone` launches |
| Lost messages in a batch | Every put taken by `sendBatch` is answered (`OK`, `BAD`, `MAILBOX`, `BYTES`, `FULL`, `UNKNOWN` sent alone), put back (locations), or sent alone (older relay, 4xx); nothing suspends between `take` and the answers | Courier messages are never put back: the courier is told and retries (as before); a waiter that timed out (90 s) cancels its put; a late answer finds no waiter, and the retry posts the same bytes, which the relay keeps once |
| Wire format | `RelayWire` against `server/Batch.kt`: op layout, 200 ops, 512 KB (`512 * 1024` on both sides; the relay answers 413 only above it), record sizes 16..255 and 16..4,000, get blocks, status 6 alone, heldsince count byte | Same constants and layout; `AppRequestFixtureTest` and the server's `AppRequestsTest` pin them |
| Older relay | `404`, `405`, `400` or an unreadable answer from `/v1/heldsince` or `/v1/batch`: the old endpoint for an hour; `/v1/install` refused: no token, asked again in an hour | `RelayEndpoints`; everything waiting goes alone at once (`sendAlone`) |
| Relay down or timing out | Batch with no answer: locations put back, the courier told `NO_NETWORK`; the flusher looks again after 5 s and the budget's own quiet periods (15 s doubling to 2 min) keep it from asking | At most one real request a minute from the sync; no tight loop |
| ntfy.sh fallback | `send`, `lookup`, `putFile`, `listFiles`, `latestFiles`, `download`: same requests as before; no token, no cursors, no batches with a blank base | `RelayEndpoints.usable` is false for a blank base; `askToken`/`sign` return early. (By design, not a fallback change: crew clips over 2 MB also wait for the Story or Wi-Fi on ntfy.sh, step 6.) |
| Safety on the wire | Need help, Check in, Home safe: `BatchPlan.route` → alone; `RelayHolds.heldUntil` → 0; `RelayBudget` → `safetyAlwaysHasRoom` with batches, the old 10 s rule in a pause | Only the courier's upload slots held it back (F2, fixed) |
| Cursors | Day rollover (a new id from 0), rekey (new ids), restart (memory only: from 0), MORE (asked again, 20 rounds a poll), a relay whose top is below our cursor (starts again), duplicates (moved to newest, as the relay does), the 72 h expiry (ids read 2 days at most) | `HeldMirrorTest`; only another relay with a higher top was wrong (F4, fixed) |
| Clips | Left for later on mobile data: skipped in the background until Wi-Fi or the Story; `Content-Length` over the limit stops before the body; without one, the read stops at the limit | `Moments.refresh` and `RelayClient.fetch`; a clip fetched once is in `seenUrls` |
| Interop with build 312 | Same mailboxes, same records: batch puts land as single puts do, batch gets read what `/v1/lookup` answers | Server `AppRequestsTest` |

### Two safety pings in one minute (for the owner)

F6 keeps room for **one** safety ping a minute on ntfy.sh (2 requests), as asked ("sized to what
one Need help ... actually sends"). A second, different safety ping within the same minute (a
Check in, then a Need help 20 s later) still goes at once unless everything else had already
used its 6 before the first; then it waits for the minute (at most about 40 s, retried every
15 s). Room for two would be `safetyRequestReserve = 4`: everything else would then get 4 a
minute on ntfy.sh instead of 6.

## How this was checked

- core and server tests: a scratch Gradle build of only `:core` and `:server`, Maven Central only
  (as docs/WATCH.md describes).
- The app compiles only in CI. Locally, `RelayClient.kt` is type-checked against core with
  small stubs (`SystemClock`, `Base64`, `Context`, `SharedPreferences`, `BuildConfig`,
  `NetState`) in a scratch module; the other app files changed here aren't.
- App bugs (F1, F3) are tested in core: the rule the app used moved into core (`BatchPlan.wakes`,
  `RelayBudget.withBatches`), and the failing test was first written against the app's old rule
  or numbers.
