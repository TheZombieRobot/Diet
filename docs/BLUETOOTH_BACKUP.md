# Messages without signal (Bluetooth backup): design note

Step 1 of "Decided next (November 2026)" in [ROADMAP.md](ROADMAP.md). This note records the
decision on each hard problem, with the reason. Where it differs from the roadmap text, the
reason is given. The code review in [BLUETOOTH_BACKUP_REVIEW.md](BLUETOOTH_BACKUP_REVIEW.md)
(14 items) is answered item by item in the second half.

It was written before the code and then corrected to match what was built. What is done,
what is only checked by tests, and what still needs real phones is at the end, under
[Status](#status-and-next-steps).

## What gets built, in short

- Crew chat, quick pings and the meet-up pin are **sealed and signed once**. The same bytes
  then travel by whichever route works: the relay server, Bluetooth to crew phones in range, or
  (pings and pins only) the crowd relay through any Moshpoint phone.
- Each of your own messages shows **Sent**, **Sent nearby** or **Waiting for signal**. The state
  only ever moves forward.
- Crew phones **carry** each other's messages. The first one back on signal uploads them
  exactly as they were sealed.
- The delivery logic is one state machine in `core` (`Courier`), tested with simulated phones.
  The app only adapts it to the radios and the relay.

## The biggest decision: not Nearby Connections

The roadmap named Google Nearby Connections. I'm not using it. Messages ride **Bluetooth 5
extended adverts in the advertising set the crowd relay already runs**, heard by the one
shared scan the app already runs. Reasons, for the owner:

| | Nearby Connections | The app's own adverts (chosen) |
|---|---|---|
| Google Play services | Needed. The app avoids it in its own code (`MyLocation` says so); phones without it would lose the feature. | Not needed. |
| Advertiser slots | Adds its own advertiser and its own scan, in Google's process, that we can't see or throttle. A failed advert in this app stops for good (`BleBroadcaster` has no retry), so losing the last slot makes someone unfindable. | No new advertiser and no new scan. Messages take turns in the relay set. |
| Several hops | Doesn't route. We would write store-and-forward ourselves anyway. | Same store-and-forward, one mechanism for crew hops and crowd hops. |
| What's on air | Endpoint ids and names we don't control; Bluetooth Classic paths can expose the device address and rename the adapter. | Only our own packets: version, hops, ciphertext. |
| Wi-Fi | Can switch radios and break Wi-Fi Aware ranging unless every option is right. | Never touches Wi-Fi. |
| Battery | Discovery is a heavy scan. | Nothing new while idle; a short advert per message. |
| Testing | Behaviour lives in Google's code. Only `core` and `server` tests can fail CI. | A lossy broadcast is easy to simulate exactly, so the gating tests exercise the real protocol. |
| Cost | Fast bulk transfer. | Slow: about one message every 8 seconds per phone. Fine for text, which is all step 1 sends. |

Limits accepted with this choice:

- Both phones need Bluetooth 5 extended adverts. That is already true for the crowd relay and
  crew intros. Phones without it stay internet-only and show "Waiting for signal" honestly.
- No fast catch-up of a long backlog over Bluetooth. History bundles and the relay still do that.
- The courier only knows the radio as "hand me the next packet" and "here is a packet I
  heard" (`Courier.nextPacket`, `onPacket`, and `Courier.Air`). A connection-based link (Nearby
  or BLE L2CAP) can be added behind the same calls later if field tests show the need.

This also removes every new runtime permission: no `BLUETOOTH_CONNECT`, no
`NEARBY_WIFI_DEVICES`. Going live automatically keeps working unchanged.

## How a message travels

```
 you type / tap            sealed + signed ONCE (existing sealPing / signed pin)
        │
        ▼
   ┌─ Courier (core) ───────────────────────────────────────────────┐
   │ outbox + carried messages, keyed by message id                 │
   └──┬──────────────────────┬──────────────────────────┬───────────┘
      │ internet first       │ Bluetooth (while live)   │ crowd relay (pings, pins)
      ▼                      ▼                          ▼
 relay mailbox         crew phones in range        any Moshpoint phone,
 valid right now       carry it, confirm it        a few hops, can't read it
      │                      │                          │
      ▼                      ▼                          ▼
    Sent                Sent nearby ──────────────► still uploads later
```

Bluetooth mechanics, all inside the existing relay advertising set:

- A packet is `[version 2][hops left][fragment][payload ≤ 197 bytes]`. The payload is a sealed
  crew message, unchanged. A long chat line (up to 318 bytes) goes as two fragments.
- A message is held on air for **5.5 s**, long enough for a phone scanning at low power to
  catch it. Then the relay's location packets get three 1-second turns, so the crowd relay
  never starves.
