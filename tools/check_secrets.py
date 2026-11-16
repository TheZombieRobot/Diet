#!/usr/bin/env python3
"""
No secrets in the repo (docs/SECRETS.md).

Scans the files git tracks (default) or every line ever added in history (--history) for:
private keys, well-known token formats (AWS, Google, GitHub, Slack, Stripe, Fly, OpenAI,
Anthropic, SendGrid, Meta access tokens), anything named like a key, secret, token or password
that has a literal value next to it, keys in URLs (?apikey=..., client_id=..., app_id=...),
literal Authorization headers, and files that should never be committed (keystores other than
the public debug one, .env files, private key files).

API keys live in the relay's secrets (fly secrets set) and signing secrets in GitHub's Actions
secrets: never in a file here. A line can opt out with the comment "secret-scan: allow" (for
made-up keys in tests). Exit status 1 when anything is found; findings are shown redacted.

Usage: python3 tools/check_secrets.py [--history [--all]]
  --history  every line ever added on this branch;  --all  every branch in the repo too.
"""
import os
import re
import subprocess
import sys

ALLOW_MARK = "secret-scan: allow"

# Files that may be committed although their names look sensitive.
ALLOWED_FILES = {
    "app/debug.keystore",   # the public Android debug key, for test builds (docs/SECRETS.md)
    "wear/debug.keystore",
}

SENSITIVE_FILE = re.compile(
    r"(^|/)(\.env(\..+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|keystore\.properties|secrets\.properties|"
    r"local\.properties|service[-_]?account[^/]*\.json)$|\.(jks|keystore|p12|pfx|pem|key|ppk|secrets)$",
    re.I,
)

BINARY_EXT = re.compile(
    r"\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|mp3|mp4|webm|ogg|wav|zip|gz|tgz|jar|aar|apk|aab|so|dex|class|"
    r"bin|pdf|keystore|jks)$",
    re.I,
)

TOKEN_FORMATS = [
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----")),
    ("AWS access key", re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("Google OAuth secret", re.compile(r"\bGOCSPX-[A-Za-z0-9_\-]{20,}")),
    ("GitHub token", re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}")),
    ("Slack token", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}")),
    ("Stripe live key", re.compile(r"\b(sk|rk)_live_[0-9a-zA-Z]{20,}")),
    ("Fly.io token", re.compile(r"\bFlyV1\s+fm[12]_[A-Za-z0-9_+/=\-]{20,}|\bfo1_[A-Za-z0-9_\-]{20,}")),
    ("OpenAI key", re.compile(r"\bsk-(proj-)?[A-Za-z0-9_\-]{20,}T3BlbkFJ[A-Za-z0-9_\-]{20,}|\bsk-proj-[A-Za-z0-9_\-]{40,}")),
    ("Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{30,}")),
    ("SendGrid key", re.compile(r"\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b")),
    ("Meta access token", re.compile(r"\bEAA[A-Za-z0-9]{60,}")),
]

NAMES = (
    r"api[_-]?key|apikey|api[_-]?secret|secret[_-]?key|client[_-]?secret|app[_-]?secret|access[_-]?token|"
    r"auth[_-]?token|private[_-]?key|password|passwd|store[_-]?password|key[_-]?password|consumer[_-]?key|"
    r"consumer[_-]?secret|token[_-]?secret|ticketmaster[_-]?key|tm[._-]key|seatgeek[_-]?client[_-]?id|"
    r"bandsintown[_-]?app[_-]?id|fb[._-]?app[._-]?secret|app[._-]?secret"
)
# name = "literal" / name: 'literal' / "name": "literal"
QUOTED_ASSIGN = re.compile(r"(?i)[\w.\-]*(" + NAMES + r")[\w.\-]*[\"']?\s*[:=]\s*[\"']([^\"'\s]{12,})[\"']")
# name=literal in .properties / .env / .toml / .yml style lines (config files only: in code an
# unquoted value is a name, not a secret)
CONFIG_FILE = re.compile(r"(\.(properties|env|toml|ya?ml|ini|cfg|conf)|(^|/)\.env(\..+)?)$", re.I)
BARE_ASSIGN = re.compile(r"(?i)^\s*[\w.\-]*(" + NAMES + r")[\w.\-]*\s*[:=]\s*([^\s\"'#]{12,})\s*$")
# ?apikey=literal&...
URL_KEY = re.compile(r"(?i)[?&](apikey|api_key|client_id|client_secret|app_id|app_secret|access_token|token|key)=([A-Za-z0-9_\-]{16,})")
AUTH_HEADER = re.compile(r"(?i)authorization[\"']?\s*[:=,]\s*[\"']?(bearer|basic|token)\s+([A-Za-z0-9_\-.=+/]{16,})")

