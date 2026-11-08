# Moshpoint product plan

Design audit, ranked next features, logins/connectors, and big ideas. The engineering
milestones are in [ROADMAP.md](ROADMAP.md).

What's built, what's next, and why. Ranked by how much each helps someone find their mates at
a packed gig.

## Built (test builds 59–75)

| Area | Feature |
|---|---|
| Finding | One shared Bluetooth scan (no more "scan froze"), warmer/colder, walk-to-find direction, spin scan, UWB arrows, compass fixed for upright phones |
| Far away | GPS arrows + Mosh map (OpenStreetMap, no key) over a free encrypted relay; last-known spots kept for a day; breadcrumb trails; save the venue map for no signal |
| Crew | One QR = in the crew (host carried in the QR, members gossip each other over Bluetooth and the relay); crew tiles show live / battery / last seen |
| Coordination | Meet-up pin, saved spots, crew pings (On my way, Stay put, Where are you?…) |
| Last metres | Light me up (screen + torch strobe in your own colour), "Ask them to light up" notification |
| Safety | Need help alert with location, Check In (heading home with a timer, alarm held by the crew's phones), last location at 5% battery, ghost mode |
| Social | Crew moments (photos pinned where they were taken), night recap card |

## Design audit (home screen)

**Problem:** the home screen read like a settings page: a big Go-live switch card, text-heavy
blocks, and an always-visible "add someone" form at the bottom.

**What the leaders do:** Snap Map, Life360, Find My and Zenly are people-first. You see your
people and their status at a glance, actions are one tap away, and setup is tucked behind a
"me" tab.

**Changes made:**
- **Header:** a compact **Live** pill instead of the switch card (it turns violet in ghost mode).
- **Crew card:** tonight's crew is the hero card, with photo tiles showing live / x min ago /
  battery, a big **Find the crew** button, one-tap pings, the meet-up banner and moments.
- **Add sheet:** every way to add someone (crew QR, scan, paste, send the app, friend QR,
  code) lives in one **Add** sheet.
- **Bottom bar:** **Crew · Map · Add · Me**. Settings live under **Me**.

**Next design steps (when there's data from real nights):**
1. **Map as home:** open straight to the map when the crew is spread out (more than 200 m),
   and to the crew card when everyone is close.
2. **Bar icons:** replace the emoji/unicode icons with drawn ones (consistency).
3. **Watch support:** a single-glance status for wearables (distance + warmer/colder).

## Next features (ranked)

1. **Bump to join**
   - **What:** hold two phones together to join the crew (very strong Bluetooth signal +
     a tap on both sides). Faster than a QR in the dark.
   - **Size:** medium.
2. **Crew bubbles on the map:** mates within ~15 m merge into one bubble with a count. Small.
3. **Adaptive location rate**
   - **What:** fast while a mate is actively looking for you (we already know this from
     their Bluetooth "looking" flag), slow when you're standing still.
   - **Size:** small.
4. **Venue map overlay**
   - **What:** stages, bars, toilets, first aid and exits per event, as a GeoJSON layer,
     plus "lost friend" meeting points.
   - **Needs:** site data (promoter partnership, or crowd-built, see below).
   - **Size:** medium.
5. **Set-time planner**
   - **What:** import the lineup, crew votes on who to see, and it drops a meet-up pin at
     that stage.
   - **Needs:** lineup data. Clashfinder-style sites, or the promoter.
   - **Size:** large.
6. **Audio chirp ping** for quiet spots (campsites, queues). Useless near a stage. Small.
7. **AR view:** the camera with a label floating over your mate's direction. Only worth it
   once direction is reliable (UWB, or GPS with good accuracy). Large.

## Logins and connectors

The app works with **no account on purpose**:
- Codes rotate.
- Everything is end-to-end encrypted.
- One QR does the "friending".

Logins are only for profile convenience.

| Connector | Value | What it needs |
|---|---|---|
| Facebook login (built) | Name + photo in one tap | Meta app id + client token in `gradle.properties` |
| Google sign-in | Same, for people without Facebook | Google Cloud OAuth client (SHA-1 of the signing key) |
| Contacts | "Invite Sam" from your address book via SMS/WhatsApp | READ_CONTACTS permission. Optional: the share sheet already covers most of it |
| Spotify / Apple Music | See which of your mates are going to the same gig; import who you're seeing | Spotify Web API app (client id), OAuth |
| Ticketing (Ticketmaster, Eventbrite, Dice) | Auto-create the crew for an event and set the night's expiry to the event end | Partner APIs |
| Calendar | "Add to calendar" for the gig, with the crew invite in the notes | None (system intent). Easy add |
| Ride-hailing (Uber, local taxis) | "Get home" from the map, pre-filled with your saved Home spot | Deep links, no key |
| Own relay server | Faster updates, profile photos, no third-party relay | Deploy `server/` (Render/Fly), set `moshpoint.serverUrl` |

## "Build a map of the venue from everyone's phones"

**Verdict:** a strong long-term moat, but only as an opt-in, anonymous, aggregated feature.

**How it would work:**
- While live, phones already know their GPS position and how many Moshpoint phones are around
  them (Bluetooth).
- Each phone uploads rounded, anonymous cells, e.g. "this 10 m square has 40 phones, people
  move through it at walking pace". Nothing identifies the person.
- The relay aggregates the cells into a live heatmap:
  - where the crowds are (stages),
  - walkable paths (where people actually move),
  - quiet meet-up spots.

**What that unlocks:**
- "Busy here", shown on the map.
- Better walking routes to a mate: avoid the mosh pit, use the path people actually take.
- An automatic venue map for any gig with no promoter data.

**Guardrails:**
- Strictly opt-in.
- Cells are only kept when 10 or more phones contribute.
- No IDs, so no "who was where".
- Clear wording in the privacy policy.

**Needs:** our own relay server (the public relay is message-based, not a database).

## Crew moments (the photo idea): assessment

**Verdict:** worth having. Nothing in the research does this.

**Why:** a photo pinned where it was taken, with "3 min ago", lets a lost mate recognise the
spot (the bar, the left speaker stack) faster than any radio method. And people already take
photos at gigs.

**Built:**
- Opt-in per photo.
- Encrypted to the crew.
- Expires from the relay within hours.

**Possible next steps:**
- Short video clips (needs our own server for size).
- Auto-suggest sharing the last photo you took when a mate is looking for you.
