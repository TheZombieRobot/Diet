#!/usr/bin/env python3
"""
Checks a running Moshpoint relay from the outside, the way phones and Android see it.

Run after every deploy by the Deploy server workflow (.github/workflows/deploy-server.yml), and
in CI against the relay's Docker image (android.yml, "Relay image"), so the deploy's checks are
themselves checked on every push.

  /healthz                        answers "ok" (waited for, while a new Machine starts)
  /.well-known/assetlinks.json    lets exactly the expected signing certificates open texted
                                  spots in the app (RELAY_API.md section 13)
  /spot and /spot.js              the page for phones without the app
  /v1/discover/suggest            refused (403 "members only"): Discover stays off until billing

Only what was checked and whether it passed is printed: never an answer's body.

Usage: python3 tools/check_relay.py <relay address, e.g. https://moshpoint-relay.fly.dev>
Environment (optional):
  EXPECT_CERTS   the SHA-256 fingerprints assetlinks.json must list, comma-separated (the
                 MOSHPOINT_APP_CERTS the relay was given). Default: the public debug key's
                 alone, which is what the relay serves when MOSHPOINT_APP_CERTS isn't set.
  WAIT_SECONDS   how long to wait for /healthz at first (default 180)
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

APP_ID = "nz.waveformlabs.moshpoint"
# The public debug key in the repo (app/debug.keystore), which signs test builds: the relay's
# default (server AppLinks.DEBUG_CERT). A fingerprint of a public certificate, not a secret.
DEBUG_CERT = "89:B4:37:7F:73:AB:77:7E:46:EF:31:37:6F:55:ED:E5:3E:CB:EA:D9:9A:33:18:64:C7:35:A7:17:40:26:1A:8D"
CERT = re.compile(r"^([0-9A-F]{2}:){31}[0-9A-F]{2}$")


class Answer:
    def __init__(self, status: int, headers, body: bytes):
        self.status = status
        self.headers = headers
        self.body = body

    def header(self, name: str) -> str:
        return self.headers.get(name, "") if self.headers is not None else ""

    def text(self) -> str:
        return self.body.decode("utf-8", "replace")


def get(base: str, path: str) -> Answer:
    req = urllib.request.Request(base + path, headers={"User-Agent": "moshpoint-relay-check"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return Answer(r.status, r.headers, r.read())
    except urllib.error.HTTPError as e:
        return Answer(e.code, e.headers, e.read())


def certs(value: str) -> list:
    """Fingerprints from a comma-separated list, upper case, each once."""
    out = []
    for c in value.replace(" ", "").split(","):
        if c and c.upper() not in out:
            out.append(c.upper())
    return out


class Checks:
    def __init__(self):
        self.failed = 0

    def ok(self, what: str):
        print(f"OK    {what}")

    def fail(self, what: str, why: str):
        self.failed += 1
        print(f"FAIL  {what}: {why}")
        print(f"::error::Relay check failed: {what} ({why})")


def wait_for_health(base: str, seconds: int, c: Checks):
    deadline = time.time() + seconds
    last = "no answer"
    while True:
        try:
            a = get(base, "/healthz")
            if a.status == 200 and a.text().strip() == "ok":
                c.ok("/healthz answers ok")
                return True
            last = f"HTTP {a.status}"
        except (urllib.error.URLError, OSError) as e:
            last = type(e).__name__
        if time.time() >= deadline:
            c.fail("/healthz", f"{last} after {seconds} s")
            return False
        time.sleep(5)


def check_asset_links(base: str, expected: list, c: Checks):
    what = "/.well-known/assetlinks.json"
    a = get(base, what)
    if a.status != 200:
        return c.fail(what, f"HTTP {a.status}")
    if "json" not in a.header("Content-Type"):
        return c.fail(what, "not served as JSON")
    try:
        statements = json.loads(a.text())
        s = statements[0]
        target = s["target"]
        listed = [str(x).upper() for x in target["sha256_cert_fingerprints"]]
    except (ValueError, KeyError, IndexError, TypeError):
        return c.fail(what, "not a Digital Asset Links statement")
    if len(statements) != 1 or "delegate_permission/common.handle_all_urls" not in s.get("relation", []):
        return c.fail(what, "not one handle_all_urls statement")
    if target.get("namespace") != "android_app" or target.get("package_name") != APP_ID:
        return c.fail(what, f"not for the app {APP_ID}")
    if sorted(listed) != sorted(expected):
        missing = [x for x in expected if x not in listed]
        extra = [x for x in listed if x not in expected]
        return c.fail(what, f"certificates differ: missing {missing or 'none'}, unexpected {extra or 'none'}")
    c.ok(f"{what} lists {len(listed)} certificate(s), as expected" + (" (the debug key's)" if listed == [DEBUG_CERT] else ""))


def check_spot_page(base: str, c: Checks):
    a = get(base, "/spot")
    if a.status != 200 or "text/html" not in a.header("Content-Type"):
        return c.fail("/spot", f"HTTP {a.status}, {a.header('Content-Type') or 'no type'}")
    if not a.header("Content-Security-Policy").startswith("default-src 'none'"):
        return c.fail("/spot", "no Content-Security-Policy")
    if '<script src="/spot.js"></script>' not in a.text():
        return c.fail("/spot", "not the spot page")
    c.ok("/spot is the spot page, with its Content-Security-Policy")
    js = get(base, "/spot.js")
    if js.status != 200 or "javascript" not in js.header("Content-Type"):
        return c.fail("/spot.js", f"HTTP {js.status}, {js.header('Content-Type') or 'no type'}")
    c.ok("/spot.js is served")


def check_discover_refused(base: str, c: Checks):
    what = "/v1/discover/suggest"
    a = get(base, what + "?country=NZ&q=a")
    if a.status == 403:
        return c.ok(f"{what} is refused (403 members only): Discover is off until billing")
    c.fail(what, f"HTTP {a.status}, expected 403: is MOSHPOINT_DISCOVER_OPEN set? It must never be on this relay")


def main() -> int:
    if len(sys.argv) != 2 or not re.match(r"^https?://[^/\s]+$", sys.argv[1].rstrip("/")):
        print(__doc__)
        return 2
    base = sys.argv[1].rstrip("/")
    expected = certs(os.environ.get("EXPECT_CERTS", "")) or [DEBUG_CERT]
    bad = [x for x in expected if not CERT.match(x)]
    if bad:
        print(f"::error::EXPECT_CERTS has something that isn't a SHA-256 fingerprint (AB:CD:... 32 pairs): {bad}")
        return 2
    c = Checks()
    print(f"Checking the relay at {base}")
    if wait_for_health(base, int(os.environ.get("WAIT_SECONDS", "180")), c):
        check_asset_links(base, expected, c)
        check_spot_page(base, c)
        check_discover_refused(base, c)
    if c.failed:
        print(f"{c.failed} check(s) failed")
        return 1
    print("All relay checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
