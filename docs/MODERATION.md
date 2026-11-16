# Moderation: reading reports and acting on them

For the owner. How reports reach you, how to read and clear them from a computer, what you can
do about them, and how fast to answer. Why it's built this way: [REPORT_BLOCK.md](REPORT_BLOCK.md).

## What a report is

Anyone can report a crew chat message, a private message, a photo, a clip, or a person, from the
same places they can block someone (hold a message, a crew mate's options, "Report or block" on a
photo or clip). Crew content is end-to-end encrypted, so the relay can't see it: the reporter's
phone sends **what its person could see**, after saying so on the report sheet:

- the message text, or the photo (at most 800 px) or four frames of the clip (at most 480 px),
  with its caption;
- the sender's name and their **crew signing key** (66 hex characters: their identity in that
  crew only, see PRIVATE_MESSAGES.md);
- a **crew hash** (SHA-256 of the crew's id: the same for every report from one crew, but not its
  name, invite or key);
- when it was posted (`postedSec`) and when the report arrived (`receivedSec`), unix seconds;
- the reason (`harassment`, `hate`, `sexual`, `violence`, `spam`, `other`), the reporter's note,
  and the app version.

Nothing about the reporter is kept: no address, no install. The relay keeps each report **90
days** (`reports/<id>.json` on the volume; at most 2,000 at a time), then deletes it.

## Setting up (once per relay)

Both relays take reports, the free one and the paid one (Moshpoint+): the app sends a report to
the relay it uses. Each relay needs its own admin token:

1. On a computer: `openssl rand -hex 32` makes one.
2. `fly secrets set MOSHPOINT_ADMIN_TOKEN=<that value> -a <relay app>` (or the app's Secrets page
   on fly.io). Use a different token on each relay. **Never** put it in the repo, a chat or a
   ticket (docs/SECRETS.md).
3. Keep it in your password manager. Without a token the admin routes are switched off (they
   answer 404), but reports are still received and kept, ready for when you set one.

## Reading reports (from a computer)

```sh
export RELAY=https://moshpoint-relay.fly.dev      # each relay in turn
read -rs MP_ADMIN                                  # paste the token; it isn't shown or saved
curl -sS -H "Authorization: Bearer $MP_ADMIN" "$RELAY/v1/admin/reports?limit=50" > reports.json
```

`reports.json` is a list, newest first (`limit` 1–500, default 100). To read it:

```sh
python3 -m json.tool reports.json | less
# One line each: id, reason, kind, who, text or caption, note
python3 -c 'import json; [print(r["id"], r["reason"], r["kind"], r["senderName"], repr(r["text"] or r["caption"]), repr(r["note"])) for r in json.load(open("reports.json"))]'
# The images of report <id> as JPEG files
python3 -c 'import json,sys,base64; r=[r for r in json.load(open("reports.json")) if r["id"]==sys.argv[1]][0]; [open("%s-%d.jpg" % (r["id"], i),"wb").write(base64.b64decode(b)) for i,b in enumerate(r["images"])]' <id>
```

Reports from the same crew share a `crewHash`; reports about the same person in that crew share a
`senderKey` (the same person has a different key in every other crew).

Once a report is dealt with, delete it (and delete the downloaded files):

```sh
curl -sS -X DELETE -H "Authorization: Bearer $MP_ADMIN" "$RELAY/v1/admin/reports/<id>"   # 204 = deleted, 404 = no such report
```

A wrong or missing token gets 401. Don't run these from a shared machine, and don't paste the
token on the command line itself (shell history keeps it): `read -rs` keeps it out.

## Acting on a report

The relay can't link a report to anyone: it never sees who posted what (content is sealed on the
phone, and mailboxes aren't tied to people). What you can do:

| Situation | Action |
|---|---|
| Spam, insults inside one crew | Usually none beyond the reporter's own **Block** (the report sheet offers "Also block"). The crew's maker can **remove** them (a new crew key they don't get). Delete the report. |
| Harassment, hate, threats | As above; if the report gives a way to reach the reporter (their note), reply with how to block and remove. Keep the report until it's resolved, then delete it. |
| A credible threat to someone's safety | Contact the local police with the report's content and times. Keep the report (it's deleted after 90 days: download it first). |
| Sexual content involving a minor (CSAM) | **Don't download or share the image.** Report to the authorities (NZ: Department of Internal Affairs, dia.govt.nz/report-objectionable-material; elsewhere NCMEC's CyberTipline or the local hotline listed by INHOPE). Preserve the report as they instruct, then delete it. |
| Reports that are themselves abuse (floods of false reports) | They're limited per phone (5 at once, then 20 a day per install; 20 at once, then 200 a day per address: `ReportLimits` in server `Reports.kt`). If a flood gets through, lower those and deploy; delete the junk with the DELETE call. |

**Next (not built yet):**
- **Block an install token at the relay.** An admin endpoint (`POST /v1/admin/blocked-installs`
  with a token's install id, checked in `Clients`, refusing that install's writes) would stop a
  phone that abuses the relay itself. It can't target the *sender* of reported content today: the
  relay doesn't know which install posted it. That needs the phone to put its install id inside
  the sealed content (readable by the crew and so by a reporter), a protocol change to weigh
  against privacy first.
- **Signed moments,** so a photo's sender is matched by key, not name (REPORT_BLOCK.md, "Later").
- A small web page for the inbox instead of curl, behind the same token.

## How fast to answer

Play's User Generated Content policy wants reports acted on "in a timely manner". Aim for:

| Report | First look | Done |
|---|---|---|
| Sexual content involving a minor, a credible threat to life | within **24 hours** (check daily while the app is live) | report to the authorities the same day |
| Violence or threats, hate, sexual content | within **48 hours** | within **7 days** |
| Harassment, spam, something else | within **7 days** | within **14 days** |

Check both relays at least every two days while there are users, and daily on and after big gig
nights. Note in your own records (not in the repo) what you did about each report.
