# Production audit (15 November 2026)

Three independent audits of ccr-5839ed7c-1q0ztj at 792cd68 (test build 289): performance and battery, reliability, and release / security / Play Store readiness. The full findings, with classes, lines and fixes, are in [audit/performance.md](audit/performance.md), [audit/reliability.md](audit/reliability.md) and [audit/release.md](audit/release.md). The code tidy-up (no behaviour change) is merged: see [CODE_STRUCTURE.md](CODE_STRUCTURE.md).

Two findings were checked again by hand:
- **Signing:** the signing secrets are not set; run 289 skipped "Signed Play Store bundle".
- **Android target:** Google's Play Console help (Target API level requirements) confirms that from 31 August 2026, new apps and updates must target Android 16 (API 36), with extensions to 1 November; Wear OS must target Android 15 (API 35).

## Launch blockers

**These must never mislead.**
1. **Removed, owner's decision (16 November 2026):** Need help is no longer in the app, so this
   no longer applies ([REMOVE_SAFETY.md](REMOVE_SAFETY.md)). The finding was: Need help says "Crew alerted ✓" as soon as it's tapped, even when the alert is only queued. Texting the emergency contact and calling fail silently on a phone without an SMS or dialler app. Show the real outbox state. (reliability P0-2)
2. **Removed, owner's decision (16 November 2026):** check-ins are no longer in the app, so this
   no longer applies ([REMOVE_SAFETY.md](REMOVE_SAFETY.md)). The finding was: the overdue check-in alert only fires on phones that are open or live, and it shares chat's notification channel, so muting chat mutes it. It needs a Doze-proof alarm at the deadline and the help channel. (reliability P0-4)
3. The Live state can be wrong in two ways:
   - it shows "live" when nothing is running (after every app update, a force-stop or a Samsung background kill);
   - it never turns off after the gig, costing 13–19% of the battery a day.

   One fix covers both: reconcile Live with the service, restart it after updates, tell the user when it stops, and turn it off when the crew ends or after 12 h. (reliability P0-1, performance P0-1)

