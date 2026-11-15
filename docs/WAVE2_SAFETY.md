# Wave 2a: safety and the Live state

Launch blockers 1–3 of [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and the reliability items that go
with them (reliability P0-1, P0-2, P0-4, P1-5 to P1-8, then P2; performance P0-1).
Branch: `claude/wave2-safety-k7m3p9` (from `ccr-5839ed7c-1q0ztj`).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Started:** read the audits and the code; plan below.
- **Next:** core rules with tests (Need help status, check-in alarm time, Live auto-off), then
  the app adapters, strings, screenshot tests and field-test steps.

## Plan

1. Need help shows the alert's real outbox state.
2. Overdue check-in: a Doze-capable alarm at the deadline, posted on the help channel.
3. The Live state: reconciled with the service, restarted after updates, told when it stops,
   switched off when the crew ends or after about 12 h.
4. Background checks re-armed on boot, after updates and at app start.
5. Full storage: guarded writes, logging exception handlers, "Storage full" once.
6. configChanges for MainActivity; MomentFlow's clip survives process death.
7. CrewRadar's coerceIn crash.
8. Remote crash and memory risks (clip size overflow, full-size mate photos).
9. P2 items, in the order given, as time allows.
