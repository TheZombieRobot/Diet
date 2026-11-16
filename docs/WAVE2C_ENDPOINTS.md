# Wave 2c, part 3: the app adopts the relay's new endpoints

The app side of [RELAY_API.md](RELAY_API.md) sections 7 to 11 (install token, 429 by kind,
cursors, batch), plus moments uploads and clips on Wi-Fi: the audit's biggest remaining battery
items, performance P0-2 (the mobile radio never idles) and P1-8 (chat polls re-download
everything; clips come over mobile data). Parts 1 and 2: [WAVE2C_BATTERY.md](WAVE2C_BATTERY.md),
[WAVE2C_PERF.md](WAVE2C_PERF.md). Branch: `claude/wave2c-endpoints`, from
`ccr-5839ed7c-1q0ztj` at 8024c86.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done:** nothing merged yet.
- **In progress:** step 1, the install token (core `InstallToken` + tests; `RelayClient` sends
  it to our own relay only). Pushed for CI.
- **Next step:** when step 1's CI run is green, compare its screenshots (below), then step 2
  (429 by kind, RELAY_API.md sections 10 and 11.2).
- **Last green CI run:** none on this branch yet.
- **Screenshots:** expected byte-identical (no screen or string changes). How to check: after a
  run, `git fetch origin ui-screenshots ui-screenshots-claude-wave2c-endpoints ui-screenshots-watch
  ui-screenshots-watch-claude-wave2c-endpoints` and compare `git ls-tree -r` of each pair (blob
  hashes).

## The steps (RELAY_API.md section 11's order; each one works on its own)

| Step | What | Core rule (tests) | Status |
|---|---|---|---|
| 1 | Install token | `InstallToken` (`InstallTokenTest`) | in progress |
| 2 | 429 by kind | | |
| 3 | Chat cursors (`/v1/heldsince`) | | |
| 4 | One batch a minute; `ownBudget` lowered | | |
| 5 | Moments: `Content-Length`, reseal on 400 | | |
| 6 | Clips on Wi-Fi | | |

## Rules kept (from the brief)

- **Safety is never batched, delayed or limited.** Need help, Check in, Home safe and overdue
  alerts go at once, on their own, exactly as before.
- **The free path keeps working.** No build needs `MOSHPOINT_SERVER`. With no server built in, the
  app uses ntfy.sh as before: tokens, cursors and batches are only ever used with our own relay,
  and every new endpoint falls back to the old one on `404` (an older relay).
- **Old and new builds keep talking** (build 312 and this one in one crew): message formats are
  unchanged; only how they travel changes.
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

## Risks (for the reviewer)

- Nothing in `app` can be compiled here (Google Maven is blocked): CI is the first compile. Each
  step is type-checked locally with plain `kotlinc` against core (Android names don't resolve,
  so only new errors about our own declarations count).
