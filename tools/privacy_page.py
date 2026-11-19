#!/usr/bin/env python3
"""
Builds the privacy policy's web page from docs/PRIVACY.md (the one source).

Writes the same page to two places:
  server/src/main/resources/privacy.html   served by the relay at GET /privacy (PrivacyPage.kt),
                                           which puts MOSHPOINT_CONTACT where the page says
                                           INSERTCONTACTEMAILHERE, at runtime
  docs/site/index.html                     a copy ready for GitHub Pages (docs/PLAY_STORE.md,
                                           Privacy policy), for an owner who'd rather host it there

Run it after every change to docs/PRIVACY.md and commit the result. CI runs it with --check,
which fails when either copy is out of date. In docs/site/index.html the contact may have been
filled in by hand (that copy is published as it is): --check accepts any address there.

Only the Markdown that PRIVACY.md uses is understood: # and ## headings, paragraphs, - lists
(with indented continuation lines), | tables |, **bold**, _italic_, `code` and [links](url).
Everything is HTML-escaped first, so text can't become markup. The page has no script and loads
nothing from anywhere else.

Usage: python3 tools/privacy_page.py [--check]
"""
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "docs", "PRIVACY.md")
SERVED = os.path.join(ROOT, "server", "src", "main", "resources", "privacy.html")
PAGES = os.path.join(ROOT, "docs", "site", "index.html")
OUTPUTS = [SERVED, PAGES]
CONTACT = "INSERTCONTACTEMAILHERE"
# How the contact appears on the page: the relay replaces both halves at runtime (Privacy.kt).
CONTACT_HTML = f'<a class="contact" href="mailto:{CONTACT}">{CONTACT}</a>'
CONTACT_ANY = re.compile(r'<a class="contact" href="[^"<>]*">[^<>]*</a>')

STYLE = """
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1d1a24;--muted:#5b5566;--line:#e3dfea;--link:#6b2bd9;--head:#f6f3fa}
@media (prefers-color-scheme:dark){:root{--bg:#07050f;--fg:#f3eefc;--muted:#b9b1c9;--line:#2b2538;--link:#22e4ff;--head:#141020}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 4rem}
h1{font-size:1.75rem;line-height:1.25;margin:0.5rem 0 1rem}
h2{font-size:1.25rem;line-height:1.3;margin:2.25rem 0 0.75rem;padding-top:1rem;border-top:1px solid var(--line)}
p,ul{margin:0 0 1rem}
ul{padding-left:1.25rem}
li{margin:0.25rem 0}
a{color:var(--link);overflow-wrap:anywhere}
code{font:0.9em ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
em{color:var(--muted)}
.table{overflow-x:auto;margin:0 0 1rem}
table{border-collapse:collapse;width:100%;font-size:0.95rem}
th,td{border:1px solid var(--line);padding:0.5rem 0.6rem;text-align:left;vertical-align:top}
th{background:var(--head)}
""".strip()


def inline(text: str) -> str:
    """One line or paragraph of Markdown text to HTML, escaped first."""
    out = []
    # Code spans first, so nothing inside them is read as Markdown.
    for i, part in enumerate(re.split(r"(`[^`]+`)", text)):
        if i % 2:
            out.append("<code>" + html.escape(part[1:-1], quote=False) + "</code>")
            continue
        s = html.escape(part, quote=True)
        s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<![\w*])_(?!\s)(.+?)(?<!\s)_(?!\w)", r"<em>\1</em>", s)
        s = s.replace(CONTACT, CONTACT_HTML)
        out.append(s)
    return "".join(out)


def cells(row: str) -> list:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def convert(md: str) -> (str, str):
    """The page's title and body HTML."""
    lines = md.splitlines()
    body, title, i = [], "Moshpoint privacy policy", 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("# "):
            title = line[2:].strip()
            body.append(f"<h1>{inline(title)}</h1>")
            i += 1
        elif line.startswith("## "):
            text = line[3:].strip()
            anchor = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
            body.append(f'<h2 id="{anchor}">{inline(text)}</h2>')
            i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            head, rest = cells(rows[0]), [r for r in rows[1:] if not re.fullmatch(r"\|[\s:|-]+\|?", r.strip())]
            t = ["<div class=\"table\"><table>", "<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>", "<tbody>"]
            t += ["<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells(r)) + "</tr>" for r in rest]
            t.append("</tbody></table></div>")
            body.append("\n".join(t))
        elif re.match(r"- ", line):
            items = []
            while i < len(lines) and (lines[i].startswith("- ") or (lines[i].startswith("  ") and lines[i].strip())):
                if lines[i].startswith("- "):
                    items.append(lines[i][2:].strip())
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            body.append("<ul>\n" + "\n".join(f"<li>{inline(x)}</li>" for x in items) + "\n</ul>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#{1,2} |\||- )", lines[i]):
                para.append(lines[i].strip())
                i += 1
            body.append(f"<p>{inline(' '.join(para))}</p>")
    return title, "\n".join(body)


def page(md: str) -> str:
    title, body = convert(md)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>{html.escape(title)}</title>
<style>
{STYLE}
</style>
</head>
<body>
<main>
{body}
</main>
</body>
</html>
"""


def main() -> int:
    check = "--check" in sys.argv[1:]
    with open(SOURCE, encoding="utf-8") as f:
        want = page(f.read())
    stale = []
    for out in OUTPUTS:
        have = open(out, encoding="utf-8").read() if os.path.exists(out) else None
        if check:
            # The GitHub Pages copy may have the real contact filled in; the relay's never does.
            if have is not None and out == PAGES:
                have = CONTACT_ANY.sub(CONTACT_HTML, have)
            if have != want:
                stale.append(os.path.relpath(out, ROOT))
        elif have != want:
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "w", encoding="utf-8") as f:
                f.write(want)
            print("Wrote " + os.path.relpath(out, ROOT))
    if stale:
        for s in stale:
            print(f"::error::{s} isn't built from the current docs/PRIVACY.md: run python3 tools/privacy_page.py and commit")
        return 1
    if check:
        print("The privacy pages match docs/PRIVACY.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
