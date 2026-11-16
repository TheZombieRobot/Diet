# Removing the safety features; Text my spot and satellite data (Moshpoint+)

The owner's decisions of 16 November 2026: take out the app's own emergency features (Need help,
check-ins, the watch's SOS), keep old builds working with this one, and add two Moshpoint+
features (Text my spot, satellite data). Branch: `claude/remove-safety` (from
`ccr-5839ed7c-1q0ztj` at 75fe2fb).

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 16 November
2026, 18:25 UTC._

- **Done:** nothing yet; the code has been read and the plan below written.
- **In progress:** stage 1 (phone removal and old-build interop), starting with core.
- **Exact next step:** core first (it tests locally): `PingPolicy` maps Need help, Check in and
  Home safe to ordinary quick pings; `RelayUse.SAFETY` and its special cases go (budget reserve,
  hold bypass, batch bypass, the courier's slot/queue bypass); `SafetyRules.kt` is split so the
  non-safety rules it holds (Live, alarm plan, storage notice, clock check) stay; `CheckIns.kt`
  and `HelpRules`/`CheckInReminder` go; a core test proves old builds' safety pings still open
  and show as plain pings.
- **Last green run:** none on this branch yet (ccr's last: run 346).

### Stages (each must be green in CI before the next)

1. Phone removal and interop.
2. Watch removal.
3. Text my spot.
4. Satellite switch.

## Decisions (with reasons)

- **The `safety/` package keeps its name.** It also holds GhostMode, TorchStrobe, AppErrors,
  Housekeeping and Notices, which are not safety features. Renaming a package is a pure move with
  wide churn; it can come later on its own.
- **`SafetyRules.kt` is removed, but only its safety parts are deleted.** It also held the Live
  state rules, the background alarm plan, the storage-full notice and the clock check, which stay
  (moved to files named after them).
- **`strings_safety.xml` is removed, but the Live and storage strings in it stay** (moved to a
  file of their own): they are for Live going off by itself and a full phone, not for help.

## Open questions

_(none yet)_
