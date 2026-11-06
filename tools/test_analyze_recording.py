"""Checks analyze_recording.py recovers known constants from a synthetic recording.

    python3 tools/test_analyze_recording.py
"""
import math
import os
import random
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import analyze_recording as ar  # noqa: E402

HEADER = "t_ms,event,friend,method,distance_m,bearing_deg,rssi_dbm,heading_deg,lat,lon,accuracy_m,confidence,note"


def synthetic(path):
    rnd = random.Random(1)
    lines = [HEADER, "0,device,,,,,,,,,,,Test Phone"]
    t = 1000
    for d in (2, 5, 10, 20, 40):
        for _ in range(20):
            rssi = -62 - 10 * 2.5 * math.log10(d) + rnd.gauss(0, 2)
            lines.append(f"{t},rssi,A,BLE_RSSI,{d:.2f},,{int(round(rssi))},0,,,,,")
            lines.append(f"{t},fix,A,WIFI_AWARE,{d + rnd.gauss(0, 0.5):.2f},,,0,,,,0.85,")
            lines.append(f"{t},arrow,A,{'UWB' if d < 20 else 'WIFI_AWARE'},{d:.2f},,,,,,,,")
            t += 400
        lines.append(f"{t},mark,,,,,,,,,,,A {d} m")
        t += 40_000  # walk to the next spot (makes a gap too)
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "rec.csv")
        synthetic(p)
        text = "\n".join(ar.analyse(p))
    print(text)
    fit = [l for l in text.splitlines() if "rssiAt1m =" in l][0]
    a = float(fit.split("rssiAt1m =")[1].split("dBm")[0])
    n = float(fit.split("pathLossExponent =")[1].split()[0])
    assert abs(a - -62) < 2.0, a
    assert abs(n - 2.5) < 0.2, n
    assert "WIFI_AWARE" in text and "off by" in text
    assert "WIFI_AWARE -> UWB" in text or "UWB -> WIFI_AWARE" in text
    assert "Gaps" in text and " s)" in text
    print("\nOK: recovered rssiAt1m %.1f, exponent %.2f" % (a, n))


if __name__ == "__main__":
    main()
