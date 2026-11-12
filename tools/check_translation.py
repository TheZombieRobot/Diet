"""Check translated Android string files against the English ones.
Usage: python3 tools/check_translation.py <values-xx dir>   (run from the repo root)
       python3 tools/check_translation.py --same-languages <res dir> <res dir> ...
The English files are the ones in the 'values' folder next to the folder given, so this works
for any module: app/src/main/res/values-de, wear/src/main/res/values-de.
CI runs it on every language folder of the phone app and the watch app; it exits 1 if anything is wrong.
Checks: XML parses; same names as English; same placeholders (%1$s, %d ...) per string;
plurals have 'other'; apostrophes escaped; no stray unescaped quotes at start.
--same-languages: every res dir given (app/src/main/res wear/src/main/res) must be translated
into the same set of languages, so the watch never speaks a language the phone doesn't, or the
other way round."""
import sys, os, re, xml.etree.ElementTree as ET
def languages(res):
    return {d for d in os.listdir(res) if d.startswith('values-') and any(f.startswith('strings') and f.endswith('.xml') for f in os.listdir(os.path.join(res, d)))}
if sys.argv[1] == '--same-languages':
    sets = {res: languages(res) for res in sys.argv[2:]}
    everywhere = set.union(*sets.values())
    bad = 0
    for res, have in sets.items():
        for d in sorted(everywhere - have):
            print('MISSING LANGUAGE', os.path.join(res, d)); bad += 1
    print('OK' if bad == 0 else f'{bad} problem(s)')
    sys.exit(1 if bad else 0)
target = sys.argv[1].rstrip('/')
EN = os.path.join(os.path.dirname(target), 'values')
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
