# Turkish (tr) translation review: `values-tr`

Validator: `check_translation.py app/src/main/res/values-tr` prints **OK**. The percent sign goes before the number (`%%%1$d` renders as %40), which is the correct Turkish convention.

Note: only web search worked. Direct page fetches were blocked by the sandbox network.

## Key terms

| English | Turkish | Why | Sources |
|---|---|---|---|
| crew | ekip | The standard casual word | – |
| mate / friends | arkadaş / arkadaşlar | Neutral | – |
| fallback name "Mate" | Arkadaş | – | – |
| nudge "mate" | kanka | A very common casual word for a close friend among young people. Not vulgar. | https://www.haberturk.com/ne-demek/kanka-ne-anlama-gelir |
| gig | konser | – | – |
| Go live / live / hidden | Konumu paylaş / Paylaşılıyor (paylaşıyor) / Gizli | Location-sharing wording, so it does not read as a livestream (see second-round changes) | – |
| Ghost mode | Hayalet modu | The same name Snapchat uses in Turkish | https://parental-control.flashget.com/tr/snap-map , https://newsroom.snap.com/introducing-snap-map?lang=tr-TR |
| Need help | Yardım lazım | – | – |
| Heading home / check in / home safe | Eve dönüyorum / haber vermek / Evdeyim, her şey yolunda | Natural | – |
| **flare** | **işaret** (was *meşale*) | See "Changed" | below |
| flare vibes | Kayboldum, Bar zamanı, En öndeyim, Yemek molası, Tuvaletler, Hava almaya çıktım, Merch standı, Birazdan çıkıyorum | Natural | – |
| ping | ping / ping attı | Anglicism | – |
| pin / meet-up | pin / buluşma noktası | Casual. Google's Turkish interface uses "raptiye". | https://developers.google.com/maps/documentation/urls/guide?hl=tr |
| Story | Hikâye | Instagram uses "Hikaye" / "Hikayene ekle" in Turkish | https://www.outfy.com/blog/tr/instagramda-bir-hikaye-nasil-yeniden-paylasilir/ |
| moment | an | – | – |
| Up next | Sıradakiler | – | – |
| Your gigs | Konserlerin | – | – |
| Bump | Tokuştur | "tokuşturmak" means to clink (glasses or eggs) or touch fists. Playful and harmless. | see "Checked" |
| Light me up | Ekranımı yak | "Turn my screen on bright", the same pattern as "ışığı yak" (turn on the light) | – |
| sound desk / encore | ses masası / bis | Standard | – |
| Ride | Araç | – | – |
| colours | pembe, mavi, yeşil, turuncu, mor, beyaz | – | – |

## Changed

- **meşale → işaret** everywhere: "Meşale yak" became "İşaret gönder", "meşale yaktı" became "işaret gönderdi", "Meşale:" became "İşaret:", and "meşaleler" became "işaretler". The keys are `crew_chat_send_flare_hint`, `crew_chat_night_tools_later`, `crew_chat_you_flare`, `crew_chat_flare`, `crew_flare_title`, `crew_notif_flare`, `crew_ping_flare`, `crew_ping_title_flare` and `home_chat_subtitle`.
  - **Reason:** "meşale yakmak" is the exact phrase for the stadium-pyro offence under Turkish Law No. 6222 on sports violence. Fans are prosecuted and banned from stadiums for it. A concert app button saying "Meşale yak" echoes a punishable act. "İşaret" (signal or sign) is neutral. I rejected "sinyal" because the app already uses it for the Bluetooth signal, and "işaret fişeği" is also on the list of banned items.
  - **Sources:** https://www.ffkpartnerhukuk.com.tr/sahaya-yabanci-madde-atmanin-cezasi-2026-guncel-rehber-6222-sayili-kanun-kapsaminda-spor-alanlarinda-suclar/ ; https://hukukcularevi.com/taraftar-haklari-ve-seyirden-men-cezasi/ ; https://normkararlarbilgibankasi.anayasa.gov.tr/Dosyalar/Kararlar/KararPDF/2015-16-nrm.pdf
- **"Bir ara." → "Onu ara."** (`crew_notif_overdue_text`, the alert that a friend heading home has not checked in). "Bir ara" is ambiguous: it can mean "give a call", but it usually means "sometime / one of these days". In a safety alert it could read as "call them sometime". "Onu ara" means "call them". This is a grammar fix with no source.

## Changed (second round): "canlı" → location sharing

