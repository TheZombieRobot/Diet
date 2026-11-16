# Wave 2b: Play Store compliance and security

Branch `claude/play-store-security`, from `ccr-5839ed7c-1q0ztj` at df2b9f7. Scope: launch
blockers 6, 8, 10 and 11 in docs/PRODUCTION_AUDIT.md, its "Release" list, and the cold-start
invite crash from "Found during the tidy-up" (details in docs/audit/release.md). Wave 2a (safety
and Live) runs in parallel; wave 2c (battery) and 2d (Report and Block) come later.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here. Last updated 16 November
2026, 00:20 UTC._

- **Done.** Code: items 1–4 and 6–12 below; item 5 was dropped by the owner (the refusal was
  built, then removed again). Docs: ANDROID_16.md, BLUETOOTH_UUIDS.md, PLAY_STORE.md (Data
  safety corrected, Play Console answers), PRIVACY.md, FIELD_TEST_PLAN.md section 4g,
  SERVER_PRODUCTION.md's app follow-ups, this note.
- **Review round (16 November):** an independent review of 2ceb820 found one regression that
  blocked the merge and six smaller items; all seven are dealt with (next section). **CI: run
  308 (f86b6e1)** (https://github.com/TheZombieRobot/Diet/actions/runs/43778320868): every
  step that can fail has passed (the new core tests, debug and release builds, the 16 KB
  check, screenshots, the watch); its report-only steps were still running at 00:20.
  Screenshots: still 252 added and nothing else against `origin/ui-screenshots`, and every
  image identical to run 306's (no screen changed this round: the disclosure's look didn't,
  only when it shows). Reported to the coordinating session; it decides on merging.
- **Before the review round, final CI was run 306 (d58062f), green**
  (https://github.com/TheZombieRobot/Diet/actions/runs/43772437390): translations, core and
  server tests, debug and release builds, the 16 KB check (phone and watch), screenshots, the
  watch. Against `origin/ui-screenshots`: 252 added (the 12 new screens × 21 languages), none
  modified or deleted. Manifest: exactly the six intended removals (below). Licences: only
  MapLibre 11.5.2 → 11.8.1.
- **Course change (15 November, from the coordinating session):** item 5 dropped; item 4's relay
  rule is "release builds follow an invite only to one of their own relays"
  (`RelayClient.ownRelays`); Settings' relay example is `https://<app>.fly.dev`; PRIVACY.md has
  Fly's one-day snapshots.
- **Screens reviewed, every new screen in every language** (normal phone, small phone with a
  large font, tablet): two problems found in run 303 and fixed: the French "Rejoindre" and
  "Continuer" broke mid-word on a small phone with a large font (the dialog buttons now stack,
  the confirming one on top, when both don't fit: `PlayDialogs.Buttons`), and `settingsAbout`
  showed CI's build number, which changes every run (the test passes a fixed version). Fine as
  they are: on a small phone with a large font the welcome's second step and the disclosure's
  points scroll, so the privacy link is below the fold there; tablets in landscape show the
  phone layout full width, nothing cut off.
- **CI quirk, for whoever owns android.yml:** when two queued runs on one branch both change the
  same image in `docs/screenshots`, the second run's commit can't rebase (a binary conflict) and
  the step's `continue-on-error` hides it. It happened to run 306 (`settingsAbout`, whose build
  number changed between runs 303 and 304); its five images were copied by hand from its own
  `ui-screenshots-claude-play-store-security` set. The all-language branch is force-pushed, so
  it's always right.

## Review round (16 November): what the independent review found, and what was done

1. **Must fix: crew intros could stay off Bluetooth all night.** The intro loop decided once, at
   its start, whether adverts had room; with Bluetooth off Android reports a maximum of 0, and
   nothing restarted the loop when Bluetooth came on unless the finder, the map or Live passed
   the event on. Fixed: core `IntroRadio` works it out every round (2.5 s), as `advertise()` did
   before this branch; when Bluetooth comes (back) on it drops the dead advert set and restarts
   the shared scan; and it starts listening if it couldn't at the start (`startListening` gave
   up for good when Bluetooth was off: older than this branch, same scenario). Tests:
   `IntroRadioTest` (started with Bluetooth off, then on; off and on again; room; followers).
2. **The disclosure showed at every start for people who said no**, and after a permanent
   denial its Continue did nothing. Now (core `PermissionAsks`, tested; `PermissionsState`):
   the launch ask runs only at a fresh start (`savedInstanceState == null`), never after "Not
   now" (remembered), and not when Android won't show its prompt any more (asked before, and
   Android's rationale flag off for everything missing); Continue opens Android's prompt, or
   the app's page in Settings once Android won't ask. The first start after updating counts as
   "asked before" when the welcome was done (older versions asked at every start). A disclosure
   on screen survives the activity being re-created (a tablet rotating). Field tests 4g-D6–D8.
