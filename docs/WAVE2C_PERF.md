# Wave 2c: performance (photos, memory, smooth drawing)

The rendering and memory items of [audit/performance.md](audit/performance.md): P1-6 and P1-7
(photos), P1-4 (the venue map's pins), P1-5 (the finder's drawing), and "Home redraw efficiency"
from [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) ("Found during the tidy-up"). Performance only:
nothing may look or behave differently. The battery work ([WAVE2C_BATTERY.md](WAVE2C_BATTERY.md))
is merged and left alone.

Branch: `claude/wave2c-perf-m4x7rd` (from `ccr-5839ed7c-1q0ztj` at c1f77e5). Screenshots of this
branch: `ui-screenshots-claude-wave2c-perf-m4x7rd`, compared with `ui-screenshots`.

## Status and next steps (handover)

_Keep this section current: whoever picks this up next starts here._

- **Done: the whole list (items 1-4), with the proofs.** Last green run: **318** (dispatched on
  b3edd12, items 1-4 together; conclusion success). Item 1 alone: run 317 (0efbb3e), success.
- **Screenshots:** both runs, phone 1711 of 1711 and watch 798 of 798 **byte-identical** to
  `ui-screenshots` / `ui-screenshots-watch`, every language folder (so pixel-identical; no
  differences to explain). Core and server tests passed in both runs.
- **Deviation from the plan:** items 2, 3 and 4 were saved with [skip ci] and checked by one CI
  run together (318) instead of one each, to keep the work pushed while CI ran; all green.
- **Next (owner):** the phone checks in FIELD_TEST_PLAN.md section 4i; then merge. "Left" under
  item 3 (the compass heading) and "Found, not changed" below are for a later wave.
- **How to check locally:** only core tests run here (Google Maven is blocked; CI builds the app).

## 1. Photos: memory and freezes (performance P1-6, P1-7)

- **Taking a photo** (`ui/moments/CaptureScreen.kt`): captured at about 2048 x 1536 (a
  `ResolutionSelector`: the closest size the camera has at or above it, same 4:3 framing), not
  the sensor's full 12+ MP, and decoded and turned upright on a background thread; the photo
  comes back to the main thread as before. Was: two 48 MB bitmaps and a 200-400 ms freeze on
  the main thread. A capture that fails to decode now shows "photo failed" instead of crashing.
- **Crew moments arriving** (`moments/Moments.kt`): opening (decrypting) a moment runs on
  `Dispatchers.Default`, and unpacking a clip, keeping it in the gig's folder and reading its
  board image on `Dispatchers.IO`; only the board list changes on the main thread. One moment is
  added at a time (a lock), and the board is checked again just before adding, so a moment the
  Story put back meanwhile is never added twice. Sealing a clip to send (up to 12 MB) is off the
  main thread too.
- **The Story's board images** (`moments/MomentImages.kt`, `gigs/GigArchive.load`): read only
  when a Polaroid is on screen, at the board's size (`GigArchive.thumbnail`, unchanged), into a
  small LRU cache (24 MB, or an eighth of the app's memory allowance if less: about 16 images).
  The newest 8 are read when a gig is loaded (the home strip shows 8), and a moment that arrives
  is read as it arrives, so they show at once as before. Was: every photo of the night decoded
  at every start (about 300 MB for 200 photos). A photo whose file isn't a picture still stays
  out of the Story (its header is checked, not decoded).
  `Moments.Item.image` became `imageNow()` (memory only) and `loadImage()` (off the main
  thread); `ui/moments/StoryScreen.kt` `rememberMomentImage` shows a Polaroid's photo at once if
  it's in memory, else a dark square of the same size (the Polaroid's own background) for the
  moment it takes to read.
- **Full screen** (`StoryScreen.FullScreenMedia`): the original is read off the main thread
  (`LaunchedEffect`), at about twice the size it's shown (a power-of-two step, never more than
  before); the board image shows until then. Was: decoded in composition, up to about 50 MB.
- **The map's photo pins** (`main/MapOverlay.kt` `MomentIcons`, `ui/map/FriendMap.momentIcon`):
  each moment with a place gets its small pin icon made once, off the main thread, from its
  board image (not kept in the cache); `MapMoment` carries the icon instead of the image. On the
  first open of the map the photo pins appear as they're made (a few ms each).
- **Faces** (`profile/PhotoStore.kt`): a saved face is read from its file the first time it's
  shown (then kept: the same picture object each time, which the watch's face cache relies on),
  not all of them before the first screen. Faces of people who are no longer anyone's (not you,
  not a friend, not a crew mate) are deleted: at start, and when a crew's mates go
  (`FriendsRepository.clearGigGroup`, `clearLeftoverCrewMates`, the crew entry dropped by
  `makePermanent`). Nothing showed them: a crew picked again comes back under new ids.

