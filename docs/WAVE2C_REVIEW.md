# Wave 2c part 3: independent review of the networking change

An independent review of merge `17caa74` (wave 2c part 3, branch `claude/wave2c-endpoints`,
`8024c86..156f3f7`): the app's adoption of the relay's new endpoints (install token, 429 by
kind, chat cursors, one batch a minute, moments with `Content-Length`, clips on Wi-Fi). Design:
[WAVE2C_ENDPOINTS.md](WAVE2C_ENDPOINTS.md). Branch: `claude/wave2c-review`, from
`ccr-5839ed7c-1q0ztj` at `17caa74`.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Stage:** reading. `RelayClient.kt`, `BatchPlan`, `RelayWire`, `RelayEndpoints`, `HeldMirror`,
  `RelayHolds`, `RelayBudget`, the server's `Batch.kt`, `MailboxStore.since` and routes are read.
  Two findings confirmed by reading (F1, F2 below); no tests or fixes yet.
- **Exact next step:** read `Moments.kt`/`MomentRules`, `InstallToken`, `ChatSync`, the server's
  `AppRequestsTest`; then write the failing core tests for F1 and F2 and fix them.
- **Last green CI run:** none on this branch yet (the merged work's last green run is 341).

## Findings

| # | Area | Finding | State | Evidence |
|---|---|---|---|---|
| F1 | Batch flusher | A put with `Timing.MINUTE` into an empty queue never wakes `RelayClient`'s flusher: `queue()` nudges only for `SOON`, and the flusher sleeps in `nudges.receive()` while nothing is due. With no crew sync taking the puts (no crew, or a dormant crew: friends finding each other), location shares, floor boxes and crowd-relay packets stay queued after the first batch until something else nudges. | confirmed by reading | `RelayClient.kt:683-687` (no nudge for MINUTE), `:702-705` (sleeps until a nudge); `GroupSync.syncServer` is the only other taker |
| F2 | Safety | Need help, Check in and Home safe wait for a courier upload slot. The courier allows 2 own uploads in flight (`Courier.MAX_IN_FLIGHT`); with batches a non-safety upload holds its slot until its batch answers (up to 60 s, 90 s at most). Two such uploads in flight (a pin and an "I'm here" re-posted every 10 minutes, or messages retried after coming back on signal) hold Need help back for up to a minute: it is queued behind a batch. | confirmed by reading | `Courier.kt:643-652` (`if (free <= 0) break`), `OfflineMessages.upload` (`sendBatched` waits for the batch), `RelayClient.BATCH_WAIT_MS` |

## How this was checked

- core and server tests: a scratch Gradle build of only `:core` and `:server`, Maven Central only
  (as docs/WATCH.md describes).
- The app compiles only in CI.
