# Moshpoint: everything it does (test build 130)

Android app for finding your mates at gigs and festivals. No accounts.

**Status key**
- **(field-tested):** tried on real phones.
- **(untested):** built, but not yet tried on a real phone.
- **(needs X):** waiting on a key or a server.

## 1. Crews (the group for the night)
- **Invite mates for tonight:** one tap starts a crew named after you and shows a QR code.
- **Joining:** mates scan the QR and they're in. The QR carries the host, so the joiner can
  find you straight away. Everyone in the crew can find everyone. (field-tested)
- **Other ways to join:**
  - Send the invite by WhatsApp or Messenger.
  - Paste an invite.
  - Copy an invite and open the app: it offers "Join X's crew?".
  - Bump: hold two phones back to back. (untested)
- **Finding each other's details:** crew members pass each other's details on over Bluetooth
  (gossip) and through an internet relay. (partly tested)
- **Plan a gig ahead:** search upcoming gigs ("Iron…" lists Iron Maiden, venue, date), or type
  the gig in. Search needs a Ticketmaster key; typing it in works now.
- **Sleeping crews:** a crew for a later date sleeps until the day, with no Bluetooth, GPS or
  battery use. Mates can join any time.
  - On the day, 3 h before the start: "Iron Maiden tonight! Tap to go live".
  - The crew ends itself the morning after.
- **Follow from home:** a separate invite for family. Followers:
  - see the photo Story, where everyone is ("at the venue" or "1.2 km from the venue"), pings,
    check-ins and help alerts;
  - never broadcast and can't be found;
  - are shown to the crew ("Following from home: Mum").
- **Several crews at once:** a new crew never replaces the one you're in.
  - The soonest gig is the main crew (the big card, finding, Bluetooth).
  - The rest wait in **Up next** with a countdown ("in 4 weeks"), the plan or how many mates
    are in, and an unread badge. They stay asleep, so they cost no battery.
  - When the main crew ends, the next one steps up.
  - Two gigs on the same day: **Switch** chooses which crew is the main one. (untested)
- **Friends list:** people you keep across gigs, alongside the one-night crew.
- **Removing:** a ⋯ menu on each person (remove, set photo, keep as friend).

## 2. Finding a mate (picks the method automatically)
- **GPS arrow when far:** both phones share encrypted GPS through a free public relay
  (ntfy.sh), and the phone shows an arrow plus distance using the compass. (untested end to end)
- **Bluetooth up close:** warmer/colder from signal strength, shown as bands (Right here,
  Close, Nearby, In range) instead of fake-precise metres.
  - The phone ticks faster as you get closer.
  - A walk-to-find arrow learns the direction from which way you walked when the signal
    got stronger.
- **Spin scan:** turn on the spot and your body blocks the signal to give a rough direction.
  It's unreliable in crowds, so it's ranked low.
- **UWB precise arrow** on phones that have UWB (some Pixels and Samsungs). (untested)
- **Wi-Fi Aware distance** on phones that support it. (untested)
- **Crowd relay:** encrypted locations hop phone to phone over Bluetooth through the crowd,
  which helps with no signal. (untested)
- **Light me up:** your screen and torch strobe in your own colour. Mates' apps say "look for
  flashing BLUE (Bevan)". "Ask them to light up" sends them a notification.
- **"Found them"** celebration within about 3 m.
- **Finder screen:** shows what's switched off, with fixes ("Bluetooth is off → Turn on").
- **Live phone status:** battery on each mate's tile and pin. At 5% battery the phone sends
  one last location.

## 3. Map (Snap Map style)
- **What's on it:**
  - mates as photo pins;
  - your blue dot;
  - last-known spots, kept for a day, with "x min ago" and battery;
  - 30-minute breadcrumb trails;
  - crew bubbles when mates stand together.
- **Styles:** Bright, Night or Dark (free OpenStreetMap maps, no key).
- **Pins:** a crew meet-up pin (everyone gets it), and private saved spots (tent, car).
- **Actions:**
  - Walk: Google Maps walking directions.
  - Ride: an Uber deep link to a saved spot.
  - Find: opens the arrow.
  - Ask: a "go live" message.
