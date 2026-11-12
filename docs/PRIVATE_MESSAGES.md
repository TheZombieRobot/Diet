# Private messages: decisions

Step 4 of "Decided next (November 2026)" in [ROADMAP.md](ROADMAP.md). Tap a crew mate, choose
**Message Sam**, and you get a one-to-one chat that only the two of you can read. It goes over the
internet normally and over Bluetooth when you're near each other with no signal, and each of your
messages shows **Sent**, **Sent nearby** or **Waiting for signal**, like crew chat. Nothing to set up.

Decisions were made without stopping to ask, as instructed. Each is recorded here with the reason,
so it can be changed later. **Nothing here has run on a real phone yet.**

## Status and next steps

_Handover, kept current at every push. Branch `claude/private-messages-p7m2xd`, started from
`ccr-5839ed7c-1q0ztj` at `849390a`._

| Step | State |
|---|---|
| 1. This note: a decision for each hard problem | **done** (first version; corrected as the code lands) |
| 2. Core: sealing and opening (`GigGroup.sealPrivate` / `openPrivate`, `ENV_PRIVATE`), the private mailbox id, `PrivateRule`, `PrivateBook` (threads, replays, pending senders, mute, unread), with tests | **done.** `GigGroup` (additions only), `CrewKeys.agree(…, label)`, `core/Private.kt`; `PrivateTest` (21 tests) passes here and in CI |
| 3. Core: the courier carries it (`KIND_PRIVATE`, `Box.PRIVATE`, receipts, re-seal after a rekey), `CourierSimTest` cases incl. older builds | **done.** `Courier`: `Message.pm`, `KIND_PRIVATE`, `Box.PRIVATE` (held like the chat: 180 for helpers), no crowd hops, a rekey re-wraps ours in the new envelope, `letGo`; 9 new `CourierSimTest` cases; the whole core suite passes locally |
| 4. App: `PrivateMessages` adapter (store, relay fetch in `ChatSync`, courier hook-up, notifications, mute), screens (options dialog, finder, thread), `strings_private.xml` in 20 folders | **done; green in CI** (run 259 on `1ddd6c3`: translations, core + server tests, phone debug and release with the debug-text check, licences, screenshots; watch debug, release and screenshots). `PrivateMessages.kt`, `ui/PrivateChatUi.kt` (+ `UnreadBadge`), hooks in `OfflineMessages`, `ChatSync.pollAll`, `CrewRekey.migrate`, `GroupSync`, `Crews.dropExpired`, `CrewNotifications`, `MainActivity`, `FriendsScreen` / `HomeSections`, `FinderScreen`; `CrewChatUi.ChatLine` now internal |
| 5. Screenshot tests (`PrivateSnapshotTest`, own package, every language) | **done; drawn by CI** (runs 259 and 260): 5 screens in 21 languages, all 105 looked at. One fix from them: the thread header cut "only you two can read it" short in 8 languages (German, both Spanish, French, Indonesian, Dutch, Polish, Portuguese); since `481abcd` the line wraps and a long Unmute takes two lines, checked again in every language |
| 6. Field test (two phones), roadmap, architecture and privacy notes | **done.** `FIELD_TEST_PLAN.md` section 4e and a known limit; `ROADMAP.md` step 4 status; `ARCHITECTURE.md` section; `PRIVACY.md` paragraph; a "Private messages" section at the end of each `docs/i18n/*.md` for native reviewers |
| 7. CI green, report sent | **done.** CI green on runs 259 (`1ddd6c3`) and 260 (`481abcd`). Before them, run 258 failed one core test: `PrivateTest.aMutedMateStillArrivesButNeverNotifies` sent two messages in the same second, and since the id is a hash of a freshly keyed body their order (by id within a second) was a coin toss; fixed in `1ddd6c3` (the second one a second later, as a phone stamps it), then 15 clean runs of the private and courier tests here. Report sent to the session that asked for this step |

**Exact next step:** nothing left to build for step 4. What remains is the field test on real phones (section 4e of `FIELD_TEST_PLAN.md`) and a native speaker's read of the translations (the "Private messages" section at the end of each `docs/i18n/*.md`); then review and merge. If the field test finds something, the rules are in core (`Private.kt`, `GigGroup` private part, `Courier`) with their tests, and the app side is `PrivateMessages.kt`.

