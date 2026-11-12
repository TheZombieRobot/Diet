# Dutch (values-nl): translation review

Scope: Netherlands and Flanders. Tone: casual *je/jij*, ages 18–35.
Validator: `check_translation.py app/src/main/res/values-nl` prints **OK**.

Note: Wiktionary pages could not be fetched from this session (blocked network). Evidence comes from search-result snippets, Vlaamse Taaladvies and Dutch tech sites.

## Key terms

| English | Chosen Dutch | Why | Sources |
|---|---|---|---|
| crew | **crew** | Common loanword in NL and BE youth language. | — |
| mate / friends | **vrienden / vriend** | Neutral in plural and indefinite use (*een vriend*). | — |
| fallback name "Mate" | **Maat** | "Buddy" in both NL and Flanders. Friendly. | — |
| gig | **concert** | — | — |
| Go live / live / hidden | **Ga live / live / Verborgen** | — | — |
| Ghost mode | **Spookmodus** | Used in Dutch Snapchat guides. Some sources call Snapchat's version *Onzichtbare modus*. Spookmodus is still clear. | https://www.iculture.nl/tips/snapchat-snap-kaart/ |
| Need help | **Hulp nodig** | — | — |
| Heading home / check in / home safe | **Ik ga naar huis / inchecken / Veilig thuis** | Natural. | — |
| flare | **lichtkogel** | Means a signal flare. Stadium pyro is called *fakkels*, so this is not the crime term. | — |
| flare vibes | Kwijt / Tijd voor de bar / Vooraan bij het hek / Eten halen / Wc / Even naar buiten / Merchstand / Ga zo weg | Natural. | — |
| ping | **ping / pingen** | — | — |
| pin / meet-up | **pin / verzamelpunt** | — | — |
| Story | **story** | Youth usage. The official Instagram/Snapchat UI uses *verhaal*. | — |
| Up next | **Binnenkort** | — | — |
| Your gigs | **Jouw concerten** | — | — |
| Bump | **Telefoons (tegen elkaar) tikken** (was *botsen*) | See Changed. | — |
| Light me up | **Laat me knipperen** (was *oplichten*) | See Changed. | — |
| Ride | **Rit** | — | — |
| sound desk / encore | **mengtafel / toegift** | — | — |
| nudge text | "Hé maat, open Moshpoint en tik op Ga live…" | — | — |
| colours | roze, blauw, groen, oranje, paars, wit | — | — |

## Changed

| Old → New | Reason | Source |
|---|---|---|
| *Laat me oplichten / om op te lichten / Vraag ze op te lichten / scherm laten oplichten* → *knipperen* forms | *Oplichten* also means "to scam or swindle" (*oplichter* = con artist). "Vraag ze op te lichten" could read as "ask them to scam". | https://kaikki.org/dictionary/Dutch/meaning/o/op/oplichten.html , https://www.vocabulary.com/dictionary/nl/oplichter |
| *net nu* (just now) → *zojuist* | *Net nu* means "right now / of all moments", not "a moment ago". | https://heardutchhere.net/disambiguation_net.html |
| *%d u geleden*, *%1$d u %2$d min* → *uur* | Writing out *uur* is preferred, and the bare *u* looks Belgian or technical. | https://www.vlaanderen.be/team-taaladvies/taaladviezen/uur-uren , https://www.vlaanderen.be/taaladvies/uurnotatie |
| *Telefoons tegen elkaar botsen / Telefoons botsen / Botsen / Gebotst!* → *tikken / Telefoons tikken / Gelukt!* | *Botsen* means "collide or crash", as in a car crash. *Tikken* (tap) is the everyday word for tapping your phone. | https://www.androidplanet.nl/tips/google-wallet-tips/ |
| *Schiet het podium… / Schiet waar je bent…* → *Maak foto's van het podium… / Maak een foto van waar je bent…* | *Foto's schieten* is fine, but "schiet het podium" (shoot the stage) at a concert reads violently. | https://www.icreatemagazine.nl/academy/professionele-fotos-iphone/ |
| *Ruw / ruwe richting* → *Globaal / globale richting* | *Ruw* also means "rough, violent, rude". | — |
| *Vast* (locked) → *Precies* | Clearer. | — |
| *%1$s verderop* → *%1$s verwijderd* | *Verderop* means "further along", not "away". | — |
| *geen batterij* → *geen batterijverbruik* (2) | Read as "no battery". | — |
| *Live · spook / 1 uur spook* → *…spookmodus* | Use the full feature name. | — |
| *Ga even checken.* → *Check even hoe het gaat.* | Clearer. | — |

## Checked and safe (kept)
- **Maat** (fallback name, nudge "Hé maat"): "buddy" in NL and BE. It also means "size" or "beat (music)", but context makes it clear.
- **lichtkogel**: signal flare. Not the stadium-pyro word (*fakkel*).
- **Tijd voor de bar 🍺**: harmless.
- **Vooraan bij het hek**: correct for "at the rail".
- **%1$s is nu een vriend**: uses *een vriend*, so it does not read as "boyfriend" (*mijn vriend* would).

## For a native reviewer
1. ***Laat me knipperen*** as the button for "Light me up". Is there a punchier word? Alternatives: *Laat me stralen*, *Lichtsignaal*. Confidence **medium**.
2. ***Tikken*** for Bump: *Telefoons tikken*, and *Gelukt!* after the bump. Confidence **medium-high**.
3. **Ghost mode name** *Spookmodus* vs Snapchat NL's possible *Onzichtbare modus*. Confidence **medium**.
4. **Flemish feel.** *Hou/Houd*, *zojuist* (Flemish also *zonet*) and *kletsen* should work, but a Flemish reviewer should check. Confidence **medium-high**.
5. ***story*** vs official *verhaal*. Confidence **high** that young users understand *story*.