At the coordinator's request, "Canlıya geç / Canlı" was reworded because in Turkish it reads like starting a livestream (Instagram's "Canlı yayın"). The "CANLI" tag on story photos (`find_live_tag`) is unchanged.

| Key | Old | New |
|---|---|---|
| home_go_live (button) | Canlıya geç | Konumu paylaş |
| home_live, crew_tile_live, find_pill_live | Canlı | Paylaşılıyor |
| home_live_ghost | Canlı · hayalet | Paylaşılıyor · hayalet |
| home_tile_live, time_live (a mate's status) | canlı | paylaşıyor |
| visibility_channel / visibility_notification | Canlı durum / Canlıdasın: … | Konum paylaşımı / Konumun paylaşılıyor: … |
| setup_stay_live | Yeniden başlatınca canlı kal | Yeniden başlatınca paylaşmaya devam et |
| setup_onb_title_live | İçeri girerken canlıya geç | İçeri girerken konumunu paylaş |
| main_nudge_title | Canlıya geçmelerini iste | Konumlarını paylaşmalarını iste |

Every sentence that quotes the button now says "Konumu paylaş" with the correct suffix ("Konumu paylaş'a dokun"): `home_hidden_hint`, `main_nudge_text`, `find_searching_help`, `find_map_no_mates`, `crew_wake_text(_venue)`, `setup_stay_live_desc`, `setup_about_text`, `setup_onb_body_live` and `setup_onb_need_notifications_why`. "Hidden" stays "Gizli". Validator: OK.

## Checked and safe

- **kanka**: an informal word for a close friend. Not vulgar. Sources disagree on whether it counts as slang (Habertürk link above).
- **Tokuştur / Tokuşturuldu**: comes from "tokuşmak" (to knock together). It is used for clinking glasses ("kadeh tokuşturmak"), which is a mild drinking image, and for touching fists. Search found no sexual or crime sense. Source: https://wiki.neonvagabond.xyz/content/wiktionary_en_all_nopic_2024-05/A/toku%C5%9Fmak
- **Hayalet modu** matches Snapchat Turkish.
- **Gazlayın / gaz başlasın** ("hype it up"): casual and positive among young people.

## For a native reviewer

1. **işaret** for "flare" (medium confidence). It is safe but a little flat. Check that "İşaret gönder" reads as "share where I am with a vibe".
2. **pin / Pinde buluşalım** (medium confidence). Casual users say "pin", but Google uses "raptiye". "Konumda buluşalım" is an alternative.
3. **Ekranımı yak** (medium-high confidence). "Ekran yanması" also means screen burn-in. Check that it doesn't sound like damaging the screen.

## UI review

Shortened after checking the rendered screens against English (validator: OK).

| Key | Old | New | Why |
|---|---|---|---|
| home_tap_mate_hint | Bulmak için bir arkadaşına dokun · seçenekler için basılı tut | Bulmak için dokun · seçenekler için basılı tut | Wrapped to 2 lines |
| home_one_thing_first_more | ÖNCE BİR ŞEY · %d TANE DAHA | ÖNCE BİR ŞEY · %d DAHA | Kicker wrapped |
| home_plan_gig | Konser planla (bul, şimdiden davet et) | Konser planla (bul, davet et) | Button wrapped |
| home_invite_mates_tonight | Bu gece için arkadaşlarını davet et | Arkadaşlarını davet et | Main button wrapped (the card title already says tonight) |
| home_tile_not_sharing | henüz paylaşmıyor | paylaşmıyor | Tile status wrapped |
| crew_chat_send_flare_hint (plural) | İşaret gönder: %d dk boyunca nerede olduğunu göster | İşaret gönder: %d dk konumunu göster | "göster" wrapped alone |
| find_restart_scan | Taramayı yeniden başlat | Yeniden tara | Button wrapped to 3 lines |
| find_last_seen_on_map | Haritada son görülen yer | Son konum | Button wrapped |
| find_place_crew_meetup | ekip buluşma noktası | buluşma yeri | Map row wrapped |
| find_place_only_you | bunu sadece sen görürsün | sana özel | Map row wrapped |
| setup_stay_live | Yeniden başlatınca paylaşmaya devam et | Yeniden başlayınca paylaş | Setting title wrapped |

Not fixable by wording: the "Konumu paylaş" chip squeezes the moshpoint logo into a broken wrap on Home (layout bug). The vetted term is kept.

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **mekân haritası** | *Mekân* as in `crew_at_venue`. Percent written `%%%1$d`, as in `find_saving_area_pct`. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Üst katta / ↓ Alt katta** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | üst katta / alt katta | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.