How to work on it: `core` and `server` tests run here with a scratch Gradle settings file that
includes only `:core` and `:server` and points its version catalogue at
`gradle/libs.versions.toml` (the Android modules can't be built in this container: Google's Maven
host is blocked). The app and the watch are compiled, tested and drawn by CI on every push.
CI commits changed screenshots back to the branch: `git pull --rebase` before pushing.

## What you see

- **Starting one.** On the home screen, hold a crew mate's face (or tap ⋯): **Message Sam** is the
  first choice. In the finder, when it's showing just Sam, a **Message Sam** button sits under
  their name. No new tabs.
- **The thread** looks like the crew chat (same bubbles, faces and states) with Sam's name on top
  and "Private · only you two can read it" under it. No plan, flares or quick pings: just the two
  of you. **Mute** is at the top right.
- **A new message** buzzes like crew chat, one notification per person, updated in place. On a
  locked phone set to hide sensitive content it says only "Private message". Sam's face on the
  home screen and the finder's **Message Sam** button carry a count of unread messages.
- **Your messages** show **Waiting for signal**, **Sent nearby** or **Sent**, exactly as in the
  crew chat. **Not sent** (rare: three days without reaching anyone) takes a tap to try again.

## Decisions on the hard problems

### 1. Sealing to one person

**Checked in the code:** `GigGroup.sealDirect` (used for "keep as friend" and rekey notices) is
static-static ECDH inside the crew-key layer, and puts the recipient's tag and the sender's public
key in that crew-readable layer: every crew member sees who is writing to whom. It has no
signature and no message id. `GigGroup.ENV_PRIVATE = 16` was reserved in the `mp2` envelope for
this step. Signing keys are P-256, one per person per crew (`Identity.signer`), kept across a
rekey; `CrewKeys.agree` does ECDH and hashes it with a label.

**Decision: ephemeral-static ECDH to the recipient's crew signing key, signed by the sender, inside
an `mp2` envelope of type `ENV_PRIVATE`.** `sealDirect` and its users are untouched.

```
crew-key layer (mp2 envelope, as every new crew message):  [time:4][nonce:8] AES-GCM(type 16, body)
body, which any crew phone can read:   [ver:1][ephemeral key:33][sealed part]
sealed part, only the recipient opens: AES-GCM( [sender key:33][signature:64][time:4][len:2]
                                                [kind:1][text length:1][text] [zero padding] )
message id = the first 8 bytes of SHA-256("mp-pm1 id", body)
```

- **Sealing.** A fresh P-256 key pair for every message. The sealed part's key and nonce come from
  ECDH between that ephemeral key and the recipient's crew signing key (`CrewKeys.agree` with its
  own label, `"mp-pm1"`), run through HMAC-SHA-256 with the ephemeral key and the recipient's key.
  The ephemeral private key is dropped as soon as the message is sealed. The sealed part is bound
  (associated data) to the version and the ephemeral key in front of it.
- **Signed.** The sender's key and signature are inside the sealed part only. The signature covers
  `"mp-pm1"`, the time, **the recipient's key** (so the recipient can't pass it on to a third mate
  as if it had been sent to them) and the fields. Readers take the fields they know and ignore
  anything a later version adds under the signature.
- **Not bound to the crew key, on purpose.** Everyone has a different signing key in every crew,
  so a message sealed to Sam's key in one crew opens nowhere else; across a rekey (same crew, same
  signing keys) the *same body* goes into the new key's envelope, so it keeps its id. The time the
  sender signed is inside; the envelope's own time, which anyone with the crew key could change by
  re-wrapping, is only what carrying phones go by.
