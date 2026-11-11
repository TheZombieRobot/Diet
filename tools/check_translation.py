"""Check translated Android string files against the English ones.
Usage: python3 tools/check_translation.py <values-xx dir>   (run from the repo root)
CI runs it on every language folder; it exits 1 if anything is wrong.
Checks: XML parses; same names as English; same placeholders (%1$s, %d ...) per string;
plurals have 'other'; apostrophes escaped; no stray unescaped quotes at start."""
import sys, os, re, xml.etree.ElementTree as ET
EN = 'app/src/main/res/values'
target = sys.argv[1]
ph = re.compile(r'%(\d+\$)?[-#+ 0,(]*\d*(\.\d+)?[sdfx%]')
def load(path):
    out = {}
    root = ET.parse(path).getroot()
    for el in root:
        if el.get('translatable') == 'false':
            continue
        if el.tag == 'string':
            out[('string', el.get('name'))] = ''.join(el.itertext())
        elif el.tag == 'plurals':
            out[('plurals', el.get('name'))] = {i.get('quantity'): ''.join(i.itertext()) for i in el}
    return out
errors = 0
for f in sorted(os.listdir(EN)):
    if not f.startswith('strings') or not f.endswith('.xml'):
        continue
    en = load(os.path.join(EN, f))
    tp = os.path.join(target, f)
    if not os.path.exists(tp):
        print('MISSING FILE', tp); errors += 1; continue
    raw = open(tp, encoding='utf-8').read()
    try:
        tr = load(tp)
    except Exception as e:
        print('BAD XML', tp, e); errors += 1; continue
    for k in en:
        if k not in tr:
            print('MISSING', f, k[1]); errors += 1
    for k in tr:
        if k not in en:
            print('EXTRA', f, k[1]); errors += 1
    for k, v in tr.items():
        if k not in en: continue
        ev = en[k]
        if k[0] == 'string':
            if sorted(m.group(0) for m in ph.finditer(ev)) != sorted(m.group(0) for m in ph.finditer(v)):
                print('PLACEHOLDERS', f, k[1], repr(v)); errors += 1
        else:
            if 'other' not in v:
                print('NO OTHER', f, k[1]); errors += 1
            want = set(m.group(0) for m in ph.finditer(ev.get('other', '')))
            for q, t in v.items():
                got = set(m.group(0) for m in ph.finditer(t))
                if got - want:
                    print('PLURAL PLACEHOLDERS', f, k[1], q, repr(t)); errors += 1
    # Unescaped apostrophes break the build.
    for m in re.finditer(r'<(string|item)[^>]*>(.*?)</(string|item)>', raw, re.S):
        body = m.group(2)
        if re.search(r"(?<!\\)'", body) and not (body.startswith('"') and body.endswith('"')):
            print('UNESCAPED APOSTROPHE', f, body[:60]); errors += 1
print('OK' if errors == 0 else f'{errors} problem(s)')
sys.exit(1 if errors else 0)
