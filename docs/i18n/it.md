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