- **Save this area for no signal:** an offline map of the venue.

## 4. Messaging and safety
- **Crew chat, one per crew:** short messages (up to 140 characters), encrypted with the crew
  key. Chat works weeks before the gig, for the hype. Followers at home can read but not
  post. (untested)
  - **Messages don't get lost:**
    - the relay keeps chat for 12 hours (3 days on your own server);
    - phones share a sealed copy of the recent chat every few hours, so anyone who was away
      catches up.
  - **Sending:** your messages show "Sending…", then "Not sent · Tap to retry" if there's no
    signal. They're also retried by themselves.
  - **Every message carries a hidden sender tag,** so two people called "Mate" never get mixed
    up.
  - **One notification per crew,** updated in place ("3 new messages" with the latest lines).
    The app checks every 20 s while you're chatting, every ~2 min while it's open, and about
    hourly in the background.
- **Pinned plan:** one line pinned at the top of the chat and on the crew card ("Sound desk
  after the encore"). It's re-sent every 8 minutes so late joiners see it. (untested)
- **Flares:** "Bar time 🍺", "At the rail 🎶", "Lost 😅" and more. Your spot shows for 30
  minutes, and the vibe shows under your tile. (untested)
- **Plan card:** the gig, the plan, the meet-up and who's coming, as a shareable picture.
- **Crew pings:** On my way, Where are you?, Stay put, Meet at the pin, All good.
- **Need help:**
  - an urgent alert to the crew with your location;
  - a text to your emergency contact with a map link (plain SMS, so it works without data);
  - a Call 111 button;
  - a hint about satellite SOS when there's no signal.
- **Check In:** "Heading home" with a 30–90 minute timer. If you don't tap "I'm home safe",
  the crew is alerted. The timer runs on the crew's phones, so it still works if yours dies.
- **"Bevan is on the move":** fires when a mate moves 200 m or more away from where they
  were, at most once every 20 minutes per person.
- **Ghost mode:** hidden from the map but findable up close, optionally for 1 hour.
- **Live notification**, like a Live Activity: "Bevan 40 m · Jo 1.2 km", with a Find crew
  button.
- **Home-screen widget** showing crew distances.

## 5. Photos, clips and the Story
- **In-app camera:** tap for a photo, hold for a clip of up to 10 s. Includes flip camera and
  gallery buttons. You can also share to "Moshpoint crew" from any app.
- **The Story:** a live pinboard. Polaroids are pinned zig-zag down a timeline, and the
  pushpin is the poster's face.
  - It checks for new posts every 30 s; new ones pop in.
  - A "↑ new" pill and a LIVE tag.
  - Tap for a bigger view, then tap again for full screen with pinch zoom. Clips play full
    screen.
- **Moments on the map:** each photo is pinned where it was taken.
- **Quality:** photos up to 2048 px and clips in 720p, with a Data saver option. Your own
  originals are always kept full quality.
- **Privacy:** photos and clips are crew-only and encrypted. The public relay deletes them
  within hours.

## 6. Your gigs (memories)
- **Kept as they arrive:** every photo and clip is saved on the phone per gig, so it survives
  restarts and the relay deleting.
- **Your gigs list:** past nights with a cover, date, venue, counts and who was there. Relive
  the pinboard offline.
- **Save to phone:** one item, or **Save all**, into a gallery album "Moshpoint / <gig>".
- **Add your photos from that night:** finds photos and videos on your phone taken during the
  gig and copies them in.
- **Memories:** "A year ago today: Iron Maiden with Bevan & Jo", as a home-screen card and a
  notification.
- **Night recap:** distance walked, finds, moments and pings, shareable.

## 7. Profile and setup
- **Profile:**
  - Name and photo (selfie or gallery), with generated initials avatars as the fallback.
  - Photos are shared encrypted with friends.
  - Facebook login for name and photo. (needs Meta keys)
- **First run:** onboarding with permission explanations, and a single "one thing first" card
  for missing permissions and switches.
- **Going live:** automatic while you're in a crew, unless you chose to hide. There's a Quick
  Settings tile, and live can survive a phone restart.
- **Debug mode for testing:**
  - a tech panel;
  - simulated friends, including ones pinned at a real spot 60, 150 or 400 m away;
  - a sample past gig;
  - a field recorder.

## 8. Privacy and tech
- **No account:** rotating codes that change every 5 minutes, and end-to-end encryption
  (AES-GCM) for locations, intros, pings, photos and avatars. The relay only sees scrambled
  bytes.
- **Own relay server:** ready to deploy in one tap on Render (free). Paste its address in Me →
  Relay server. The invites you share carry it, so your crew switches too.
- **Public relay is frugal:** location is only sent after moving 25 m, and intros less often
  late in the night, so it lasts a big night.
- **Test builds:** scrambled (R8), about 27 MB, from a public download link. The repo is
  public; there's a proprietary licence.

## 9. Security (build 135)
- **Crew passes:** in each crew you're a separate identity, used up when the crew ends.
  - Invites and crew mates only ever get that pass, so nobody from a one-night crew, and
    no leaked QR, can find you at later gigs.
  - At a gig, finding uses the crew's passes. Friends you've kept who come along join the crew.
- **Signed messages:** every chat message, plan, ping, flare and history copy is signed with
  your key for that crew.
  - Fakes and edits are dropped.
  - Two people with the same name show as "Jo" and "Jo (2)", so nobody can pass as someone
    else.
- **Keep as friend is a private request:** your permanent identity goes only to that person,
  and only if they say yes.
- **Remove from crew:** the crew moves to a new key, sent privately to everyone else (re-sent
  for 3 days). The removed person can't see locations, the chat or photos any more.
- **Reset invite:** the same, with nobody removed, so a leaked QR stops working. Invites also
  expire when the crew ends.
- **Joins are visible:** "Jo joined the crew" appears in the chat for everyone.
- **Test builds:** signed with a private key once it's added to GitHub (no public key in the
  repo).
