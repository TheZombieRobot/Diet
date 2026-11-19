# Launch prep: the code side of the first Play Store release

The owner's scope for v1 (19 November 2026): the phone app only (the watch follows later);
everything free (no payments yet, so `Entitlements.plus` stays on for everyone until billing
exists); keyed services off (the relay refuses Discover by default); no Facebook login unless
it's configured. Branch: `claude/launch-prep` (from `ccr-5839ed7c-1q0ztj` at e2d5384). Seven
items, in order, each green in CI before the next.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 19 November
2026, 07:16 UTC._

- **Now:** all seven items are done, each green in CI before the next. What's left is the
  owner's: **docs/RELEASE_CHECKLIST.md**, from step 0.
- **Done:** item 1, green in run 363 (493fd3b); item 2, run 364 (d88c2bf); item 3, run 365
  (838f941: "OK: SpotLinkActivity with one autoVerify filter for
  https://relay.example.invalid/spot", "OK: no SpotLinkActivity and no verified link", "OK: the
  release APK has no SpotLinkActivity"); item 4, run 366 (da28245); item 5, run 367 (de83af6);
  item 6, run 368 (e6e70c3: the Facebook check, the throwaway-key rehearsal and the 16 KB check
  of its bundle all passed); item 7, run 369 (08cd36e).
- **Screenshots:** against e2d5384's, by blob hash: phone 2,312 identical and 8 changed, all
  `smallPhoneLargeFontTextedSpotMap` (fr, in, nl, pl, sv, th, tr, vi: item 5, the languages
  whose map title was cut to a dot or a few letters; looked at: Polish now shows "Mapa" and its
  status, the buttons on a line under them); watch 546 identical. No other item changed one.
- **Last green run:** 369 (08cd36e, item 7; 07:16 UTC). The commit after it (this handover,
  and the Live notification's button named as it is, "Go hidden", in the checklist's video steps
  and PLAY_STORE.md) is docs only, pushed with `[skip ci]`.
- **Tests:** core 660 and server 115 pass locally (scratch Gradle build of only `:core` and
  `:server`, Maven Central only); at e2d5384 they were 658 and 108.

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

## Item 3: the spot links' App Link, checked with and without a relay

**Built:**

- A CI step after the release build, **Texted spots open in the app only with a relay**: it merges
  the release manifest twice (`:app:processReleaseManifest`), once with a made-up relay
  (`-Pmoshpoint.server=https://relay.example.invalid`) and once with none (`-Pmoshpoint.server=
  -Pmoshpoint.serverUrl=`, blank, so `gradle.properties` can't fill one in), whatever the
  `MOSHPOINT_SERVER` variable is. `tools/check_spot_link.py` then checks the first has exactly one
  `SpotLinkActivity`, exported, with exactly one `android:autoVerify="true"` filter (VIEW,
  DEFAULT and BROWSABLE, `https://relay.example.invalid/spot` and nothing else) and no other
  verified link, and the second has neither the activity nor any verified link, and that no
  manifest placeholder was left unfilled. Last, the release APK CI built with the repository's
  own setting must match it (aapt2): the activity is there exactly when `MOSHPOINT_SERVER` is a
  plain https address (`check_spot_link.py --host`, the build script's own rule).
- Builds still never need `MOSHPOINT_SERVER`: the step sets the relay itself.

## Item 4: the flaky ReportTest (two reports in the same millisecond)

**The cause:** a report's id is its arrival time in milliseconds and a random part, and the
owner's list is sorted by id, newest first. Two reports in the same millisecond tied on time, so
the random part decided which listed first: `aReportIsStoredAndTheOwnerCanListAndDeleteIt`
(two posts back to back, the newer expected first) failed about half the time they landed in
one millisecond (run 358's first attempt).

**Fixed in the relay, not the test:** `ReportStore` keeps the newest time part it has handed out
(read back from the stored reports when it starts) and gives each new report a time part at
least a millisecond later (`maxOf(clock(), last + 1)`). The order is now the order they came in,
every time, including after a restart with the clock set back. Ids keep their format
(13 digits, a dash, 12 hex); a report in a burst may be stamped a millisecond or so later than
it came, which only keeps it a millisecond longer. The test itself is unchanged.

**New tests (ReportTest):** `reportsInTheSameMillisecondListInTheOrderTheyCame` (a clock that
stands still, four reports, 25 times over: newest first every time) and
`theOrderHoldsAcrossARestartEvenIfTheClockWentBack` (two reports, a new store on the same
folder with the clock 5 seconds behind: the third still lists first, nothing swept early).
`ReportTest`: 12 tests pass locally.

## Item 5: the map's top bar on a small phone with large text

**The problem:** the map's top bar was one Row: the back chevron, the title over the status, then
Pin, All and Me, with the title and status given whatever the buttons left. On a small phone with
large text (`smallPhoneLargeFontTextedSpotMap`: Nexus 5, text at 130%) the buttons took nearly
all of it, and in many languages the title was cut to "·" or a few letters (Polish: Pinezka,
Wszyscy and Ja). On normal phones the title fits in every language.

**Fixed with the place rows' rule** (`ListRow`, the same map's list): wherever the longest word
of the title and the status fits between the chevron and the buttons, the bar is laid out exactly
as the Row it was (`MapTopBar` measures and places its parts the way Row does, so nothing changes
there). Below that, the buttons go on a line of their own under the title, at the end, and the
title and status get the bar's whole width. The map style's button under the bar (Bright, Night,
Dark) moves down with it then, 20 dp under the bar as before (`MapTopArea`); otherwise it stays
where it was. No new strings; RTL mirrors as before (`placeRelative`).

**Result (run 367):** only `smallPhoneLargeFontTextedSpotMap` changed, in 8 languages (fr, in,
nl, pl, sv, th, tr, vi); every other map screenshot, the normal phone's included, is identical by
blob hash. In Spanish and Portuguese the title's first word already fitted, so it stays a Row
(ellipsised after a word, as on any phone).

## Item 6: release readiness

**Continue with Facebook only with a Meta app; nothing of its SDK starts by itself:**

- The button was already hidden without a Meta app (`FacebookLogin.available` is
  `BuildConfig.FACEBOOK_ENABLED`, which needs both the app id and the client token; Settings and
  the welcome show it only then), and the SDK is only ever started by that button
  (`FacebookLogin.start`; its start-up provider is removed in every build, auto-init, automatic
  events and advertising-ID collection are off in the manifest). Nothing else in the app calls
  Facebook (checked: only `profile/FacebookLogin.kt` imports `com.facebook`).
- New: a build without a Meta app also has **none of the SDK's components** in its manifest
  (`app/src/noFacebook/AndroidManifest.xml`, added by the build script when `facebookEnabled` is
  false; the list is the SDK 17.0.2 AARs' own: FacebookActivity, CustomTabMainActivity,
  CustomTabActivity, which any app could open with `fbconnect://cct.nz.waveformlabs.moshpoint`,
  and the two token broadcast receivers). So nothing of it can start, from inside the app or
  outside.
- CI, after the texted-spots step: `tools/check_facebook.py` on the release manifests merged
  there (with a relay and without one, this repository's own Facebook setting), on one merged
  with a made-up Meta app (`-Pmoshpoint.facebookAppId=1234567890`, the login's activity comes
  back), and on the release APK (aapt2). The merges now go through `tools/release_manifest.sh`,
  shared with item 3's step, and pass the build's Facebook variables.
- The report-only "Merged manifest … compared with the published main build" step will list the
  five Facebook components as gone from this branch's test build (expected).

**Moshpoint+ for everyone while billing doesn't exist:** the rule moved into core,
`Membership.plus(stored, testBuild, billing = Membership.BILLING)`, with `MembershipTest`.
`BILLING` is false, so every store build answers yes **whatever is saved** (before, a saved
"no" would have won; only a test build's debug panel can save one). Test builds keep the debug
panel's switch. `Entitlements.plus` calls it; nothing else changed.

**The relay refuses Discover by default:** confirmed, no change. `EntitlementCheck.fromEnv`
opens it only for `MOSHPOINT_DISCOVER_OPEN=1` (DiscoverTest checks blank, 0, true, yes and on
stay closed), the relay-image job checks `/v1/discover/suggest` answers 403 from the real
container, and the Deploy server workflow fails if `MOSHPOINT_DISCOVER_OPEN` is set on Fly. The
app takes a 403 quietly (DiscoverClient: hand entry only, asked again a day later).

**The signed Play bundle:**

- **Upload key works** (new, right after the tests, before anything is signed): runs when
  `MOSHPOINT_KEYSTORE` is set; `tools/check_upload_key.sh` checks all four secrets are there,
  the keystore decodes (base64) and opens with its password, the alias is in it, and the key
  password opens the key (by signing a throwaway file with jarsigner: keytool alone accepts a
  wrong key password for PKCS12). It names the secret that's missing or wrong and prints no
  value.
- **Signed Play Store bundle** (unchanged) runs on the same condition, so with all four secrets
  set it runs after the check passes. Its upload step is unchanged.
- **Signed bundle rehearsal with a throwaway upload key** (new, until the secrets exist): makes
  a key for the run (random passwords, never printed), runs the key check (passes, and fails
  for a wrong key password and for a missing secret), builds the bundle with the real step's
  command, and checks the bundle's certificate is that key's (SHA-256). Nothing is uploaded; the
  16 KB check then covers the bundle too. Once the secrets are set it skips itself.
- The release debug-text check is unchanged.

**Result (run 368):** "A Meta app is configured for this repository's builds: no"; "OK: no
Facebook component at all" for both release manifests and for the release APK; "OK: Facebook
login there, its SDK started only by the button" with the made-up Meta app; "OK: the upload key
decodes, its alias is in the keystore, and both passwords work", "OK: the key check refuses a
wrong key password and a missing secret", "OK: app-release.aab (15M) is signed with the upload
key it was given" (the rehearsal took 74 seconds); the 16 KB check passed with the bundle. The
report-only manifest comparison lists the five Facebook components as gone, as expected. No
screenshot changed.

## Item 7: the owner's launch checklist

**Built:**

- **docs/RELEASE_CHECKLIST.md**, the owner's steps in order, for a phone, each with where to
  tap and what to paste (placeholders only): 0, the default branch (so the Run workflow buttons
  show); 1, the Play Console account (personal: US$25, ID check, the Play Console app, and the
  closed test of 12 testers for 14 days in a row); 2, creating the app; 3, the upload key
  (keytool on a computer or Termux) and the four signing secrets, checked by a manual Android
  build (Upload key works, the signed bundle, its artifact); 4, Fly.io and the Deploy server
  workflow (the organization token and the relay's secrets); 5, `MOSHPOINT_SERVER`, then
  `MOSHPOINT_APP_CERTS` with Play's app signing fingerprint after the first upload; 6, the
  privacy policy URL (the relay's `/privacy`); 7, App content, every item's answer, the content
  rating (IARC, from PLAY_STORE.md), 18+ only, Data safety (PLAY_STORE.md) and the foreground
  service declarations (connectedDevice and location, what each video shows, recorded with the
  test build before the first upload); 8, the store listing (short and full description in
  English, the images, category Events); 9, the closed test; 10, applying for production;
  11, a staged rollout (10%, 50%, 100%, halt if needed). Then what comes after the first
  release.
- **docs/store/play/**, the images to upload, made by **tools/store_images.py** (Pillow) from
  docs/store and docs/screenshots: the icon (512 × 512, 32-bit), the feature graphic (1024 × 500,
  24-bit) and eight phone screenshots, 500 × 1000 with no transparency (the test screenshots are
  461 × 1000 with an alpha channel and taller than Play's 2:1, so each is padded at the sides with
  its own edge colour). Chosen to tell the story with made-up names only: welcome,
  finderOneFriend, homeMain, finderFarAway, privateThread, hypeGroup, venueCard, upNext (not
  crewChat or offlineChat, which show a real band, finderGroup or finderBigCrew, a real band and
  a real festival, the map, a placeholder in tests, or Moshpoint+).
- **docs/PLAY_STORE.md**: points to the checklist; the store listing (the new short and full
  description, the images); the Data safety answers checked against the app as it is now (gig
  search no longer goes to Ticketmaster or anyone else: the old search is gone and smart search
  asks only our relay; the install code declared under Device or other IDs; reports' name and
  crew key under Personal info; no Facebook rows until a Meta app is configured; retention as
  the relay keeps it); one foreground-service video per type.
- **docs/SECRETS.md**: the fill-in checklist gains `FLY_API_TOKEN` (INSERTFLYAPITOKENHERE) and
  `MOSHPOINT_APP_CERTS` (INSERTPLAYSHA256HERE), and the relay's secrets now say they go in
  GitHub (the Deploy server workflow copies them). **README**: the checklist first under
  Releasing.

**Result (run 369):** green; no screenshot changed. After it, the checklist's video steps and
PLAY_STORE.md name the Live notification's button as the app does ("Go hidden", not "Stop").

## Open questions

1. **The Run workflow button and the default branch.** The repository's default branch is
   `claude/fitness-grocery-mvp-plan-xzbk8k`, which has no workflows. GitHub documents that a
   `workflow_dispatch` workflow has to be on the default branch to be run from the web page
   (Android build's manual runs on `ccr-5839ed7c-1q0ztj` may have come through the API). If the
   owner can't see Deploy server or its Run workflow button, the fix is one setting: make
   `ccr-5839ed7c-1q0ztj` the default branch (RELEASE_CHECKLIST.md, step 0, and SERVER_PRODUCTION.md
   say how). That's the owner's call; nothing here changes it.
2. **Who the developer is.** The policy names "the developer named on its Google Play page"
   rather than a legal entity, so nothing is left to fill in. If the owner wants their legal name
   or company there, it's one line at the top of docs/PRIVACY.md (then
   `python3 tools/privacy_page.py`).
3. **Fly.io's pages and prices weren't checked from here** (fly.io and docs.github.com don't
   resolve from this environment). The commands were checked in flyctl's own source; the
   dashboard's labels (Tokens, Billing), the organization-token steps, "about US$10 a month" and
   whether the `syd` region needs anything more were written from memory. If a label differs,
   SERVER_PRODUCTION.md and RELEASE_CHECKLIST.md step 4 are the two places to fix.
4. **Data safety: the install code is declared** under Device or other IDs (collected, processed
   ephemerally, not shared, required with the relay). It's a random server-signed code kept only
   in the relay's memory for rate limits; declaring it is the cautious reading of Play's
   definitions. The owner can drop the row if Google's guidance says an ephemeral, random,
   app-instance code doesn't count.
5. **The closed test applies to personal developer accounts** made after November 2023 (12
   testers, 14 days in a row). The checklist assumes a personal account; an organization account
   (needs a D-U-N-S number) skips it.
6. **CI time:** until the four signing secrets exist, every phone build also rehearses the signed
   bundle with a throwaway key (item 6): 74 seconds in run 368. It skips itself once they're set.
