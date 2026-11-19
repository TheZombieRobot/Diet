# Launch prep: the code side of the first Play Store release

The owner's scope for v1 (19 November 2026): the phone app only (the watch follows later);
everything free (no payments yet, so `Entitlements.plus` stays on for everyone until billing
exists); keyed services off (the relay refuses Discover by default); no Facebook login unless
it's configured. Branch: `claude/launch-prep` (from `ccr-5839ed7c-1q0ztj` at e2d5384). Seven
items, in order, each green in CI before the next.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 19 November
2026._

- **Now:** item 1 (the Deploy server workflow).
- **Done:** nothing yet.
- **Last green run:** none on this branch yet.
- **Baseline:** core 658 and server 108 tests pass locally at e2d5384 (scratch Gradle build of
  only `:core` and `:server`, Maven Central only).

### The seven items

1. A one-tap "Deploy server" workflow (manual only, from `ccr-5839ed7c-1q0ztj`), with the
   owner's steps in SERVER_PRODUCTION.md.
2. The privacy policy as a page: the relay's `GET /privacy`, built from an up-to-date
   PRIVACY.md, plus a GitHub Pages copy in `docs/site/`.
3. CI builds the release manifest with a dummy relay once and checks the spot links' App Link
   is there (and isn't without a relay).
4. The flaky `ReportTest` (two reports in the same millisecond).
5. The map's top bar on a small phone with large text.
6. Release readiness: Facebook hidden without an app id, Moshpoint+ on for everyone, Discover
   refused by default, the signed bundle and a keystore check.
7. docs/RELEASE_CHECKLIST.md: the owner's launch steps, phone-friendly.

## How to work on it

- `core` and `server` tests run here with a scratch Gradle build of only `:core` and `:server`
  (a `settings.gradle.kts` pointing at the repo's modules and version catalogue, Maven Central
  only; docs/WATCH.md). The app and the watch build only in CI (Google's Maven is blocked here).
- Work in progress is committed with `[skip ci]`; a push without it is a CI check. `git pull
  --rebase origin claude/launch-prep` before every push (CI commits screenshots back).
- Screenshots: after each CI run, compare `ui-screenshots-claude-launch-prep` with
  `ui-screenshots` (and the watch pair) by git blob hash. Only screens an item touches may change.
