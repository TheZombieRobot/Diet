# Report and block: decisions

Google Play's User Generated Content policy wants, in any app where people share content: an
in-app way to report objectionable content and users, a way to block users, and terms people
agree to before posting. Moshpoint has crew chat, private messages and shared photos and clips
(moments), and had none of these: launch blocker 9 in [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md),
P0-4 in [audit/release.md](audit/release.md).

Decisions were made without stopping to ask, as instructed. Each is recorded here with the
reason, so it can be changed later. **Nothing here has run on a real phone yet.**

## Status and next steps (handover)

_Kept current at every push. Branch `claude/ugc-moderation-b5k8q2`, started from
`ccr-5839ed7c-1q0ztj` at `16c6eeb`. Work only on this branch: no pushes elsewhere, no merge, no PR._

| Stage | State |
|---|---|
| 1. Block (app only) | **done, green**: run 320 at `5c4ceec`: secrets, translations, core and server tests, phone debug and release builds passed. Screenshots: all 1,711 existing phone and 798 watch images byte-identical to `ui-screenshots` / `ui-screenshots-watch`; 126 new (6 tests × 21 languages), looked at (small phone, large font): nothing cut off |
| 2. Community rules before the first post | **pushed** at `af17acb`, run 321 (its own run) |
| 3. Report (sheet, relay endpoints, server tests) | **pushed**; 10 relay tests (`ReportTest`) pass locally; CI: the run for the commit "Report and block: CI for stages 3 and 4" (run 322 or the next) |
| 4. Docs (MODERATION.md, PRIVACY.md, PLAY_STORE.md, SECRETS.md, FIELD_TEST_PLAN.md 4j) | **pushed**; CI in the same run as stage 3 |

**Exact next step:** check run 321 (stage 2) and the run for the head (stages 3 and 4): green,
every old screenshot byte-identical (`bash` the comparison in "How to work on it"), and the new
ones looked at: stage 2 `communityRules`, `smallPhoneLargeFontCommunityRules`; stage 3
`moderationMenuWithReport`, `reportSheet`, `smallPhoneLargeFontReportSheet`, `reportSheetClip`.
Then send the report (branch, last green run, stages, screens) to the session that asked.

How to work on it:
- `core` and `server` tests run here with a scratch Gradle build that includes only `:core` and
  `:server` and points its version catalogue at `gradle/libs.versions.toml` (a `settings.gradle.kts`
  with `project(":core").projectDir = file("<repo>/core")` and the same for `:server`). The app
  and the watch can't be built here (Google's Maven host is blocked): CI builds them on every push
  without `[skip ci]`.