3. **The compass was 90° off in landscape on large screens.** Fixed: `Compass` reads the
   display's rotation with every reading and core `CompassHeading` uses whichever edge of the
   phone is at the top of the screen (the mapping `SensorManager.remapCoordinateSystem` uses for
   a compass); tests flat and upright, every quarter turn. Only the finder and the map run it.
4. **The 128-bit UUIDs weren't field-tested** with the screen off, where the Bluetooth chip does
   the filtering. Field test 4g-I (airplane mode, Bluetooth on, screen off, two chipsets). No
   fallback in the code, explained in BLUETOOTH_UUIDS.md ("With the screen off"): an unfiltered
   scan can't run with the screen off, and Android can't be made to match in software; the fix
   for a failing chip (the UUID also as a 128-bit service UUID list, with a filter on it) is
   written down, not done, because it spends three more of the chip's few filter slots.
5. **Test builds could still pass on a stranger's relay** saved by an older version (no
   "fromInvite" flag): such an address now counts as from an invite (`RelayClient.init`).
6. **Test builds switched relay even for a bad invite**: the switch now comes after
   `GroupSync.join` succeeds (still before the crew's first request, which starts on the main
   thread after this returns).
7. **The privacy policy link would break with the branch:** it's a commit permalink now
   (gradle.properties, docs/FACEBOOK.md); hosting it is an owner to-do below.

## What changed, item by item

### 1. Target API 36 (watch 35), AGP 8.10.1
`compileSdk`/`targetSdk` 36 for the phone (and `finder`), 35/35 for the watch, AGP 8.7.3 →
8.10.1 (Gradle, Kotlin and Compose unchanged). Every Android 16 behaviour change was checked
against the code: docs/ANDROID_16.md. New tablet-width screenshot tests (1280 × 800 dp, every
language): `tabletHomeMain`, `tabletFinderGroup`, `tabletDisclosure`.
- Paparazzi 1.3.5 can't start on API 36 (its layoutlib's `Build` lacks `VERSION_CODES_FULL`):
  `app/src/test/java/android/os/Build.java` is a test-only copy without it. Upgrading Paparazzi
  instead would have changed every screenshot (ANDROID_16.md).
