# Polish (pl) translation review: `values-pl`

Validator: `check_translation.py app/src/main/res/values-pl` prints **OK**. The plurals have one, few, many and other forms, and I checked their grammar.

Note: only web search worked. Direct fetches to miejski.pl and wiktionary.org were blocked by the sandbox network.

## Key terms

| English | Polish | Why | Sources |
|---|---|---|---|
| crew | ekipa | The standard casual word for a group of friends | – |
| mate / friends | znajomy / znajomi | Neutral and widely used | – |
| fallback name "Mate" | Znajomy | – | – |
| nudge "mate" | ekipo (vocative) | Casual "Hey crew" | – |
| gig | koncert | – | – |
| Go live / live / hidden | Udostępnij lokalizację / Udostępniasz (udostępnia) / Ukryty | Location-sharing wording, so it does not read as a livestream (see second-round changes) | – |
| Ghost mode | Tryb ducha | The same name Snapchat's Ghost Mode has in Polish | https://www.kontentino.com/pl/social-media-urban-dictionary/snapchat-map/ , https://spidersweb.pl/2017/06/snapchat-mapa.html |
| Need help | Potrzebuję pomocy | – | – |
| Heading home / check in / home safe | Wracam do domu / Dam znać / Jestem bezpiecznie w domu | Natural | – |
| **flare** | **flara** (was *raca*) | See "Changed" | see below |
| flare vibes | Nie wiem, gdzie jestem; Czas na bar; Pod barierkami; Idę po jedzenie; Toalety; Na świeżym powietrzu; Stoisko z merchem; Zaraz się zbieram | Natural and casual | – |
| ping | ping / pinguje | Anglicism | – |
| pin / meet-up | pinezka / zbiórka | "Pinezka" is the usual map-pin word | – |
| Story | Relacja | The name Instagram uses in Polish ("Twoja relacja") | https://www.instalki.pl/demonstracje/mobile/jak-udostepnic-czyjas-relacje-na-instagramie/ |
| moment | moment | – | – |
| Up next | Wkrótce | – | – |
| Your gigs | Twoje koncerty | – | – |
| Bump | Stuknij / Stuknijcie się telefonami | Like "stuknąć się kieliszkami" (clink glasses) | see "Checked" |
| Light me up | Podświetl mnie | Literal | – |
| sound desk / encore | realizatorka / bis | Concert-goer jargon | – |
| Ride | Przejazd | – | – |
| colours | różowy, niebieski, zielony, pomarańczowy, fioletowy, biały | – | – |

## Changed

- **raca → flara** everywhere: "Odpal racę" became "Wyślij flarę", "odpala racę" became "wysyła flarę", "Raca:" became "Flara:", and "race" became "flary". The keys are `crew_chat_send_flare_hint`, `crew_chat_night_tools_later`, `crew_chat_you_flare`, `crew_chat_flare`, `crew_flare_title`, `crew_notif_flare`, `crew_ping_flare`, `crew_ping_title_flare` and `home_chat_subtitle`.
  - **Reason:** in Poland "raca" and "odpalić racę" are the words for stadium pyrotechnics. Bringing pyrotechnics into a mass event, and concerts count as mass events, is a crime under the Mass Events Safety Act (art. 59). The word comes up constantly in news about football hooligans and about pyro bans on 11 November (Independence Day marches). A concert app telling people to "fire a raca" sounds like it encourages an illegal act and carries hooligan and political overtones. "Flara" is the neutral loanword for a signal flare, and the verb "wysłać" (send) also drops the "fire" meaning.
  - **Sources:** https://www.rmf24.pl/fakty/news-race-zabronione-na-polskich-stadionach,nId,86030 ; https://e-prawnik.pl/temat/zaostrzenie-przepisow-uderzy-w-bandytyzm-stadionowy.html ; https://tvn24.pl/tvn24-news-in-english/polish-officials-ban-use-of-pyrotechnics-on-independence-day-st8172517 ; https://www.benchmark.pl/testy_i_recenzje/co-to-sa-flary.html (shows "flara" in use)

## Changed (second round): "live" → location sharing

At the coordinator's request, "Go live / Live" no longer reads like starting a livestream (on Instagram, Polish "live" means a broadcast). It now uses location-sharing wording. The "LIVE" tag on story photos (`find_live_tag`) is unchanged.

| Key | Old | New |
|---|---|---|
| home_go_live (button) | Włącz live | Udostępnij lokalizację |
| home_live, crew_tile_live, find_pill_live | Live | Udostępniasz |
| home_live_ghost | Live · duch | Udostępniasz · duch |
| home_tile_live, time_live (a mate's status) | live | udostępnia |
| visibility_channel / visibility_notification | Status live / Jesteś live: … | Udostępnianie lokalizacji / Udostępniasz lokalizację: … |
| setup_stay_live | Zostań live po restarcie | Udostępniaj dalej po restarcie |
| setup_onb_title_live | Włącz live, gdy wchodzisz | Udostępnij lokalizację, gdy wchodzisz |
| main_nudge_title | Poproś, żeby włączyli live | Poproś o udostępnienie lokalizacji |

Every sentence that quotes the button now says "Udostępnij lokalizację" or "udostępniasz lokalizację": `home_hidden_hint`, `main_nudge_text`, `find_searching_help`, `find_map_no_mates`, `crew_wake_text(_venue)`, `setup_stay_live_desc`, `setup_about_text`, `setup_onb_body_live` and `setup_onb_need_notifications_why`. "Hidden" stays "Ukryty". Validator: OK.

## Checked and safe

- **Stuknij / stuknijcie się telefonami**: the colloquial "stuknąć **kogoś**" can mean "to bump someone off" (kill), according to Langenscheidt. The app only uses the reflexive form with an instrument ("stuknąć się telefonami"), which matches "stuknąć się kieliszkami". Search found no sexual sense. Source: https://en.langenscheidt.com/polish-german/stukn%C4%85%C4%87
- **Tryb ducha** matches Snapchat (link above).
- **Nakręcajcie się** ("get hyped"): a common casual usage.

## For a native reviewer

1. **flara** (medium-high confidence). Check that it sounds natural and not military. "Sygnał" was rejected because the app already uses "sygnał" for Bluetooth signal.
2. **realizatorka** for "sound desk" (medium confidence). I believe "pod realizatorką" is real concert jargon, but search could not confirm it. If it isn't, "przy stanowisku dźwiękowca" is the safe alternative.
3. **Stuknij** as the Bump button name (medium-high confidence). The bare form appears in "(ta osoba też otwiera Stuknij)".
4. **Podświetl mnie** for "Light me up" (medium confidence). It is understandable but literal. "Zaświeć ekranem" could be livelier.
