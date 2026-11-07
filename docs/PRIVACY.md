# Moshpoint privacy policy

_Draft for review before Play Store release. Last updated: 7 November 2026. Contact: [EMAIL]._

Moshpoint helps you find your friends at gigs and other crowded places. It was built so
that it can do this **without knowing who you are or where you are**. This page explains
exactly what happens to your information.

## The short version

- No account, no phone number, no email, no contacts upload.
- You're only findable while **you** switch on "Go live". You can switch it off at any time,
  from the app, the notification or the Quick Settings tile.
- Your location never leaves your phone in a form anyone else can read except the friends
  you've added.
- We don't sell, share or use your data for advertising. There are no ads, trackers or
  analytics in the app.

## What's on your phone

Stored only in the app's private storage on your device, never backed up to the cloud:

- your display name, your optional photo, and photos of friends (the ones they shared, or ones you picked for them),
- your friends list and tonight's gig group (gig groups expire after 18 hours),
- a random secret key that lets your friends recognise your phone.

Deleting the app deletes all of it.

## What goes over the air (Bluetooth, Wi-Fi Aware, UWB)

While you're live, your phone broadcasts a **random code that changes every 5 minutes**.
Only friends who hold your secret key can tell the code is you; to everyone else it's
meaningless and can't be linked from one 5-minute window to the next. No name, phone number
or device identifier is broadcast.

Phones that are looking for friends broadcast the same kind of rotating code, so that
friends' phones can speed up and set up precise UWB ranging.

**Crowd relay:** when there's no mobile data, your phone may pass on other Moshpoint users'
sealed locations over Bluetooth, and theirs may pass on yours. These are encrypted so that
only that person's friends can open them. A phone that relays one can't read it and can't
tell whose it is.

## What goes to our server (only if GPS sharing is enabled)

When you're live and have mobile data, your phone uploads your GPS position, **encrypted on
your phone** with a key only your friends have, filed under your current rotating code.
Friends' phones fetch and decrypt it. The server:

- only ever sees rotating codes and encrypted bytes,
- can't read locations and can't tell who anyone is,
- deletes everything after 15 minutes,
- doesn't log request contents, codes or IP addresses (it keeps short-lived per-connection
  rate-limit counters in memory to stop abuse).

Gig-group introductions (your finding key and name, encrypted with the group's key) may
also be posted there briefly so group members can find each other.

**Your photo (optional):** if you set one, it's encrypted on your phone with a key only your
friends have and stored under an id that changes weekly, for up to 8 days, so friends'
phones can show your face. The server can't see it. Removing your photo shares an empty one,
so friends' copies are cleared the next time they refresh.

## Continue with Facebook (optional)

If you choose "Continue with Facebook", Facebook tells the app your name and profile
photo (nothing else: no friends list, email or posts). Your first name fills in your
Moshpoint name and the photo becomes your Moshpoint photo, shared with your friends as
described above. Facebook's analytics and advertising features in the login library are
switched off. You can stop using it any time; it doesn't post anything on your behalf.

## Deleting your data

Delete the app: everything on your phone is gone. Anything on our server (encrypted
locations, intros and photos) expires on its own within 8 days. If you used Facebook
login you can also remove Moshpoint at facebook.com → Settings → Apps and websites.

## Permissions and why

| Permission | Why |
|---|---|
| Nearby devices (Bluetooth, Wi-Fi) | Find friends and be found nearby; precise distance. |
| Location | GPS arrow when you're far apart; Android requires it for Bluetooth/Wi-Fi distance on some versions. Used only while finding or while you're live. |
| UWB | The precise arrow on phones that support it. |
| Notifications | Shows when you're live, so it's never on without you knowing. |
| Camera | Scanning a friend's or group's QR code. Images aren't stored or sent. |
| Run in background / start at boot | Keep you findable with the app closed, only while you're live (and after a restart only if you chose "always on"). |

## Children

Moshpoint isn't directed at children under 13.

## Changes

We'll update this page if anything here changes, and note the date at the top.
