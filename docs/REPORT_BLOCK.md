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
| 1. Block (app only) | **pushed** at `5c4ceec`, CI run 320: secrets, translations, core and server tests and the debug build passed; screenshots pending at this push |
| 2. Community rules before the first post | **pushed with this commit** for its own CI run (core `CommunityRules` + test pass locally) |
| 3. Report (sheet, relay endpoints, server tests) | written (10 server tests pass locally), pushed next |
| 4. Docs (MODERATION.md, PRIVACY.md, PLAY_STORE.md, SECRETS.md, FIELD_TEST_PLAN.md 4j) | written, pushed with stage 3 |

**Exact next step:** check run 320 (Stage 1) and this commit's run (Stage 2): both green, and
every old screenshot byte-identical to `origin/ui-screenshots` (compare the branch's
`ui-screenshots-claude-ugc-moderation-b5k8q2`), the new ones looked at in every language
(`moderationMenu`, `blockConfirm`, `smallPhoneLargeFontBlockConfirm`, `blockedPeople`,
`smallPhoneLargeFontBlockedPeople`, `blockedPeopleEmpty`; stage 2: `communityRules`,
`smallPhoneLargeFontCommunityRules`). If Stages 3 and 4 aren't on the branch yet, they are on the
local branch `backup-ugc-all` (commits `894af2e` and `c0c6cae`): cherry-pick them.

How to work on it:
- `core` and `server` tests run here with a scratch Gradle build that includes only `:core` and
  `:server` and points its version catalogue at `gradle/libs.versions.toml` (a `settings.gradle.kts`
  with `project(":core").projectDir = file("<repo>/core")` and the same for `:server`). The app
  and the watch can't be built here (Google's Maven host is blocked): CI builds them on every push
  without `[skip ci]`.
- CI commits changed screenshots to `ui-screenshots-claude-ugc-moderation-b5k8q2`; compare with
  `git fetch --filter=blob:none origin ui-screenshots <that branch>` and `git diff --stat`.
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

## Later

- **Sign moments** (a signed trailer that older builds ignore), so a photo or clip is matched by key,
  not by name.
- Flares from a blocked person still show on the map (they are a fixed list of vibes).
