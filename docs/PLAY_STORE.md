# Play Store release checklist

Things to do before publishing Moshpoint on Google Play. Items marked **(you)** need your
accounts or decisions; the rest can be done in the repo. **Your launch steps, in order and
phone-friendly, are in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)**; this file is the reference
behind them (every Play Console answer, and why).

## Before submitting

- [ ] **(you)** Trademark check for "Moshpoint" (IPONZ in NZ first; then AU/UK/US if launching there).
- [ ] **(you)** Google Play developer account.
- [ ] **(you)** Upload key: `keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload`,
      then add repository secrets `MOSHPOINT_KEYSTORE` (`base64 -w0 upload.jks`),
      `MOSHPOINT_KEYSTORE_PASSWORD`, `MOSHPOINT_KEY_ALIAS` (`upload`), `MOSHPOINT_KEY_PASSWORD`.
      Every CI run then also produces a signed `moshpoint-release-aab` artifact to upload to Play.
      Keep `upload.jks` and its passwords somewhere safe and never commit them. CI checks the four
      secrets before it signs anything ("Upload key works", `tools/check_upload_key.sh`: it names
      a missing or wrong one and never prints a value); until they're set, every run rehearses the
      signed bundle with a throwaway key instead.
- [ ] **(you)** Deploy the relay server (GitHub → Actions → **Deploy server**, see
      SERVER_PRODUCTION.md, "Deploy from your phone") and set `MOSHPOINT_SERVER`.
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
- [x] The privacy policy is a page: the relay serves it at `https://<relay>/privacy`, built from
      `docs/PRIVACY.md` (`tools/privacy_page.py`; CI fails if the page is out of date), with the
      contact filled in at runtime from `MOSHPOINT_CONTACT`. Builds with a relay link to it
      (`app/build.gradle.kts`); builds without one open `moshpoint.privacyUrl` (`gradle.properties`).
- [ ] **(you)** Once the relay is deployed with `MOSHPOINT_CONTACT` set, put
      `https://<relay>/privacy` in Play Console (App content → Privacy policy); the Deploy server
      run's summary shows the address. Prefer GitHub Pages? `docs/site/index.html` is the same
      page: replace `INSERTCONTACTEMAILHERE` in it with the support email, then Settings → Pages →
      Deploy from a branch → `ccr-5839ed7c-1q0ztj`, folder `/docs` → Save; the policy is then at
      `https://thezombierobot.github.io/Diet/site/` (`docs/.nojekyll` keeps the other docs as they
      are).
- [ ] Real-world test session done and tuned (see `FIELD_TEST_PLAN.md`).
- [ ] **(you)** Watch app (optional at launch): in Play Console add the **Wear OS** form factor
      and upload the `wear` build to its own track, with round watch screenshots
      (`docs/screenshots/watch/` are a start). It has the same application id and must be signed
      with the same key as the phone app, or the two can't talk. Do the wrist test first
      (`FIELD_TEST_PLAN.md`, section 4c). See `WATCH.md`.
- [ ] Before the watch app is public: confirm what Google states about how the Wear OS link
      between a phone and its watch is protected, so `PRIVACY.md` can say it in Google's words.
      Moshpoint+ is on for everyone until Play Billing exists (`Membership.BILLING` in core,
      tested; store builds ignore any saved "no"), so the
      watch never shows "Unlock" with nothing to buy. CI builds a signed watch bundle
      (`moshpoint-watch-release-aab`) whenever the signing secrets are set.

## Store listing

**Graphics, ready to upload** in `docs/store/play/` (made by `tools/store_images.py` from
`docs/store/` and `docs/screenshots/`; run it again after the screenshots change, and commit the
folder):

- App icon `icon-512.png`: 512 × 512, 32-bit PNG.
- Feature graphic `feature-1024x500.png`: **1024 × 500**, 24-bit PNG, no transparency (source
  `docs/store/feature.html`, open in Chrome).
