# German (values-de): translation review

Scope: Germany, Austria, Switzerland. Tone: casual *du*, ages 18–35.
Validator: `check_translation.py app/src/main/res/values-de` prints **OK**.

Note: Wiktionary could not be fetched from this session (blocked network). Evidence comes from Duden and search-result snippets.

## Key terms

| English | Chosen German | Why | Sources |
|---|---|---|---|
| crew | **Crew** (die) | Common loanword in German youth and event language. | — |
| mate / friends | **Freunde** (plural), *Freund* in counts | The plural and indefinite uses are neutral. Possessive *dein Freund* = boyfriend (see Changed). | https://discoverdiscomfort.com/friend-in-german-freund/ |
| fallback name "Mate" | **Freund** (kept) | Short. Shown only as a stand-in name. See doubts. | — |
| gig | **Konzert** | Natural word. | — |
| Go live / live / hidden | **Live gehen / live / Versteckt** | Natural. | — |
| Ghost mode | **Geistmodus** | Same name as Snapchat's feature in German. | https://www.schieb.de/geistmodus-in-snapchat-aktivieren , https://www.antwort.net/a/tutorial/so-aktivierst-du-den-geist-modus-ghost-mode-auf-snapchat.html |
| Need help | **Brauche Hilfe** / *Ich brauche Hilfe* | Clear. | — |
| Heading home / check in / home safe | **Auf dem Heimweg / melde mich / Gut zu Hause** | *Sich melden* is the idiomatic "check in". | — |
| flare | **Leuchtsignal** | Neutral "light signal". Not the stadium-pyro word (*Bengalo*, *Pyro*). | — |
| flare vibes | Verlaufen / Ab an die Bar / Erste Reihe / Essen holen / Klo / Frische Luft / Merch-Stand / Bin bald weg | Natural. *Klo* is informal but not vulgar. | — |
| ping | **Ping / anpingen** | Tech anglicism, understood. | — |
| pin / meet-up | **Pin / Treffpunkt** | Natural. | — |
| plan | **der Plan** | — | — |
| Story | **Story** | Instagram and Snapchat users say *Story*. | — |
| Up next | **Demnächst** | — | — |
| Your gigs | **Deine Konzerte** | — | — |
| Bump | **Handys anstoßen** | *Anstoßen* = clink glasses. A playful image. | https://deutschgo.com/en/dictionary/terms/anstoßen , https://www.duden.de/konjugation/anstoszen |
| Light me up | **Leuchten** | Neutral. | — |
| beacon / flashing | **blinkendes Handy / leuchtet** | — | — |
| Ride | **Fahrt** | Uber in German uses *Fahrt*. | — |
| sound desk / encore | **Mischpult / Zugabe** | Correct concert terms. | — |
| venue | **Location** | Denglisch, but the standard word in German event language. | — |
| nudge text | "Hey du, öffne Moshpoint und tippe auf Live gehen…" | — | — |
| colours | pink, blau, grün, orange, lila, weiß | — | — |

## Changed

| Old → New | Reason | Source |
|---|---|---|
| *%1$s ist jetzt dein Freund* → *Du und %1$s seid jetzt befreundet* | Possessive *dein Freund* normally means "your boyfriend". | https://discoverdiscomfort.com/friend-in-german-freund/ , https://blogs.transparent.com/german/?p=8127 |
| *Tipp, um… / Tipp zum… / Tipp auf… / Ein Tipp:* (≈29 places, plus the widget) → *Tippe, um… / Tippen zum… / Tippe auf… / Einmal tippen:* | At the start of a sentence *Tipp* reads as the noun "tip/hint". Duden lists both *tipp* and *tippe* as imperatives, so the unambiguous forms were used. | https://www.duden.de/rechtschreibung/Tipp , https://www.duden.de/konjugation/tippen_wetten |
| *Find deine Freunde in jeder Menge* → *…in jeder Menschenmenge* | *Jede Menge* is a fixed idiom for "loads of", so the headline read as "find loads of your friends". | https://www.duden.de/rechtschreibung/Menge |
| *Gut daheim / ist gut daheim / Bin gut daheim* → *Gut zu Hause…* | *Daheim* sounds southern or Austrian/Swiss. *Zu Hause* is neutral in all three countries. | — |
| *Kümmer dich.* → *Frag nach, ob alles okay ist.* | Clipped and slightly bossy. The new wording says what to do. | — |
| *Gib ihnen einen Namen* → *Gib der Person einen Namen* | Lowercase *ihnen* (plural) for one person read oddly. | — |
| *Heizt euch schon mal ein!* → *Bringt euch schon mal in Stimmung!* | *Jemandem einheizen* also means "give someone hell". | — |
| *Geh bald 👋* → *Bin bald weg 👋* | More natural colloquial wording. | — |
| *Hat sich %1$s weg bewegt* → *Ist %1$s weitergezogen* | Ungrammatical spacing and clumsy wording. | — |
| *Live · Geist / 1 Stunde Geist* → *Live · Geistmodus / 1 Stunde Geistmodus* | Matches the established feature name. | Snapchat links above |
| *Lösen* (unpin) → *Loslösen* | *Lösen* alone also means "solve". | — |
| *lass die Vorfreude starten* → *lass die Vorfreude steigen* | Idiomatic. | — |

