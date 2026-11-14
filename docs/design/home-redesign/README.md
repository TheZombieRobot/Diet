# Home screen redesign (November 2026)

The approved design for the home screen ("Crew" tab). Five artboards, each a 390 × 844 phone screen:

| Artboard | State | Picture | Exact sizes |
|---|---|---|---|
| Main | Crew tonight, you're live, top of the screen | `Main.png` | `Main.html` |
| Scrolled | The same screen scrolled down: Up next, Past gigs, Friends | `Scrolled.png` | `Scrolled.html` |
| Crew menu | The ⋯ sheet: once-a-night crew actions | `CrewMenu.png` | `CrewMenu.html` |
| No crew | A returning user with no crew tonight | `NoCrew.png` | `NoCrew.html` |
| First time | A brand-new user: no crew, no friends, no past gigs | `FirstTime.png` | `FirstTime.html` |

The `.html` files are the source of truth for sizes, colours and spacing (CSS px = Compose dp/sp). Open them in a browser from this folder: they load the app's own fonts from `app/src/main/res/font`. The faces in `faces/` are crops of the app's default avatars.

## Why it changed

The old home read like a settings page: one long card with every action at the same volume. The new one keeps Moshpoint's look (dark ground, neon accents, Unbounded headings) but gives it a pecking order:

1. **Who's here and how far away** (the faces) and **Find everyone** are the loudest things on the screen.
2. Tonight's two everyday actions (crew chat, share photos) come next, as quieter glass buttons.
3. Once-a-night actions (invite more mates, share the night with family, end the night) move into the ⋯ crew menu.
4. **Need help** is always one tap away in the header (it opens the existing help dialog; nothing is ever sent on that first tap).
5. The Live switch says what it means ("You're visible to your mates" / "Off: mates can't see you yet").
6. Lists become horizontal strips (faces, Polaroids). One section per row, never two sections side by side. Empty sections are hidden, so a new user sees one clear thing to do.

## Flaws in the mock-up that the app must not copy

- The lime rings and glow on the faces are cut off at the top of both face rows. In the app, rings and glows must never be clipped.
- The Polaroids show through the bottom bar. In the app the bar is opaque and the list ends above it.
- Sizes are for English. Every language must fit (see the checks in `docs/HOME_REDESIGN.md`).