- **Who can open what.** Strangers and the relay: nothing (crew key). Crew members: the envelope
  (version, ephemeral key, the envelope's time), never who sent it, who it's for or the time they
  signed. The ephemeral key is random and fresh, so nothing in it points at either person. The
  recipient: everything.
- **Finding your own messages in a crew of up to 30** is one key agreement per new message (well
  under a millisecond on a phone), then an AES-GCM check that fails at once if it isn't for you.
  Each blob is opened once: the courier remembers what it has looked at (by a hash of the bytes).
  Rejected: a pairwise key with trial decryption (one cheap AES try per crew mate per message). It
  saves the ephemeral key, but anyone who later gets either phone's key could read the whole
  conversation in both directions; with an ephemeral key, the sender's key can't open what they
  sent. Rejected: a short recipient hint to skip the key agreement. It needs the sender's key ahead
  of time, so a message from a mate whose phone we haven't heard yet couldn't even be recognised.
- **The message id is a hash of the body.** Any crew phone can work it out (to carry, de-duplicate,
  confirm and upload it); it's the same for every copy and route, and after a rekey (the same body
  in a new envelope); and nothing else can claim it. That last point is why it isn't random, which
  the first version of this note chose: a random id in the crew-readable part let a hostile crew
  mate post junk under a real message's id ahead of it, so the recipient's phone took the real one
  for a copy it already had and never showed it (`CourierSimTest` now tries exactly that). Nor is it
  worked out from the contents, as crew message ids are: a crew mate who sees the id could then
  test guesses ("did Jo send Sam 'meet at the bar' at 9:41?"). The sender's phone keeps the body
  until the relay has it, so a retry sends the same bytes with the same id.
- **Padding: every private message is exactly 352 bytes**, whatever it says (text up to 160 bytes,
  the same limit as crew chat; up to 140 characters). The size gives nothing away. It's two
  Bluetooth packets, like most crew chat lines. Rejected: a short size for "ok": it would save one
  packet's airtime on tiny messages and tell everyone which messages are tiny.
- **Replays.** The same body again, in any envelope: the same id, dropped (the phone remembers the
  ids it has had for as long as the crew lasts, and refuses anything signed longer ago than the relay
  keeps messages, 73 hours, whatever the envelope says). Any change to the body: another id, and the
  sealed part doesn't open. Forged: needs the sender's private key. Altered: AES-GCM on both layers
  and the signature.
