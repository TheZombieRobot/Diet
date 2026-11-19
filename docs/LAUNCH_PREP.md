# Launch prep: the code side of the first Play Store release

The owner's scope for v1 (19 November 2026): the phone app only (the watch follows later);
everything free (no payments yet, so `Entitlements.plus` stays on for everyone until billing
exists); keyed services off (the relay refuses Discover by default); no Facebook login unless
it's configured. Branch: `claude/launch-prep` (from `ccr-5839ed7c-1q0ztj` at e2d5384). Seven
items, in order, each green in CI before the next.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 19 November
2026._

- **Now:** item 2 (the privacy policy as a page), pushed for its CI check.
- **Done:** item 1, green in run 363 (493fd3b); screenshots unchanged (phone 2,320 and watch 546
  identical to e2d5384's by blob hash).
- **Last green run:** 363 (493fd3b, item 1).
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

## Item 1: the Deploy server workflow

**Built:**

- `.github/workflows/deploy-server.yml` ("Deploy server"): `workflow_dispatch` only, no inputs.
  A job that runs only on `refs/heads/ccr-5839ed7c-1q0ztj`; started from any other branch, a
  second job says so and stops (no secret reaches it). Actions pinned to commit SHAs
  (`actions/checkout` v7.0.1, `superfly/flyctl-actions/setup-flyctl` 1.6, both node24; tags read
  with `git ls-remote`). Per run: reads fly.toml (app, region, volume) and the optional
  variables; creates the app if the organization token doesn't see it (`FLY_APP`, `FLY_ORG`
  optional); creates the volume if missing (`--size` from `initial_size`, one day of snapshots);
  copies the six relay secrets that are set in GitHub with `fly secrets set --stage NAME=-`, the
  value on standard input (flyctl reads `-` from stdin: checked in flyctl's source,
  `internal/command/secrets/set.go`), so no value is on a command line, in a log, an input or a
  file; warns (by length only) when a token secret is under 32 characters (the relay ignores
  those); deploys with `--ha=false --remote-only --yes`, plus `--env MOSHPOINT_APP_CERTS=…` from
  the repository variable when it's set; checks there's exactly one Machine, lists which relay
  secrets Fly has (names only) and fails if `MOSHPOINT_DISCOVER_OPEN` is set; runs
  `tools/check_relay.py` against `https://<app>.fly.dev`; prints the address and puts it in the
  run's summary with the MOSHPOINT_SERVER step.
- `tools/check_relay.py`: the checks, from outside: `/healthz` (waited for), `assetlinks.json`
  lists exactly the expected certificates for `nz.waveformlabs.moshpoint`, `/spot` with its CSP
  and `/spot.js`, and `/v1/discover/suggest` refused with 403. Prints only what passed or failed,
  never a body. Tried here against the relay run locally: passes; fails on a certificate
  mismatch, on `MOSHPOINT_DISCOVER_OPEN=1` (503 instead of 403) and with nothing listening.
- `android.yml`, new job `relay-image` (in parallel with the phone and watch jobs): checks the
  deploy workflow only runs by hand, only from the main branch, with every action pinned;
  builds the relay's image the way `fly deploy` does (repo root as context with the root
  `.dockerignore`, which is what flyctl reads, not `server/Dockerfile.dockerignore`); starts it on
  a volume with `MOSHPOINT_APP_CERTS` set; runs `check_relay.py`; checks it runs as uid 10001
  with its database on the volume.
- Docs: SERVER_PRODUCTION.md "Deploy (owner)" rewritten phone-first ("Deploy from your phone":
  one-off set-up, each deploy, store builds' certificates, optional variables, what to do when
  it goes red), the computer route kept after it; its environment table gains
  `MOSHPOINT_ADMIN_TOKEN`, `MOSHPOINT_APP_CERTS`, `MOSHPOINT_APP_ID`, `MOSHPOINT_DISCOVER_OPEN`.
  README, ROADMAP, PLAY_STORE and fly.toml's header point at the workflow; contacts are the
  `INSERTCONTACTEMAILHERE` placeholder.

**Decisions:**

