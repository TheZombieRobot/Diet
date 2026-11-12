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
| 2. Core: sealing and opening (`GigGroup.sealPrivate` / `openPrivate`, `ENV_PRIVATE`), the private mailbox id, `PrivateRule`, `PrivateBook` (threads, replays, pending senders, mute, unread), with tests | not started |
| 3. Core: the courier carries it (`KIND_PRIVATE`, `Box.PRIVATE`, receipts, re-seal after a rekey), `CourierSimTest` cases incl. older builds | not started |
| 4. App: `PrivateMessages` adapter (store, relay fetch in `ChatSync`, courier hook-up, notifications, mute), screens (options dialog, finder, thread), `strings_private.xml` in 20 folders | not started |
| 5. Screenshot tests (`PrivateSnapshotTest`, own package, every language) | not started |
| 6. Field test (two phones), roadmap, architecture and privacy notes | not started |
| 7. CI green, report sent | not started |

**Exact next step:** step 2, core sealing in `GigGroup.kt` and `core/Private.kt`, with `PrivateTest.kt`.

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
body, which any crew phone can read:   [ver:1][id:8][ephemeral key:33][sealed part]
sealed part, only the recipient opens: AES-GCM( [sender key:33][signature:64][len:2]
                                                [kind:1][text length:1][text] [zero padding] )
```

- **Sealing.** A fresh P-256 key pair for every message. The sealed part's key and nonce come from
  ECDH between that ephemeral key and the recipient's crew signing key (`CrewKeys.agree` with its
  own label, `"mp-pm1"`), run through HMAC-SHA-256 with the id, the ephemeral key and the
  recipient's key. The ephemeral private key is dropped as soon as the message is sealed.
- **Bound to its outside.** The sealed part's associated data is the crew's signing tag, the time,
  the version, the id and the ephemeral key, so nobody can move it under another id, time or crew.
- **Signed.** The sender's key and signature are inside the sealed part only. The signature covers
  `"mp-pm1"`, the crew's signing tag (so it only counts in this crew), the time, the id, **the
  recipient's key** (so the recipient can't pass it on to a third mate as if it had been sent to
  them) and the fields. Readers take the fields they know and ignore anything a later version adds
  under the signature.
- **Who can open what.** Strangers and the relay: nothing (crew key). Crew members: the envelope
  (version, id, ephemeral key, time), never who sent it or who it's for. The ephemeral key is
  random and fresh, so nothing in it points at either person. The recipient: everything.
- **Finding your own messages in a crew of up to 30** is one key agreement per new message (well
  under a millisecond on a phone), then an AES-GCM check that fails at once if it isn't for you.
  Each blob is opened once: the courier remembers what it has looked at (by a hash of the bytes).
  Rejected: a pairwise key with trial decryption (one cheap AES try per crew mate per message). It
  saves the ephemeral key, but anyone who later gets either phone's key could read the whole
  conversation in both directions; with an ephemeral key, the sender's key can't open what they
  sent. Rejected: a short recipient hint to skip the key agreement. It needs the sender's key ahead
  of time, so a message from a mate whose phone we haven't heard yet couldn't even be recognised.
- **The message id** is 8 random bytes (never 0) chosen when you send. It's in the crew-readable
  body so crew phones can carry it, de-duplicate it and confirm it (receipts, "what I have"), and
  it's under the signature so nobody can change it. It is the same for every copy and route, and
  after the crew moves to a new key (the author's phone signs it again under the new key with the
  same id). Random rather than worked out from the contents, as crew messages are, because a crew
  mate who sees the id could otherwise test guesses ("did Jo send Sam 'meet at the bar' at 9:41?").
- **Padding: every private message is exactly 352 bytes**, whatever it says (text up to 160 bytes,
  the same limit as crew chat; up to 140 characters). The size gives nothing away. It's two
  Bluetooth packets, like most crew chat lines. Rejected: a short size for "ok": it would save one
  packet's airtime on tiny messages and tell everyone which messages are tiny.
- **Replays.** Same bytes again: the same id, dropped (the phone remembers the ids it has had for
  as long as the crew lasts, and refuses anything older than the relay keeps messages, 73 hours).
  The same message re-wrapped with a new id or time: the sealed part doesn't open (its associated
  data names them) and the signature fails. Forged: needs the sender's private key. Altered: AES-GCM
  on both layers and the signature.
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
- **After a rekey** the author's phone signs its unsent private messages again under the new key,
  with the same ids (the courier asks the app to re-seal them from the thread, since it can't open
  them itself: they're sealed to the recipient). Carriers drop other people's old-key copies, as
  for crew chat.
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

_To be filled in as they land._

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