## UI review
Shortened so the text fits the way English does:
- `find_light_me_up`: *Laat me knipperen* → *Knipperen* (the half-width button wrapped onto 2 lines. It keeps *knipperen* and still avoids *oplichten*)
- `find_restart_scan`: *Scan opnieuw starten* → *Scan opnieuw* (the button wrapped)
- `find_last_seen_on_map`: *Laatst gezien op kaart* → *Laatst gezien* (the button wrapped)
- `find_meet_label`: *Verzamelen: %1$s* → *Pin: %1$s* (the map row got cut off with "…")
- `home_one_thing_first` and its plural: *EERST NOG EVEN DIT (· NOG %d)* → *EERST DIT (· NOG %d)* (the eyebrow wrapped)
- `home_plan_gig`: *Plan een concert (zoek het, nodig nu uit)* → *Plan een concert (zoek, nodig uit)* (the button wrapped)
- `home_invite_mates_tonight`: *Vrienden uitnodigen voor vanavond* → *Vrienden uitnodigen* (the main button wrapped. The card title already says *vanavond*)
- `home_paste_invite` / `home_scan_invite`: *Uitnodiging plakken / Uitnodiging scannen* → *Plak uitnodiging / Scan uitnodiging* (the link wrapped). The two hints that name the button (`main_get_the_app`, `main_no_invite_found`) were updated to match.
- `home_chat_subtitle`: *Berichten, het plan, lichtkogels* → *Chat, plan, lichtkogels* (cut off with "…")
- `home_tap_mate_hint`: *Tik op een vriend om hem te vinden · houd vast voor opties* → *Tik om te zoeken · houd vast voor opties* (wrapped onto 2 lines. This also drops the gendered *hem*)

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **kaart van de locatie** | *Locatie* as in `crew_at_venue`. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Boven / ↓ Beneden** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | een verdieping hoger / een verdieping lager | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **horloge** / **pols** / **trillingen** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Geen verbinding met telefoon** | The watch has lost its Bluetooth link to the phone. *Geen verbinding met telefoon* (no connection to the phone). *Buiten bereik* was avoided because *bereik* is the app's word for phone reception. |
| Hold (on the round button) / Hold to tell your crew | **Hou vast** / Hou vast om je crew te waarschuwen | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Hou je pols plat** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Volg de trillingen** | Shown when there is a distance but no direction. |
| Not sent yet | **Nog niet verstuurd** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Alleen crew in de buurt heeft het nu | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Dichtstbijzijnde vriend** / **Crewstatus** | Names in the watch's pickers. |

For a native reviewer: *Hou vast* on the round button, *waarschuwen* for telling the crew. *Dichtstbijzijnde vriend* is long for a complication name; it only shows in the picker. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.

## "I'm here" pin (`strings_here.xml`)

Eight strings: the **I'm here** button in the drop-a-pin dialog and the line under it, the
"pinned 3 min ago" note on a mate's face (map, list, radar, finder), and your own pin's row in
the map's list. Validator prints **OK**. See `docs/IM_HERE.md`.

| English | Chosen |
|---|---|
| I'm here (button) | **Ik ben hier** |
| Your crew sees you on this spot, with the floor, until you walk away (20 min at most). | Je crew ziet je op deze plek, met de verdieping, tot je weggaat (max. 20 min). |
| pinned 3 min ago (%1$s = the app's "3 min ago" / "just now") | gepind %1$s |
| You're here / Pinned 3 min ago · your crew sees you here | Je bent hier / Gepind %1$s · je crew ziet je hier |
| Take your pin down (screen reader, ✕) | Je pin weghalen |

Uses **crew** and **pin** (*gepind*), with **je**. Written without a native reviewer. Confidence: **medium**.

## Private messages (`strings_private.xml`)

Ten strings: **Message Sam** (in a crew mate's options and the finder), the private thread's
subtitle, empty note, Mute and its note, and the notification (with what a locked phone shows).
Validator prints **OK**. See `docs/PRIVATE_MESSAGES.md`.

| English | Chosen |
|---|---|
| Message %1$s (button and menu item) | **Bericht aan %1$s** |
| Private · only you two can read it | Privé · alleen jullie twee kunnen het lezen |
| Only you and %1$s can read what's sent here: not the rest of the crew, and not us. | Alleen jij en %1$s kunnen lezen wat hier wordt gestuurd: niet de rest van de crew, en ook wij niet. |
| Mute / Unmute | Dempen / Dempen opheffen |
| Muted on this phone. %1$s's messages still arrive here, without a notification. | Gedempt op deze telefoon. Berichten van %1$s komen hier nog steeds binnen, zonder melding. |
| %1$s · private (notification title) | %1$s · privé |
| Private message (locked phone) | Privébericht |
| %d new private messages | %d nieuwe privéberichten |
| %d unread private messages (screen reader, the count on a face) | %d ongelezen privéberichten |

Uses **crew**, as elsewhere. *Dempen* / *Dempen opheffen*. Reuses the existing words for "Sent", "Sent nearby", "Waiting for signal" and the no-signal notes. Written without a native reviewer. Confidence: **medium**.
