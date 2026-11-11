# Parked: the phone side of the watch app (work in progress)

These files belong in `app/src/main/java/nz/waveformlabs/moshpoint/watch/`. They are parked
here, outside the build, because the rest of the phone side (`WatchFind`, `PocketFinder`,
`WatchFinderService`, the manifest and Gradle additions) isn't written yet and the app would
not compile with them in place.

To pick up: see "Status and next steps" in `docs/WATCH.md`. In short: move the `.kt` files
into place, `git apply wip/watch-phone-side/locatorengine-bridge.patch`, write the three
missing files, add the manifest and Gradle lines, then delete this folder.
