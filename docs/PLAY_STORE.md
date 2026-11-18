# Play Store release checklist

Things to do before publishing Moshpoint on Google Play. Items marked **(you)** need your
accounts or decisions; the rest can be done in the repo.

## Before submitting

- [ ] **(you)** Trademark check for "Moshpoint" (IPONZ in NZ first; then AU/UK/US if launching there).
- [ ] **(you)** Google Play developer account.
- [ ] **(you)** Upload key: `keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload`,
      then add repository secrets `MOSHPOINT_KEYSTORE` (`base64 -w0 upload.jks`),
      `MOSHPOINT_KEYSTORE_PASSWORD`, `MOSHPOINT_KEY_ALIAS` (`upload`), `MOSHPOINT_KEY_PASSWORD`.
      Every CI run then also produces a signed `moshpoint-release-aab` artifact to upload to Play.
      Keep `upload.jks` and its passwords somewhere safe and never commit them.
- [ ] **(you)** Deploy the relay server (`fly deploy`, see README) and set `MOSHPOINT_SERVER`.
- [x] Bluetooth UUIDs: the three extended adverts (crowd relay and crew messages, crew intros,
      bump) use Moshpoint's own 128-bit UUIDs (wave 2b). The finder's own advert must stay a
      31-byte legacy advert, where a 128-bit UUID doesn't fit: **(you)** join the Bluetooth SIG
      (Adopter, free) and buy one 16-bit UUID (US$3,750), then replace `0xFFA7` in `Ble.kt`
      before launch. See `docs/BLUETOOTH_UUIDS.md`.
