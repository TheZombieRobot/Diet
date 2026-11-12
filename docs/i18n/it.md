# Italian (values-it): translation review

Scope: Italy (also understood in Italian-speaking Switzerland). Tone: casual *tu*, ages 18–35.
Validator: `check_translation.py app/src/main/res/values-it` prints **OK**.

## Key terms

| English | Chosen Italian | Why | Sources |
|---|---|---|---|
| crew | **gruppo** | Natural and neutral. *Gruppo* can also mean "band", but the strings use *band* for the artist, so the meaning stays clear. | — |
| mate / friends | **amico / amici** | Natural. The generic masculine is standard Italian. | — |
| fallback name "Mate" | **Amico** | — | — |
| gig | **concerto** | — | — |
| Go live / live / hidden | **Vai live / live / Nascosto** | — | — |
| Ghost mode | **Modalità fantasma** | Same name as Snapchat's feature in Italian. | https://parental-control.flashget.com/it/what-is-snapchat-ghost-mode , https://www.airdroid.com/it/parent-control/how-to-pause-snapchat-location/ |
| Need help | **Mi serve aiuto** | — | — |
| Heading home / check in / home safe | **Torno a casa / check-in / A casa sano e salvo** | *Check-in* is an understood anglicism. | — |
| flare | **segnale** (was *bengala*) | See Changed. | — |
| flare vibes | Perso / Al bar / Sotto il palco / A prendere da mangiare / Bagni / Fuori a prendere aria / Al merch / Vado via a breve | Natural. | — |
| ping | **avviso / avvisare** | Native word. | — |
| pin / meet-up | **pin / ritrovo, punto di ritrovo** | — | — |
| Story | **storia** | Instagram's Italian UI uses *La tua storia*. | https://www.aranzulla.it/come-fare-una-Storia-su-instagram-1065634.html , https://blog.hootsuite.com/it/instagram-stories-guida-completa/ |
| Up next | **Prossimi** | — | — |
| Your gigs | **I tuoi concerti** | — | — |
| Bump | **Avvicina (i telefoni)** | Neutral. | — |
| Light me up | **Illuminami** | Neutral. | — |
| warmer / colder | **Fuocherello / Acqua** | The Italian children's "hot and cold" game. A nice localisation. | https://www.nostrofiglio.it/giochi/caccia-fuoco-fuochino-al-tesoro |
| Ride | **Passaggio** | "A lift". | — |
| sound desk / encore | **mixer / bis** | — | — |
| nudge text | "Ehi amico, apri Moshpoint e tocca Vai live…" | — | — |
| colours | rosa, blu, verde, arancione, viola, bianco | — | — |

## Changed

| Old → New | Reason | Source |
|---|---|---|
| *bengala* everywhere (*Lancia un bengala, ha lanciato un bengala, Bengala:, bengala*) → *segnale* (*Manda un segnale, ha mandato un segnale, Segnale:, segnali*); the send button *Lancia* → *Manda* | In Italy *bengala* is the word for the flares ultras throw at stadiums. Throwing or even carrying one at events is a crime (L. 401/1989) and gets a DASPO ban. A notification saying "X ha lanciato un bengala" reads as X threw a flare in the crowd. | https://www.studiocataldi.it/guide_legali/diritto-penale-parte-speciale/violenza-negli-stadi , https://www.espansionetv.it/2024/05/07/stadio-sinigaglia-fumogeni-in-campo-aggressioni-e-insulti-sette-daspo-a-tifosi |
| *telefono morto* → *telefono scarico* (2) | *Scarico* is the natural word for a dead battery. *Morto* sounds grim next to a person's name. | — |
| *al locale / dal locale / zooma sul locale* → *sul posto / dalla location / zooma sulla location* | *Locale* means a bar or club, which is wrong for festivals. *Location* is normal Italian event jargon. | — |
| *%d min fuori* → *%d min in giro* | "Time out tonight" means time out and about (*in giro*), not time spent outdoors. | — |
| *Mosh mappa* → *Mappa Mosh* | Italian puts the noun first. | — |
| *Scatta il palco… / Scatta dove sei…* → *Fotografa il palco… / Fai una foto di dove sei…* | *Scattare* needs *una foto* as its object. | — |
| *Fai trovare i tuoi amici a Moshpoint* → *Consenti a Moshpoint di trovare i tuoi amici* | Clearer and matches Android permission wording. | — |
| *niente batteria / zero batteria* → *zero consumo di batteria* | Read as "no battery". | — |

## Checked and safe (kept)
- **Carichiamoci! / caricatevi**: "get pumped". No drug or sexual sense.
- **Fuocherello / Acqua**: the standard hot/cold game words. https://www.nostrofiglio.it/giochi/caccia-fuoco-fuochino-al-tesoro
- **Illuminami**: light-up. A mild "enlighten me" echo, but harmless.
- **Al bar 🍺**: harmless.
- **Modalità fantasma**: matches Snapchat IT.
- **storia**: matches Instagram IT.

