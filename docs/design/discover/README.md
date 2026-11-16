# Discover and hype: mock-ups (November 2026)

Design only, for the owner to react to before anything is built (ROADMAP.md, "Discover and hype"). Four phone screens in the home redesign's look: 390 × 844 artboards, CSS px = Compose dp/sp, the app's own fonts and colours.

| Artboard | What it shows | 390 wide | 360 wide |
|---|---|---|---|
| `SmartSearch.html` | Plan a gig, member: "I" typed, artists with upcoming shows, biggest first, in three sections | `SmartSearch.png` | `SmartSearch-360.png` |
| `ComingUp.html` | Home, no crew tonight, with the "Coming up near you" card | `ComingUp.png` | `ComingUp-360.png` |
| `HypeGroup.html` | A planned crew for a show: countdown, tickets, chat, invites | `HypeGroup.png` | `HypeGroup-360.png` |
| `FreeView.html` | Plan a gig, free user: type the gig in, plus a quiet Moshpoint+ card | `FreeView.png` | `FreeView-360.png` |

Open the `.html` files in a browser from this folder; add `?w=360` to see a small phone. Shared styles are in `discover.css`. Faces come from `../home-redesign/faces/`. Every artist and venue is made up, and no ticket seller is named.

## Design reasoning

- **Search answers one letter with shows, not just names.** Each row says how many shows, when the next one is and where ("3 shows in New Zealand · next Sat 13 Mar, Auckland"), so you can tell the right artist at a glance. The sections run from closest to furthest: Near you (your region), Elsewhere in New Zealand, then Worldwide. Rows are biggest first within each section. A big act that only plays overseas comes after a smaller one playing your town, because a gig your mates can actually get to matters more.
- **"Type your own gig" is pinned to the bottom of the sheet**, so it stays reachable above the keyboard however long the list is. It opens today's name, date and venue form.
- **The Moshpoint+ mark is small and amber.** It sits next to the title on the member sheet and heads the free card, and it's never louder than the content. Free users get a complete free path first (fields, then Start the crew). The Moshpoint+ card comes after it, with no price and no "Upgrade" button, only "What's in Moshpoint+".
- **The Coming up card goes in the "No crew tonight" state, under Start a crew** (where the Plan a gig row was). There are three reasons:
  1. On a gig night the crew must own the screen. The home redesign's order is faces first, then Find everyone, and a discovery strip would compete with that.
  2. Most days aren't gig nights, so this state is where people spend the weeks between gigs, which is when they plan.
  3. "No crew tonight" followed by "here's what's coming" is a natural next step.

  For members, the card's search button replaces the Plan a gig row, so the screen doesn't have two ways into the same sheet. Free users keep the row and don't see the card. Join a crew moves one scroll down; it's also on the + button.
- **The chips wrap onto two lines rather than scroll sideways**, so all three filters are visible at 360 too. The show strip does scroll sideways, and a fade on the third card hints at that.
- **The hype group is the existing COMING UP crew state, built up.** The countdown is the headline ("in 117 days"), with "wakes up on the day" kept from today's asleep text. The show card holds the ticket link as the screen's one gradient button. The faces show who has a ticket: a lime ring and "Got my ticket ✓", or no ring and "No ticket yet". Your own toggle sits right under the faces, then chat, then Invite mates. On the night it becomes the normal crew screen.
- **Dates are real 2027 dates.** The show is Sat 13 Mar 2027, which is exactly 117 days after 16 Nov 2026. The brief said "Sat 14 Mar", but 14 Mar 2027 is a Sunday.
- **The bottom bar is opaque**, as the home redesign README says the app's must be. Content scrolls under it behind a short fade.

## Open questions for the owner

1. **Where the card lives:** is the No crew state right (recommended), or should it also appear at the bottom of a crew night, below Past gigs?
2. **How much of Discover free users get:**
   - Recommended: no card and no search, only the quiet card in Plan a gig, as drawn.
   - Alternative: a small taste, such as the first three Coming up shows from the shared cache.
3. **Ticket link for free mates:** a member plans a show and invites a free mate. Does the free mate see Get tickets in the hype group? Recommended: yes. The link was fetched once for the member, so it costs no key call.
4. **Ticket ticks:** can mates untick, and should the organiser get a nudge when everyone has a ticket?
5. **Ranking:** should a show you've already planned stay in the Coming up strip as "Planned ✓", or drop out?
6. **Hand-typed gigs:** should the free form become name, then date, then venue, as drawn? Today's sheet asks for the venue before the date.

## Not covered yet

- No keyboard is drawn. With the keyboard up, about four results show above it, so "Near you" goes first.
- Untested: long names, the 20 languages, large fonts, and the empty and error states (no shows found, no signal). These would follow the home redesign's audit before building.

## Status and next steps

- **Done:** four artboards, rendered at 390 and 360 wide (deviceScaleFactor 2), each checked by eye and by script for clipped text.
- **Next:** the owner reacts, the open questions above get answered, and then the build (about three sessions, ROADMAP.md).
- **To re-render:** use Playwright as in this session. Load each `.html` at 390 × 844, and with `?w=360` at 360 × 844, with deviceScaleFactor 2, then screenshot the `.phone` element.
