# Moshpoint privacy policy

_Draft for review before Play Store release. Last updated: 18 November 2026. Contact: [EMAIL].
Moshpoint is provided by [LEGAL ENTITY]._

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
  analytics in the app, and it doesn't use your phone's advertising ID.
- Moshpoint is for people aged 18 and over.

## What's on your phone

Stored only in the app's private storage on your device, never backed up to the cloud:

- your display name, your optional photo, and photos of friends (the ones they shared, or ones you picked for them),
- your friends list and tonight's gig group (gig groups expire after 18 hours),
- a random secret key that lets your friends recognise your phone.

Deleting the app deletes all of it.

Earlier test versions had a "Need help" button that could text an emergency contact, and kept
that contact's name and phone number on your phone for it. That feature has been removed: the
app deletes a contact saved that way the first time it opens after updating, and never sends a
text itself.

Text my spot (Moshpoint+, only if you switch it on in Settings) opens your own texting app with
your location already written in: a map link and the coordinates. You choose who gets it and
press Send yourself. Moshpoint doesn't see the text or who it goes to, keeps no copy, and needs
no SMS permission. The link carries your first name and your spot after a `#`, which browsers
never send anywhere: our server only ever sees that someone opened the page, never where.

When a mate's link opens in your Moshpoint, the spot (and their first name) is read on your
phone and kept there as a saved place until you remove it; nothing is sent anywhere, and the
finder's arrow to it uses only your phone's own GPS and compass.

"Use satellite when there's no signal" (Moshpoint+, off until you switch it on) lets crew
messages and your shared location go over your phone's satellite connection when there's no
other network. They are the same end-to-end encrypted messages that otherwise go over mobile
data, to the same server; your carrier carries them and may charge for it. With the switch off,
the app sends nothing over a satellite connection.

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
your crew (chat, "On my way", the meet-up pin) are also passed between crew
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
4 bytes in it that stayed the same all night. This version only sends a form with nothing
constant in it.

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

**Which relay:** a build without our own server (such as a test build) uses the free
public relay [ntfy.sh](https://ntfy.sh) for this. It gets exactly the same thing: encrypted bytes filed
under a code that changes every 5 minutes. It can't read them or tell who you are, but like
any website it sees your phone's internet address when it connects. ntfy.sh keeps messages
for up to 12 hours (see its own privacy policy).

**Crew pings, meet-up pins and moments (optional):** messages you send your crew ("On my
way", "Where are you?"), a meet-up pin you drop, and photos and short clips (with their sound) you
choose to share as moments (with where you took them) are encrypted on your phone with your
crew's key, so only people who scanned your crew's QR can open them. They pass through the same
relay under codes that change daily or every 5 minutes. Our relay deletes moments within 24
hours, and crew chat, pings and pins within 3 days; the public relay deletes everything within
12 hours. Nothing is shared unless you tap to send it.

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

**Adding your own photos from that night (optional):** Android's photo picker shows your
photos; only the ones you pick are copied into the gig, on your phone. Moshpoint has no access
to the rest of your photos and never looks through them.

**Gig search (optional):** when you search for a gig, the words you type (and your phone's
country, for nearby shows) go to our server, which asks Ticketmaster, Bandsintown and SeatGeek
for matching shows. Builds without our server ask Ticketmaster directly. Nothing
about you or your crew is sent with it. Typing a gig in by hand sends nothing.

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

## Reporting and blocking

**Blocking** someone hides their crew chat messages, photos, clips and private messages on your
phone, and their new private messages are dropped when they arrive. It happens only on your phone:
nothing is sent, they aren't told, and they stay in the crew. Your blocked list (their name, the
crew's name and their crew key) stays on your phone; Settings → Blocked people shows it and
unblocks.

**Reporting** something sends a copy of it to us, because we can't see your crew's messages
otherwise: they're end-to-end encrypted. Before anything is sent, the report screen lists what
goes:

- the message's text, or the photo (made smaller) or four still frames of the clip (made smaller),
  with its caption;
- the name and crew key of the person who posted it (their identity in that crew only);
- a code for the crew (a hash of its id: not its name, invite or key) and when it was posted;
- the reason you picked, your note if you wrote one, and the app's version.

Nothing about you goes with it: not your name, your key, your phone's address or an install id.
The person you report isn't told who reported them. Reports are stored on our relay server and
kept for **90 days**, then deleted; only the app's owner can read them, with a secret key, to deal
with them (see docs/MODERATION.md). A report about a serious crime may be passed to the police.

Before your first crew chat message, photo, clip or private message, the app shows the community
rules once and asks you to agree.

## Continue with Facebook (optional)

Nothing reaches Meta unless you tap "Continue with Facebook": Facebook's login library in the
app only starts then. When you do, Meta's library talks to Meta to log you in (Meta's own
privacy policy covers what it receives, such as your Facebook session and basic information
about the app and your phone), and Facebook tells the app your name and profile photo (nothing
else: no friends list, email or posts). Your first name fills in your Moshpoint name and the
photo becomes your Moshpoint photo, shared with your friends as described above. The library's
analytics, advertising-ID collection and automatic start are switched off. You can stop using
it any time; it doesn't post anything on your behalf.

## Where our server is

Our relay server runs in Sydney, Australia (on Fly.io). What it holds is encrypted on your phone
before it's sent: locations for 15 minutes, moments for 24 hours, crew chat, pings and pins for
up to 3 days, profile photos for up to 8 days, each deleted when it expires. Reports (see
"Reporting and blocking") are the one thing it holds that it can read, and are kept 90 days. Fly keeps one daily
snapshot of the server's storage for one day, so a copy of that encrypted data can outlive its
deletion by up to a day; it's as unreadable there as on the server. Map tiles come from OpenFreeMap, venue
lookups from OpenStreetMap's Nominatim, and gig searches from Ticketmaster, Bandsintown and
SeatGeek (asked by our server), each under its own privacy policy. Builds without our server
(such as test builds) use the public relay ntfy.sh instead. If you have a Wear OS watch, the phone-to-watch link is
Google's (see "What goes to your watch").

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
| Camera | Scanning a friend's or group's QR code (those images aren't stored or sent); taking your own photo; taking the photos and clips you choose to share with your crew as moments (encrypted, see above). |
| Microphone | Sound on the short clips you record for your crew (asked the first time you hold to record). |
| Photos and videos | No permission: "Add your photos from that night" uses Android's photo picker, which hands the app only what you pick. |
| Run in background / start at boot | Keep you findable with the app closed, only while you're live (and after a restart only if you chose "always on"). |
| View network connections | Know when the phone has no signal, so messages wait (or go by Bluetooth) instead of failing. Android grants this without asking; nothing about your network is sent anywhere. |

## Children

Moshpoint is for people aged 18 and over. It isn't directed at children, and we don't knowingly
let anyone under 18 use it.

## Changes

We'll update this page if anything here changes, and note the date at the top.