- **`MOSHPOINT_APP_CERTS` is a repository variable** (it isn't secret, like `MOSHPOINT_SERVER`),
  passed with `fly deploy --env`. Set to the debug key's fingerprint now; Play's app signing
  key's goes in front of it later (SERVER_PRODUCTION.md, "Store builds"). Unset, the relay lists
  the debug key alone (its own default). A deploy from a computer must pass it too (written in
  the computer steps).
- **An organization token**, because the first run creates the app. An app's own deploy token
  also works once the app exists (the workflow falls back to `fly status`).
- **Fly builds the image** (`--remote-only`), as Fly's own GitHub Actions guide does; CI builds
  the same image with Docker to catch mistakes first.
- **The gig search keys are copied only if set**, and the owner's steps say to leave them unset
  for v1 (keyed services off). Nothing on Fly is ever deleted by the workflow.
- **Never auto-fixes two Machines** (`fly scale count 1` could destroy the one with the data):
  it fails with the steps instead.

**Not checked here:** fly.io and docs.github.com can't be reached from this session, so the Fly
dashboard's labels for making a token ("Tokens", an organization token) come from memory, and
whether region `syd` needs a paid plan isn't known (flyctl refuses some regions without one; the
workflow's error says what to change). The workflow itself can't run here or in CI (no
`FLY_API_TOKEN`, and deploying is the owner's step): its YAML and every `run:` script were
checked with PyYAML and shellcheck locally, and CI checks its triggers and pins.

## Item 2: the privacy policy as a page

**Built:**

- **`docs/PRIVACY.md`, brought up to date with the app** (checked against the code, not the old
  docs): no account and 18+ up front; Need help's removal kept (the app still deletes an old
  emergency contact); Text my spot and texted spot links (what the relay sees, the 20 kept spots,
  Android's assetlinks check at install); satellite (off until switched on; chat reads included,
  never media); smart search and Coming up near you (the typed letters, the country and at most
  a region, never the position; the relay says no until Moshpoint+ is on sale and the app hides
  them for a day); Report and Block; the install code; the battery level in location shares;
  Facebook only in versions that offer it. **Fixed:** pings and pins are kept 15 minutes, not 3
  days (the courier keeps only chat and private messages in the 72-hour store,
  `Courier.held(box)`); the old gig search (straight to Ticketmaster) is gone from the app. The
  relay's retention is a table: locations, floor, pings and pin 15 minutes; moments 24 hours;
  chat and private messages 72 hours; profile photos 8 days; reports 90 days.
- **The contact** is `INSERTCONTACTEMAILHERE` (docs/SECRETS.md) in the header and under
  "Deleting your data"; **the developer** is "the developer named on its Google Play page" (no
  legal entity to fill in; open question 2).
- **`tools/privacy_page.py`** builds the page (stdlib only: the Markdown PRIVACY.md uses,
  everything escaped first, no script, light and dark, phone-width tables scroll) into
  `server/src/main/resources/privacy.html` and `docs/site/index.html`. `--check` (a new CI step)
  fails when either is out of date; the Pages copy may have the contact filled in by hand.
- **The relay:** `PrivacyPage.kt` and `GET /privacy` (CSP with no script at all, no referrer,
  cached an hour). `MOSHPOINT_CONTACT` replaces the placeholder at start: an email becomes a
  mailto link, an https address a link, anything else plain text, always escaped; unset, the
  placeholder shows. RELAY_API.md section 14.
- **`PrivacyPageTest`** (5): served with the contact (and its headers, no script, nothing
  loaded); the placeholder without one; links, plain text and escaping; every heading and the
  date of PRIVACY.md on the page; and the policy's retention table against the relay's own
  `RelayConfig` (15 min, 24 h, 72 h, 8 days, 90 days), plus the topics the brief lists.
- **The deploy and CI:** `check_relay.py` checks `/privacy` (fails if the placeholder shows
  while Fly has `MOSHPOINT_CONTACT`, else warns); the deploy's summary prints the policy's
  address for Play Console; the `relay-image` job runs the image with a contact and checks the
  page links to it.
- **The app:** builds with a relay link to `https://<relay>/privacy` (`app/build.gradle.kts`,
  the same host test as the spot links); without one, `moshpoint.privacyUrl`, now a permalink to
  this policy (9773f19). `-Pmoshpoint.privacyPolicyUrl` still wins. No screen shows the address.
- **Docs:** PLAY_STORE (the privacy item, hosting on GitHub Pages with `docs/.nojekyll`),
  FACEBOOK (Meta's privacy URL), SECRETS (where each relay secret is set now, `FLY_API_TOKEN`,
  `MOSHPOINT_APP_CERTS`), SERVER_PRODUCTION (its PRIVACY.md to-do done), README.

## Open questions

1. **The Run workflow button and the default branch.** The repository's default branch is
   `claude/fitness-grocery-mvp-plan-xzbk8k`, which has no workflows. GitHub documents that a
   `workflow_dispatch` workflow has to be on the default branch to be run from the web page
   (Android build's manual runs on `ccr-5839ed7c-1q0ztj` may have come through the API). If the
   owner can't see Deploy server or its Run workflow button, the fix is one setting: make
   `ccr-5839ed7c-1q0ztj` the default branch (SERVER_PRODUCTION.md says how). That's the owner's
   call; nothing here changes it.
2. **Who the developer is.** The policy names "the developer named on its Google Play page"
   rather than a legal entity, so nothing is left to fill in. If the owner wants their legal name
   or company there, it's one line at the top of docs/PRIVACY.md (then
   `python3 tools/privacy_page.py`).