- CI publishes every language's screenshots to `ui-screenshots-claude-ugc-moderation-b5k8q2`
  (and the watch's to `ui-screenshots-watch-claude-ugc-moderation-b5k8q2`), and commits the
  English ones to `docs/screenshots` here (`git pull --rebase` before pushing). Compare without
  downloading images: `git fetch --filter=blob:none --depth=1 origin ui-screenshots <that branch>`,
  then compare `git ls-tree -r` of the two (the same blob id = the same bytes).
  `tools/contact_sheet.py` puts one test's 21 languages side by side.
- All new text is in `app/src/main/res/values*/strings_moderation.xml` (20 folders), for all four
  stages at once, so the translations were done in one pass. Check with
  `for d in app/src/main/res/values-*/; do python3 tools/check_translation.py "$d"; done` and
  `python3 tools/check_translation.py --same-languages app/src/main/res wear/src/main/res`.

## Where the code is

| What | Where |
|---|---|
| The rules (who is blocked, what is hidden, saving, a rekey) | `core/.../core/Moderation.kt` (`BlockList`, `Blocked`), tests `ModerationTest` |
| The list on this phone (prefs `moderation`, key `blocked`) and who a message, photo or face belongs to | `app/.../moderation/Blocks.kt` (`Blocks`, `Person`) |
| Which dialog is open | `app/.../moderation/Moderation.kt` |
| The dialogs (menu, "Block Jo?", the blocked list, the Settings row) | `app/.../ui/moderation/ModerationUi.kt` |
| Drawing them over everything; "Remove Jo from the crew?" from there | `app/.../main/ModerationOverlays.kt` |
| Hiding: crew chat lines and plan, unread and notifications | `ChatOverlays.kt` (`Blocks.visibleLines`), `CrewChat.ingest`/`ingestHistory`/`add` |
| Hiding and dropping private messages | `PrivateMessages.arrived` (dropped), `promoteKnown`, `refresh`, `unreadByFriend`, `blockedChanged` |
| Hiding photos and clips | `HomeContent`, `StoryOverlays` (tonight and past gigs), `MapOverlay` (`Blocks.visibleMoments`) |
| Community rules: the rule, the gate, the dialog | core `CommunityRules`; `Moderation.beforePosting` / `agree` (prefs `moderation`, key `rules_agreed`); `CommunityRulesContent`; gated in `ChatOverlays` (chat, plan, private) and `MomentFlow.sendMoment`/`sendClip` |
| Report: building and sending | `app/.../moderation/Reporting.kt`; `RelayClient.postReport` |
| Report sheet | `ReportContent` in `ModerationUi.kt`; `ReportSheet` in `ModerationOverlays.kt` |
| Relay: storing, limits, admin | `server/.../Reports.kt` (`ReportRules`, `ReportStore`, `ReportLimits`, `AdminAuth`), routes in `Main.kt`, `RelayConfig.adminToken`/`reportTtlMs`/`reportMaxCount`; tests `ReportTest` |

## Decisions

### 1. Who "they" are: the crew signing key

Everything a person writes in a crew is signed with their **crew signing key** (`Identity.signer`,
one per person per crew, kept across a rekey): chat lines carry its tag (`CrewChat.Line.sender`),
private messages its public key. That is the stable key the block list keeps (`Blocked.tag`, and
`Blocked.pub` as hex when known). A crew mate's face maps to it through their intro
(`GroupSync.pubOf`).

- **Per crew, on purpose.** A person has a different key in every crew (so nobody can be followed
  from one gig to the next, see `Identity`). A block is for the crew it was made in; the same
  person in another crew is not blocked there. Settings shows the crew's name beside each person.
- **A rekey** (someone removed, or the invite reset) changes the crew's id but not anyone's key:
  `Blocks.migrate` (called from `CrewRekey.migrate`) moves the crew's entries to the new id.
- The list is kept until you unblock (at most 500 people; the oldest go first past that).

### 2. Photos and clips: by name

A moment (`GigGroup.Moment`) carries only its sender's name: moments aren't signed. So a photo or
clip is hidden when its name matches a blocked person's name **in the crew of the block**
(trimmed, case ignored). From a photo, "Block Jo" finds Jo's key when exactly one crew mate has
that name, and otherwise blocks the name alone. Anyone in the crew could post a photo under
someone else's name; signing moments would fix that, and is listed under "Later".

### 3. What blocking does, on this phone only

- **Crew chat:** their lines, their plan and their flares are hidden; they never notify or count
  as unread. They are kept (as the crew's History would bring them back anyway), so unblocking
  shows them again. **Need help is never hidden**: blocking is for what people write, not for
  safety alerts.
- **Private messages:** new ones are **dropped on arrival** (`PrivateMessages.arrived`, never kept,
  shown or announced); ones that arrived before the block are hidden, their notification goes, and
  the thread says "You blocked Jo… Tap to unblock".
- **Photos and clips:** hidden on the home screen, the Story, a past gig's Story and the map.
- **Nothing is sent.** They aren't told, and **they stay in the crew**: blocking changes nothing for
  anyone else. If you made the crew, "Block Jo?" also offers **Remove Jo from the crew**, which
  opens the usual removal confirmation (the same rekey as from the home screen).

### 4. Where you block someone

- **A crew mate's options** (hold their face on the home screen): "Block Sam" (or "Unblock Sam"),
  next to Remove.
- **A chat message:** hold someone else's bubble (crew chat or a private thread) for a menu with
  "Block Jo". The screen reader calls it "Options for Jo".
- **A private thread:** tap their name at the top, or hold one of their messages.
- **A photo or clip:** "Block Jo" under it, in the viewer and in the Story.
- **Settings → Blocked people**, with Unblock for each. The row sits after the test-build tools
  (just before About), so the Settings screenshots, drawn from a test build, stay identical; in a
  release build it follows the emergency contact.

### 5. Screens

New screenshot tests in `ScreensSnapshotTest` (every language): `moderationMenu`,
`blockConfirm`, `smallPhoneLargeFontBlockConfirm`, `blockedPeople`,
`smallPhoneLargeFontBlockedPeople`, `blockedPeopleEmpty`. No existing screen changes when nobody is
blocked: the hold and tap handlers draw nothing, and the lists are passed through unchanged.

### 6. Community rules, once

- Shown **before the first post**, not at install: the crew chat's Send (and its plan), a private
  message's Send, and a photo's or clip's Send (`MomentFlow`, which also covers photos shared
  from another app). Whatever was being posted waits and goes the moment they tap **I agree**;
  **Not now** drops it (the text box was already cleared, a known small cost).
- Remembered on the phone as the version agreed to (`CommunityRules.VERSION`): changing the rules
  and raising the version asks everyone again.
- Three rules in plain words (harassment, bullying or hate; anything illegal or sexual involving
  anyone under 18; threats or violence), that anyone in the crew can report a post and reports
  may be reviewed, that breaking the rules can get you blocked from Moshpoint, and the privacy
  policy link (`BuildConfig.PRIVACY_POLICY_URL`).

### 7. Report

- **Where:** the same places as Block. Holding a message (crew chat or private) or tapping a
  private thread's name opens a menu with **Report this message** (or **Report Jo**) and Block;
  a photo or clip has **Report or block**; a crew mate's options have **Report Sam**.
- **The sheet:** six reasons (harassment or bullying, hate, sexual content, violence or threats,
  spam, something else), an optional note (300 characters), then plainly what is sent and that
  it's kept 90 days, and **Also block Jo** (off by default: you may want a mate warned, not
  hidden). Send waits for a reason.
