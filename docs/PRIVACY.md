# Moshpoint privacy policy

_Draft for review before Play Store release. Last updated: 12 November 2026. Contact: [EMAIL]._

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

## What goes to your watch (only if you install the watch app)

If you put Moshpoint on a Wear OS watch that is paired with your phone, your phone sends the
watch what its screen shows and nothing else: your crew's names and colours, small copies of
their photos, how far away each one is and, while you're finding someone, which way they are.

It travels over Wear OS's own link between your phone and your watch: Bluetooth when they're
together, and Google's Wear OS sync when they aren't. The watch never gets your crew's keys or
anyone's map position, and it never talks to our server. Nothing is sent unless a watch with
Moshpoint on it is paired with your phone. Removing the watch app removes its copy.

## What goes over the air (Bluetooth, Wi-Fi Aware, UWB)

While you're live, your phone broadcasts a **random code that changes every 5 minutes**.
Only friends who hold your secret key can tell the code is you; to everyone else it's
meaningless and can't be linked from one 5-minute window to the next. No name, phone number
or device identifier is broadcast.

Phones that are looking for friends broadcast the same kind of rotating code, so that
friends' phones can speed up and set up precise UWB ranging.

**Upstairs / downstairs:** if your phone has an air-pressure sensor, the broadcast also
carries its reading, scrambled so that only your friends can read it, so a friend's phone can
tell whether you're on the floor above or below them. Air pressure isn't a location: it can't
say where you are, only how high you are compared with a friend who was standing next to you
earlier. Phones without the sensor send nothing.

**Crowd relay:** when there's no mobile data, your phone may pass on other Moshpoint users'
sealed locations over Bluetooth, and theirs may pass on yours. These are encrypted so that
only that person's friends can open them. A phone that relays one can't read it and can't
tell whose it is.

**Messages without signal:** while you're live and there's no internet, the messages you send
your crew (chat, "On my way", "Need help", the meet-up pin) are also passed between crew
phones nearby over Bluetooth. The first crew phone that gets signal back sends them on for
everyone. These are the same encrypted, signed messages that would have gone to the relay:
only your crew can open them, and a phone can't change one or pretend to be you. Chat only
travels between your own crew's phones. Quick messages and the pin can also pass through a
few other Moshpoint phones, like the crowd relay: a phone passing one on can't read it or
tell which crew or person it belongs to. Someone listening learns that a message of a
certain size was sent at a certain time, and nothing else. Someone removed from a crew can't
read or send these once the crew has its new key, and phones stop using the old key over
Bluetooth as soon as they hear it has been replaced.

**Who can remove people:** only the person who made the crew. Anyone can leave. The crew's
key is a fingerprint of its creator's key, so an invite passed on by someone else can't name a
different creator, and a removed member can't take the crew over. When the creator leaves,
they can hand the crew to another member. (Crews made before this rule keep the old one,
where anyone in them could remove people, until they end.)

**Crew introductions:** phones in a crew also broadcast a short encrypted introduction, so
crew members' phones recognise each other. Only the crew can open it. Earlier versions left
4 bytes in it that stayed the same all night. This version has a form with nothing constant
in it, and sends only that form once everyone in the crew has updated.

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

**Your floor:** the air-pressure reading described above is uploaded the same way as your
location (encrypted on your phone for your friends only, filed under a rotating code, deleted
after 15 minutes), so friends out of Bluetooth range can see whether you're upstairs. Only
builds with our own server do this, and not while you're in ghost mode.