- [ ] **(you)** Optional: set up "Continue with Facebook" (see `docs/FACEBOOK.md`); declare the Facebook SDK in the Data safety form (login only; analytics off).
- [x] Target API 36 (Android 16) for the phone, 35 for the watch (wave 2b, `docs/ANDROID_16.md`).
- [x] No `READ_MEDIA_IMAGES`/`VIDEO` (the system photo picker instead), no `AD_ID`, MapLibre 16 KB
      aligned (CI fails on any 64-bit native library that isn't), the Facebook SDK starts only
      when someone taps "Continue with Facebook", invites from other apps wait for a tap, a
      location disclosure before the permission prompt, a privacy policy link in the welcome,
      the disclosure and Settings (wave 2b, `docs/WAVE2_PLAY.md`).
- [ ] **(you)** Set the `MOSHPOINT_SERVER` Actions variable to the production relay (a
      Moshpoint+ feature, owner's decision of 15 November). Without it a build uses the public
      ntfy.sh; the free tier's relay and the routing between them come with billing (wave 2e).
- [x] Launcher icon: neon arrow + radar rings (adaptive, with monochrome for themed icons). Swap for a pro logo later if wanted.
- [ ] **(you)** Host `docs/PRIVACY.md` at a stable public URL (fill in the date, contact email
      and legal entity), then set `moshpoint.privacyUrl` in `gradle.properties` to it: the app's
      links follow on the next build. Until then they open the copy on GitHub.
- [ ] Real-world test session done and tuned (see `FIELD_TEST_PLAN.md`).
- [ ] **(you)** Watch app (optional at launch): in Play Console add the **Wear OS** form factor
      and upload the `wear` build to its own track, with round watch screenshots
      (`docs/screenshots/watch/` are a start). It has the same application id and must be signed
      with the same key as the phone app, or the two can't talk. Do the wrist test first
      (`FIELD_TEST_PLAN.md`, section 4c). See `WATCH.md`.
- [ ] Before the watch app is public: confirm what Google states about how the Wear OS link
      between a phone and its watch is protected, so `PRIVACY.md` can say it in Google's words.
      Moshpoint+ is on for everyone until Play Billing exists (`Entitlements.BILLING`), so the
      watch never shows "Unlock" with nothing to buy. CI builds a signed watch bundle
      (`moshpoint-watch-release-aab`) whenever the signing secrets are set.

## Store listing (draft)

**Graphics** (in `docs/store/`): app icon `icon-512.png`, feature graphic `feature-1024x500.png`
(source `feature.html`, open in Chrome). Phone screenshots: use `docs/screenshots/` (updated by CI on every build)
or, better, real ones from the field test.

**App name:** Moshpoint

**Short description (80 chars):**
Find your mates at gigs. Tap a friend, follow the glowing arrow.

**Full description:**
> Lost your crew in the mosh pit? Open Moshpoint, tap a mate, and a glowing arrow points
> straight to them, with the distance counting down as you close in.
>
> • Works up close and far away: UWB, Wi-Fi Aware, Bluetooth and GPS, picked automatically.
> • No signal at the venue? Locations hop phone to phone through the crowd.
> • One QR for the whole night: start a gig group, everyone scans, everyone can find everyone.
> • Spin to scan: no UWB? Turn on the spot and Moshpoint works out which way they are.
> • Private by design: no account, rotating codes, end-to-end encrypted locations. You're only
>   findable while you go live.

**Category:** Events (Social would bring in the Child Safety Standards policy). **Content
rating:** from the questionnaire below; not "Everyone": crews chat, share photos and share
their location.

## Data safety form (answers)

Corrected in wave 2b (audit/release.md). The old draft was wrong on three points: it said the
app **shares nothing** (it shares search words and a rough area with outside services, and
Meta gets login data), that everything on the server is **deleted after 15 minutes** (only
locations are; moments stay 24 hours, crew chat 3 days, profile photos 8 days), and that there
is **no user-generated content** (crew chat, moments and private messages are).

What Play counts: data that leaves the phone in a form someone other than the user's own people
can read. Everything end-to-end encrypted (locations, chat, private messages, moments, profile
photos, pings, pins) is unreadable by us and by the relay, which Play's form treats as not
collected; it still goes in the privacy policy.

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | **Yes** |
| Is all of the user data encrypted in transit? | **Yes** (HTTPS everywhere; locations, messages and photos are also end-to-end encrypted) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: there is no account; deleting the app deletes everything on the phone, and the relay's copies expire on their own (locations 15 min, moments 24 h, crew chat 3 days, profile photos 8 days). Facebook login can be removed at facebook.com |
| **Location → Approximate location** | **Shared** (not collected): when the person types a venue, its name and a box about 300 km across go to OpenStreetMap's Nominatim (through our relay, or directly from a build without it); the map area being viewed goes to OpenFreeMap for map tiles. Optional, App functionality. Not used for ads or analytics |
| Location → Precise location | **Not collected or shared** (only ever sent end-to-end encrypted to the user's own crew and friends) |
| **App activity → Other actions / In-app search history** | **Shared**: the words typed into gig search go (through our relay) to Ticketmaster, Bandsintown and SeatGeek, or straight to Ticketmaster from a build without our relay. Optional, App functionality. Nothing about the person goes with them |
| **Personal info → Name; Photos → profile photo** (only if "Continue with Facebook" is used) | **Collected** by Meta's SDK when the person chooses Facebook login: Meta receives what its login needs (see Meta's own Data safety guidance for the Facebook Login SDK), and the app receives the name and profile photo, which stay on the phone or go end-to-end encrypted to friends. Optional, App functionality |
| **Messages → Other in-app messages; Photos and videos → Photos, Videos** | **Collected, only when a user reports one** (docs/REPORT_BLOCK.md): the reporter's phone sends the reported message's text, or the photo (smaller) or four frames of the clip (smaller), with the poster's name and crew key, to our relay, where the owner reads it; kept 90 days. Optional (nothing goes unless someone taps Send report). Purpose: **Fraud prevention, security, and compliance**. Not shared. Everything else in these types is end-to-end encrypted and **not collected** |
| Audio | **Not collected** (a reported clip sends still frames, never its sound) |
| Contacts, calendar, app info and performance, device or other IDs, financial, health | **Not collected** (no analytics, crash reporting or advertising ID; the Facebook SDK's analytics and ad ID are off and the AD_ID permission is removed) |
| Contacts and SMS | **Not collected, no SMS to contacts any more.** Need help used to keep one emergency contact on the phone and open a text to it; it was removed on 16 November 2026, and the app deletes a stored contact on the first start after updating. The app never reads the phone's contacts, sends or reads texts, or asks for SMS or call permissions |
| Is collection required or optional? | **Optional** for everything above |
| Purposes | App functionality; reports only: fraud prevention, security, and compliance (moderation). Never advertising, analytics or personalisation |

## User Generated Content policy (answers)

Crew chat, private messages and photos and clips (moments) are user-generated content shared
between people. What Play's UGC policy asks for, and where it is (docs/REPORT_BLOCK.md):

| Play asks for | Moshpoint |
|---|---|
| Terms or user policies people accept before creating or uploading content | **Community rules**, shown once before the first crew chat message, plan, photo, clip or private message, with "I agree" (no harassment, bullying or hate; nothing illegal and nothing sexual involving anyone under 18; no threats or violence; reports may be reviewed; breaking the rules can get you blocked), and the privacy policy link. Screenshot: `communityRules.png` |
| Defining objectionable content in those terms | The same rules, in all 20 languages |
| An in-app way to report objectionable content and users | **Report** on any crew chat message or private message (hold it), any photo or clip ("Report or block"), and any crew mate (their options): a reason, an optional note, and a plain list of what is sent. Screenshot: `reportSheet.png` |
| An in-app way to block users | **Block** in the same places; Settings → Blocked people, with Unblock. Blocked people's chat, photos, clips and private messages are hidden, and their private messages dropped on arrival. Screenshots: `blockConfirm.png`, `blockedPeople.png` |
| Acting on reports in a timely way | The owner's inbox on each relay (`GET /v1/admin/reports` with an admin token), reply times and actions in docs/MODERATION.md (24 h for the most serious, 48 h for threats, hate and sexual content) |
| Child safety (CSAM) | Reports of it are handled first and passed to the authorities (docs/MODERATION.md). The app is 18+ |
| Not a "UGC-focused" app | Sharing is among a crew that invited each other, never public; there is no public feed, search or discovery of strangers' content |

**Content rating questionnaire:** "Do users interact or exchange content?" stays **Yes**; the
questionnaire's follow-ups about moderation: users can **report** and **block** in the app; the
developer **reviews reports**.

## Play Console answers (draft for the owner)

**App access:** "All functionality is available without special access." No account or login.
For reviewers and the pre-launch crawler: "On the welcome, tap Skip, then Skip for now; deny
or allow permissions as you like." (A Robo script that taps through the welcome helps the
pre-launch report: owner to-do.)

**Ads:** No, the app contains no ads.

**Advertising ID:** No, the app does not use an advertising ID (the Facebook SDK's `AD_ID`
permission is removed from the manifest; checked in CI's merged-manifest report).

**Target audience and content:** ages **18 and over** only. The app is not designed for
children and doesn't appeal to them (live music nights, location sharing with friends).

**Content rating questionnaire (IARC)**, category "Social or communication":

| Question | Answer |
|---|---|
| Violence, fear, sexual content, crude humour, gambling | No |
| Controlled substances: does the app reference alcohol, tobacco or drugs? | **Yes, references**: a ready-made status "Bar time 🍺" (and its translations). No depiction or encouragement of use |
| Language: offensive language in the app's own text | No |
| Do users interact or exchange content with each other? | **Yes**: crew chat, private messages, photos and clips (moments) |
| Does the app share the user's current physical location with other users? | **Yes**: with their own crew and friends, while they're live |
| Can users purchase digital goods? | No (no billing yet) |
| Unrestricted internet access (web browser, search engine)? | No (links open the phone's own browser) |

**News app:** No. **COVID-19 contact tracing:** No. **Government app:** No. **Financial
features:** None. **Health:** No health or fitness features.

**Foreground service permissions.** The form asks, per foreground service type, what the task
is, why it can't wait, and for a short video of it. The app has two services with types:

1. `VisibilityService`, types **connectedDevice** and **location** ("Go live"):
   > While the user has chosen to be live (findable by their own crew and friends), Moshpoint
   > keeps a Bluetooth advert with a rotating code on air, answers friends' UWB and Wi-Fi Aware
   > ranging (connectedDevice), and shares the phone's GPS position with those friends,
   > end-to-end encrypted (location). This must continue with the app closed and the screen off:
   > at a gig the phone is in a pocket, and a friend trying to find the user in a crowd needs the
   > signal now, not when the app is next opened. The user starts it with "Go live" (or the Quick
   > Settings tile) after a disclosure, sees a persistent notification with a Stop button the
   > whole time, and it stops when they stop it.

   Video: tap Go live, show the notification, lock the phone, show a friend's phone still
   finding it, tap Stop in the notification.
2. `WatchFinderService`, types **connectedDevice** and **location** (finding for the watch):
   > When the user asks their paired Wear OS watch to find a friend, the phone does the finding
   > (Bluetooth, UWB and Wi-Fi Aware ranging with the friend's phone, and GPS) while it stays in
   > a pocket with the screen off, and sends the direction to the watch. It runs only while the
   > watch is asking (at most 15 minutes at a time), with a notification ("Finding Sam for your
   > watch" · Stop), and stops the moment the watch stops.

   Video: on the watch, tap a mate; show the phone's notification with its screen off; stop on
   the watch.

The app requests no background location (`ACCESS_BACKGROUND_LOCATION`): location is used only
in these user-started foreground services, so the Location permissions declaration doesn't
apply.

**Prominent disclosure (User Data policy):** shown in the app before Android's location and
nearby-devices prompt (the welcome's Allow, and every later prompt): location shared with the
crew and friends while live, encrypted and sent through a relay server that can't read it, Live
keeps running with the app closed, and the phone relays other people's encrypted messages over
Bluetooth, with a link to the privacy policy. Screenshot: `docs/screenshots/locationDisclosure.png`.