- **What is sent** (`Reporting`): the message text, or the photo at most 800 px, or four frames of
  a clip (start, a third, two thirds, near the end) at most 480 px, with the caption; the
  sender's name and crew signing key (hex); `SHA-256("moshpoint-report-crew:" + crew id)`;
  the posted time; the reason, note and app version. **Not** the reporter's name, key, address or
  install. A clip's frames, not the clip: a whole video is too big for the relay's small-request
  path, and frames are enough to judge it.
- **Which relay:** the one the app uses, free or paid (both run the same server). A build on the
  public ntfy.sh fallback can't report (it says the report couldn't be sent).
- **The relay** (`Reports.kt`): `POST /v1/report` checks the JSON (known reason and kind, key and
  hash in hex, JPEGs only, sizes), stores one file per report under `reports/` on the volume,
  and answers 201 with its id. 5 at once then 20 a day per install, 20 at once then 200 a day
  per address (today's builds send no install token, so the address applies); at most 2,000
  stored; swept after 90 days. Nothing about the reporter is written down.
- **Admin:** `GET /v1/admin/reports?limit=` and `DELETE /v1/admin/reports/{id}` need
  `Authorization: Bearer <MOSHPOINT_ADMIN_TOKEN>`, compared in constant time (SHA-256 of both,
  `MessageDigest.isEqual`). No token set: those routes answer 404, as if absent. Wrong or
  missing token: 401. How the owner uses them: [MODERATION.md](MODERATION.md).

## Later

- **Sign moments** (a signed trailer that older builds ignore), so a photo or clip is matched by key,
  not by name.
- Flares from a blocked person still show on the map (they are a fixed list of vibes).
- Blocking an install at the relay, and reaching the *sender* of reported content there: see
  MODERATION.md, "Next".
- A report waits for signal like nothing else does: today it's sent or it fails (try again).