- **Forward secrecy, plainly.** Because each message has its own key pair, thrown away once it's
  sealed, someone who later gets the *sender's* phone or keys can't open what they sent (beyond the
  copy shown in the sender's own thread). What you *receive* is opened with your crew signing key,
  which stays on your phone while the crew lasts. So someone who has kept copies of the relay's
  records and then gets your phone, or that key, before the crew ends can read what was sent to
  you: the same messages that are in your threads on that phone anyway. When the crew ends its keys
  and threads are deleted from the phone (ordinary app storage, not a guaranteed wipe), and the
  relay has forgotten the records by then (72 hours at most; the public relay 12). **There is no
  ratchet:** no forward secrecy for the receiver within a crew, and no recovery if a key is stolen
  while the crew lasts. That is weaker than Signal. The reason: the courier carries one sealed copy
  to someone who may be offline for hours, and a ratchet needs both phones to agree new keys
  first.
- **Not deniable.** Like crew chat, a message carries the sender's signature, so the recipient could
  show someone else that it really came from the sender.

### 2. The relay

**Checked in the code:** the held mailbox (`/v1/held`) keeps 200 records of 16 to 4,000 bytes per
id for 72 hours, a byte-identical PUT replaces rather than duplicates, `heldlookup` takes 64 ids;
PUTs are limited per address to a 120 burst then 2 a second, lookups to 60 then 1 a second
(`Main.kt`). `ChatSync.pollAll` fetches every crew's chat mailbox (today and yesterday) in one
`lookupHeld` (chunks of 60 ids): about every 10 to 20 seconds while a chat is open, every 2 minutes
while the app is open (`GroupSync.syncServer`), about hourly in the background (an inexact alarm).

**Decision: one private mailbox per crew per day, which every crew phone fetches whole.**

- Its id is `GigGroup.privateIdForDay(day)`: HMAC of the crew key with its own label and the UTC
  day, 16 bytes. Nothing in the id links it to the crew's other mailboxes or to the next day's.
  Uploads go to the one valid at upload time; readers fetch today's and yesterday's.
- **Why not a mailbox per pair:** whoever posts to the Jo–Sam mailbox is talking to the other
  person in it. The relay sees both phones fetch that mailbox, so every message posted there tells
  it exactly who wrote to whom. With one mailbox for the whole crew, everyone fetches everything,
  and the relay learns only that someone in the crew sent a private message. The cost is that each
  phone looks at every private message in its crew (one key agreement each, once), and crew members
  can count them. It's also cheaper: 2 ids per crew in the request the chat already makes, instead
  of 58 for a crew of 30.
- **Why not the crew chat's own mailbox:** it would hide which posts are private, but it holds 200
  records a day and a busy crew already fills much of that with chat lines and History copies.
  Private messages pushing chat out (or the reverse) is worse than the relay knowing which mailbox
  is which.
- **Fetched in the same request as the crew chat** (`ChatSync.pollAll`), so it costs no extra
  request until a phone is in more than 15 crews: the same 10 to 20 seconds with a chat or a private
  thread open, 2 minutes with the app open, about an hour in the background. Every crew you're in,
  not only the main one: a mate whose main crew is your Up next crew can still reach you. Not for
  crews you follow from home (hard problem 6).
- **What the relay learns:** that this crew sends private messages, how many, when, all exactly
  352 bytes, and the internet address each was posted from (the author's, or a crew phone that
  carried it and uploaded it). It can't read them or tell who they're for. Because the private
  mailbox rides in the same request as the chat mailbox, a relay that kept records could tell the
  two apart (and link a crew's mailboxes within a day, as it already can from the chat). A relay
  that records addresses and times could guess that two addresses posting turn about are talking to
  each other; it can't read or prove it, and on mobile data many phones share one address.
- **Limits:** 200 private messages per crew per day on our own server (the oldest drop off; phones
  fetch far more often than that fills, except in a huge, chatty crew). A crew phone uploading for
  others never fills it past 180, like the chat. Every fetch returns the whole of today's and
  yesterday's mailbox, 352 bytes a message (a busy crew's 200 messages is 70 KB a fetch), as the
  chat does with its History copies.
- **For a day after a rekey,** the old key's private mailbox is still read, like its chat mailbox,
  and only messages from the people allowed then (`RekeyPolicy.allowlist`) are shown. Nothing is
  ever written under the old key.
- **No server change.** The held mailbox already takes these records and these sizes; older apps
  never ask for the new mailbox.

### 3. Bluetooth

**Checked in the code:** `Courier` carries crew messages for the main crew only, in 2 fragments
when long; chat goes out with no crowd hops (crew phones only), pings and pins with 4 or 5; a crew
phone that takes a message sends a sealed receipt, which is what turns "Waiting for signal" into
"Sent nearby"; with no signal a phone says what it holds about once a minute and crew phones in
range send what it lacks; the first phone back on signal uploads after a random wait and a fresh
look at the mailbox; `Courier.handle` treats every envelope type but `ENV_HERE` as a control packet
and ignores types it doesn't know.

**Decision: carried like crew chat, by crew phones only, never through strangers' phones.**

- **Which phones carry it:** every crew phone in range (main crew, live, Bluetooth 5 adverts), as
  for crew chat. They can't read it, but they can open its envelope, so they know its id and time
  and can carry, confirm and upload it. **The recipient's phone behaves exactly like any other
  carrier** (takes it, confirms it, carries it, may upload it), so watching phones' behaviour says
  nothing about who it was for.
- **Never through strangers:** it goes out with no crowd hops. Strangers' phones only ever pass on
  single-packet messages anyway, and this is always two packets. Same as crew chat; the roadmap
  rules out venue-wide chat through strangers.
- **"Sent nearby"** means what it means for crew chat: a crew phone nearby has confirmed it holds
  the message, and it will be uploaded by whichever phone gets signal first. It doesn't say whether
  that phone was Sam's: the receipt can't say so without telling the crew who the message was for.
- **Receipts** are the courier's ordinary ones (ids only, sealed with the crew key, no hops).
- **The first phone back on signal uploads it**, to the crew's private mailbox, by the same rules as
  chat: the author first; a helper after a random 10 to 60 seconds, a fresh look at the mailbox,
  five at a time; never past 180 records. A crew phone's word that it uploaded ours is checked at
  our next look at the private mailbox.
- **Priority** on air and for uploads is the chat's: after safety pings, pins and quick pings.
  Carried for 24 hours; our own keeps trying for three days, then says "Not sent".
- **After a rekey** the author's phone puts its unsent private messages, unchanged, in the new key's
  envelope: same ids, nothing to sign again (the courier does it itself; it can't open them, since
  they're sealed to the recipient, and doesn't need to). One to someone who was removed is let go
  first. Carriers drop other people's old-key copies, as for crew chat.
- Nothing new on air: the relay's existing advertising set and scan, version 2 packets, no hops. A
  listener who knows the format can tell a private message from other crew messages by its size;
  not who sent it or who it's for.

### 4. States and history

- **States:** Waiting for signal → Sent nearby → Sent, and Not sent, with the same rules and stored
  numbers as crew chat (`OutboxState`). Sending… shows only while the first upload is under way.
- **No "Delivered", no "Read".** Telling the sender would mean the recipient's phone posting a
  receipt: one more upload per message on a relay budget that is tight on the public relay, and
  its timing (Sam's phone posts just after Jo's message lands) would show the relay who answers
  whom, undoing the point of hard problem 2. A Bluetooth receipt that said "the recipient has it"
  would tell the whole crew who the message was for. And with phones in pockets and the background
  check hourly, a missing tick would worry people for nothing. Could be added later as a sealed
  private receipt posted after a random delay.
- **Where threads are kept:** on the phone only, one store per crew (the app's private storage,
  with crew chat). The rules (ids, order, replays, mute, unread) are core `PrivateBook`. One thread
  per crew mate, the last 300 messages.
- **For how long:** as long as the crew. When the crew ends (or you leave, or End night), its
  threads, its mutes and its keys are deleted. Private threads are **not** kept in Your gigs: the
  gig archive keeps photos and clips, not conversations, and a private conversation shouldn't
  outlive the night by default.
- **Someone removed:** the crew moves to a new key without them (`CrewRekey`). Signing keys don't
  change, so every other thread moves to the new key untouched. Their thread is deleted along with
  their key and name (`CrewChat.dropKeys` does the same for chat), and they can't send any more:
  they don't have the new key, and the old key's mailbox is only read for a day, from the allowlist.
- **A message from someone who isn't (or is no longer) a crew mate isn't shown.** The sender must
  be a crew mate on this phone: in the main crew, someone whose intro we've had (not someone
  following from home, not someone removed); in an Up next crew, someone known in its chat. A
  signed message from a key we don't know *yet* (a mate who joined a minute ago) waits, unshown,
  until their intro arrives, then appears; if they never turn out to be a mate it's dropped with
  the crew.