- Found and fixed in the review round: the compass arrow was 90° off on a large screen in
  landscape (now it follows the display's rotation: core `CompassHeading`). Found, for the
  bug-fixing phase: rotation recreates MainActivity on large
  screens (wave 2a's `configChanges`).

### 2. Photos: the system picker, no READ_MEDIA permissions
- Manifest: `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED` and
  `READ_EXTERNAL_STORAGE` (max 32) removed. Nothing else used them.
- "＋ Add your photos" (a gig's Story) → "Your photos from that night" (what happens) →
  **Choose photos** → Android's photo picker (`PickMultipleVisualMedia`, photos and videos) →
  copied into the gig with the untouched originals, as before (`GigArchive.describePicked` +
  `addFromPhone`). The app used to search the gallery by date itself; now the person picks.
  The time of each item comes from the picker (`DATE_TAKEN`), else the file's last change, else
  the gig's start. Duplicates are still caught (same MediaStore number as before). Video frames
  fall back to `MediaMetadataRetriever` when the picker gives no thumbnail.
- The launcher sits where the permission request was (`MainLaunchers.pickRoll`), so every later
  launcher keeps its position; which gig the picker is for survives Android closing the app.
- Text: four strings of the old flow removed from all 20 languages (`setup_roll_looking`,
  `setup_roll_nothing`, `setup_roll_tap_to_leave_out`, `setup_roll_add_n`,
  `main_photos_permission_needed`); two new ones (`play_roll_pick_text`, `play_roll_choose`).

### 3. No advertising ID
`com.google.android.gms.permission.AD_ID` removed with `tools:node="remove"` (the Facebook SDK
added it). Play Console: Advertising ID = No.

### 4. Invites from outside the app (release P0-5, the cold-start crash)
- **Every invite from outside the app waits for a confirmation**: `ShareInviteActivity` and any
  app starting `MainActivity` with the `INVITE_TEXT` extra only *offer* it
  (`InviteState.offerSharedInvite` → `sharedInvite` → NightDialogs' `SharedInviteDialog`).
  Crews: "Join Bevan's crew?"; follow links: "Follow …?"; named friend codes: "Add Sam?"; a bare
  code fills in "Add someone" (which asks for a name and a tap). Nothing joins, adds or goes live
  until Join/Add is tapped. There is no link handler (no `VIEW` intent filter); a future one
  should call `offerSharedInvite` too. The in-app paths (scanning a QR, Paste invite, bump, the
  clipboard offer) were already explicit taps and are unchanged.
- **Relays** (revised by the owner's decision of 15 November, relayed by the coordinating
  session): the build's own relays are one list, `RelayClient.ownRelays` (today
  `MOSHPOINT_SERVER`; the free tier's relay joins it with billing). A release build follows an
  invite's `r=` only to one of its own relays, never a stranger's host, and ignores a stranger's
  relay saved by an older version; otherwise server selection is today's (the chosen relay, else
  `MOSHPOINT_SERVER`, else the public ntfy.sh). Test builds keep the option: after the person
  confirms, they switch to the invite's relay (the dialog names it, in amber). `withRelay` never
  copies a relay that came from someone else's invite (`RelayClient.shareableServer`: in release
  the relay in use, always one of its own; in a test build the build's relay or one typed into
  Settings). Rules and tests: core `InviteRelay`, `InviteRelayTest`.
- **Cold start:** the shared invite is handled at the end of `onCreate`'s
  `savedInstanceState == null` block, after the finder engine and `GroupSync.load`, as
  `onNewIntent` does. So joining tonight's crew sees the current main crew and moves it to
  Up next as the in-app path does (`GroupSync.set`), and opening your own crew's invite no
  longer wipes its members and pin. `refreshSetupIssues` and `missingPermissions` do nothing
  with the engine until it exists. A waiting confirmation survives Android closing the app.
- Not done: a Robolectric start-up test (the audit's suggestion). Adding Robolectric next to
  Paparazzi in the app's unit tests risks the screenshot pipeline; the pure rules are tested in
  core, and the cold start is field test 4g-A.

### 5. ~~No Play bundle without our own server~~: dropped
Owner's decision (15 November, relayed by the coordinating session): the production relay is a
Moshpoint+ feature and free users run on another, limited relay, so builds must not require
`MOSHPOINT_SERVER` and the public-relay fallback stays. The refusal was built (df41ff3 and
before) and has been removed again; CI's bundle step is back as it was.

### 6. Gig search uses the build's server
`GigSearch` asks `RelayClient.shareableServer` (the build's server), not `serverUrl` (blank when
the server is built in), so search works in release builds. `VenueLookup` decides the same way.

### 7. Facebook SDK only when someone taps "Continue with Facebook"
- `FacebookInitProvider` removed from the merged manifest (`tools:node="remove"`), and
  `FacebookLogin.register()` no longer starts the SDK: it registers a result launcher whose
  contract starts the SDK on first use (the tap, or a login result arriving after Android closed
  the app). So nothing reaches Meta at launch.
- Confirmed off: `AutoInitEnabled`, `AutoLogAppEventsEnabled` and
  `AdvertiserIDCollectionEnabled` are `false` in the manifest, and set again when the SDK starts;
  `AD_ID` is removed.
- **Bug found and fixed:** with auto-init off the SDK never counts as "fully initialised", and
  then every Graph request fails ("GraphRequest can't be used when Facebook SDK isn't fully
  initialized"), so the name and photo never arrived. The SDK is now started with
  `FacebookSdk.fullyInitialize()` on the tap. (Untested on a phone: no Meta app is configured.)

### 8. Prominent disclosure and privacy policy link
- **Before Android's location and nearby-devices prompt**, a dialog in plain words (all 20
  languages): location shared with your crew and friends while live; encrypted on the phone and
  sent through a relay server, which can't read it (no "Moshpoint's": free users may be on
  another relay, owner's decision); Live keeps running with the app closed
  (with a notification) until turned off; while live, the phone passes on other users'
  encrypted messages over Bluetooth and can't read them. Then Continue (→ Android's prompt) or
  Not now. Every prompt goes through it: the welcome's Allow, the prompt at launch, the home's
  "allow" banner and Go live (`PermissionsState.askWithDisclosure`). It isn't shown once location
  and Bluetooth are allowed.
- **Privacy policy link** in the welcome's permissions step, in the disclosure, and at the
  bottom of Settings (`AboutSection`). The address is `BuildConfig.PRIVACY_POLICY_URL`, from
  `moshpoint.privacyUrl` in gradle.properties: a placeholder until the owner hosts the policy,
  a commit permalink to PRIVACY.md (a branch link would break when the branch goes).

### 9. MapLibre 11.8.1 (16 KB pages)
11.5.2's `libmaplibre.so` is 4 KB aligned; 11.8.1 is the first 11.x that's 16 KB aligned and
has no API change for the app's calls, so `FriendMap` and `MapScreen` needed no change (checked
against the changelog; 11.13.5 would add 1.7 MB for nothing we need). `tools/check_16kb.py`
checks every 64-bit native library in an APK, AAB or AAR (ELF alignment, and stored libraries'
position in an APK); CI runs it on the release APK, the Play bundle and the watch's release APK
and bundle, and fails on any miss.

### 10. The watch
- CI builds a signed watch bundle (`moshpoint-watch-release-aab`) whenever the signing secrets
  exist, like the phone's, and checks it for 16 KB alignment.
- `Entitlements.plus` defaults to true in every build until Play Billing exists
  (`Entitlements.BILLING = false`), so the watch never says "Unlock" with nothing to buy.

### 11. Bluetooth UUIDs
Decision and the byte maths: docs/BLUETOOTH_UUIDS.md. The three Bluetooth 5 adverts (crowd relay
and crew messages, crew intros, bump) now use Moshpoint's own 128-bit UUIDs, with their room
checks updated for the bigger header. The finder's own advert has to stay a 31-byte legacy
advert, where a 128-bit UUID can't fit (41 bytes): it keeps `0xFFA7` until the owner buys a
16-bit UUID from the Bluetooth SIG. **Testers must all update together.**

### 12. Extras
- Release builds strip `Log.v/d/i` with R8 (`app/proguard-release.pro`; UwbResponder logged a
  friend's name).
- `ShareMomentActivity`, and `MainActivity` itself, refuse a shared photo that's a `file://`
  path or one of the app's own providers.
- Release: `isShrinkResources = true`; `localeFilters` = the app's 20 languages (plus the two
  pseudo-locales test builds use).
- Crew intros are only sent in the second form now (no constant prefix, no repeatable nonce),
  on air and to the relay; both forms are still read.
- Settings > Relay server (test builds only): the example address is `https://<app>.fly.dev`,
  where the production relay runs (was an onrender.com one).

### 13. Docs
PLAY_STORE.md's Data safety draft was wrong on three points ("shares nothing", "deleted after 15
minutes", "no user-generated content") and is rewritten, with the Play Console answers drafted
(app access, ads, Advertising ID, audience 18+, the content rating questionnaire, both
foreground services' declarations with what to film). PRIVACY.md: the camera, microphone and
photos rows, where the server is and how long it keeps what (Fly's one-day snapshots too),
which builds use ntfy.sh, Meta, the gig APIs, 18+, moments 24 hours, intros. The app's "a few
hours" for moments is "within 24 hours" in every language.

## Intended manifest changes

From CI's "Merged manifest and licence list, compared with the published main build" (runs 302,
304 and 306, the same each time):

```
< provider name=com.facebook.internal.FacebookInitProvider exported=false authorities=nz.waveformlabs.moshpoint.FacebookInitProvider
< uses-permission name=android.permission.READ_EXTERNAL_STORAGE maxSdkVersion=32
< uses-permission name=android.permission.READ_MEDIA_IMAGES
< uses-permission name=android.permission.READ_MEDIA_VIDEO
< uses-permission name=android.permission.READ_MEDIA_VISUAL_USER_SELECTED
< uses-permission name=com.google.android.gms.permission.AD_ID
```

Only removals, nothing added: 69 → 63 entries. Licence list: `org.maplibre.gl:android-sdk`
11.5.2 → 11.8.1, nothing else. (Target SDK isn't in that report; `aapt2 dump badging` shows it.)

## Intended screenshot changes

New screens (every language): `sharedInvite`, `sharedFriendInvite`, `smallPhoneLargeFontSharedInvite`,
`locationDisclosure`, `smallPhoneLargeFontDisclosure`, `tabletDisclosure`, `welcomeLive`,
`smallPhoneLargeFontWelcomeLive`, `settingsAbout`, `cameraRoll`, `tabletHomeMain`,
`tabletFinderGroup`. Changed on purpose: none of the existing screens (the moment caption
line with "within 24 hours" isn't in a screenshot test, and Settings' relay example is below
the fold of both Settings screenshots). Everything else must be byte-identical to
`origin/ui-screenshots`. Against this branch's own df41ff3 run: the three disclosure screens
change (the relay line) in every language, `settingsAbout` (a fixed version instead of CI's
build number), and the small-phone, large-font French dialogs (stacked buttons).

## Checking

```
git fetch origin ui-screenshots ui-screenshots-claude-play-store-security
git diff --name-status origin/ui-screenshots origin/ui-screenshots-claude-play-store-security
```
`A` lines should be exactly the new screens above (12 × 21 languages); no `M` or `D` lines.

## Shared files (for merging with wave 2a)

Small, local edits only:
- `AndroidManifest.xml`: the photo permissions block replaced by a comment; an `AD_ID` remove
  line after the features; a `FacebookInitProvider` remove element before the Facebook
  meta-data. Nothing else.
- `crew/GroupSync.kt`: one import (`IntroRadio`); the `INTRO_UUID` line; inside the intro loop
  (`introFor` callers, the `IntroRadio` round before `advertise`); the start of
  `startListening` (Bluetooth off); `syncOnce`'s `sealIntro` call.
- `MainActivity.kt`: `onNewIntent`'s last line; the invite line moved from before
  `GroupSync.load` to the end of the `savedInstanceState == null` block, with an `else` that
  restores three holders; `askPermissions.launch` → `permissions.atLaunch(fresh = …)`; three
  lines in `onSaveInstanceState`.
- `main/`: InviteState (relay rule, shared-invite offer), PermissionsState (guards, the
  disclosure), HomeState (one line), MainScreen (the disclosure dialog, onboarding's two
  arguments, the roll dialog's arguments), NightDialogs (the confirmation), StoryState (the
  picker), MainLaunchers (the picker launcher in the old one's place).

## Merging with wave 2a (`claude/wave2-safety-k7m3p9`, tried at ce1363e)

A trial merge (local only, nothing pushed) is clean except `docs/FIELD_TEST_PLAN.md`, where both
waves add a section after 4e: keep both, 2a's "4f. Safety and the Live state" first, then this
wave's "4g. Play Store readiness". Three other conflicts were avoided on this side: the Play
screenshot tests sit after `smallPhoneSettings` (2a appends at the end of the class), the
disclosure is composed just above `CrewDialogs(a)` (2a adds `AppNotices(a)` below it), and one
doc comment in GigArchive is back as it was. Checked on the merged tree: every location and
nearby-devices prompt still goes through the disclosure (2a's Live restart and auto-start ask
for nothing), and a shared invite is still only offered, never joined or live by itself.

## For the billing session (wave 2e): what assumes a relay

Nothing here assumes a release build always has `MOSHPOINT_SERVER`. What the free/premium routing
will need to touch:
- `RelayClient.ownRelays`: add the free relay (e.g. a `MOSHPOINT_FREE_SERVER` build field) so
  release builds accept it from invites; then decide which relay a phone uses (`InviteRelay.inUse`
  takes the chosen one, else the built-in one) and what invites carry (`shareableServer`: the
  relay in use; a Moshpoint+ member's invite would move a free joiner onto the production relay).
- Gig search and venue lookups ask `shareableServer`; with no relay they fall back to
  Ticketmaster directly (if a key is built in) and Nominatim directly.
- The disclosure says "sent through a relay server, which can't read it" (true for every relay);
  PRIVACY.md says which relays there are; both need the free relay named when it exists.
- Safety messages must never count against the free allowance (ROADMAP.md, Moshpoint+): nothing
  in this wave meters them.

## Owner to-do (found or confirmed here)
- **Bluetooth SIG:** join as an Adopter (free), buy one 16-bit UUID (US$3,750), and replace
  `0xFFA7` in `Ble.kt` before launch (testers update together).
- **`MOSHPOINT_SERVER`:** set it to the production relay (`https://<app>.fly.dev`); builds work
  without it (the public relay), as the owner decided.
- **Privacy policy:** host it at a stable address of its own, then set `moshpoint.privacyUrl`
  (and the Meta app's privacy URL, docs/FACEBOOK.md); fill in the email and legal entity;
  confirm the server region line (Sydney, Fly.io). Until then the app links to a commit
  permalink of PRIVACY.md as of wave 2b (8b81317): it survives branches being renamed or
  deleted, but doesn't follow later edits, so re-point it if PRIVACY.md changes first.
- **Play Console:** use the drafted answers in PLAY_STORE.md (Data safety, content rating,
  foreground services with two short videos, audience 18+, category Events, Advertising ID No).
- **Meta:** if Facebook login is used, test it once on a phone (it never worked before the fix
  in item 7), then switch the Meta app to Live mode.
- **Later:** upgrade Paparazzi (then delete the test-only `Build.java` and review every
  screenshot).