- Phone screenshots `screenshot-1.png` to `screenshot-8.png`, in this order: 500 × 1000, 24-bit
  PNG. Play takes screenshots at most twice as tall as wide and with no transparency; the test
  screenshots are 461 × 1000 with transparency, so the script pads each at the sides with its own
  edge colour.
  1. `welcome`: the welcome
  2. `finderOneFriend`: finding Sam up close, the glowing arrow
  3. `homeMain`: the crew on the home screen, tonight
  4. `finderFarAway`: finding Sam 140 m away, by GPS
  5. `privateThread`: private messages at the gig with no signal
  6. `hypeGroup`: a gig planned ahead with the crew ("Ivory Tide")
  7. `venueCard`: a gig's card, Neon Paddock at Kauri Fields
  8. `upNext`: the crews coming up

  Made-up names only: not `crewChat` or `offlineChat` (a real band in the chat), `finderGroup`
  (a real band in its title) or `finderBigCrew` (a real festival's name), not the map (the tests
  draw a placeholder where it goes), and nothing about Moshpoint+ (free for now). Real
  screenshots from the field test are better later (at most twice as tall as wide).

**App name:** Moshpoint

**Short description (80 characters at most; this is 62):**
Find your mates at gigs. Tap a mate, follow the glowing arrow.

**Full description:**
> Lost your crew in the crowd? Open Moshpoint, tap a mate, and a glowing arrow points straight
> to them, with the distance counting down as you close in.
>
> • Up close or far away: UWB, Wi-Fi Aware, Bluetooth and GPS, picked for you.
> • No signal at the venue? Locations and crew messages hop phone to phone through your crew and
>   the crowd.
> • One QR for the whole night: start a crew, everyone scans it, everyone can find everyone.
> • Crew chat, quick pings ("On my way", "Meet at the pin") and private messages, with or
>   without signal.
> • Drop a meet-up pin, or pin "I'm here" on your exact spot.
> • The venue's street map is saved on your phone before the gig, so it works with no signal.
> • Share photos and clips with your crew, and keep the night's Story on your phone.
> • Text my spot: when data is down, send your spot as an ordinary text.
> • Private by design: no account, codes that change every few minutes, and locations and
>   messages encrypted end to end. You're only findable while you go live.
>
> Moshpoint is for people aged 18 and over.

**Category:** Events (Social would bring in the Child Safety Standards policy). **Content
rating:** from the questionnaire below; not "Everyone": crews chat, share photos and share
their location.

## Data safety form (answers)

For the first release (19 November 2026), checked against the app as it is: no account, the
relay built in (`MOSHPOINT_SERVER`), Discover refused by the relay, no Facebook login (no Meta
app configured, so none of the Facebook SDK is in the manifest), everything free. Corrected
again from wave 2b's draft: gig search no longer goes to Ticketmaster or anyone else (the app's
old gig search is gone; smart search asks only our relay, which answers from its own lists), the
install code is declared (an app-instance id our relay uses for its limits), and the Facebook
rows are out until a Meta app is configured.

