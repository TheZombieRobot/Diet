# Release checklist: Moshpoint's first Play Store release

Your launch steps, in order, written for a phone. Each says where to tap and what to paste.
Everything on the code side is done (docs/LAUNCH_PREP.md); what's left needs your accounts.

**The first release (your scope, 19 November 2026):** the phone app only (the watch comes later);
everything free (no payments yet, so everyone has Moshpoint+); keyed services off (Discover stays
refused); no Facebook login.

**Never paste a real value into this file, or any file in the repo.** The repo is public and
every save on GitHub is published at once. Values below are placeholders (`INSERT…HERE`): the
real ones go only into GitHub's or Fly's own secret boxes, or Play Console.

**On a phone:** use github.com, fly.io and play.google.com/console in the browser (Chrome or
Safari), not the apps. If a GitHub page looks cut down (no Settings tab, no Run workflow button),
tap the browser's ⋮ menu → **Desktop site**.

**What you need:** a Google account; a card (Play: US$25 once; Fly.io: about US$10 a month); a
password manager; 12 or more testers with Android phones (friends, the crew); about 15 minutes on
any computer once, for the upload key (or the Termux app on your phone). Allow at least three
weeks: the closed test runs 14 days, then Google reviews.

Steps 0, 1, 3 and 4 can be done on the same day; start recruiting testers on day one.

---

## 0. One GitHub setting (once)

GitHub shows a workflow's **Run workflow** button only for workflows on the repository's
**default branch**, and today that's an old branch with none. Make the app's branch the default:
github.com/TheZombieRobot/Diet → **Settings** → **General** → **Default branch** → the ⇄ button →
pick `ccr-5839ed7c-1q0ztj` → **Update** → confirm. Then **Actions** lists **Android build** and
**Deploy server**, each with a **Run workflow** button. (Your call: nothing else depends on the
old default branch. docs/LAUNCH_PREP.md, open question 1.)

## 1. Play Console developer account

1. Open **play.google.com/console** → **Sign up** (or **Get started**).
2. Account type: **Yourself** (a personal account). An organization account needs a D-U-N-S
   number first.
3. Pay the **US$25** registration fee, then verify your identity (a photo of your ID), your email
   and your phone number, as it asks. This can take a few days.
4. Install the **Google Play Console** app on your Android phone and sign in with the same
   account (Google asks developers to prove they have an Android device).
5. **Personal accounts must run a closed test before going public:** at least **12 testers**,
   opted in for **14 days in a row** (step 9). Line up 15 or so testers now (some drop out):
   you need their Gmail addresses.

## 2. Create the app

Play Console → **Home** → **Create app**:

| Field | Answer |
|---|---|
| App name | `Moshpoint` |
| Default language | English (United Kingdom), or the English you prefer |
| App or game | App |
| Free or paid | Free (Moshpoint+ can still be sold in the app later) |
| Declarations | Tick both (Developer Program Policies, US export laws) |

Tap **Create app**.

## 3. The upload key and the four GitHub secrets

Every bundle you upload is signed with your **upload key**; Google then signs the app people
install with its own key (Play App Signing). Make the upload key once and keep it safe: you
need it for every update.

1. **Make it** (needs Java's `keytool`, so a computer, or Termux on the phone:
   F-Droid → Termux → `pkg install openjdk-17`):

   ```sh
   keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias INSERTKEYALIASHERE
   ```

   For INSERTKEYALIASHERE type a short name for the key (`upload` is usual); you'll paste it
   again in step 4. It asks for a password: make a long one in your password manager, and give
   the **same** password if it asks for the key's too. It asks for your name and so on: anything
   sensible.
2. **Turn it into text:** `base64 -w0 upload.jks` prints one long line.
3. **Keep two copies** of `upload.jks` and the password (the password manager, plus one more
   place). Never commit it, email it or paste it in a chat.
