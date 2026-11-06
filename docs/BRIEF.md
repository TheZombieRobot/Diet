# Moshpoint Brief

Repo: JoshWaveformLabs-Dev/moshpoint (private)
Platform: Android first. Play Store release if it works well.

## What it is

Moshpoint finds your mates at a gig or any big venue. You open the app, tap a friend, and an arrow points you straight to them. That's it. Every bit of tech that makes the arrow work runs in the background, and the user never has to pick anything.

The goal is to be the best way there is to find your friends at a gig, using any means the phone has.

## The main screen

- When nobody's in range there's no arrow, just a no-signal state.
- As you get closer, a red arrow shows up and swivels to point the way to walk.
- With two or more friends, the arrow splits into one arrow per friend, and each one fades into that friend's own colour as you close in.
- Each arrow has the friend's profile photo at its tip, so you know who you're heading for.
- A small distance readout sits under each arrow (for example "40 m").
- There's a Scan button for when the arrow's unsure. It tells you to turn slowly in a circle while it gets a fix.

## Friends and groups

Both ways of linking up are in:

- Friends list: permanent, like adding someone on Snapchat.
- Gig group: a quick group for one night. One person makes a code or QR and everyone scans it.

Tap a friend in either one and you go straight to their arrow.

## Being visible

- Each person turns on visibility when they head into the gig.
- Once it's on, the phone keeps broadcasting in the background, even with the app shut, so mates can still find you.
- There's a setting to leave visibility always on.
- Visibility is only ever on when the user chooses it.

## How it finds people (all automatic)

The app checks what both phones can do and uses the best method that's working right now. It switches between methods on the fly without the user noticing.

1. GPS and compass: when there's mobile data and you're far apart. Locations get shared through the server, and the compass turns that into an arrow.
2. Crowd relay: when mobile data drops out at the venue, locations hop phone to phone over Bluetooth through other Moshpoint users in the crowd, until they reach someone with signal or reach you.
3. UWB (ultra-wideband): within about 50 m, when both phones have UWB. This gives the exact distance and direction, which is the proper precise arrow.
4. Wi-Fi Aware: close range, for a good distance reading on phones without UWB.
5. Bluetooth signal strength: close range fallback that works on any phone. It shows warmer or colder for distance.
6. Spin to scan: on phones with no UWB, the user holds the phone flat against their chest and turns in a slow circle. Their body blocks the Bluetooth signal, so the app reads where the signal drops, matches it with the compass, and works out roughly which way the friend is. This is what the Scan button runs.

## Crowd network (later, at scale)

Once lots of people use it, every phone with Moshpoint helps find people, the same way Tile and Apple's Find My network work, even when that user isn't looking for anyone.

Privacy has to be built in from the start:

- A visible phone sends out a scrambled code that changes every few minutes.
- Any Moshpoint phone that hears it adds its own location and passes it on locked.
- Only the friend it belongs to can unlock it. The phone that helped never knows who it helped or where they were.

## Things to watch

- Battery: broadcasting all night is hard on the battery. Work out how to keep that down.
- Packed crowds: bodies soak up Bluetooth and radio signals, so test in real crowds, not just the backyard.
- Background limits: Android limits what apps can do in the background. The broadcasting has to keep running with the app closed.
- Testing: Bluetooth, UWB and the compass need real phones. Test with at least two physical phones, one with UWB and one without.

## Name

Moshpoint is the working name. Get a proper trademark check (IPONZ in NZ, for a start) before launch.
