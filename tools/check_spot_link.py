#!/usr/bin/env python3
"""
Checks the texted spots' App Link in a merged Android manifest (docs/SPOT_LINKS.md, item 1).

A build with a relay of its own declares SpotLinkActivity, exported, with one
android:autoVerify="true" filter for https://<relay host>/spot (app/src/spotLinks, added by
app/build.gradle.kts). A build without one has neither the activity nor any verified link.

Usage: python3 tools/check_spot_link.py <merged AndroidManifest.xml> <relay host, or "" for none>
Exit status 1 (with ::error:: lines) when the manifest isn't what that build should have.

       python3 tools/check_spot_link.py --host <MOSHPOINT_SERVER>
prints the host a build with that server gets the link for (nothing if none), by the build's own
rule: a plain https address, no user, the default port.
"""
import sys
import urllib.parse
import xml.etree.ElementTree as ET

A = "{http://schemas.android.com/apk/res/android}"
ACTIVITY = "SpotLinkActivity"


def attr(e, name):
    return e.get(A + name)


def host_of(server: str) -> str:
    """app/build.gradle.kts's spotLinkHost: https, no user info, port 443 or none, a host."""
    try:
        u = urllib.parse.urlsplit(server.strip().rstrip("/"))
        ok = u.scheme.lower() == "https" and u.hostname and u.username is None and u.port in (None, 443)
    except ValueError:
        return ""
    return u.hostname.lower() if ok else ""


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--host":
        print(host_of(sys.argv[2]))
        return 0
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    path, host = sys.argv[1], sys.argv[2].strip().lower()
    root = ET.parse(path).getroot()
    app = root.find("application")
    activities = [a for a in app.iter("activity") if (attr(a, "name") or "").split(".")[-1] == ACTIVITY]
    verified = [(a, f) for a in app.iter() if a.tag in ("activity", "activity-alias") for f in a.findall("intent-filter") if attr(f, "autoVerify") == "true"]
    problems = []
    if "${" in ET.tostring(root, encoding="unicode"):
        problems.append("a manifest placeholder was left unfilled")
    if not host:
        if activities:
            problems.append(f"{ACTIVITY} is in a build without a relay")
        if verified:
            problems.append(f"{len(verified)} autoVerify link filter(s) in a build without a relay")
        what = f"no {ACTIVITY} and no verified link"
    else:
        if len(activities) != 1:
            problems.append(f"{len(activities)} {ACTIVITY} entries, expected 1")
        else:
            a = activities[0]
            if attr(a, "exported") != "true":
                problems.append(f"{ACTIVITY} isn't exported")
            filters = [f for f in a.findall("intent-filter") if attr(f, "autoVerify") == "true"]
            if len(filters) != 1:
                problems.append(f"{ACTIVITY} has {len(filters)} autoVerify filters, expected 1")
            else:
                f = filters[0]
                actions = {attr(x, "name") for x in f.findall("action")}
                categories = {attr(x, "name") for x in f.findall("category")}
                data = [{k.replace(A, ""): v for k, v in d.attrib.items()} for d in f.findall("data")]
                if actions != {"android.intent.action.VIEW"}:
                    problems.append(f"the filter's actions are {sorted(actions)}")
                if categories != {"android.intent.category.DEFAULT", "android.intent.category.BROWSABLE"}:
                    problems.append(f"the filter's categories are {sorted(categories)}")
                if data != [{"host": host, "path": "/spot", "scheme": "https"}]:
                    problems.append(f"the filter's data is {data}, expected https://{host}/spot only")
        others = [x for x, _ in verified if (attr(x, "name") or "").split(".")[-1] != ACTIVITY]
        if others:
            problems.append(f"other verified links: {[attr(x, 'name') for x in others]}")
        what = f"{ACTIVITY} with one autoVerify filter for https://{host}/spot"
    if problems:
        for p in problems:
            print(f"::error::{path}: {p}")
        return 1
    print(f"OK: {what} ({path})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
