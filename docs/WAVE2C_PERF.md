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

- **Item 1 (photos): pushed for CI (run 317, 0efbb3e).** The watch's screenshots came back
  byte-identical (798 of 798); the phone build was still running when item 2 was saved.
- **Item 2 (the venue map): code done, saved with [skip ci]** on top of item 1. Once item 1 is
  green, run CI for it (Actions, "Android build", Run workflow on this branch) and compare.
- **Items 3 and 4: drafted in the working tree, not committed** (if this session ended, they're
  gone: redo them from the notes below). Field tests: FIELD_TEST_PLAN.md section 4i (written).
- **Left:** CI and screenshots for items 1-4, items 3 and 4, and the report to the parent
  session (session_01Sw3Y2WCFVzhNwUVdFGVbRq).
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

## Proof

- CI green on this branch (the app compiles only there).
- Every screenshot pixel-identical to `origin/ui-screenshots`, in every language folder
  (`ui-screenshots-claude-wave2c-perf-m4x7rd`).
- Core tests pass.