4. **Add four repository secrets:** github.com/TheZombieRobot/Diet → **Settings** → **Secrets
   and variables** → **Actions** → **Secrets** tab → **New repository secret**, once for each:

   | Name | Paste |
   |---|---|
   | `MOSHPOINT_KEYSTORE` | INSERTKEYSTOREBASE64HERE (the long line from step 2) |
   | `MOSHPOINT_KEYSTORE_PASSWORD` | INSERTKEYSTOREPASSWORDHERE |
   | `MOSHPOINT_KEY_ALIAS` | INSERTKEYALIASHERE (the alias you used in step 1) |
   | `MOSHPOINT_KEY_PASSWORD` | INSERTKEYPASSWORDHERE (the same password) |

5. **Check:** **Actions** → **Android build** → **Run workflow** → branch
   `ccr-5839ed7c-1q0ztj` → **Run workflow** (leave "publish" ticked to also update the testing
   page, or untick it). In the run (about 20 minutes): **Upload key works** has a green tick,
   then **Signed Play Store bundle**, and the run's **Artifacts** list `moshpoint-release-aab`.
   If a secret is missing or wrong, **Upload key works** goes red and says which one (never its
   value): fix it under Secrets (the pencil), then run it again. Every later build on that branch
   makes the signed bundle too.

## 4. The relay on Fly.io (the Deploy server workflow)

The app's server. Full steps: docs/SERVER_PRODUCTION.md, **Deploy from your phone**. In short:

1. Sign up at **fly.io**, add a card (dashboard → **Billing**), and set billing alerts there
   (e.g. US$25 and US$50 a month).
2. Fly dashboard → your organization (**Personal**) → **Tokens** → create an **organization**
   token, `GitHub deploy` → copy all of it (it starts with `FlyV1` and a space).
3. GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

   | Name | Paste |
   |---|---|
   | `FLY_API_TOKEN` | INSERTFLYAPITOKENHERE (the whole token) |
   | `MOSHPOINT_TOKEN_SECRET` | INSERTTOKENSECRETHERE (a random string, 64 letters and digits, from your password manager) |
   | `MOSHPOINT_ADMIN_TOKEN` | INSERTADMINTOKENHERE (another one; keep it: it reads reports, docs/MODERATION.md) |
   | `MOSHPOINT_CONTACT` | INSERTCONTACTEMAILHERE (your support email: it's shown on the privacy page) |

   Leave `TICKETMASTER_KEY`, `SEATGEEK_CLIENT_ID` and `BANDSINTOWN_APP_ID` out: keyed services
   stay off in the first release.
4. **Variables** tab → **New repository variable**: `MOSHPOINT_APP_CERTS` = the public debug key's
   fingerprint, copied from docs/SERVER_PRODUCTION.md (step 5 below adds Play's later).
5. **Actions** → **Deploy server** → **Run workflow** → branch **ccr-5839ed7c-1q0ztj** → **Run
   workflow**. About 5 minutes. Green tick: the relay is up and checked. Its **Summary** shows
   the relay's address and the privacy policy's.
   - No Deploy server in the list, or no Run workflow button? Step 0.
   - Red? Open the red step: it says what to fix (SERVER_PRODUCTION.md has a table).

## 5. MOSHPOINT_SERVER and MOSHPOINT_APP_CERTS

Both are **variables** (not secrets): GitHub → **Settings** → **Secrets and variables** →
**Actions** → **Variables** tab.

1. **`MOSHPOINT_SERVER`** → **New repository variable** → the address from the Deploy server
   summary (`https://moshpoint-relay.fly.dev`, unless you set `FLY_APP`). From the next build,
   the app uses your relay: GPS sharing, photos, chat, the privacy link and texted spot links.
2. **`MOSHPOINT_APP_CERTS`**, after your first upload to Play (step 9): Play Console → **Test and
   release** → **App integrity** → **App signing** → **App signing key certificate** → copy the
   **SHA-256 certificate fingerprint**. Edit the variable (the pencil) to Play's fingerprint, a
   comma, then the debug one that's there: `INSERTPLAYSHA256HERE,<the debug fingerprint>`.
   Run **Deploy server** again. Until then, store builds open texted spots in the browser
   instead of the app.

## 6. The privacy policy URL

Your relay serves the policy (docs/PRIVACY.md, kept up to date with the app):
**`https://moshpoint-relay.fly.dev/privacy`** (the Deploy server summary shows yours).

1. Open it on your phone: the contact near the top must be your email, not
   INSERTCONTACTEMAILHERE (if it is, `MOSHPOINT_CONTACT` is missing: step 4).
2. Play Console → **Policy and programs** → **App content** → **Privacy policy** → paste the
   address → **Save**.

Builds with your relay link to the same page from the welcome, the location disclosure and
Settings. (Prefer GitHub Pages? docs/PLAY_STORE.md, privacy item.)

## 7. App content (Play Console → Policy and programs → App content)

Each item has a **Start** or **Manage** button. Answers:

| Item | Answer |
|---|---|
| Privacy policy | Step 6 |
| App access | **All functionality is available without special access** |
| Ads | **No**, my app does not contain ads |
| Content rating | The questionnaire below |
| Target audience and content | Ages **18 and over** only; the app isn't designed to appeal to children |
| News apps | No |
| Data safety | The answers in docs/PLAY_STORE.md, **Data safety form**, row by row |
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health apps | No |
| Advertising ID | **No**, the app doesn't use an advertising ID |
| Foreground service permissions | Below: two types, one short video each |
| Photo and video permissions | Not used (the app uses Android's photo picker) |

**Content rating:** **Start questionnaire** → your email → category **Social or communication**
(or the nearest the form offers) → answer as in docs/PLAY_STORE.md (**Content rating
questionnaire**): violence, fear, sexual content, crude humour, gambling: No; controlled
substances: **references** only (a ready-made status "Bar time 🍺"); users interact and share
content: **Yes**; shares location with other users: **Yes**; digital purchases: No; unrestricted
internet: No → **Save** → **Submit**.

**Foreground service permissions:** Moshpoint declares two types, `connectedDevice` and
`location`, for "Go live" (and, later, finding for the watch). For each type the form asks what
the task is, what happens if it's stopped, and a link to a short video (YouTube **Unlisted** or a
Google Drive link anyone can view). Record on your phone with Android's screen recorder (Quick
Settings → **Screen record**), with a friend's phone nearby, both in one crew. Play wants these
before the first upload (step 9), so use the test build from the testing page on both phones.

- **connectedDevice** (finding nearby friends over Bluetooth, UWB and Wi-Fi Aware). Record:
  open Moshpoint → **Go live** → show the notification ("You're live…" with **Stop**) → lock the
  phone → on your friend's phone, find you: the arrow and the distance update while your screen
  is off → unlock and tap **Stop** in the notification. 30–60 seconds.
  Paste in "task": the paragraph for `VisibilityService` in docs/PLAY_STORE.md (Foreground
  service permissions).
- **location** (sharing GPS with your crew when you're far apart). Record: **Go live** →
  lock the phone → walk 100 m or more (or use a friend across town) → your friend's map and
  finder show your position moving while your phone is in your pocket → tap **Stop** in the
  notification. 30–60 seconds. Same paragraph, plus the one for `WatchFinderService` if the form
  asks about every service.

## 8. The store listing (Play Console → Grow users → Store presence → Main store listing)

| Field | What to put |
|---|---|
| App name | `Moshpoint` |
| Short description (80 characters max) | `Find your mates at gigs. Tap a mate, follow the glowing arrow.` |
| Full description | The text below |
| App icon | `docs/store/play/icon-512.png` (512 × 512) |
| Feature graphic | `docs/store/play/feature-1024x500.png` (**1024 × 500** px, no transparency) |
| Phone screenshots | `docs/store/play/screenshot-1.png` to `screenshot-8.png`, in that order |
| Category (Store settings) | **Events** |
| Contact email (Store settings) | INSERTCONTACTEMAILHERE |

**Full description:**

> Lost your crew in the crowd? Open Moshpoint, tap a mate, and a glowing arrow points straight
> to them, with the distance counting down as you close in.
>
> • Up close or far away: UWB, Wi-Fi Aware, Bluetooth and GPS, picked for you.
> • No signal at the venue? Locations and crew messages hop phone to phone through your crew and
>   the crowd.
> • One QR for the whole night: start a crew, everyone scans it, everyone can find everyone.
> • Crew chat, quick pings ("On my way", "Meet at the pin") and private messages, with or without
>   signal.
> • Drop a meet-up pin, or pin "I'm here" on your exact spot.
> • The venue's street map is saved on your phone before the gig, so it works with no signal.
> • Share photos and clips with your crew, and keep the night's Story on your phone.
> • Text my spot: when data is down, send your spot as an ordinary text.
> • Private by design: no account, codes that change every few minutes, and locations and
>   messages encrypted end to end. You're only findable while you go live.
>
> Moshpoint is for people aged 18 and over.

**The images** are ready to upload in `docs/store/play/` (made by `tools/store_images.py` from
docs/store and docs/screenshots: Play takes screenshots no taller than twice their width and with
no transparency, which the test screenshots aren't). The eight screenshots, with made-up names
only: the welcome; finding Sam up close (the arrow); the crew on the home screen; finding Sam
140 m away (GPS); private messages at the gig with no signal; a gig planned ahead with its crew
("Ivory Tide"); a gig's card with its venue map saved for offline; the crews coming up. On the
phone: open each file on github.com → **Download** (or long-press the image → Download), then
pick it in Play Console. Real screenshots from the field test are even better later (crop them
to at most twice as tall as wide).

## 9. The closed test: 14 days, at least 12 testers

1. **Get the bundle:** GitHub → **Actions** → the latest green **Android build** on
   `ccr-5839ed7c-1q0ztj` made after steps 3 and 5 → **Artifacts** → `moshpoint-release-aab`
   (a .zip) → open it in **Files** → **Extract** → `app-release.aab`.
2. Play Console → **Test and release** → **Testing** → **Closed testing** → **Create track** (or
   use the **Alpha** track) → **Testers** tab → **Create email list** → paste your testers' Gmail
   addresses → **Save**. Add a feedback email.
3. **Releases** → **Create new release** → if asked about app signing, choose **Use
   Google-generated key** → **Upload** → `app-release.aab` → release notes ("First test") →
   **Next** → **Save** → **Send for review** / **Start rollout to Closed testing**.
4. **Testers** tab → **Copy link** → send it to your testers: they open it on their phone, tap
   **Become a tester**, then install Moshpoint from Play.
5. Keep **at least 12 testers opted in for 14 days in a row**. Updates during the test are fine,
   and Google asks what you changed. Ask testers to open the app over the 14 days.
6. Now do step 5's `MOSHPOINT_APP_CERTS` (Play's fingerprint exists once the first bundle is
   uploaded), then **Deploy server**.

## 10. Apply for production (day 15 or later)

Play Console → **Dashboard** → **Apply for production** (it appears once the test has run 14
days with 12 testers) → answer the questions about the test (who tested, how you found them,
what you fixed) → **Submit**. Google replies in about a week.

## 11. Production, with a staged rollout

1. **Test and release** → **Production** → **Countries / regions** → **Add countries / regions**
   (start with where you are, e.g. New Zealand and Australia).
2. **Create new release** → **Add from library** (the bundle from the closed test, or a newer
   one) → release notes → **Next**.
3. **Rollout percentage: 10%** → **Start rollout to Production**. Google reviews it (hours to a
   few days).
4. Watch **Monitor and improve** → **Android vitals** (crashes, ANRs) and the reviews for two or
   three days. Then **Production** → **Manage rollout** → **Update rollout** → **50%**, and a few
   days later **100%**.
5. Something wrong? **Halt rollout**, fix it, and roll out a new version the same way.

---

## After the first release (not needed for it)

- **Satellite data:** ask Spark and One NZ to list Moshpoint (`nz.waveformlabs.moshpoint`)
  (docs/PRODUCTION_AUDIT.md, Owner to-do).
- **Facebook login:** only if you want it (docs/FACEBOOK.md); builds without a Meta app don't
  include it at all.
- **The watch app:** docs/WATCH.md and the watch items in docs/PLAY_STORE.md.
- **Moshpoint+ with billing:** when it's built, `Membership.BILLING` and this checklist change.