## Checked and safe (kept)
- **Handys anstoßen / Angestoßen!**: "clink" as in toasting. No sexual or drug sense. https://deutschgo.com/en/dictionary/terms/anstoßen
- **Leuchtsignal**: neutral. The stadium pyro words are *Bengalo* and *Pyro*, which were not used.
- **Ab an die Bar 🍺**: harmless.
- **Location** for venue: normal German event jargon.
- **Klo**: informal, not vulgar.
- **Geistmodus**: matches Snapchat DE.

## For a native reviewer
1. **Fallback name *Freund*** for a nameless crew member. It is masculine, and a woman would also be labelled *Freund*. Alternatives: *Crew-Mitglied*, *Buddy*. Confidence the current choice is OK: **medium**.
2. **Mixed imperative forms.** A few lowercase *tipp* and *kopier* forms mid-sentence remain colloquial. Fine for casual tone. Confidence **high**.
3. **Swiss users.** `values-de` uses *ß* (*weiß*, *Schließen*). Switzerland writes *ss*. Consider a `values-de-rCH` copy with ß→ss. Confidence the current strings are understood in CH: **high**.
4. ***Leuchtsignal*** as a casual status message. Natural enough? Confidence **medium-high**.

## UI review

Shortened so the text fits like English does in the rendered screens:

| Key | Old | New |
|---|---|---|
| `find_restart_scan` | Scan neu starten | Neu scannen |
| `find_last_seen_on_map` | Zuletzt auf der Karte | Letzter Standort |
| `find_band_nearby` | In der Nähe | Nah dran |
| `home_plan_gig` | Konzert planen (suchen, jetzt einladen) | Konzert planen (suchen, einladen) |
| `home_one_thing_first_more` | ERST NOCH EINS · %d WEITERE(S) | ERST EINS · NOCH %d |
| `home_tap_mate_hint` | Tippe auf einen Freund, um ihn zu finden · gedrückt halten für Optionen | Antippen zum Finden · halten für Optionen |
| `home_chat_subtitle` | Nachrichten, der Plan, Leuchtsignale | Chat, Plan, Leuchtsignale |
| `home_asleep_text` | … und am Tag bekommst du eine Erinnerung. | Ruht bis zum Konzerttag: … am Tag erinnern wir dich. |

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **Karte der Location** | *Location* is the venue word used throughout. *Oben/Unten* keeps the tag short enough to sit on a photo; the screen-reader text says it in full. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Oben / ↓ Unten** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | eine Etage höher / eine Etage tiefer | Said in full after the mate's direction. |

For a native reviewer: *Oben/Unten* versus *Obergeschoss/Untergeschoss*: the short form was chosen for size. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **Uhr** / **Handgelenk** / **Vibrationen** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Handy außer Reichweite** | The watch has lost its Bluetooth link to the phone. *Außer Reichweite* is the usual phrase for a Bluetooth device that is too far away. Phone reception is *Empfang* in the app, so the two can't be confused. |
| Hold (on the round button) / Hold to tell your crew | **Halten** / Halten, um deiner Crew Bescheid zu sagen | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Halt dein Handgelenk flach** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Folge den Vibrationen** | Shown when there is a distance but no direction. |
| Not sent yet | **Noch nicht gesendet** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Bisher hat es nur die Crew in der Nähe | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Am nächsten dran** / **Crew-Status** | Names in the watch's pickers. |

For a native reviewer: *Am nächsten dran* as the name of the watch-face complication (a literal *Nächster Freund* reads as "next friend"). *Halten* alone on the round button. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.

## "I'm here" pin (`strings_here.xml`)

Eight strings: the **I'm here** button in the drop-a-pin dialog and the line under it, the
"pinned 3 min ago" note on a mate's face (map, list, radar, finder), and your own pin's row in
the map's list. Validator prints **OK**. See `docs/IM_HERE.md`.

| English | Chosen |
|---|---|
| I'm here (button) | **Ich bin hier** |
| Your crew sees you on this spot, with the floor, until you walk away (20 min at most). | Deine Crew sieht dich an dieser Stelle, mit dem Stockwerk, bis du weggehst (höchstens 20 Min.). |
| pinned 3 min ago (%1$s = the app's "3 min ago" / "just now") | gepinnt %1$s |
| You're here / Pinned 3 min ago · your crew sees you here | Du bist hier / Gepinnt %1$s · deine Crew sieht dich hier |
| Take your pin down (screen reader, ✕) | Deinen Pin entfernen |

Uses **Crew** and **Pin** (*gepinnt*), as elsewhere. *gepinnt gerade eben* (with "just now") is colloquial; *gerade gepinnt* would read better but the time phrase is shared with the rest of the app. Written without a native reviewer. Confidence: **medium**.
