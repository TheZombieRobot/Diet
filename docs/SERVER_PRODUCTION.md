# Relay server: production readiness

Branch `claude/relay-production-r7k2q` (from `ccr-5839ed7c-1q0ztj`). Scope: `server/`, `fly.toml`,
`render.yaml`, `server/Dockerfile` and server docs only. The app adopts the new endpoints in wave 2
(see [RELAY_API.md](RELAY_API.md)).

## Status and next steps

_Handover, kept current. Last updated: 15 Nov 2026, start of work._

Plan, in order (each item is committed as it lands):

1. Durable storage on a Fly volume: SQLite (WAL) for the box and held mailboxes, files with atomic
   writes for moments and profile photos, byte caps, retention sweeps, clean close on shutdown.
2. Limits: client address from `Fly-Client-IP` (proxy headers trusted only on Fly), generous per-IP
   limits, per-mailbox limits, byte budgets, an optional per-install token, no plain media files.
3. Streaming uploads and downloads; gig and venue lookups off the request threads with timeouts;
   `POST /v1/batch` and `POST /v1/heldsince` (cursor).
4. Container (non-root, heap flags), fly.toml (one always-on Machine, volume), Render dropped.
5. Tests, docs, green CI, report to the coordinating session.

Done so far: nothing yet beyond reading the audits and the app's relay client.
