# Indonesian (id) translation review

Folder: `app/src/main/res/values-in`. Validator: `check_translation.py` prints **OK**.

Overall: the tone is casual Jakarta-style Indonesian (nggak, aja, bikin, kasih, lagi), which suits an audience aged 18–35. The slang choices (OTW, Gas!, geng, nggak) are fine. The serious problem was **"butuh"**, which is used for the Need help button. It is a vulgar word in Malaysia (see Changed). "Ojol" was also semantically wrong for the button it labelled.

## Key terms

| English | Chosen | Why | Sources |
|---|---|---|---|
| crew | geng | KBBI marks it as colloquial: 1) a youth group bonded by school or area; 2) gerombolan (gang). Among young people it's an affectionate "my squad" ("geng kantor", "gengs"). Malaysian Malay uses geng the same way. Kept, and now used consistently (see Changed) | https://kbbi.web.id/geng |
| mate / friends | teman | Neutral, understood in both countries | — |
| fallback "Mate" | Teman | — | — |
| gig | konser | — | — |
| Go live / live / hidden | Mulai live / live / Tersembunyi | "live" as an English loan is everyday Indonesian (from Instagram and TikTok live) | — |
| Ghost mode | Mode hantu | Matches Snapchat's Indonesian Ghost Mode name. "hantu" has no religious or occult problem in this UI use | https://newsroom.snap.com/introducing-snap-map?lang=id-ID ; https://parental-control.flashget.com/id/what-is-snapchat-ghost-mode |
| Need help | **Perlu bantuan** (was Butuh bantuan) | See Changed | https://en.wiktionary.com/wiki/butuh |
| Heading home | Pulang dulu | Idiomatic ("I'm off home") | — |
| check in / home safe | Kabari / Sudah sampai rumah | Natural | — |
| flare | suar | KBBI: a flame used as a signal. Correct, if a bit literary | https://kbbi.web.id/suar |
| flare vibes | Nyasar / Ke bar dulu / Di barisan depan / Cari makan / Ke toilet / Cari angin di luar / Booth merch / Bentar lagi cabut | Natural slang. "cabut" means "leave" in both Indonesia and Malaysia | — |
| On my way | OTW | Common Indonesian slang abbreviation | https://www.merdeka.com/jabar/30-singkatan-gaul-2020-yang-sering-dipakai-kln.html |
| Let's go | Gas! | From "gas"/"gaskeun": "go, let's do it". Popular youth slang | https://mojok.co/terminal/panduan-pakai-kata-gaskeun-dalam-percakapan-bahasa-sunda/ |
| ping | ping | English loan, understood | — |
| pin / meet-up | sematkan (pin a plan) / Titik kumpul / pin | "Sematkan" is what WhatsApp Indonesian uses for "Pin" | — |
| plan | rencana | — | — |
| Story / moment | Cerita / momen | Instagram Indonesian calls Stories "Cerita" | — |
| Up next / Your gigs | Berikutnya / Konser kamu | — | — |
| Bump | Tempel HP | "tempel" = hold/stick together. Literal and clean | — |
| Light me up | Nyalakan layarku | Literal "turn on my screen". No drug or sex sense ("nyalain" in some contexts means lighting a cigarette, but "layar" makes the meaning clear) | — |
| Find / Ride | Cari / **Pesan taksi** (was Ojol) | See Changed | — |
| sound desk / encore | FOH / encore | "FOH" appears in mainstream Indonesian concert-tips articles aimed at general readers | https://www.popbela.com/career/working-life/6-risiko-bahaya-nonton-konser-yang-jarang-orang-tahu-perlu-waspada-00-yl7dn-dxbftq/amp |
| phone | HP | The standard Indonesian word ("hape") | — |
| nudge | "Hai %1$s, buka Moshpoint dan ketuk Mulai live…" | Friendly | — |
| onboarding headlines | Temukan temanmu di keramaian mana pun · Mulai live begitu masuk · Teman-temanmu manggil kamu apa? | Natural | — |
| colours | pink biru hijau oranye ungu putih | "pink" is the everyday word (merah muda is formal) | — |

## Changed

| Key(s) | Old | New | Reason | Source |
|---|---|---|---|---|
| home_ping_need_help, crew_quick_need_help, crew_ping_need_help, crew_ping_title_need_help, crew_notif_help(_where), crew_help_sms(_where), setup_emergency_contact_desc, main_setup_location_off, main_photos_permission_needed, find_needs_camera, setup_onb_body_live (14 occurrences) | butuh / Butuh / BUTUH | perlu / Perlu / PERLU | In **Malaysian Malay, "butuh" is a vulgar word for the penis and is also used as an insult**. It is a well-known Indonesian–Malay false friend. It appeared on the safety button and in the SMS sent to an emergency contact. "Perlu" means "need" and is natural in both countries | https://en.wiktionary.com/wiki/butuh ; https://singlishdict.app/?q=butoh ; https://en.wiktionary.com/wiki/Appendix:False_friends_between_Indonesian_and_Standard_Malay_(S-Z) |
| find_ride | Ojol | Pesan taksi | "Ojol" (ojek online) means a **motorbike** taxi, and the button opens an Uber car ride. Malaysians mostly don't use the word. "Pesan taksi" ("order a taxi") is clear in both countries | https://mojok.co/terminal/rasanya-naik-ojol-di-bandung-jogja-jakarta-dan-malang/ ; https://economy.okezone.com/read/2023/09/05/320/2876871/mengenal-istilah-istilah-abang-ojol-dari-gacor-hingga-opik?page=all |
| crew_vibe_bar | Ngebir dulu 🍺 | Ke bar dulu 🍺 | "Ngebir" explicitly means "drinking beer". This is a ready-made status sent to the group in a Muslim-majority market (and Malaysia). "Ke bar dulu" keeps the meaning of the English "Bar time" without spelling out the drinking | — |
| find_story_title, find_the_story_eyebrow | Ceritanya / CERITANYA | Cerita / CERITA | "Ceritanya" on its own as a title reads like "so the story goes…" / "supposedly". Now matches the "Cerita" tab | — |
| crew_default_group_name, home_start_gig_group, main_invite_expired, main_group_invite_title | grup | geng | Consistency: the rest of the app calls the crew "geng" | — |