What Play counts: data that leaves the phone in a form someone other than the user's own people
can read. Everything end-to-end encrypted (locations, chat, private messages, moments, profile
photos, pings, pins) is unreadable by us and by the relay, which Play's form treats as not
collected; it is still in the privacy policy.

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | **Yes** |
| Is all of the user data encrypted in transit? | **Yes** (HTTPS everywhere; locations, messages and photos are also end-to-end encrypted) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: there is no account; deleting the app deletes everything on the phone, the relay's copies expire on their own (locations, pings and pins 15 minutes, moments 24 hours, crew chat and private messages 72 hours, profile photos 8 days, reports 90 days), and anything else on request at the contact address (INSERTCONTACTEMAILHERE) |
| **Location → Approximate location** | **Collected and shared.** Collected (by our relay, processed ephemerally: never stored or logged): the region Coming up near you asks about (in New Zealand the island, elsewhere a region from the relay's list, picked on the phone; never the position). Shared: when the person types a venue, its name and a box about 300 km across go through our relay to OpenStreetMap's Nominatim; the map area being viewed goes to OpenFreeMap for map tiles. Optional. Purpose: App functionality. Not for ads or analytics |
| Location → Precise location | **Not collected or shared** (only ever sent end-to-end encrypted to the user's own crew and friends). Text my spot writes the person's position into a text in their own texting app, which they address and send themselves: a transfer the person starts and expects, not collection or sharing by the app |
| **App activity → In-app search history** | **Collected, not shared:** what's typed into the plan's smart search goes to our relay, which answers from lists it already holds (no outside service sees it) and keeps nothing (processed ephemerally). Optional. Purpose: App functionality |
| **Device or other IDs** | **Collected, not shared:** the install code, a random value our relay hands the app at first start and the app sends back with each request (nothing about the device or the person; the relay holds it in memory for its rate limits and never stores or logs it). Required (it comes with using the relay). Purpose: Fraud prevention, security, and compliance |
| **Messages → Other in-app messages; Photos and videos → Photos, Videos** | **Collected, only when a user reports one** (docs/REPORT_BLOCK.md): the reporter's phone sends the reported message's text, or the photo (smaller) or four frames of the clip (smaller), to our relay, where the owner reads it; kept 90 days. Optional (nothing goes unless someone taps Send report). Purpose: **Fraud prevention, security, and compliance**. Not shared. Everything else in these types is end-to-end encrypted and **not collected** |
| **Personal info → Name; User IDs** | **Collected, only in a report:** the reported poster's display name and their key in that crew (their identity in that crew only), so the owner can act on it. Optional. Purpose: Fraud prevention, security, and compliance. Not shared |
| Personal info → Name, photo (Facebook login) | **Not collected** in the first release: no Meta app is configured, so "Continue with Facebook" isn't there and none of the Facebook SDK starts or is in the manifest. If Facebook login is ever configured (docs/FACEBOOK.md), add Name and Photos (collected by Meta's SDK at login, see Meta's own Data safety guidance) |
| Audio | **Not collected** (a reported clip sends still frames, never its sound) |
| Contacts, calendar, app info and performance, financial, health, web browsing | **Not collected** (no analytics, crash reporting or advertising ID; the AD_ID permission is removed) |
| Contacts and SMS | **Not collected.** The app never reads the phone's contacts, sends or reads texts, or asks for SMS or call permissions. Text my spot only opens the phone's own texting app with a text written in (`ACTION_SENDTO`, no number): the person picks who and presses Send. (Need help's emergency contact, in earlier test builds, is deleted from the phone on the first start after updating) |
| Is collection required or optional? | **Optional** for everything above except the install code (required with the relay) |
| Purposes | App functionality; reports and the install code: fraud prevention, security, and compliance. Never advertising, analytics or personalisation |

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
   > Settings tile) after a disclosure, sees a persistent notification with a "Go hidden" button the
   > whole time, and it stops when they stop it.

   Video: tap Go live, show the notification, lock the phone, show a friend's phone still
   finding it, tap Go hidden in the notification.
2. `WatchFinderService`, types **connectedDevice** and **location** (finding for the watch):
   > When the user asks their paired Wear OS watch to find a friend, the phone does the finding
   > (Bluetooth, UWB and Wi-Fi Aware ranging with the friend's phone, and GPS) while it stays in
   > a pocket with the screen off, and sends the direction to the watch. It runs only while the
   > watch is asking (at most 15 minutes at a time), with a notification ("Finding Sam for your
   > watch" · Stop), and stops the moment the watch stops.

   Video: on the watch, tap a mate; show the phone's notification with its screen off; stop on
   the watch.

Play asks for one video per **type**, not per service. The first release has no watch app, so
record both with Go live (RELEASE_CHECKLIST.md, step 7, says what each shows) and give both
tasks above in the text.

The app requests no background location (`ACCESS_BACKGROUND_LOCATION`): location is used only
in these user-started foreground services, so the Location permissions declaration doesn't
apply.

**Prominent disclosure (User Data policy):** shown in the app before Android's location and
nearby-devices prompt (the welcome's Allow, and every later prompt): location shared with the
crew and friends while live, encrypted and sent through a relay server that can't read it, Live
keeps running with the app closed, and the phone relays other people's encrypted messages over
Bluetooth, with a link to the privacy policy. Screenshot: `docs/screenshots/locationDisclosure.png`.