## For a native reviewer
1. ***Segnale*** for flare. The same word also appears for radio signal ("Niente segnale"). Is it clear enough, or is the English *flare* better? Confidence **medium**.
2. **Gendered defaults** (*sano e salvo, Perso, Nascosto, entrato*). These are the standard generic masculine. Italian inclusive forms (schwa, asterisk) are politically divisive and were deliberately not used. Confidence **high**.
3. ***Passaggio*** for Ride: clear for booking an Uber or taxi? Confidence **medium**.
4. ***Gruppo*** vs *crew*. Young Italians also say *la mia crew*. *Gruppo* is safer and clearer. Confidence **high**.

## UI review
Shortened so the text fits the way English does:
- `find_band_nearby`: *Nei paraggi* → *Vicino* (the big finder word wrapped onto 2 lines)
- `find_spin_scan`: *Scansione a giro* → *Gira e cerca* (the button wrapped)
- `find_from_gps`: *Da GPS: diventa più precisa mentre cammini* → *Da GPS: più precisa se cammini* (wrapped onto 2 lines)
- `find_last_seen_on_map`: *Visto l'ultima volta sulla mappa* → *Ultima posizione* (the button wrapped)
- `find_map_title`: *Mappa Mosh* → *Mappa* (the map header title wrapped and pushed "Updated…" into an ellipsis)
- `home_one_thing_first_more`: *PRIMA UNA COSA · ALTRE %d* → *PRIMA UNA COSA · +%d* (the eyebrow wrapped)
- `home_plan_gig`: *Pianifica un concerto (trovalo, invita subito)* → *Pianifica un concerto (trova, invita)* (the button wrapped)
- `home_tile_not_sharing`: *non condivide ancora* → *non condivide* (the label under the avatar wrapped)
- `home_family_can_follow`: *La famiglia può seguire la serata da casa* → *La famiglia può seguirti da casa* (wrapped onto 2 lines)
- `home_tap_mate_hint`: *Tocca un amico per trovarlo · tieni premuto per le opzioni* → *Tocca per trovarlo · tieni premuto per le opzioni* (wrapped onto 2 lines)

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **mappa della location** | *Location* as in `crew_from_venue`. First person *Salvo… / Cerco…*, like `main_saving_many`. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Di sopra / ↓ Di sotto** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | al piano di sopra / al piano di sotto | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **orologio** / **polso** / **vibrazioni** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Telefono fuori portata** | The watch has lost its Bluetooth link to the phone. *Fuori portata* is the usual phrase for Bluetooth range; phone reception is *segnale*. |
| Hold (on the round button) / Hold to tell your crew | **Tieni premuto** / Tieni premuto per avvisare il gruppo | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Tieni il polso in piano** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Segui le vibrazioni** | Shown when there is a distance but no direction. |
| Not sent yet | **Non ancora inviato** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Per ora ce l'ha solo chi del gruppo è vicino | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Amico più vicino** / **Stato del gruppo** | Names in the watch's pickers. |

For a native reviewer: *Tieni premuto* takes two lines on the round button. *Tieni il polso in piano* for holding the wrist level. *App per orologio*. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.

## "I'm here" pin (`strings_here.xml`)

Eight strings: the **I'm here** button in the drop-a-pin dialog and the line under it, the
"pinned 3 min ago" note on a mate's face (map, list, radar, finder), and your own pin's row in
the map's list. Validator prints **OK**. See `docs/IM_HERE.md`.

| English | Chosen |
|---|---|
| I'm here (button) | **Sono qui** |
| Your crew sees you on this spot, with the floor, until you walk away (20 min at most). | Il tuo gruppo ti vede in questo punto, con il piano, finché non te ne vai (al massimo 20 min). |
| pinned 3 min ago (%1$s = the app's "3 min ago" / "just now") | pin messo %1$s |
| You're here / Pinned 3 min ago · your crew sees you here | Sei qui / Pin messo %1$s · il tuo gruppo ti vede qui |
| Take your pin down (screen reader, ✕) | Togli il tuo pin |

Uses **gruppo** and **pin** (*pin messo*), as in *Metti un pin*. Floor = *piano*. Written without a native reviewer. Confidence: **medium**.

## Private messages (`strings_private.xml`)

Ten strings: **Message Sam** (in a crew mate's options and the finder), the private thread's
subtitle, empty note, Mute and its note, and the notification (with what a locked phone shows).
Validator prints **OK**. See `docs/PRIVATE_MESSAGES.md`.

| English | Chosen |
|---|---|
| Message %1$s (button and menu item) | **Scrivi a %1$s** |
| Private · only you two can read it | Privata · solo voi due potete leggerla |
| Only you and %1$s can read what's sent here: not the rest of the crew, and not us. | Solo tu e %1$s potete leggere quello che vi mandate qui: non il resto del gruppo, e nemmeno noi. |
| Mute / Unmute | Silenzia / Riattiva |
| Muted on this phone. %1$s's messages still arrive here, without a notification. | Silenziato su questo telefono. I messaggi di %1$s arrivano comunque qui, senza notifica. |
| %1$s · private (notification title) | %1$s · privato |
| Private message (locked phone) | Messaggio privato |
| %d new private messages | %d nuovi messaggi privati |
| %d unread private messages (screen reader, the count on a face) | %d messaggi privati non letti |

Uses **gruppo**, as elsewhere. The subtitle agrees with *la chat* (*Privata… leggerla*). *Silenzia* / *Riattiva*. Reuses the existing words for "Sent", "Sent nearby", "Waiting for signal" and the no-signal notes. Written without a native reviewer. Confidence: **medium**.