**Battery**
4. The mobile radio never idles: every GPS fix and relay packet is uploaded at once, a request every 3–5 s. Batch into one request a minute, use only networks that really have internet, and back off. (performance P0-2; needs the server's batch endpoint)
5. The finder keeps the screen on for as long as it's open, even in a pocket: 8–13% an hour. Let the screen sleep about 90 s after the last touch, unless a mate is close. (performance P0-3)

**Play Store**
6. Target Android 16 (API 36) for the phone and Android 15 (API 35) for the watch, with AGP 8.9 or later. (release P0-1)
7. A signed release bundle (AAB): create an upload key, add the four signing secrets and use Play App Signing. Test builds are signed with the public debug key in the repo, so anyone could sign a fake update for testers. (release P0-2)
8. Remove READ_MEDIA_IMAGES/VIDEO (Photo and Video Permissions policy). "Add your photos from that night" uses the system photo picker instead. (release P0-3)
9. Report and Block for crew chat, photos and private messages, terms shown on the first post, and a moderation inbox (User Generated Content policy). (release P0-4)
10. Remove the AD_ID permission that the Facebook SDK adds. (release P0-6)

**Security**
11. Any app can send an invite that joins a crew, turns on live sharing without asking, and moves all relay traffic to a stranger's server. Fix: confirm first; never go live from an intent; in release, accept only the app's own relay. (release P0-5)

**Server**
12. The relay forgets messages it has already accepted. It holds everything in memory, Fly stops the machine when idle (losing it all), the first Fly deploy splits mailboxes across two machines, and 12 MB uploads sit whole in a ~100 MB heap. Fix: one always-on machine, storage on a volume, streamed files. (reliability P0-3, release P1-10, P1-12)

## Before launch

**Performance**
- The venue map rebuilds every pin about 20 times a second.
- The finder recomposes and rebuilds its drawing every frame.
- Photo decode, clip decryption and full-size Story images run on the main thread.
- The Story decodes a whole gig at once (about 300 MB for 200 photos).
- ~~Every chat poll re-downloads up to 200 messages: add a cursor.~~ Done: chat polls ask only for what's new (wave 2c part 3, [WAVE2C_ENDPOINTS.md](WAVE2C_ENDPOINTS.md)).
- ~~Crew clips download over mobile data in the background.~~ Done: clips wait for Wi-Fi or the Story (wave 2c part 3).
- GPS runs every 15 s while you stand still.

**Reliability**
- Background checks aren't set up again after a reboot and run late in Doze.
- A full phone makes the app crash over and over: guard file writes and add error handlers.
- Dark mode at night, a language change or split screen closes the finder: declare configChanges.
- The radar can crash on a small screen with large text.

**Release**
- MapLibre 11.8 or later for 16 KB pages (Play deadline 1 Feb 2027).
- ~~Fail release builds that have no server set~~ **Dropped (owner's decision, 15 November):** free users run on a
  different, limited relay and the production relay is a Moshpoint+ feature (ROADMAP.md, Moshpoint+). The
  free/premium routing comes with billing.
- Gig search is broken in release builds (GigSearch.viaServer).
- The Facebook SDK contacts Meta at every launch: start it only when someone logs in.
- Add a prominent disclosure and a privacy policy link before the location prompt.
- The watch app: a signed bundle, and no "Unlock" with nothing to buy.
- Move to 128-bit Bluetooth UUIDs before launch. After launch, changing them would split old and new versions.

**Server**
- Rate limits trust a header the client sets, yet a whole venue behind one carrier IP shares one limit.
- No byte caps.
- Blocking calls stall all traffic.

## Later
See the P2 sections of the three reports: Keystore encryption at rest, the old intro form, a log line with a name in release, file:// shares, resource shrinking and a .test suffix for test builds, clock edge cases, cleaning old files, and privacy-safe error counts.

## Found during the tidy-up (15 November)
- **Cold-start invite crash (already on the main branch before the tidy-up).**
  - **Where:** MainActivity.onCreate handles a shared invite before the finder engine exists and before GroupSync.load.
  - **What:** a tonight-crew invite then goes live, refreshSetupIssues reads the uninitialised engine, and the app crashes whenever MainActivity is created fresh. Android 10–11 always crash; Android 12+ escapes only when Bluetooth advertise permission is missing.
  - **Related:** because the join runs before GroupSync.load, it replaces the current main crew instead of moving it to Up next, and re-opening your own crew's invite wipes its members and meet-up pin.
  - **Fix:** handle the shared invite at the end of the savedInstanceState == null block (after the engine and GroupSync.load, as onNewIntent does); guard refreshSetupIssues and missingPermissions until the engine is ready; add a Robolectric start-up test. (Goes with launch blocker 11.)
- **Home redraw efficiency.** After FriendsScreen's parameters were grouped, lambdas that capture a group object are re-created on every home redraw (ui/home/FriendsScreen.kt around lines 262, 369, 409 and 434). The face tiles, friends strip, Up next rows, memory card and sheets therefore can't skip recomposition. Users won't notice. Fix: stable (data) action classes, or remembered lambdas. (Performance list.)
- **Where things moved:** see the table in CODE_STRUCTURE.md. The audits' line numbers refer to the code before the tidy-up.

## Plan

**Wave 1 (tidy-up merged 15 November; server running)**
- **Code tidy-up (app module, no behaviour change):** MainActivity split into per-area pieces, feature folders, the home's 76 inputs grouped. Proof: screenshots pixel-identical in every language, and the manifest and licences unchanged.
- **Server hardening (server/ and deployment files only):** item 12 and the server parts of "Before launch", plus batch and cursor endpoints for wave 2. Backward compatible, so test builds keep working.

**Wave 2 (after the tidy-up merges, split so no two sessions edit the same files)**
- **2a Safety and Live:** items 1–3, background checks, configChanges, storage-full guards, the radar crash. (Need help and check-ins, items 1 and 2, were removed on 16 November 2026: [REMOVE_SAFETY.md](REMOVE_SAFETY.md).)
- **2b Play and security:**
  - items 6, 8, 10 and 11;
  - the disclosure and privacy link, the Facebook SDK starting at login;
  - the gig search fix (failing release builds with no server was dropped: see above);
  - MapLibre, the watch bundle, 128-bit UUIDs;
  - fixing PLAY_STORE.md's Data safety draft.
- **2c Battery and performance:** items 4 and 5 and the performance list (uses wave 1's batch and cursor endpoints).
- **2d Report and Block (item 9):** app and server.
- **2e Moshpoint+ and billing:** Play Billing into `Entitlements`; free users on a separate limited relay,
  members on the production relay (ROADMAP.md, Moshpoint+).

Then a test build, the field tests in FIELD_TEST_PLAN.md, and the bug-fixing phase.

## Owner to-do
- **Signing (needed for any Play upload):** create an upload key and add MOSHPOINT_KEYSTORE, MOSHPOINT_KEYSTORE_PASSWORD, MOSHPOINT_KEY_ALIAS and MOSHPOINT_KEY_PASSWORD as GitHub secrets. Never commit the keystore.
- **Developer account:**
  - a company account needs a D-U-N-S number;
  - a personal account created after November 2023 needs a 14-day closed test with at least 12 testers before production.
- **Privacy policy:**
  - host it at a stable URL;
  - fill in the email and legal entity;
  - correct "images aren't stored or sent";
  - cover the microphone, photos, hosting regions, Meta and the gig APIs;
  - say 18+;
  - say moments stay on the relay for 24 h (the app says "a few hours").
- **Play Console:**
  - Data safety (draft in audit/release.md);
  - Advertising ID: No;
  - the foreground-service declaration, with a short video per service;
  - the age rating (users interact, share location and post content);
  - audience 18+;
  - category Events.
- **Meta:** switch the app to Live mode and add the key hashes for both signing keys.
- **Third-party terms:** check Ticketmaster, Bandsintown, Nominatim and OpenFreeMap at launch scale.
- **Fly.io:** deploy the hardened relay once wave 1 lands (steps will come with it), and set billing alerts.
