# Release, security, privacy and Play audit (ccr 792cd68 and the published build 289, 15 Nov 2026), condensed from the auditor's report

"Visible" = would the owner notice the change.

## P0
1. Target API too low: app 35 (app/build.gradle.kts:18), watch 34 (wear/build.gradle.kts:20). Play's Target API level requirements have required 36 (Wear OS 35) for new apps and updates since 31 Aug 2026, and extensions ended 1 Nov. Fix: 36/35 with AGP ≥ 8.9; retest tablets, where Android 16 ignores the portrait lock. [M · tablets]
2. No signed release bundle. Build 289 is signed with the public debug key committed to the repo (app/debug.keystore, SHA-256 89:B4:37…); the auditor concluded MOSHPOINT_KEYSTORE isn't set, so the signed bundle step (android.yml:156–168) never runs. Nothing to upload to Play, and anyone can sign a fake "update" over testers' installs. Fix: upload key, the four secrets, Play App Signing. [S · testers reinstall once] — CHECK whether the secrets exist (the test page always ships the debug APK).
3. Photo permissions break Play's Photo and Video Permissions policy. READ_MEDIA_IMAGES/VIDEO (manifest 39–42) serve one occasional feature (MainActivity.startRoll 202 → GigArchive.findOnPhone 89). Fix: remove them and use PickMultipleVisualMedia. [S–M · users pick photos instead of the app finding them by date]
4. No report or block for user-generated content (UGC policy). Crew chat (CrewChatScreen, CrewChatUi 63), moments and private messages have none; there's only a mute (PrivateMessages 46). Fix: Report (sends the decrypted item and its sender to the owner), Block, terms on first post, a moderation inbox. [M · yes]
5. An invite can take over the relay and turn on live sharing. MainActivity.handleInvite (391–418) joins and goes live (416) without asking. Any app can trigger it through the exported ShareInviteActivity (12–23) or the INVITE_TEXT extra (570, 485). The invite's r= (394–398) goes to RelayClient.setServer (54–60), which saves any https host for all relay traffic, Need help included. Release builds can't undo it (the relay setting is test-only, SettingsScreen 208), and withRelay (1537) copies the host into invites you send. Fix: confirm first, as the clipboard path does (1090); never go live straight from an intent; in release, ignore r= unless it equals MOSHPOINT_SERVER. [S · one extra tap]
6. The Facebook SDK adds AD_ID. facebook-core 17.0.2 merges com.google.android.gms.permission.AD_ID (it's in the published APK); an Advertising ID declaration of "No" then blocks the release. Fix: tools:node="remove". [S · no]

## P1
7. MapLibre 11.5.2's libmaplibre.so (libs.versions.toml:17) is 4 KB-aligned; Play blocks releases with it from 1 Feb 2027. Fix: 11.8.0 or later (checked: 16 KB-aligned). [S · no]
8. Release can silently fall back to ntfy.sh: with the server CI variable blank, RelayClient.base (74) sends traffic there (78, 92), which allows ~250 messages/day per IP (fails behind a shared carrier IP) and isn't in the privacy policy. Fix: fail bundleRelease when the server is blank. [S · no]
9. Gig search is broken in release: GigSearch.viaServer (42) reads RelayClient.serverUrl, which is blank when the server is built in, so requests have no host. Fix: use shareableServer. [S · search starts working]
10. The relay can run out of memory and its limits are easy to dodge. A 256 MB VM with default heap (fly.toml:30, Dockerfile 10–14), but AvatarStore may hold 256 MB (AvatarStore 11) and 12 MB uploads sit in memory whole (Main 116). client() (Main 64–66) trusts the client's X-Forwarded-For, while real phones behind one carrier IP share one limit. Anyone can upload, so it's free file hosting billed to the owner. Fix: limits keyed on Fly-Client-IP, byte budgets, avatars on disk, streamed uploads, more memory, a per-install token, billing alerts. [M · no]
11. Slow outside calls block request handling: the gig and venue routes (Main 172–187) run GigSearch.httpGet (up to 3×8 s) and VenueLookup.find (Thread.sleep) on Ktor's request thread, stalling all traffic on one CPU. Fix: withContext(Dispatchers.IO). [S · no]
12. Relay data lost or split: everything is in memory or temporary disk; auto-stop with min_machines_running=0 (fly.toml 17–19) wipes it when idle; Fly's first deploy creates two Machines, each holding half the mailboxes; Render free (render.yaml:11) wakes slower than the app's 5–6 s timeouts. Fix: one always-on Machine, or shared storage. [S–M · finding and chat become reliable]
13. Once configured, the Facebook SDK contacts Meta at every launch: FacebookInitProvider and FacebookLogin.register (43) call sdkInitialize, which always fetches settings and creates a device ID, even with AutoInit off. The privacy policy implies only Facebook-login users are involved. Fix: remove the provider; initialise in login(). [M · no]
14. Play's User Data policy: no privacy-policy link in the app; onboarding (strings_setup 56–60) never says location is uploaded, shared and kept running with the app closed, or that the phone relays strangers' encrypted data. Prominent Disclosure needs that wording before the permission prompt. Fix: add the link and the wording. [S · new text]
15. The watch app can't ship: no watch bundle in CI, the watch release is unsigned (android.yml 457–462); Entitlements.plus is false in release (Entitlements 19) with no billing, so the watch says "Unlock the watch app on your phone" with nothing to unlock (Minimum Functionality; any paywall must use Play Billing). Fix: build a signed watch bundle; plus=true until billing exists. [S · yes]
16. The Bluetooth UUIDs 0xFFA7–FFAA (Ble 12, CrowdRelayRadio 42, GroupSync 44, Bump 25) aren't SIG-assigned, and changing them after launch would split old and new versions. Fix: register them, or move to 128-bit UUIDs before launch. [M · no]

## P2 (not visible, except that a .test suffix gives testers a second app)
- Keys and private messages are plain in prefs, and photos and location history in app storage (VisibilityPrefs.mySecret 43, Identity 42–68, PrivateMessages.save 76). They're excluded from backup; wrap them with Android Keystore later. [M]
- Intro form 1 (GigGroup.sealIntro 93, nonce 822) leaks a constant 4-byte prefix and its nonce can repeat within a second (GroupSync 217): stop sending it. [S]
- UwbResponder logs a friend's name in release (113): strip Log calls with R8. [S]
- ShareMomentActivity (16) accepts file:// and the app's own provider URIs: reject both. [S]
- Build: isShrinkResources; a .test applicationId suffix for test builds; versionCode = CI run number (resets if the workflow is renamed); a Ticketmaster key would be compiled into the APK (build.gradle.kts 47). [S]
- CI/server: signing secrets reach every branch; actions pinned by tag not SHA; the finder check only reports (android.yml 342–347); Render auto-deploys every commit (render.yaml 14); the container runs as root. [S]

## Permissions
Need a declaration: the two foreground-service types (Play's FGS form, a video for each of the 3 services). Fine as they are: everything else (no neverForLocation on Bluetooth is right, since location is derived from scans; location is foreground-only, so no Location declaration). Remove: READ_MEDIA_* and AD_ID. Unused: exact alarms and full-screen intents.

## Data safety (draft)
Collected and shared (optional, app functionality): search history (relay → Ticketmaster, Bandsintown, SeatGeek); approximate location (a 300 km box to Nominatim, the viewed map area to OpenFreeMap); whatever Meta's guidance lists if Facebook login is on. Not collected: precise location, messages, photos/videos, audio (end-to-end encrypted, which Play exempts). In transit: encrypted. Relay retention: locations 15 min, moments 24 h, chat 72 h, profile photos 8 days. Accounts: none (identity is a key on the phone), so account deletion doesn't apply. PLAY_STORE.md's draft is wrong on three points: "Shares: no", "15 min" and "no UGC".

## Owner to-do
- Developer account: a company account needs a D-U-N-S number; a personal account created after Nov 2023 needs a 14-day closed test with at least 12 testers first.
- Privacy policy: host it at a stable URL; fill in [EMAIL] and the legal entity; fix "images aren't stored or sent"; add the microphone, photos, hosting regions, Meta and the gig APIs; say 18+; align moment retention (the app says "a few hours", strings_find 198; the relay keeps 24 h).
- Play Console: Data safety; Advertising ID = No; the FGS form; the age-rating questionnaire (users interact, share location, post content); audience 18+; category Events (Social brings in the Child Safety Standards policy).
- Meta: switch the app to Live mode; add key hashes for both signing keys.
- Third parties: check the Ticketmaster, Bandsintown, Nominatim and OpenFreeMap terms at scale.
- Pre-launch report: no crash paths found; add a Robo script so the crawler gets past onboarding.

## Done well
TEST_BUILD is a compile-time constant and CI checks the release build for debug text; nothing debuggable; R8 on test builds too; no reflection serialisation, and the Facebook SDK ships its keep rules; the watch shares the phone's app ID and signing key, and its versionCode offset fits one listing; backups and device transfers excluded; cleartext only in debug; the FileProvider shares one folder; foreground services fall back cleanly on Android 14+; the crypto matches docs/PRIVATE_MESSAGES.md and the lock screen hides private messages; no Meta App Secret anywhere in history; the server keeps no accounts or logs, validates input, keeps API keys in env vars, has /healthz and forces HTTPS.