## Checked and safe

- **geng.** Its secondary KBBI sense is "gang", but in context ("Geng kamu", "Bikin geng") it reads as "your squad". Malaysian youth use geng the same way.
- **hantu.** Matches Snapchat's own Indonesian "Mode Hantu".
- **Nyasar, cabut, nempel, aman, banget.** These are colloquial but not vulgar.
- **gampang, buntut, pantat.** These Malaysian taboo or false-friend words don't appear. ("gampang" is a curse word in Malaysia; see the Wiktionary false-friends appendix above.)

## Reading as a Malaysian

After the fixes, nothing is offensive to a Malaysian reader. It will still clearly read as Indonesian:
- "nggak / aja / bikin / kasih" (Malay: tak / je / buat / bagi)
- "HP" (Malay: telefon / fon)
- "Nyasar" (Malay: sesat)
- "mobil" (Malay: kereta)
- "bisa" ("can"; in Malay it means "venom", though Malaysians recognise the Indonesian sense from media)
- "aku/kamu" (very casual in Malaysia; "saya/awak" is more usual)

Android does not fall back from `ms` to `in`, so Malaysian-locale phones won't see this file unless a `values-ms` folder is added. Add one for Malaysian users.

## For a native reviewer

1. **suar for flare** (medium). It's correct but literary. Young users might prefer just "flare" or "sinyal". I kept it because it is consistent across 9 strings.
2. **FOH for sound desk** (medium-high). It's understood by regular concert-goers, but casual fans might say "dekat mixer".
3. **Pesan taksi** (medium-high). "Taksi online" is the more exact Indonesian term. "Pesan taksi" was chosen so it also reads well in Malaysia.
4. **Ke bar dulu** (high). Fine. The owner could restore "Ngebir dulu" if they want a cheekier tone in Indonesia only.
5. **Battery setting names** in main_battery_text ("Jangan optimalkan" / "Tidak dibatasi") (medium). They match stock Android, but phone brands differ.

## UI review
Shortened so the text fits the way English does:
- `setup_onb_title_find`: *Temukan temanmu\ndi keramaian mana pun* → *Temukan temanmu\ndi keramaian* (the welcome title took 4 lines, with "pun" alone on the last one)
- `find_band_nearby`: *Sekitar sini* → *Dekat* (the big finder word wrapped onto 2 lines. Matches *Makin dekat*)
- `find_last_seen_on_map`: *Terakhir terlihat di peta* → *Terakhir di peta* (the button wrapped)
- `find_map_title`: *Peta mosh* → *Peta* (the map header title wrapped and pushed "Updated…" into an ellipsis)
- `find_place_only_you`: *cuma kamu yang lihat* → *khusus kamu* (the map row subtitle took 2 lines)
- `home_plan_gig`: *Rencanakan konser (cari, undang sekarang)* → *Atur konser (cari, undang)* (the button wrapped)
- `home_family_can_follow`: *Keluarga bisa ikut memantau dari rumah* → *Keluarga bisa pantau dari rumah* (wrapped onto 2 lines)

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **peta venue** | *Venue* as in `crew_at_venue`. *Kamu*, matching the app's tone. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Lantai atas / ↓ Lantai bawah** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | di lantai atas / di lantai bawah | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **jam (jam tangan)** / **pergelangan tangan / tangan** / **getaran** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **HP tidak terhubung** | The watch has lost its Bluetooth link to the phone. *HP tidak terhubung* (the phone isn't connected). *Di luar jangkauan* was avoided: it is what the phone network says for "no coverage". |
| Hold (on the round button) / Hold to tell your crew | **Tahan** / Tahan untuk kabari gengmu | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Posisikan jam mendatar** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Ikuti getarannya** | Shown when there is a distance but no direction. |
| Not sent yet | **Belum terkirim** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Baru sampai ke geng yang di dekatmu | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Teman terdekat** / **Status geng** | Names in the watch's pickers. |

For a native reviewer: *Jam* alone for the watch. *Posisikan jam mendatar* ("hold the watch level") instead of a literal "wrist flat". *Belum terkirim* serves for both "Not sent" (the app's own wording) and "Not sent yet". The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium**.