Trade-offs (the audit's fixes, as asked):
- **"Save to phone" for a photo taken with Moshpoint's own camera** keeps the ~2048 px capture
  (what crew mates get at high quality), not the sensor's full size. Photos added from the
  phone's camera roll keep their untouched originals, as before.
- **Scrolling fast through a long Story** can show a Polaroid's dark square for a moment before
  its photo; full screen shows the board image for a moment before the sharp one; zooming in
  past about 2x on a big original is a little softer than before.

## 2. The venue map (performance P1-4)

- **`near` changes only when a distance does** (`main/MapOverlay.kt`): the mates heard close by
  (a distance, no direction) come from the finder's arrows, which change 20 times a second
  because the compass heading is in them. They're now a `derivedStateOf` with structural
  equality, read only there, so the map's screen recomposes when a distance (or who's close)
  changes, not on every tick. The rule is the same (only while the finder looks or at a venue).
- **Pin pictures are cached** (`ui/map/FriendMap.kt`): a mate's pin is drawn again only when
  what it's drawn from changes (initial, colour, floor tag, face picture); was a new bitmap per
  mate per update.
- **Unchanged GeoJSON is skipped**: each source (mates, trails, photo pins, places, you) is given
  data only when it differs from what that map look already has; photo pin icons are added once.
  A new map look (Bright / Night / Dark, a saved venue map) starts empty and gets everything.

## 3. The finder's drawing (performance P1-5)

- **Animations are read while drawing, not composing** (`ui/finder/FinderArrows.kt`,
  `ui/finder/CrewRadar.kt`): each arrow's swivel, the radar's spring in and out, and the colour
  warming are kept as state and read in the draw phase (`animatedAngleState`), so an animation
  frame redraws the canvas without recomposing the screen. Recomposition still follows the
  arrows themselves (20 times a second while the heading is in them; see "Left" below).
- **Paths, glows and gradients are cached**: the single-mate view's drawing is a remembered
  `drawWithCache` (the arrow's path and its glow strokes made once per screen size, its gradient
  once per colour, the photo ring's gradient while the mate stays put, the photo's clip path
  reused); the radar keeps each mate's path and gradient while their length and colour stay the
  same, and the glow strokes per width (`RadarCache`). `softGlow` takes pre-made strokes
  (`softGlowStrokes`); the drawing is the same.
- **Each animated canvas has its own layer** (`graphicsLayer()`): the arrows, the radar, the
  radar pulse and the radar sweep (whose gradient is also made once). A frame redraws that
  canvas, not the screen around it.
- **GlowBackground is static** (`ui/Neon.kt`): its three light blobs sit where their slow 14 s
  drift used to start, which is exactly where calm motion (battery saver) always showed them,
  and are drawn again only when the size or a colour changes (`drawWithCache`). This is the one
  visible change on this list, asked for by the audit: the blobs no longer drift. Screenshots
  are taken at the drift's start, so they're unchanged.
- **The crew pass is remembered** (`profile/Identity.crewPass`): the finder's block asks for your
  "Light me up" colour on every recomposition, which was an HMAC each time; the last pass is kept
  (same secret and crew, same pass; a copy is returned).

Left: **the compass heading is still in `ArrowState`**. Moving it out (arrows that change only
when a fix changes, the heading read in the draw phase) touches the finder engine, its tests and
every screen that reads arrows (the finder, the map's `near`, the watch, the screen-on rule);
not safe without a phone to test on, so not done here. The map no longer recomposes on it
(item 2), and animation frames no longer recompose the finder.

## 4. Home redraws (PRODUCTION_AUDIT.md, "Home redraw efficiency")

- `ui/home/FriendsScreen.kt`: the lambdas that used the action holders (`crewActions`,
  `gigActions`), which are new objects on every home redraw, now read the latest holder through
  `rememberUpdatedState`, so they stay the same objects between redraws (strong skipping
  remembers them by what they capture). The face tiles (`CrewTiles`), the friends strip, the
  friends and past-gigs sheets, the Up next rows and the memory card can skip recomposing.
  Lambdas inside the dialogs and menus (shown rarely) are unchanged.

## Found, not changed (outside this list)

- `HomeGigLists` decodes each past gig's cover (`GigArchive.thumbnail`, about 1.5 MB) in
  composition, on the main thread, the first time the list shows. Same fix as the Story: read
  it off the main thread into `MomentImages`.
- `MomentFlow.Dialogs` takes a recorded clip's first frame (`MediaMetadataRetriever`) in
  composition, on the main thread, when the "Share with crew" box opens (50-100 ms).
- `FullScreenMedia` decodes a camera-roll original without its EXIF rotation (as before), so a
  portrait photo stored sideways shows sideways in full screen. Kept as it was here (a fix would
  change what's shown).

## Proof

How the screenshots were compared: both branches fetched, every PNG under every language folder
compared by blob (byte-identical), and any that differ by pixels (RGBA) with Pillow.

- CI green on this branch (the app compiles only there).
- Every screenshot pixel-identical to `origin/ui-screenshots`, in every language folder
  (`ui-screenshots-claude-wave2c-perf-m4x7rd`).
- Core tests pass.