### 5. The screens

- **Two ways in**, both where you already look at one mate:
  - **Home screen:** hold a crew mate's face (or tap ⋯ on a friend row): **Message Sam** is first
    in the options. The face shows a small count of unread private messages.
  - **Finder**, showing one mate (you tapped them): **Message Sam** under their name, with the
    unread count. This is the literal "tap a mate, then Message Sam".
  - Not on the map's list: its rows already carry Walk, Find and Ask, and a fourth button would
    crowd them.
- **The thread** reuses the crew chat's bubbles (`ChatLine` in `ui/CrewChatUi.kt`), faces, colours
  and state lines, so it looks like a quieter crew chat: header with their name, "Private · only you
  two can read it", **Mute**/**Unmute**; the crew chat's no-signal note when it applies; the text
  box. Followers never see it.
- **Notification:** like crew chat's (`ChatSync.notifyCrew`): one per thread, updated in place,
  "Sam · private" with the text, or "3 new private messages" with the latest lines. Same channel as
  crew messages. **Lock screen:** marked private with a public version that says only "Private
  message" (no name, no words), so a phone set to hide sensitive content on the lock screen shows
  nothing else. On a phone set to show everything, it shows like any messaging app (that is the
  phone's own setting for every app). Not while that thread is on screen, never for a muted person.
- **Unread mark:** a count per person, cleared when you open the thread.

### 6. Who

- **Crew mates only, both in the same crew,** on gig day or before it (a crew asleep until the gig
  still has its tiles and its options). You start a thread from your main crew's tiles; a message
  that arrives in an Up next crew is kept and notified, and you can reply from it.
- **People following from home: neither send nor receive.** Following is watch-only by design
  (they can read the crew chat but not post, and they're never findable); a private line from home
  into the crew would turn it into a two-way role nobody agreed to. They see no **Message** option,
  their phones don't fetch the private mailbox, and a private message signed by a follower's key
  isn't shown (in the main crew they're not crew mates; see the known limit for Up next crews).
- **Mute one person, on your phone only:** their private messages still arrive and are kept in the
  thread (you can read them whenever you open it), but they never notify, buzz or count as unread.
  Nothing is sent: they aren't told and still see "Sent". Unmute from the same place. To stop
  someone for real, the crew's creator can remove them.

### 7. Older builds

- **Builds from before the courier** can't open an `mp2` envelope at all (other key, other label).
- **Builds with the courier** open the envelope over Bluetooth, see a type they don't act on and
  ignore it (`Courier.handle`: control types 1 to 3 only); they don't carry it, confirm it or show
  it. On the relay they never look: the private mailbox is new.
- **Nobody's build shows it as a crew message.** A private message tried as a ping, pin, intro,
  History bundle or "keep as friend" fails to open (tested), and the I'm-here reader rejects its
  type.
- `CourierSimTest` runs an older courier (one that doesn't know the type) beside new ones: it
  ignores private messages without errors and keeps carrying crew chat.
- **Known limit:** a crew mate on a build from before private messages never sees them, and the
  sender's phone can't tell (it shows "Sent" once the relay has it). The app isn't on the Play Store
  yet, so at launch everyone has the same version.

## Privacy, in one place

- End-to-end: only the recipient opens it; signed by the sender; the crew sees neither name.
- New on the relay: one mailbox id per crew per day, records of one size. No new stable
  identifier anywhere; nothing that links a person across crews (signing keys are per crew).
- New on air: nothing but version 2 relay packets in the existing advertising set.
- On the phone: threads and mutes, per crew, deleted with the crew.

## Tests

In core (these can fail CI):

| File | What it proves |
|---|---|
| `PrivateTest` (21) | Only the recipient opens it: not another crew mate, not its sender, not another crew. Every message is 352 bytes whatever it says, two Bluetooth packets; long text cut at 160 bytes on a character boundary. What any crew phone can read (id, the envelope's time) holds no key or tag of either person, nor the signed time; the same words sealed twice share nothing; a message for Sam and one for Alex look the same. The format built by hand from this note opens. Forged: someone claiming another's key, a message re-sealed to a third mate (the signature names its recipient), a signature for another time, Sam's key in another crew, sent to yourself. Altered: another version or ephemeral key, any byte of either layer, cut short or lengthened; re-wrapped with another envelope time it's the same message with its signed time. Replayed: the same bytes, the same body in a newer envelope, after a restart, and anything signed more than 73 hours ago. One id for every copy and after a rekey (the same body in the new envelope); nothing else can claim a message's id (500 altered copies). The private mailbox: its own, per day, per crew, per key, pinned to its label. Older builds: not a ping, pin, History, intro, moment, "keep as friend" or "I'm here"; `sealDirect` unchanged. Garbage and other envelopes aren't private messages; a later version is carried but not opened; later fields under the signature are read; an unknown kind isn't shown. The book: one thread per mate in the order every phone shows (a future clock sorts at arrival); unread and read; on screen neither unread nor announced; mute (still kept, never notified, survives a restart, undone); a sender not yet known waits and appears when they are, and someone who never is (following from home) is never shown; someone removed loses their thread and isn't shown again; our own states only move forward; everything survives a restart and garbage loads as nothing; 300 per thread. |
| `CourierSimTest` (9 new) | Through the relay only the recipient is shown it (the crew's private mailbox, not the chat's, one upload). With no signal it hops along crew phones that can't read it, "Sent nearby" from their receipt, the first back on signal uploads it, and its author doesn't upload it again. The recipient carries and confirms exactly like any other crew phone. It never crosses a stranger's phone (Need help still does). After a rekey our unsent one goes in the new key's envelope with its id, never under the old key, and one to someone being removed is let go. A hostile crew phone posting altered copies, and the real one in a newer envelope, ahead of it can't hide it from its recipient. A helper never fills the private mailbox past 180. Ours survive a restart, and the recipient isn't shown it twice after one. A build that doesn't know the type ignores it without errors, carries nothing, and the chat carries on. |

In app (rendered by CI, never gating): `PrivateSnapshotTest` and its `Lang_xx` subclasses draw, in
every language, the thread with no signal (Sent, Sent nearby, Waiting for signal under the crew
chat's note: `privateThread`), a new thread (`privateEmpty`), a muted one with "Not sent"
(`privateMuted`), a crew mate's options with **Message Sam** first and the count on their face
(`privateOptions`), and the finder's **Message Sam** (`privateFinder`); `Lang_de.privateTranslationsLoad`
guards that the translations load.

## Shared files this branch touches

Everything else is new (`core/Private.kt`, `PrivateTest.kt`, `app/PrivateMessages.kt`,
`ui/PrivateChatUi.kt`, `strings_private.xml` in 20 folders, `privatemsg/PrivateSnapshotTest.kt`,
this note).

| File | Change |
|---|---|
| core `GigGroup.kt` | Additions only: `privateIdForDay`, `Private`, `PrivateOuter`, `sealPrivate`, `privateBody`, `wrapPrivate`, `privateOuterOf`, `privateOf`, `openPrivate`, `privateId`, the constants. `ENV_PRIVATE` keeps its number. |
| core `CrewKeys.kt` | `agree(…, label)`; the old `agree` calls it with its old label, so `sealDirect` is byte-for-byte unchanged. |
| core `Courier.kt` | `Message.pm` (and `kind`/`timeSec`/`sender` no longer assume a pin when nothing else is set), `KIND_PRIVATE`, `Box.PRIVATE`, `letGo`, the held-mailbox room counted per box, and the private kind in open / post / handle / hops / receipts / rank / carry / rekey (re-wrapped, not re-signed). |
| core `CourierSimTest.kt` | The simulated relay treats the private box as held; a phone can send private messages; nine tests appended at the end. |
| app `OfflineMessages.kt` | `fetchedPrivate`, `letGo`, uploads to `Box.PRIVATE`, deliveries and states to `PrivateMessages`, a name in the route log. |
| app `ChatSync.kt` | The private mailboxes (and the old key's, during the day of grace) ride in `pollAll`'s one lookup, after everything else; `PrivateMessages.retryOutbox`. |
| app `CrewRekey.kt` | One line in `migrate`: the threads move (without the removed, whose unsent messages are let go) before the courier re-wraps ours. |
| app `GroupSync.kt`, `Crews.kt` | Threads are forgotten with the crew (End night, leave, an Up next crew that ended); a new intro shows messages that waited for it. |
| app `CrewNotifications.kt` | Two optional parameters: the private thread to open, and the lock screen's public version. |
| app `MainActivity.kt` | The thread overlay, the two entry points (`onMessage`), the notification intent (`EXTRA_OPEN_PRIVATE`). |
| app `ui/CrewChatUi.kt` | `ChatLine` is `internal` instead of `private`, so the thread can use it. |
| app `ui/FriendsScreen.kt`, `ui/HomeSections.kt`, `ui/FinderScreen.kt` | Optional parameters with defaults: **Message Sam** in the options, the count on a face, the finder's button. |
| docs | `ROADMAP.md` (step 4 status), `FIELD_TEST_PLAN.md` (section 4e, a known limit), `ARCHITECTURE.md` (a section), `PRIVACY.md` (a paragraph, the date), `i18n/*.md` (a section at the end of each, for native reviewers). |

## Known limits

- A mate on a build from before private messages never sees them (hard problem 7).
- No "Delivered" or "Read" (hard problem 4), no forward secrecy for the receiver within a crew
  (hard problem 1).
- In an Up next crew a "crew mate" is anyone known in its chat, which can include someone following
  it from home (their app doesn't offer private messages; only a modified app could send one).
- Over Bluetooth, someone watching a phone may see a private message go on air as its owner taps
  send; nothing on air says who it's for.
- A relay that records addresses and times could guess who is talking to whom from turn-taking.
- Like the rest of the app this was written where the Android SDK can't be downloaded: the app is
  compiled, and its screens drawn, only by CI; core tests run here and in CI.