- A phone with no signal broadcasts a small sealed **"what I have"** summary about once a
  minute. Crew phones that hear it send what it lacks, six at a time, newest and most urgent
  first; the next summary asks for more. If two phones could answer, the one that hears the
  other first stays quiet.
- A phone that takes a message broadcasts a sealed **receipt**. That is the only thing that
  turns "Waiting for signal" into "Sent nearby".
- Chat goes out with zero hops, so only crew phones carry it (no venue-wide chat through
  strangers, as the roadmap says). Pings, pins and their receipts start with 4 or 5 hops and
  pass through any Moshpoint phone.

## Decisions on the hard problems

### 1. One message, three routes, one copy

- **Message id** = first 8 bytes of SHA-256 over `"mp-id1"`, the signer's public key, kind,
  time, minutes, lat/lon and text. It needs no new signed field, so History bundles, proofs
  and older builds keep working. It leaves out the name and the crew-key tag on purpose, so
  the id survives a re-seal, a retry, a History copy and a re-sign after a rekey.
- Computed once in `GigGroup.openPing` (and for `HistoryLine`), from the bytes as sealed.
- The id is the key everywhere: chat list, outbox, notifications, the "what I have" summary,
  receipts, upload decisions and History ingest. The seen set is saved, so a restart doesn't
  alert twice.
- Hashes of the sealed bytes never decide whether a message is new. They are used only as a
  shortcut (to skip opening bytes a phone has already looked at) and in a stranger's relay
  cache, which can't open the packet and needs something to stop loops.
- Carriers forward the original bytes. Only the author can re-sign.

### 2. Honest states

- Forward only: `Sending… → Waiting for signal → Sent nearby → Sent`.
- **Sent nearby** needs a receipt from a phone holding the crew key. It never stops the upload.
- **Sent** means the relay has it: our own upload succeeded, or our message id was seen in a
  mailbox fetch (any copy), or a crew phone that uploaded it told us.
- A crew phone's word is shown at once but checked: at our next look at the chat mailbox, a
  message that isn't there is uploaded by us after all. So a mistaken or tampered phone can't
  make a message vanish by claiming it went. The label stays "Sent" meanwhile.
- Stored numbers: `SENT=0, SENDING=1, FAILED=2` stay; new `NEARBY=3, WAITING=4`, so saved
  chats still load. The allowed steps are one function in core (`OutboxState.mayMove`).
- A message that can't start uploading (no network, or the relay asked us to slow down) shows
  "Waiting for signal" straight away, not "Sending…" for as long as that lasts.
