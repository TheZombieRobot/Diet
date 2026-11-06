#!/usr/bin/env python3
"""
Analyse a Moshpoint field recording (CSV from the debug panel's "share last").

    python3 tools/analyze_recording.py moshpoint-20261107-201500.csv [more.csv ...]

Prints:
  * what was recorded (device, duration, readings per method),
  * for each "mark" with a distance in it (e.g. "A 20 m"), what every method said
    around that moment and how far off it was,
  * a fit of the Bluetooth path-loss constants (rssiAt1m, exponent) to the marked
    distances, to paste into RssiRanging.kt,
  * the timeline of method hand-overs,
  * gaps where nothing was heard from a friend for a while.

Standard library only.
"""
import csv
import math
import re
import statistics
import sys
from collections import Counter, defaultdict

WINDOW_MS = 10_000  # readings within +/- this of a mark count towards it
DIST_RE = re.compile(r"(\d+(?:\.\d+)?)\s*m\b", re.I)


def fnum(v):
    try:
        return float(v) if v not in ("", None) else None
    except ValueError:
        return None


def load(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["t"] = int(r["t_ms"])
        for k in ("distance_m", "bearing_deg", "rssi_dbm", "heading_deg", "lat", "lon", "accuracy_m", "confidence"):
            r[k] = fnum(r.get(k))
    return rows


def summary(rows, out):
    t0, t1 = rows[0]["t"], rows[-1]["t"]
    device = next((r["note"] for r in rows if r["event"] == "device"), "?")
    out.append(f"Device: {device}")
    out.append(f"Duration: {(t1 - t0) / 60000:.1f} min, {len(rows)} rows")
    fixes = Counter(r["method"] for r in rows if r["event"] == "fix")
    out.append("Readings per method: " + (", ".join(f"{m} {n}" for m, n in fixes.most_common()) or "none"))
    friends = sorted({r["friend"] for r in rows if r["friend"]})
    out.append("Friends: " + (", ".join(friends) or "none"))


def mark_accuracy(rows, out):
    marks = [r for r in rows if r["event"] == "mark"]
    if not marks:
        out.append("No marks. Next time press 'mark...' with the real distance, e.g. 'A 20 m'.")
        return []
    pairs = []  # (true distance, rssi) for the path-loss fit
    for m in marks:
        note = m["note"] or ""
        md = DIST_RE.search(note)
        truth = float(md.group(1)) if md else None
        out.append(f"\n[{fmt_t(rows, m['t'])}] mark: {note}")
        near = [r for r in rows if r["event"] in ("fix", "rssi", "rssi_scan") and abs(r["t"] - m["t"]) <= WINDOW_MS]
        by_method = defaultdict(list)
        for r in near:
            if r["event"] == "fix" and r["distance_m"] is not None:
                by_method[r["method"]].append(r["distance_m"])
            if r["event"] in ("rssi", "rssi_scan") and r["rssi_dbm"] is not None and truth:
                pairs.append((truth, r["rssi_dbm"]))
        if not by_method:
            out.append("    (no distance readings within 10 s)")
        for method, ds in sorted(by_method.items()):
            med = statistics.median(ds)
            spread = (max(ds) - min(ds)) if len(ds) > 1 else 0.0
            err = f", off by {med - truth:+.1f} m ({(med - truth) / truth * 100:+.0f}%)" if truth else ""
            out.append(f"    {method:<12} median {med:6.1f} m  (n={len(ds)}, spread {spread:.1f} m){err}")
    return pairs


def fit_path_loss(pairs, out):
    pts = [(math.log10(d), rssi) for d, rssi in pairs if d > 0]
    if len({round(x, 3) for x, _ in pts}) < 2:
        out.append("\nBluetooth fit: need RSSI readings near marks at 2+ different distances.")
        return
    n = len(pts)
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    sxy = sum((x - mx) * (y - my) for x, y in pts)
    slope = sxy / sxx
    a = my - slope * mx  # rssi at 1 m
    exponent = -slope / 10
    resid = [y - (a + slope * x) for x, y in pts]
    sd = statistics.pstdev(resid)
    out.append(f"\nBluetooth path-loss fit from {n} readings:")
    out.append(f"    rssiAt1m = {a:.1f} dBm, pathLossExponent = {exponent:.2f}  (scatter {sd:.1f} dB)")
    out.append("    -> RssiRanging(rssiAt1m = %.1f, pathLossExponent = %.2f)" % (a, exponent))
    out.append("    (current defaults: -59.0, 2.8. Open air is ~2, a packed crowd 3+.)")


def timeline(rows, out):
    out.append("\nMethod hand-overs:")
    last = {}
    count = 0
    for r in rows:
        if r["event"] != "arrow":
            continue
        state = (r["method"] or "") + (" " + r["note"] if r["note"] else "")
        state = state.strip() or "?"
        if last.get(r["friend"]) != state:
            if r["friend"] in last:
                d = f" ({r['distance_m']:.1f} m)" if r["distance_m"] is not None else ""
                out.append(f"    [{fmt_t(rows, r['t'])}] {r['friend']}: {last[r['friend']]} -> {state}{d}")
                count += 1
            last[r["friend"]] = state
    if count == 0:
        out.append("    none")


def gaps(rows, out, min_gap_ms=30_000):
    out.append("\nGaps (nothing heard from a friend for 30 s+):")
    seen = defaultdict(list)
    for r in rows:
        if r["event"] in ("fix", "rssi") and r["friend"]:
            seen[r["friend"]].append(r["t"])
    found = False
    for friend, ts in seen.items():
        for a, b in zip(ts, ts[1:]):
            if b - a >= min_gap_ms:
                out.append(f"    {friend}: {fmt_t(rows, a)} -> {fmt_t(rows, b)} ({(b - a) / 1000:.0f} s)")
                found = True
    if not found:
        out.append("    none")


def fmt_t(rows, t):
    s = (t - rows[0]["t"]) / 1000
    return f"{int(s // 60):02d}:{int(s % 60):02d}"


def analyse(path):
    rows = load(path)
    out = [f"=== {path} ==="]
    if not rows:
        return out + ["empty"]
    summary(rows, out)
    pairs = mark_accuracy(rows, out)
    fit_path_loss(pairs, out)
    timeline(rows, out)
    gaps(rows, out)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for p in sys.argv[1:]:
        print("\n".join(analyse(p)))
        print()
