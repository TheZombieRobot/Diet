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
