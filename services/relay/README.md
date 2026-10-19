# Relay (`services/relay`)

A Cloudflare Worker with Workers KV that carries the sealed grocery list from the phone to the laptop side panel, and the laptop's sealed "received" note back (checklist item 29; DECISIONS Q1; DOC_REVIEW C52, C79, C80, C81, C113, C114). It holds a body briefly, hands it out once at one place, and never reads, logs or keeps anything else. The owner's set-up steps are in the root [README](../../README.md#the-relay).

## Files

| File | What it is |
|---|---|
| `src/worker.ts` | The Worker entry (wrangler `main`): the runtime's clock, and no loopback origins |
| `src/handler.ts` | The request pipeline: checks, CORS, body reading, answers |
| `src/config.ts` | Reads and checks the `vars` and bindings; anything wrong means `misconfigured` |
| `src/kv.ts` | The KV and rate-limit binding types (written by hand), the hashed storage key, and the rate-limit key for a client address |
| `src/testKit.ts` | Offline stand-ins for the tests: a clock, a single-location KV, a rate limiter, request builders |
| `wrangler.jsonc` | The two deployments, `list-relay` (15-minute expiry) and `list-relay-test` (2-minute expiry) |
| `../../packages/core/src/relay/protocol.ts` | The contract shared with the phone and the extension (`@diet/core/relay`): sizes, expiries, formats, `relayOutcome` |

## Protocol version 1

| Path | POST (writer) | GET (reader) | Largest body |
|---|---|---|---|
| `/v1/list` | phone | laptop side panel | 65,536 bytes (`MAX_RELAY_BODY_BYTES`) |
| `/v1/ack` | laptop side panel | phone | 4,096 bytes (`MAX_RELAY_ACK_BODY_BYTES`) |

- The room id travels in the `X-Relay-Room` header (22 base64url characters), never in the address; any query string is refused. KV holds only `list:` or `ack:` and a SHA-256 of the room id, never the id itself.
- A POST needs `Content-Type: text/plain` (charset utf-8 if one is named) and no compression. The body must be `rl1.` followed by unpadded base64url of at least 28 bytes. The size is checked on Content-Length and again on the bytes read.
- A POST answers 204 when stored. A GET answers 200 with the body, deleting it in the same request, or 204 when nothing is waiting.
- Refusals carry `{"error":"<code>"}` only: 400 `bad-request`, `bad-room` or `bad-body`; 403 `origin-not-allowed`; 404 `not-found`; 405 `method-not-allowed`; 413 `too-large`; 415 `unsupported-type`; 429 `rate-limited` (Retry-After 60) or `busy` (KV's one write a second per room, Retry-After 2); 503 `unavailable` (Retry-After 30); 500 `misconfigured` or `internal`. No answer ever repeats any part of a request.
- CORS allows exactly the origins in `ALLOWED_ORIGINS`: the app's today, and the extension's from checklist item 32. The scans and the deploy check refuse any other entry, in either deployment. Every answer to an allowed origin carries the CORS headers, so the phone can read a 413 or a 429. Credentials are never allowed.
- Rate limits use Workers Rate Limiting bindings: 10 writes a minute per client address and per room, 60 reads a minute per client address. An IPv6 address counts by its /64 network, the block one home or phone is usually given, so a client cannot dodge the limit by taking a fresh address from that block for each request (one with many blocks still can). Nothing is counted in KV. A limiter error lets the request through. Whether the free plan honours these limits is unverified until the owner's `pnpm relay:smoke <address> --limits` run.
- The limits slow down anyone trying to use up the free plan's daily KV quota, but cannot stop a determined one: one address writing at the limit uses up the 1,000 free writes of a day in about 100 minutes, one address reading at the limit makes 86,400 of the 100,000 free reads of a day, and many addresses go faster. The expected worst case is a day when the relay answers `unavailable` and the phone offers the paste code instead. Nobody can read or reach a room this way.
- Clients classify every answer with `relayOutcome` from `@diet/core/relay`.

## What "once" and "15 minutes" mean

KV is eventually consistent, so the relay promises only what its own code controls:
- A body is never handed out after the expiry stored with it, by the Worker's own clock, even while KV still holds it.
- Every delivery deletes the body before answering. A second GET at the same place finds nothing.
- A body handed out is byte for byte one that was posted to that room and slot, and nothing refused is ever stored.

What KV does not allow anyone to promise: a GET at another Cloudflare location, before the delete reaches it (usually within a minute), can hand out the same body again, and a GET just after a POST can still find nothing for up to about a minute. The laptop recognises a repeated copy and ignores it (checklist items 30 and 33). Cloudflare deletes its own copy some time after the expiry; the Worker refuses it from the moment the expiry passes.

## What the relay can and cannot tell

The body check is a format check. It turns away raw text, such as a list sent as JSON by mistake, but it cannot tell a sealed body from encoded plain bytes. That every body is sealed with the pairing key is proven by the clients' tests: TR-01 at checklist item 30, and the end-to-end half of TR-02 at item 31. The relay sees the sealed body, the room id (KV stores only a hash of it), timing, and the IP addresses. It passes each address (an IPv6 address as its /64 network) to Cloudflare's rate limiter as a counter key, which counts per minute, and it stores none of the addresses in KV. Cloudflare itself sees the same addresses, as it does for any website.

## Tests

`pnpm --filter @diet/relay test` runs the Worker tests in Node, against the stand-ins in `src/testKit.ts`, with no Cloudflare account and no network. The safety scans (`pnpm scan`) check that the relay holds no key handling, logging or caching code, imports only the relay protocol, keeps logging off and the allowlist exact in `wrangler.jsonc`, and that no Cloudflare tooling enters the dependency tree, and nothing under `.github/` runs wrangler or names Cloudflare. Wrangler is run only by the owner, pinned and with its usage reports off, through the root `relay:*` scripts; `pnpm relay:deploy-test` and `pnpm relay:deploy` first run `tools/relay/deploy-check.ts`, which refuses while the storage ids in `wrangler.jsonc` are still the `OWNER-FILLS-IN-...` placeholders.