**Which relay:** test builds without their own server use the free public relay
[ntfy.sh](https://ntfy.sh) for this. It gets exactly the same thing: encrypted bytes filed
under a code that changes every 5 minutes. It can't read them or tell who you are, but like
any website it sees your phone's internet address when it connects. ntfy.sh keeps messages
for up to 12 hours (see its own privacy policy).

**Crew pings, meet-up pins and moments (optional):** messages you send your crew ("On my
way", "Need help"), a meet-up pin you drop, and photos you choose to share as moments
(with where you took them) are encrypted on your phone with your crew's key, so only people
who scanned your crew's QR can open them. They pass through the same relay under codes that
change daily or every 5 minutes; the public relay deletes them within hours. Nothing is
shared unless you tap to send it.

**"I'm here" (optional):** when you pin your spot with **I'm here**, the spot you chose, the
air-pressure reading there (for upstairs/downstairs) and the time go to your crew the same
way as a meet-up pin: encrypted with your crew's key and signed by you, through the relay and,
with no signal, Bluetooth. Your crew's phones show it for 20 minutes at most, or until you walk
away or take it down. People following your crew from home aren't shown it. While your pin
stands and the app is open or you're live, your phone checks your GPS, footsteps (motion
sensor) and air pressure, on the phone only, to take it down when you leave.

**Private messages (optional):** a message you send one crew mate with **Message Sam** is
encrypted on your phone so that only that person's phone can open it: not the rest of your
crew, not our server, not the public relay and not any phone that passes it on. Your name and
your signature are inside the encrypted part, so nobody but them can tell who sent it or who it
is for, and every private message is the same size. It goes through the same relay as crew chat
(in a mailbox shared by the whole crew, kept for up to 3 days, 12 hours on the public relay)
and, with no signal, through your crew's phones nearby over Bluetooth, never strangers' phones.
The relay can see that your crew sent a private message, when, and the internet address it came
from, but not who it was for. The conversation is kept on your two phones only and is deleted
when the crew ends. Muting someone happens on your phone only; they aren't told. People
following your crew from home can't send or receive private messages.

**Your gigs (on your phone only):** photos and clips your crew shares are kept on your
phone, in the app's private storage, so you can look back at the night. They never leave
your phone from there. You can delete a gig any time, uninstalling removes them all, and
"Save to phone" copies them into your own gallery only when you ask.

**Gig search (optional):** when you search for a gig, the words you type are sent to
Ticketmaster's public event search so it can list matching shows. Nothing about you or
your crew is sent with it. Typing a gig in by hand sends nothing.

**Finding a venue you typed (optional):** if you type a gig in with a venue, the venue's name
is looked up once, when you start the crew, so the crew's map knows where it is. (Joining a
crew whose venue has a name but no position does the same, once.) The name and a very rough
area (a box about 300 km across, not your position) go to our server, which asks
OpenStreetMap's search service, Nominatim. Test builds without their own server ask Nominatim
directly. Nothing about you or your crew is sent with it. Leave the venue blank and nothing
is sent.

**Maps:** the street map comes from OpenFreeMap, drawn from OpenStreetMap's data. Your phone
downloads the map for the area you look at and, when you create or join a crew, for 2 km
around the venue. That copy is kept on your phone so the map still works with no signal, and
is deleted a few days after the gig. Like any website, OpenFreeMap sees your phone's internet
address and which area of the map was asked for. Nothing about you, your friends or your
crew is sent.

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
| Nearby devices (Bluetooth, Wi-Fi) | Find friends and be found nearby; precise distance; pass crew messages on when there's no signal. |
| Location | GPS arrow when you're far apart; Android requires it for Bluetooth/Wi-Fi distance on some versions. Used only while finding or while you're live. |
| UWB | The precise arrow on phones that support it. |
| Notifications | Shows when you're live, so it's never on without you knowing. |
| Camera | Scanning a friend's or group's QR code. Images aren't stored or sent. |
| Run in background / start at boot | Keep you findable with the app closed, only while you're live (and after a restart only if you chose "always on"). |
| View network connections | Know when the phone has no signal, so messages wait (or go by Bluetooth) instead of failing. Android grants this without asking; nothing about your network is sent anywhere. |

## Children

Moshpoint isn't directed at children under 13.

## Changes

We'll update this page if anything here changes, and note the date at the top.