- **On the phone:** data sits in the app's private storage, which Android encrypts with your
  screen lock, and phone backups are off.

## 10. On your wrist (Wear OS watch) (untested)
Galaxy Watch4 and newer, Pixel Watch. The phone stays in your pocket. Details: [WATCH.md](WATCH.md).
- **Arrow on the wrist:** pick a mate and an arrow points at them, with their face, name and distance. It uses the watch's own compass, so it keeps up as you turn.
- **Honest about what it knows:** the arrow only shows with your wrist held flat, and only when the direction is real. With the phone in a pocket and your mate close, it shows the distance instead and the buzzes guide you.
- **Buzzes you can follow without looking:** ticks that quicken as you get closer, two quick ticks when you're facing them, one long buzz when you're going the wrong way, and a flourish when you've found them. It respects the watch's vibration, silent and Do Not Disturb settings.
- **Need help from the wrist:** hold the red button for two seconds and the whole crew is told. It says plainly whether it went: sent, sent nearby, or not sent yet. **Free for everyone.**
- **Quick messages:** On my way, All good.
- **Watch face and tile:** your nearest mate, or how many of the crew are live, and the crew at a glance.
- **Moshpoint+:** everything on the watch except Need help is part of Moshpoint+ (on for everyone in test builds).
- **Easy on batteries:** the phone only works for the watch while you're actually finding someone, and stops when the watch stops asking.

## Known gaps
- **No iPhone version yet.** A web-link version for iPhone mates is planned.
- **Real-crowd accuracy is unproven.** It needs proper field tests.
- **The public relay is slow:** about one update a minute, with message limits.
- **No festival maps, set times or lineups**, and no ticketing or Spotify connections.
- **The watch app has never run on a real watch.** It builds and its screens are drawn in tests; the first wrist test is section 4c of the field test plan. No Apple Watch.
