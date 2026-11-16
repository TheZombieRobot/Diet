# Keys and secrets

**No key, password or secret ever goes in this repo, in the app, or in a chat.** The repo is public (the test builds are downloaded from it), and anything committed stays in its history for good, even after it's deleted. Each secret lives in one of two locked stores, and only the thing that needs it can read it.

## Where each one lives

| Secret | Lives in | Used by | How to set it |
|---|---|---|---|
| `TICKETMASTER_KEY`, `SEATGEEK_CLIENT_ID`, `BANDSINTOWN_APP_ID` (gig search) | The relay's secrets on Fly.io | The relay only. The app asks the relay; the app never holds a key. | From a computer: `fly secrets set TICKETMASTER_KEY=…`, or the app's Secrets page on fly.io if your account shows one. |
| `MOSHPOINT_TOKEN_SECRET` (relay install tokens), `MOSHPOINT_CONTACT` | The relay's secrets on Fly.io | The relay | `fly secrets set …` (see SERVER_PRODUCTION.md) |
| `MOSHPOINT_KEYSTORE`, `MOSHPOINT_KEYSTORE_PASSWORD`, `MOSHPOINT_KEY_ALIAS`, `MOSHPOINT_KEY_PASSWORD` (the Play upload key) | GitHub, under the repo's Settings → Secrets and variables → Actions → Secrets | CI, to sign the Play bundle | On the phone: the repo on github.com → Settings → Secrets and variables → Actions → New repository secret (desktop view helps) |
| `RELEASES_TOKEN` (optional: test builds published to a separate repo) | GitHub Actions secrets | CI | As above |
| `MOSHPOINT_SERVER` (the relay's address) | GitHub, on the Variables tab of that page | CI, built into the app | Not a secret, so it goes under Variables |
| The Meta App Secret | Nowhere in this project | Not needed | Never paste it anywhere |

Two values that look like keys but are meant to be public:
- **The Facebook App ID and client token** (`moshpoint.fb.*` in gradle.properties). Meta designs these to be built into apps. They're empty today.
- **app/debug.keystore.** It's the standard Android debug key, used only to sign test builds, so a tester's phone accepts each new test build as an update. Play builds are signed with the upload key above, then by Google.

**Paid versus free:** API keys go only on the production relay, which serves Moshpoint+ members. The free relay has no keys at all (ROADMAP.md, Moshpoint+).

## Fill-in checklist

Every key the project will need, with a one-word placeholder.

**Never replace a placeholder in this file.** The repo is public, and every save on GitHub's website is a commit, so a real value typed here is published at once and stays in the history even after it's changed back. Ignoring a file later doesn't help either: `.gitignore` only affects new local files, never one already in the repo. Paste each real value into the place in the last column instead. Those are private boxes, and GitHub's works from a phone.

**Paid-only server (Moshpoint+). The free server never gets these:**

| Name | Placeholder | Get it from | Paste the real value into |
|---|---|---|---|
| `TICKETMASTER_KEY` | INSERTTICKETMASTERKEYHERE | developer.ticketmaster.com → My Apps → Consumer Key | The paid relay's Fly secrets |
| `SEATGEEK_CLIENT_ID` | INSERTSEATGEEKCLIENTIDHERE | seatgeek.com/account/develop | The paid relay's Fly secrets |
| `BANDSINTOWN_APP_ID` | INSERTBANDSINTOWNAPPIDHERE | Bandsintown's API application (check the commercial terms) | The paid relay's Fly secrets |

**Both servers:**

| Name | Placeholder | Get it from | Paste the real value into |
|---|---|---|---|
| `MOSHPOINT_TOKEN_SECRET` | INSERTTOKENSECRETHERE | Generate: `openssl rand -hex 32` | That relay's Fly secrets (a different one per relay) |
| `MOSHPOINT_CONTACT` | INSERTCONTACTEMAILHERE | Your support email | That relay's Fly secrets |

**Building and publishing the app (GitHub → repo → Settings → Secrets and variables → Actions):**

| Name | Placeholder | Get it from | Paste the real value into |
|---|---|---|---|
| `MOSHPOINT_KEYSTORE` | INSERTKEYSTOREBASE64HERE | Your Play upload keystore, base64-encoded | Secrets tab |
| `MOSHPOINT_KEYSTORE_PASSWORD` | INSERTKEYSTOREPASSWORDHERE | Chosen when you create the keystore | Secrets tab |
| `MOSHPOINT_KEY_ALIAS` | INSERTKEYALIASHERE | Chosen when you create the keystore | Secrets tab |
| `MOSHPOINT_KEY_PASSWORD` | INSERTKEYPASSWORDHERE | Chosen when you create the keystore | Secrets tab |
| `RELEASES_TOKEN` (optional) | INSERTRELEASESTOKENHERE | A GitHub fine-grained token for the builds repo | Secrets tab |
| `MOSHPOINT_SERVER` | INSERTRELAYADDRESSHERE | e.g. https://moshpoint-relay.fly.dev (not a secret) | Variables tab |

**Later, with billing:**
- A Google Play service account, for checking purchases on the paid relay: its JSON goes in that relay's Fly secrets.
- A Mapbox token for satellite maps: designed with billing so free builds can't use it.

## What stops a leak

1. **No slot for one.** The app has no build setting for an API key: gig search goes through the relay. `gradle.properties` holds no key fields.
2. **CI refuses one.** Every build runs `tools/check_secrets.py`, which fails the build if a tracked file contains a private key, a well-known token format, anything named like a key or password with a literal value, a key in a URL, or a keystore, `.env` or private-key file.
   - Made-up keys in tests carry the comment `secret-scan: allow`.
   - Run `python3 tools/check_secrets.py --history` to scan every line ever added on this branch (`--all` covers every branch).
   - On 16 November 2026 this branch's whole history scanned clean.
3. **`.gitignore`** keeps keystores, `.env` files and the like out of commits by accident.
4. **The relay's logs** hide any key in a URL or Authorization header (`apikey=[secret]`, `LogPrivacy`), on top of ids, tokens and addresses.
5. **GitHub masks Actions secrets** in CI logs, and CI never prints them.
6. **GitHub's own secret scanning** also checks public repos for known key formats. Keep **Push protection** on (repo → Settings → Advanced Security or Code security → Push protection), so GitHub refuses a push containing a known key before it lands.

## If a key ever leaks

Treat it as public from the moment it was pushed. Removing the commit isn't enough, because forks and caches may already hold it.
1. **Rotate it** in the provider's dashboard (Ticketmaster, SeatGeek, Bandsintown, Fly.io or GitHub) so the leaked one stops working.
2. Put the new one in the right store above.
3. Delete it from the repo in a normal commit.
