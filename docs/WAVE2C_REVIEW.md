# Wave 2c part 3: independent review of the networking change

An independent review of merge `17caa74` (wave 2c part 3, branch `claude/wave2c-endpoints`,
`8024c86..156f3f7`): the app's adoption of the relay's new endpoints (install token, 429 by
kind, chat cursors, one batch a minute, moments with `Content-Length`, clips on Wi-Fi). Design:
[WAVE2C_ENDPOINTS.md](WAVE2C_ENDPOINTS.md). Branch: `claude/wave2c-review`, from
`ccr-5839ed7c-1q0ztj` at `17caa74`.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Stage:** reading the diff (`git diff 8024c86d 17caa74f -- app core server`) and the relay in
  `server/`. No findings recorded yet.
- **Exact next step:** finish reading `RelayClient.kt`, the core rules and the server's batch and
  heldsince handlers; record each candidate finding below before writing its failing test.
- **Last green CI run:** none on this branch yet (the merged work's last green run is 341).

## Findings

| # | Area | Finding | State | Evidence |
|---|---|---|---|---|

## How this was checked

- core and server tests: a scratch Gradle build of only `:core` and `:server`, Maven Central only
  (as docs/WATCH.md describes).
- The app compiles only in CI.