- "Not sent" is now rare: only when a message got too old without reaching anyone (three days
  for chat, two hours for a quick ping), or the relay refused it three times. A tap on a chat
  line queues it again. A quick message that got too old just says "Not sent": it can't be
  rebuilt from its line (where you were isn't kept), so you send a new one.
- The sealed bytes are saved with the outbox (in the courier's file, keyed by the message id),
  so a retry sends the same bytes instead of re-sealing. If that file is ever lost, the line is
  sealed again: different bytes, same id, so nobody sees it twice.
- Quick pings get the same outbox and states. Before, they always looked sent.

### 3. Store-and-forward

Checked against `server/MailboxStore.kt` and `Main.kt`: the held (chat) mailbox keeps 200
records per id for 72 h, a byte-identical PUT replaces rather than duplicates, lookups return
all of them; the ping/pin box keeps 64 per id for 15 minutes; PUTs are limited to a 120 burst
then 2 a second **per IP**; the public relay doesn't de-duplicate at all.

- Upload to the mailbox id that is **valid at upload time** (today's chat id, the current
  5-minute ping id). Readers look at today and yesterday, and at this and the last ping id.
- **The author uploads first.** A helper waits a random 10 to 60 s after regaining signal
  (3 to 15 s if it had signal all along), fetches the mailbox, and uploads only ids that still
  aren't there, five per fetch. So a crew walking out of a venue together uploads each message
  about once. "About": two helpers can still overlap by a message or two. On our own server
  that costs nothing (identical bytes take one slot); on the public relay it leaves a second
  copy, which every phone shows once.
- An author whose message a crew phone already holds looks at the mailbox first (for up to
  15 s) when signal returns, in case that phone has uploaded it.
- A helper never pushes today's mailbox past 180 of its 200 records, and with little room
  sends the newest first. Yesterday's mailbox doesn't count against today's. Older backlog
  reaches people through History bundles, as before.
- An id seen in a fetched History bundle counts as already uploaded.
- Need help, Check in and Home safe are also posted to the chat mailbox, which keeps them for
  days where the ping mailbox keeps 15 minutes.
- Carry limits, saved to disk: 200 messages per crew, chat for 24 h, quick pings for 2 h,
  safety pings for 12 h, the newest pin only (18 h).
- Our own pin is re-posted every ten minutes while the app is open or live, as before (the pin
  mailbox forgets after 15). Not with the app closed.

### 4. Rekeys while offline

- **Bluetooth never carries a crew key.** A rekey is only accepted from the relay. So a removed
  member standing next to an offline phone has nothing to send it.
- When a phone moves to a new key, the old key is dead to it over Bluetooth at once: it stops
  sending, opening and carrying old-key packets.
- The phone that removed someone broadcasts a small **"this key is retired"** packet, sealed
  with the old key, through the crowd relay for six hours. A phone that hears it stops using
  that key over Bluetooth until the relay gives it the new one, and passes the notice on, so
  crew phones in range of each other stay on hold together. A phone on its own drops the hold
  30 minutes after the last notice it heard. Only someone holding the crew key can make a
  notice, and all it can do is pause Bluetooth backup: it can never move a crew.
- A limit that follows: a crew phone that has been alone and without signal for more than
  half an hour, and then meets the removed member, exchanges old-key Bluetooth messages with
  them again until it gets signal. It has no way to know who was removed until then.
- **Messages in flight under the old key:** carriers drop other people's. The author's phone
  re-signs its own not-yet-uploaded messages under the new key once it has it. The message id
  is the same, so anyone who already has the old copy shows it once.
- Cost, stated plainly: removing someone with no signal anywhere pauses the crew's Bluetooth
  messages until phones get signal. Chosen because the alternative lets the removed member
  keep reading.

### 5. Privacy on air

- No endpoint names and no service id of our own: packets use the relay's existing UUID.
- A packet shows a stranger: version, hops left, fragment marker, ciphertext. No crew tag, no
  sender id, no mailbox id. Crew phones find their packets by trying their key.
- New control messages are padded to 16-byte steps, and the starting hop count is random
  (4 or 5), so size and hop count say less.
- The intro advert's constant crew-pass prefix is fixed in a compatible way: see review item 14.
- Not ours to fix: the Bluetooth address on each advert is chosen and changed by Android on
  its own timer.

### 6. Radio budget

- Advertisers stay at five at most. Scans stay at one. Nothing new starts, so nothing can take
  the last slot from the visible advert or the "looking" advert that UWB set-up rides on.
- With no messages waiting, the relay set sends exactly what it sends today.
- Under the heaviest message load, the relay's own location packet still airs every 8.5 s and
  heard packets keep two turns in every cycle. `RelaySchedule` in core decides the turns, and
  a core test proves both figures.
- UWB, Wi-Fi Aware, the visible advert and the scan are not touched by this change. The field
  test plan checks the arrow still locks on while messages flow.

### 7. Crowd relay format

- Version 2 packets. Older phones drop anything that isn't exactly 48 bytes starting with `1`.
- Kept at 200 bytes of service data, because many phones cap an advert near 251 and an
  oversized update fails silently. The phone's own limit is checked before sending.
- A separate message cache on every phone (`MessageRelay`): 40 packets, nothing older than an
  hour, nothing timestamped more than 2 minutes ahead, the longest-held dropped first.
- A stranger's phone can't tell a Need help from an "On my way", so the time limit is set by
  the crew phones that send: a ping or pin goes out with hops for 20 minutes (Need help for an
  hour), and after that with none, so only crew phones carry it.
- A stranger relays each packet for two turns, with one fewer hop, and takes at most 6 new
  packets a minute from the air. Only whole packets: a message split in two never crosses a
  stranger's phone. Every one-tap ping, Need help and the pin fit in one packet; a flare with
  long words may not.
- The existing `RelayPacket` and `RelayCache` are unchanged and their tests still pass.

### 8. Android rules

- No new runtime permission. One new install-time permission, `ACCESS_NETWORK_STATE`, so the
  app knows when there's no network (review item 4).
- Android 10 and 11 need Location switched on to scan; Android 12 and up need "Nearby devices".
  Both are already asked for and explained. The onboarding line and the privacy table now also
  say "and to pass messages on when there's no signal".
- No new foreground service or type. The message radio starts and stops with
  `VisibilityService` (type `connectedDevice`).
- Doze and aggressive phone makers: the queue and carried messages are saved to disk, so a
  killed app loses nothing; the existing battery-optimisation prompt applies.
- No Google Play services: not needed at all now.

### 9. Battery

- Listens only while you're live, through the scan that is already on.
- Idle cost is zero: no summaries, no packets, when everyone has signal and nothing is waiting.
  A message that reaches the relay within 3 seconds never goes on air at all, unless a crew
  mate nearby has said it has no signal. Safety pings always go on air as well.
- A phone with no signal sends one summary a minute. A message costs about 5.5 s of advertising.
- No connections, so nothing churns in a crowd.

### 10. Several crews at once

- The courier keeps a separate outbox per crew, each sealed and verified with its own crew's
  keys, each uploaded to its own mailboxes.
- **Bluetooth carries the main crew only.** Up next crews are asleep by design (no radio, no
  battery), and their passes can't be recognised on air. Their messages keep the same states
  and wait for signal. When one becomes the main crew, its queue starts using Bluetooth.

### 11. Ordering and clocks

- A new message is stamped no earlier than one second after the newest message its author has
  seen in that crew (if that is within 5 minutes of its own clock). A reply never sorts above
  what it answers, even with skewed clocks.
- The chat sorts by (time, message id), so every phone shows the same order whatever order
  things arrived in.
- A message stamped in the future sorts at the time it arrived, so it can't sit at the bottom
  for hours.
- After a partition heals, each side's messages slot in by time, and the unread count and
  notification still fire for them.

## The 14 review items

| # | Item | Decision |
|---|---|---|
| 1 | One message id | As in hard problem 1. `CrewChat.add()` no longer counts a line it immediately trims as new. |
| 2 | Forward-only state | As in hard problem 2. `markSeen` no longer hides our own echo from the courier. |
| 3 | Rekey hijack | See below. |
| 4 | Relay budget | See below. **Done first.** |
| 5 | Logic in core | `Courier` is a plain synchronous state machine. The app, the relay and the radio are three small interfaces (`Host`, `Uplink`, `Air`) and the clock is passed in. The simulation steps several real couriers one second at a time. |
| 6 | Pings | Same outbox and states as chat. Staleness per kind in core (`PingPolicy`): Need help, Check in and Home safe are never dropped; other pings older than 20 minutes still appear in the chat, without a notification. Future times are clamped to arrival. De-duplicated by message id before notifying. Safety pings are also posted to the 72-hour chat mailbox, which older builds ignore silently. A safety ping this phone has never had raises its alert even when the chat is too full of newer lines to show it. |
| 7 | Check-in order | `CheckIns` in core: newest state per sender key by sender time, saved. A Home safe that arrives first beats a late Check in. A Check in that arrives already overdue waits 3 minutes for a Home safe before alarming. Safety pings upload first. |
| 8 | Transport | As above. |
| 9 | Crowd relay | As in hard problem 7. |
| 10 | Older builds | New control messages use a new envelope (`mp2` AAD) that older builds can't open, so nothing shows as "pinged the crew". No new ping kinds were added. Kinds this build doesn't know are ignored by an allowlist (`PingPolicy`). Whether something is new is decided in one place for every route (`Courier.accept`, by message id); the chat's own id check backs it up. |
| 11 | Pins | See below. |
| 12 | Upload storm | As in hard problem 3, plus back-off with jitter after a 429 and a budget reserve. |
| 13 | Lifecycle | Radio starts and stops only in `VisibilityService.begin()/onDestroy()`, main crew only, never for followers or sleeping crews. No new service. Everything runs on Main. No new required permission. |
| 14 | Privacy | As in hard problem 5; intro fix below. |

### Item 3: who may rekey

Checked: `CrewRekey.onDirect` accepts a rekey from any known key, newest record first, and
the payload carries a name, not a key. So the removed key stays "known" everywhere except on
the remover's phone.

- **Only from the relay**, never Bluetooth (hard problem 4).
- **Oldest first.** Rekeys in a mailbox are applied in the order they reached the relay. A
  removed member can't backdate arrival at the server.
- **Allowlist, taken before the rekey:** the sender must be a key this phone already knew in
  the crew. A rekey from a key that an earlier rekey removed is refused.
- **The removed key is carried and dropped.** A second notice (direct kind 4) carries the
  removed public keys. Phones then forget that key in the new crew. The old kind 3 notice is
  still sent for older builds, with an invisible mark telling new builds to wait for kind 4.
- **A notice only counts as sent when the relay has taken it.** A round goes to every member,
  every six hours for three days. Whoever a round didn't reach (signal dropped, the relay asked
  us to slow down) gets theirs at the next chat check, not six hours later.
- **Old-key grace, read-only:** for 24 h an updated phone still reads the old chat mailbox
  and shows messages from the allowlist only (members known at rekey time, minus the removed).
  It never writes under the old key.
- **Not solved:** with no owner role, "A removed B" and "B removed A" look the same. First to
  reach the relay wins and the crew converges on it. An owner-only rule would close this; it
  changes who can remove people, so it's left as a product decision.

Rules live in `RekeyPolicy` (core), with a test of a removed member trying to rekey.

### Item 4: the relay budget

Checked: `RelayClient.put` takes from the 200-a-day budget before connecting, and the
location uploader, the outbox, intros and pings all retry with no signal.

- The budget moves to core (`RelayBudget`) and is **charged only when the relay answers**.
- `put` reports `SENT`, `NO_NETWORK`, `THROTTLED` or `REFUSED`.
- A network callback (`NetState`) stops attempts while there's no network. Nothing waits out
  two 6-second timeouts before trying Bluetooth.
- A reserve: background traffic (location, intros, History) stops at 150 a day; the last 50
  are for messages, and the last 10 of those only for safety pings.
- Per minute: 8 requests. Background ones take at most 6 by themselves, and uploads of every
  kind but safety pings take at most 6, so 2 are always left for looking at the mailboxes: a
  queue being flushed can't stop the phone seeing what's new. A message that finds its share
  of the minute full waits up to 20 seconds for room rather than failing.
- After a 429 the phone pauses, with jitter: a minute and up on the public relay, 5 to 30
  seconds on our own server (whose limiter refills every second, and which the old code never
  paused for at all). Answers to requests that were already on their way don't lengthen the
  pause. Need help, Check in and Home safe still try through it, one every ten seconds.
- After a timeout only background requests hold off for a while. A message, a new crew key or
  a look-up is still tried: one timeout on patchy signal mustn't stop those.
- A 5xx from the relay's host counts as no answer (tried again, costs nothing). Any other
  refusal counts, and after three the message says "Not sent".
- Messages stay queued through all of this and go out when it lifts.

### Item 11: pins

- In scope: the meet-up pin, and flares (already signed pings with a location).
- **Signed pin:** the existing format with the signer's key and signature appended. Older
  builds read it as a normal pin. New builds check the signature; over Bluetooth only signed
  pins are accepted.
- **No future lock:** a pin dated more than 5 minutes ahead is refused, and a saved one is
  capped on load. A new pin is stamped one second after the pin it replaces.
- **Meet at the pin** now names the pin it means (the pin's name in the ping's text, which
  older builds ignore) and re-sends the pin alongside.
- **Keeping it on the relay** is the courier's job (the pin mailbox forgets after 15 minutes).
  At every sync the app checks the courier is holding our pin and hands it over again if not
  (a pin from before this version; a crew that moved to a new key). A newer pin or removal
  from an older build is unsigned, so the courier can't carry it; the app tells it ours is out
  of date so it stops being put back.

### Item 14: the intro advert

Checked: `sealIntro` puts the first 4 bytes of the member's crew pass in the clear, the same
all night.

That is worse than "all night": the crew pass is fixed for the life of the crew, so the same
4 bytes show at every gig that crew goes to.

- A second intro form replaces that prefix with 8 random bytes. Older builds can't open it and
  drop it safely.
- A full fix can't be compatible: a crew mate on an older build who can't read our intro can't
  find us. So the old form has to stay on air until the crew has updated. The rule
  (`IntroForms` in core, tested):
  - this build reads both forms;
  - while anyone might be on an older build, our own intro takes turns between the two forms,
    and intros we pass on for crew mates stay in the old one;
  - a member's own intro is signed by them. One arriving in the new form shows their phone
    writes it, so reads it. That is remembered (as a short hash, not another copy of their pass);
  - once every member we know has shown it, only the new form goes on air. Someone new on an
    older build isn't on that list, so the old form comes straight back.
- Limits: a member who never comes in Bluetooth range after updating keeps the crew on both
  forms. The copy of the intro posted to the relay is unchanged (people following from home
  and older builds read the crew list there), so the relay can still link a crew's roster
  mailboxes by that prefix. Phones whose adverts have no room for the 4 extra bytes keep the
  old form.
- The envelope reserves a type for private messages (step 4), sealed to one person with no
  sender or recipient tag in the crew-readable layer.

## The second review, of the app wiring

The delivery logic is tested; the code that connects it to the phone can't be, and has never
run on one. So that part was read again independently, against the original branch. Nothing
was found in ordinary sending and receiving. Eleven things were, at the edges, and all are
fixed:

| Found | Now |
|---|---|
| One "too many" from our own server paused every request for a minute or more, Need help included; several arriving together made it fifteen. The old code never paused there. | Seconds on our own server, one pause per burst, safety pings go through it. |
| A 502 or 503 counted as a refusal; after three the message was never tried again, and tapping didn't help. | A 5xx is "no answer" and is retried. Real refusals show "Not sent" after three; a tap tries again. |
| Tapping "Not sent" on a quick message queued nothing and showed "Sending…" for good. | A quick message that expired says "Not sent" with no promise; nothing changes state unless something is really queued. |
| A new crew key was marked sent before its uploads ran, and the budget could skip them. | A notice counts as sent when the relay has taken it; the rest follow at the next chat check. |
| Our pin stayed on the relay only while the courier held it, and it lost it on a rekey, when its queue was full, or if the pin was older than this version. | The pin follows the crew to its new key, is never pushed out, and is handed over again whenever the courier isn't holding it. |
| With the chat open on the public relay, its look-ups used up what location shares were allowed. | The per-minute ceiling for background requests counts only background requests. |
| "Reset invite" from a new phone read as a removal on older builds. | The mark that caused it is only sent with a removal. |
| A pin removed by an older build (unsigned) didn't stop ours being re-posted. | The app tells the courier ours is out of date. |
| A late Need help raised no alert if the chat already held 150 newer lines. | It does, decided by the courier's own record of what this phone has had. |
| A message with a line break, re-sealed after its queue entry was lost, got a new id and was uploaded again at every check. | The line follows the id it is sent under; saved rows are matched the way they are saved. |
| Tapping retry while asked to slow down doubled the wait each time. | A tap doesn't cut the relay's pause short, so it can't lengthen it. |

The fixes were then read again the same way. No loops, double sends, double alerts or crashes
were found. Three smaller things were, and are fixed too:

| Found | Now |
|---|---|
| After a restart, a message that had said "Not sent" could go back to "Waiting for signal" and stay there when it gave up again. | "Gave up" is saved with the queue; such a message waits for a tap, and every later change is reported. |
| The "this crew is getting a new key… when you have signal" note showed with full signal while the notices were going out. | It only shows with no signal, which is when it's true. |
| On the public relay a queue being flushed took every request of the minute, so nothing new was fetched until it finished. | Uploads take at most 6 of the 8; 2 are kept for looking. |

One narrow case is left as it is: if the app is killed in the instant between raising an alert
for a late Need help that the chat is too full to show and writing down that it did, the
alert is raised once more on the next start. The record is now written at once rather than a
moment later, so the instant is as short as a file write.

## Tests

In core (these can fail CI). 93 new tests; the whole core suite is 194.

| File | What it proves |
|---|---|
| `CourierSimTest` (32) | Several real couriers stepped one second at a time, with a lossy radio, each phone's own (possibly wrong) clock, and a relay with the server's rules. A message hops along a line of phones and the first one back on signal uploads it, once. "Sent nearby" needs a receipt and never stops the upload. Every route at once under 35% packet loss still shows each message once. A re-sealed copy is the same message. Out-of-order arrival shows in sent order; a reply stays below its question with skewed clocks. Phones walking in and out of range. Need help crosses strangers' phones and chat doesn't; Need help is carried for hours and uploaded where it lasts. Five helpers regaining signal together upload each message once. A mailbox is never pushed past its limit; yesterday's full mailbox doesn't block today's. The relay saying "too many", and a spent budget (Need help still goes), then the flush. A removed member can't send, read or rekey over Bluetooth; phones on hold together stay on hold, and one on its own lets go after half an hour. A restart keeps the queue. Several crews: only the main one uses Bluetooth, the others wait and upload to their own mailbox, and a crew that becomes the main one starts using Bluetooth. A crew phone's claim that it uploaded our message is checked against the relay. Thousands of garbage packets, and nonsense sealed by someone holding the crew key, are ignored without breaking anything. A message the relay refuses says "Not sent" after three goes and a tap tries again, and it still says so after a restart; tapping while asked to slow down doesn't make the wait longer; Need help keeps trying while everything else waits. Pins: follow the crew to a new key, are never pushed out of a full queue, stop being re-posted when an older build replaces them, newest wins, far-future refused, only kept fresh while the app is in use. Six phones through a random night on six seeds. |
| `RelayBudgetTest` (12) | Retries with no signal cost nothing. Location shares can't use up the messages. Back-off after "too many", with jitter, once per burst, short on our own server. Need help still tries through it. After a timeout only background requests wait. An open chat's look-ups don't squeeze out location shares, and a queue being flushed leaves room to look at the mailboxes. |
| `MessageRulesTest` (21) | One id for every copy of a message. Signed pin, readable by older builds. Envelope older builds can't open. Intro form with no constant prefix, and when it may replace the old one. Message clock. Need help never dropped; other late pings shown without a buzz; unknown kinds ignored. Forward-only states. |
| `CheckInsTest` (10) | Home safe arriving before its Check in still wins; order is by the sender's clock; a Check in that arrives already overdue waits for a Home safe behind it; the alarm fires once; survives a restart. |
| `RekeyPolicyTest` (6) | A removed member's later rekey isn't followed; a key we never knew can't rekey; the notice carries the removed key; older builds still get a form they understand. |
| `MessagePacketTest` (12) | Version 2 packets are dropped by the version 1 decoder. Fragments. The stranger relay's limits. The airtime schedule is unchanged when idle and never starves location packets. |

In server: `HeldMailboxTest` pins what the courier relies on from the chat mailbox (200 per
id, oldest dropped, identical bytes take one slot, newest first).

In app (rendered by CI, never gating): `OfflineSnapshotTest` and its `Offline_Lang_xx`
subclasses draw the chat with no signal in every language: Sent, Sent nearby and Waiting for
signal under the "messages are being passed on" note; the note that asks you to go live; and
the chat after removing someone with no signal. Filed as `docs/screenshots/offlineChat.png`,
`de-offlineChat.png` and so on.

## Field-test tools (test builds only)

- **Settings → TESTING → Force no internet.** The phone stops talking to the relay as if it
  had no signal; Bluetooth carries on. Off again when the app restarts.
- **Settings → TESTING → Message routes.** For each message (first six characters of its id,
  the same on every phone): queued, on air, a crew phone nearby has it, uploaded, uploaded for
  a crew mate, in by Bluetooth, in by crowd relay, in from the relay. The same lines go into
  the debug panel's log and into field recordings, marked `msg`.
- Debug panel → Technology status → `Messages (Bluetooth)` says whether this phone can carry
  messages at all.
- CI checks the release APK doesn't contain the switch.
- The two-phone test (airplane mode with Bluetooth on) is section 4b of
  [FIELD_TEST_PLAN.md](FIELD_TEST_PLAN.md).

## New words, for translators

All new text is in `strings_offline.xml`, in English and the 19 languages, and passes
`tools/check_translation.py`. It reuses each language's existing words for crew, Go live,
Need help, the pin and "no signal" (from `docs/i18n` and the existing strings). The two new
terms a native reader should look at first:

| | Sent nearby | Waiting for signal |
|---|---|---|
| ar | أُرسلت لمن حولك | بانتظار الإشارة |
| de | In der Nähe gesendet | Warte auf Empfang |
| es / es-ES | Enviado cerca | Esperando señal / Esperando cobertura |
| fr | Envoyé à proximité | En attente de réseau |
| hi | आस-पास भेजा गया | सिग्नल का इंतज़ार |
| in | Terkirim ke HP terdekat | Menunggu sinyal |
| it | Inviato qui vicino | In attesa di segnale |
| ja | 近くの仲間に送信済み | 電波待ち |
| ko | 근처에 보냄 | 신호 기다리는 중 |
| nl | Verstuurd in de buurt | Wacht op bereik |
| pl | Wysłano w pobliżu | Czeka na zasięg |
| pt | Enviada por perto | Esperando sinal |
| sv | Skickat i närheten | Väntar på täckning |
| th | ส่งถึงเพื่อนใกล้ๆ แล้ว | รอสัญญาณ |
| tr | Yakındakilere gönderildi | Sinyal bekleniyor |
| vi | Đã gửi cho máy ở gần | Đang chờ có sóng |
| zh-CN / zh-TW | 已发给附近队友 / 已傳給附近隊友 | 等待信号 / 等待訊號 |

These were written without a native reviewer, like the rest of the app's translations.

## Merging with the venue map branch

Kept apart on purpose: every new string is in `strings_offline.xml`; the screenshot tests are
in their own file and classes; `core/Advert.kt` and `ScreensSnapshotTest.kt` are untouched.
One string is now unused and left in place so the other string files don't change here:
`setup_onb_need_nearby_why` (the permission's reason; `offline_need_nearby_why` replaces it).
It can be deleted from the 20 `strings_setup.xml` files once both branches are merged.

Every shared file this branch changes, and how much:

| File | Change |
|---|---|
| `MainActivity.kt` | One line: the crew chat is given the note for its top (`offlineHint = …`). The venue map branch adds parameters to other screens' calls in the same file. |
| `service/VisibilityService.kt` | Three lines: `OfflineMessages.startRadio(this)` in `begin()` after the relay starts, `stopRadio()` in `onDestroy()`. The venue map branch also adds lines in those two functions; both sets are needed. |
| `MoshpointApp.kt`, `ui/OnboardingScreen.kt`, `ui/SettingsScreen.kt`, `AndroidManifest.xml`, `.github/workflows/android.yml` | One to three lines each (network watcher start, the permission's reason, the test tools, `ACCESS_NETWORK_STATE`, one more string in the release check). |
| `CrewNotifications.kt` | Five lines: a notification can say a message was sent a while ago. |
| `core/GigGroup.kt` | Additions only: `messageId`, the signed pin, the envelope, the second intro form. Existing formats are read exactly as before. |
| `docs/ROADMAP.md`, `PRIVACY.md`, `ARCHITECTURE.md`, `FIELD_TEST_PLAN.md`, `PLAY_STORE.md` | A status line, new paragraphs and one new section each; nothing existing reworded except the privacy table's "Nearby devices" row and the date. |
| `CrewChatUi.kt` | The two new state labels, the note at the top of the chat, the pin's name in "Meet at the pin". |
| `ChatSync.kt` | The courier is told what each fetch found; rekeys are collected and applied oldest first; the day of grace for the old mailbox. |
| `GroupSync.kt` | **Not small** (about 180 lines). Quick pings, check-ins and the pin live here, and review items 6, 7 and 11 are about exactly those: pings go through the outbox, staleness and check-ins use the core rules, pins are signed and go through the courier, and the intro form is chosen. The radio and sync loops are otherwise as they were. |
| `CrewChat.kt`, `CrewRekey.kt`, `RelayClient.kt`, `CrowdRelayRadio.kt` | The outbox, rekey rules, budget and relay turns described above. |

## Status and next steps

**Handover.** Everything ticked below is committed and pushed on `ccr-89acfff3-nbj8aa`;
nothing is half-done. CI (`Android build`) is green on the code as it stands: translations,
core and server tests, debug and release APKs, licences, screenshots in every language. To
pick this up: core and server tests are `./gradlew :core:test :server:test`; the app is
built, and its screenshots rendered, by CI on every push. No decision is waiting to be
written down.

Next steps, in order:

1. **Field test**, section 4b of [FIELD_TEST_PLAN.md](FIELD_TEST_PLAN.md), then tune the
   timings from what it shows.
2. **Merge with the venue map branch** (the shared files are listed above).

Both independent reads of the app wiring are done and everything they found is fixed (see
"The second review"). What they can't replace is the field test: the wiring has still never
run on a phone.

- [x] Design note (this file), corrected to match the code.
- [x] Item 4 first: `RelayBudget` in core with tests; `RelayClient` and `NetState` use it.
- [x] Core: message id, envelope, signed pin, intro form 2, `PingPolicy`, `CheckIns`,
      `RekeyPolicy`, message clock, with tests.
- [x] Core: packet version 2, message relay cache, `RelaySchedule`, `Courier`, and the
      multi-phone simulation.
- [x] App: `OfflineMessages` adapter; `CrewChat`, `GroupSync`, `ChatSync`, `CrewRekey`,
      `CrowdRelayRadio`, `VisibilityService` wired to it.
- [x] UI: states in the chat, `strings_offline.xml` in 19 languages, screenshot tests.
- [x] Debug tools: "no internet" switch and the route log.
- [x] Two-phone airplane-mode test in `FIELD_TEST_PLAN.md`; privacy and architecture notes.
- [x] Intro advert: the new form goes on air, and replaces the old one when the crew can read it.
- [ ] **Run section 4b of the field test plan on real phones.** Nothing here has been on a
      phone yet.

### What is checked, and how

- **By tests that can fail CI:** all the delivery logic (core), the relay budget, the server's
  mailbox rules.
- **By CI building it:** the app compiles, debug and release, and the release APK has no debug
  tools in it. Translations match English. Screenshots render in every language.
- **Not checked by anything yet:** the radio itself. Whether a 200-byte advert held for 5.5 s
  is reliably heard by a phone scanning at low power in a crowd; how many phones a venue can
  take; real battery cost; whether every phone that says it has Bluetooth 5 extended adverts
  accepts 200 bytes; whether the arrow and UWB are undisturbed in practice (the schedule is
  proven, the radio isn't). Some phones scan less often with the screen off; there a message
  may need more than one airing, which the once-a-minute summary takes care of, at the cost
  of time. These numbers (5.5 s on air, 8.5 s cycle, one summary a minute,
  six at a time) are first guesses in `Courier` and `RelaySchedule`, in one place each, to be
  tuned from field recordings.

### Known limits

- Bluetooth 5 extended adverts on both phones, both live, same main crew, on gig day.
- About one message every 8.5 seconds per phone. Text only.
- Chat never passes through strangers' phones, so it needs a crew phone in Bluetooth range.
- Removing someone with no signal anywhere pauses the crew's Bluetooth messages until phones
  get signal (hard problem 4).
- No owner role: whoever's rekey reaches the relay first wins (review item 3).
- Two helpers can occasionally both upload a message (hard problem 3). Phones show it once.
- This build was developed in a container that can't download the Android build tools, so the
  app was compiled and rendered only by CI, and type-checked locally against stand-in
  libraries. Core and server tests ran locally as well as in CI.
