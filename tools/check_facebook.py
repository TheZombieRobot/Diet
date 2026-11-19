#!/usr/bin/env python3
"""
Checks "Continue with Facebook" can't start anything it shouldn't (docs/FACEBOOK.md;
docs/LAUNCH_PREP.md, item 6), in a merged release manifest or in an APK's own manifest.

Every build: the SDK's start-up provider (com.facebook.internal.FacebookInitProvider) is gone, so
nothing reaches Meta at launch, and the manifest switches its auto-init, automatic events and
advertising-ID collection off. A build without a Meta app (no Facebook app id and client token:
BuildConfig.FACEBOOK_ENABLED is false, so the button is hidden) has no com.facebook component at
all (app/src/noFacebook), so nothing of the SDK can start, and no other app can open one of its
activities. A build with a Meta app has the login's activity.

Usage:
  python3 tools/check_facebook.py <merged AndroidManifest.xml> <configured: yes|no>
  python3 tools/check_facebook.py --aapt <aapt2 dump xmltree of an APK's manifest> <yes|no>
"""
import re
import sys
import xml.etree.ElementTree as ET

A = "{http://schemas.android.com/apk/res/android}"
COMPONENTS = ("activity", "activity-alias", "service", "receiver", "provider")
OFF = ("com.facebook.sdk.AutoInitEnabled", "com.facebook.sdk.AutoLogAppEventsEnabled", "com.facebook.sdk.AdvertiserIDCollectionEnabled")
INIT = "com.facebook.internal.FacebookInitProvider"
LOGIN = "com.facebook.FacebookActivity"


def from_xml(path):
    """(components as (tag, name), meta-data name -> value) of a merged manifest."""
    app = ET.parse(path).getroot().find("application")
    parts = [(e.tag, e.get(A + "name") or "") for e in app.iter() if e.tag in COMPONENTS]
    meta = {m.get(A + "name"): m.get(A + "value") for m in app.findall("meta-data")}
    return parts, meta


def from_aapt(path):
    """Components as (tag, name) from `aapt2 dump xmltree --file AndroidManifest.xml <apk>`."""
    stack, parts = [], []
    for line in open(path, encoding="utf-8"):
        m = re.match(r"^(\s*)E: (\S+)", line)
        if m:
            while stack and stack[-1][0] >= len(m.group(1)):
                stack.pop()
            stack.append((len(m.group(1)), m.group(2)))
            continue
        m = re.match(r'^\s*A: (?:http://schemas.android.com/apk/res/android:)?name(?:\(0x[0-9a-f]+\))?="([^"]*)"', line)
        if m and stack and stack[-1][1] in COMPONENTS:
            parts.append((stack[-1][1], m.group(1)))
    return parts


def main() -> int:
    args = sys.argv[1:]
    aapt = args[:1] == ["--aapt"]
    if aapt:
        args = args[1:]
    if len(args) != 2 or args[1] not in ("yes", "no"):
        print(__doc__)
        return 2
    path, configured = args[0], args[1] == "yes"
    problems = []
    if aapt:
        parts, meta = from_aapt(path), None
        # Read the APK's manifest at all? Its own main activity must be in the list.
        if not any(t == "activity" and n.endswith(".MainActivity") for t, n in parts):
            problems.append("couldn't read the APK's components (no MainActivity found)")
    else:
        parts, meta = from_xml(path)
    facebook = sorted(n for _, n in parts if n.startswith("com.facebook."))
    if INIT in facebook:
        problems.append("the SDK's start-up provider (FacebookInitProvider) is in the manifest: it would start at every launch")
    for name in OFF if meta is not None else ():
        if meta.get(name) != "false":
            problems.append(f"{name} isn't false")
    if configured:
        if LOGIN not in facebook:
            problems.append(f"a build with a Meta app has no {LOGIN}: the login can't run")
        what = "Facebook login there, its SDK started only by the button"
    else:
        if facebook:
            problems.append(f"Facebook components in a build without a Meta app: {', '.join(facebook)}")
        what = "no Facebook component at all (no Meta app configured)"
    if problems:
        for p in problems:
            print(f"::error::{path}: {p}")
        return 1
    print(f"OK: {what} ({path})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