# Placeholders such as INSERTTICKETMASTERKEYHERE (docs/SECRETS.md, fill-in checklist) are fine.
PLACEHOLDER = re.compile(r"(?i)example|your|xxx|changeme|placeholder|dummy|redacted|sample|^insert.*here$|<|>|\*|\.\.\.|\[secret\]|^(.)\1+$")


def looks_literal(v: str) -> bool:
    """A real-looking value, not a reference to one (env vars, Gradle props, CI expressions)."""
    if v.startswith(("$", "{", "%", "@")) or "${" in v or "$(" in v:
        return False
    if any(t in v for t in ("secrets.", "vars.", "env.", "getenv", "System.", "BuildConfig", "prop(", "(", ")")):
        return False
    if PLACEHOLDER.search(v):
        return False
    return True


def redact(v: str) -> str:
    return (v[:4] + "…" if len(v) > 4 else "…") + f" ({len(v)} chars)"


def scan_line(line: str, path: str = ""):
    if ALLOW_MARK in line:
        return []
    found = []
    for name, rx in TOKEN_FORMATS:
        m = rx.search(line)
        if m:
            found.append((name, m.group(0)))
    rules = [QUOTED_ASSIGN] + ([BARE_ASSIGN] if CONFIG_FILE.search(path) else [])
    for rx in rules:
        for m in rx.finditer(line):
            v = m.group(2)
            if looks_literal(v):
                found.append(("named secret", v))
    for m in URL_KEY.finditer(line):
        if looks_literal(m.group(2)):
            found.append(("key in a URL", m.group(2)))
    for m in AUTH_HEADER.finditer(line):
        if looks_literal(m.group(2)):
            found.append(("Authorization header", m.group(2)))
    return found


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, errors="replace", check=True).stdout


def scan_tree() -> list:
    out = []
    for path in git("ls-files", "-z").split("\0"):
        if not path:
            continue
        if SENSITIVE_FILE.search(path) and path not in ALLOWED_FILES:
            out.append((path, 0, "file that should never be committed", path))
            continue
        if BINARY_EXT.search(path) or not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            continue
        if b"\0" in data[:4096]:
            continue
        for n, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
            for rule, v in scan_line(line, path):
                out.append((path, n, rule, v))
    return out


def scan_history(all_branches: bool) -> list:
    out = []
    refs = ["--all"] if all_branches else ["HEAD"]
    for path in set(git("log", *refs, "--diff-filter=A", "--name-only", "--format=").split()):
        if SENSITIVE_FILE.search(path) and path not in ALLOWED_FILES:
            out.append((path, 0, "file that was committed at some point", path))
    proc = subprocess.Popen(
        ["git", "log", *refs, "-p", "-U0", "--no-color", "--no-ext-diff", "--format=commit %H"],
        stdout=subprocess.PIPE, text=True, errors="replace",
    )
    commit, path = "", ""
    for line in proc.stdout:
        if line.startswith("commit "):
            commit = line.split()[1][:7]
        elif line.startswith("+++ "):
            path = line[6:].strip() if line.startswith("+++ b/") else ""
        elif line.startswith("+") and path and not BINARY_EXT.search(path):
            for rule, v in scan_line(line[1:], path):
                out.append((f"{path} @ {commit}", 0, rule, v))
    proc.wait()
    return out


def main() -> int:
    history = "--history" in sys.argv
    findings = scan_history("--all" in sys.argv) if history else scan_tree()
    if not findings:
        print("No secrets found" + (" in any commit." if history else " in the tracked files."))
        return 0
    print(f"{len(findings)} possible secret(s). Move each to the relay's secrets (fly secrets set) or GitHub's "
          "Actions secrets, and rotate any real key that was ever pushed (docs/SECRETS.md).")
    for path, n, rule, v in findings:
        where = f"{path}:{n}" if n else path
        print(f"  {where}: {rule}: {redact(v)}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
