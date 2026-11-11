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
