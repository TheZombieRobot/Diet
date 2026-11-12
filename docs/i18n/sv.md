# Swedish (sv) translation review: `values-sv`

Validator: `check_translation.py app/src/main/res/values-sv` prints **OK**.

Note: during this review only web search worked. Direct page fetches to svenska.se (SAOL/SO) and wiktionary.org were blocked by the sandbox network, so the sources below are search results I saw, not dictionary pages I opened.

## Key terms

| English | Swedish | Why | Sources |
|---|---|---|---|
| crew | **grupp** (gruppen, din grupp, gruppens) — was *gäng* | Neutral word. Swedish *gäng* is strongly tied to gang crime in current news. See "Changed". | https://kaweah.freedombox.rocks/kiwix/wiktionary_en_all_maxi_2023-04/g%C3%A4ng , https://www.svt.se/kultur/sprakradets-nyord-2023 |
| mate / friends | kompis / kompisar | The standard casual word | https://www.thelocal.com/20191118/swedish-word-of-the-day-kompis/ |
| fallback name "Mate" | Kompis | Same as above | same |
| gig | spelning | The standard word for a live gig | – |
| Go live / live / hidden | Gå live / live / dold | "Live" is a well-known loanword | – |
| Ghost mode | Spökläge | Same word Snapchat uses for Ghost Mode in Swedish | https://newsroom.snap.com/introducing-snap-map?lang=sv-SE |
| Need help | Behöver hjälp | Plain and clear | – |
| Heading home / check in / home safe | På väg hem / checka in / Hemma | Common colloquial Swedish | – |
| flare | lysraket | A signal flare. Sweden's stadium-pyro word is "bengal", so this has no hooligan link. | – |
| flare vibes | Vilse, Bardags, Längst fram, Hämtar mat, Toaletterna, Ute och andas, Merchståndet, Drar snart | Casual and natural | – |
| ping | ping / pingade | Established anglicism | – |
| pin / meet-up | nål / träffpunkt | Google Maps calls a dropped pin "nål" in Swedish | – |
| plan | planen | – | – |
| Story | Storyn | Instagram's Swedish interface says "berättelse", but people say "story" when they talk. Kept for the casual tone. | https://www.pippit.ai/sv-se/resource/how-to-share-someone-story-to-your-story-on-instagram |
| moment | ögonblick | – | – |
| Up next | På gång | – | – |
| Your gigs | Dina spelningar | – | – |
| Bump | Bumpa | Playful anglicism. Search found no established Swedish slang meaning. The English drug sense ("a bump") belongs to the source word too. | https://dictionary.langeek.co/en-SV/word/25068 |
| Light me up | Lys upp mig | Literal and harmless | – |
| sound desk / encore | ljudbordet / extranumret | Standard terms | – |
| Ride | Åk | Short button label | – |
| colours | rosa, blått, grönt, orange, lila, vitt | Neuter forms are correct when a colour is used as a noun ("Din färg är blått") | – |

## Changed

