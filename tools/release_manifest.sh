#!/usr/bin/env bash
# Merges the phone app's release manifest with the given Gradle options and keeps a copy, so CI can
# check what a build's settings put in it (android.yml: the texted spots' App Link with and
# without a relay; Facebook with and without a Meta app). Needs the Android SDK (CI).
#
# Usage: bash tools/release_manifest.sh <where to keep it.xml> [-Pname=value ...]
set -euo pipefail
out="$1"
shift
marker=$(mktemp)
trap 'rm -f "$marker"' EXIT
sleep 1
./gradlew -q :app:processReleaseManifest "$@"
m=$(find app/build/intermediates -path '*release*' -name AndroidManifest.xml -newer "$marker" | sort | tail -1)
if [ -z "$m" ]; then
  echo "::error::no release manifest was written"
  find app/build/intermediates -path '*release*' -name AndroidManifest.xml
  exit 1
fi
echo "Release manifest: $m"
cp "$m" "$out"