- **gäng → grupp everywhere** (about 75 strings, at the coordinator's request, choosing the safe option). Every sentence was rewritten by hand to fix grammar, because *gäng* is neuter and *grupp* is common gender:
  - ett gäng → en grupp; gänget → gruppen; gängets → gruppens; ditt/mitt gäng → din/min grupp; nytt gäng → ny grupp; det här gänget → den här gruppen
  - "Det sover" → "Den sover" (`setup_plan_desc`); "Döp det" → "Döp den" (`home_start_gig_group_text`)
  - Compounds: Spelningsgäng → Spelningsgrupp, spelningsgäng → spelningsgrupp, huvudgäng → huvudgrupp, Kvällens gäng → Kvällens grupp, Gängets chatt → Gruppens chatt
  - "Gänget larmat ✓" → "Gruppen larmad ✓" (adjective agreement)
  - `crew_friend_need_crew`: "i ett gäng tillsammans" → "i samma grupp"
  - `main_named_crew`: "%1$s och gänget" → "%1$s och kompisarna". This avoids a genitive -s on names that may already end in s.
  - Reason: *gäng* has a strong crime association in Sweden right now (gängkriminalitet, gängvåld), and phrases like "Starta ett gäng" read as "start a gang".

- (Superseded by the change above) **Gängchatt → Gängets chatt → Gruppens chatt** (in `crew_chat_subtitle`, `home_crew_chat` and `home_crew_chat_unread`). Compounds that start with *gäng-* are dominated by crime vocabulary in Swedish news: gängkriminalitet, gängvåld, gängmedlem. Language Council new-word lists from 2021 to 2024 keep highlighting gang crime. "Gänget" on its own, or "-gäng" at the end of a word (kompisgäng), reads as a friend group. Sources: https://www.svt.se/kultur/sprakradets-nyord-2023 and https://kaweah.freedombox.rocks/kiwix/wiktionary_en_all_maxi_2023-04/g%C3%A4ng (the list of derived terms shows both neutral and criminal compounds).
- **Matrunda 🍔 → Hämtar mat 🍔** (`crew_vibe_food`). "Matrunda" sounds like a food tour. "Hämtar mat" ("getting food") is what people would actually write. This is a style fix with no source.

## Checked and safe

- **lysraket**: a distress or signal flare. Swedish pyro culture uses "bengaler", so this word has no hooligan or crime link.
- **Spökläge / spöke**: matches Snapchat's Swedish term (link above).
- **Bumpa**: search found no Swedish slang meaning. The similar Jamaican/British "bumpa" (meaning buttocks) is not Swedish.
- **Peppa loss / Drar snart / Kör!**: ordinary casual Swedish.

## For a native reviewer

1. **grupp** (high confidence it is safe; medium that it is the liveliest choice). It is neutral and a little plain. "Starta en grupp" reads like WhatsApp, which fits.
2. **Bumpa** (medium confidence). Check that it reads as playful, not odd. "Stöt ihop telefonerna" would be a more native alternative.
3. **Storyn vs Berättelsen** (high confidence that "Storyn" is fine colloquially).
4. **Hemma ✅** for "Home safe" drops the word "safe". "Hemma, allt ok ✅" is an option.

## UI review

Shortened after checking the rendered screens against English (validator: OK).

| Key | Old | New | Why |
|---|---|---|---|
| home_plan_gig | Planera en spelning (hitta den, bjud in nu) | Planera spelning (hitta, bjud in) | Button wrapped |
| home_chat_subtitle | Meddelanden, planen, lysraketer | Chatt, planen, lysraketer | Truncated with "…" |
| find_spin_scan | Snurrskanning | Snurra | Word was broken mid-word ("Snurrskannin g"); matches "Snurra långsamt" |
| find_restart_scan | Starta om skanningen | Skanna igen | Button wrapped |
| find_last_seen_on_map | Senast sedd på kartan | Senast på kartan | Button wrapped |
| setup_onb_body_find | …pekar en pil rakt mot dem… | …pekar en pil mot dem… | Lone word on last line |

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **karta över stället** | *Stället* as in `crew_at_venue`. *Uppkoppling* for a connection. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Uppe / ↓ Nere** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | en trappa upp / en trappa ner | Said in full after the mate's direction. |

For a native reviewer: *Uppe* can also mean "awake"; with the arrow and on a map it reads as upstairs. *En trappa upp* (used for screen readers) is the unambiguous form if it needs changing. Confidence: **medium-high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **klocka** / **handled** / **vibrationer** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Telefonen är utom räckhåll** | The watch has lost its Bluetooth link to the phone. *Utom räckhåll* for Bluetooth range; phone reception is *täckning* in the app. |
| Hold (on the round button) / Hold to tell your crew | **Håll in** / Håll in för att säga till gruppen | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Håll handleden plant** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Följ vibrationerna** | Shown when there is a distance but no direction. |
| Not sent yet | **Inte skickat än** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Än så länge har bara gruppen i närheten fått det | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Närmaste kompis** / **Gruppstatus** | Names in the watch's pickers. |

For a native reviewer: *Håll in* on the round button. *Säga till gruppen* for telling the crew. *Klockappen* for the watch app. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.
