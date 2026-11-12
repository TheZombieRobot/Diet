# Arabic (values-ar) translation review

Scope: all seven `strings*.xml` files in `app/src/main/res/values-ar`. Target: Modern Standard Arabic (MSA) with a light, friendly tone, read across the Gulf, Levant, Egypt and the Maghreb. Validator: `check_translation.py app/src/main/res/values-ar` printed **OK** before and after the edits.

Method: I read every string next to the English source and its comments. I checked risky words with web searches (dictionaries, dialect articles, official help pages from big apps). Some official pages (newsroom.snap.com) could not be opened from this session, so for those I relied on search-result snippets and say so below.

## Key terms

| English | Chosen Arabic | Why | Sources |
|---|---|---|---|
| crew | شلة (shilla) | Everyday word for a close group of friends in Gulf, Levantine, Iraqi and Egyptian speech, and familiar elsewhere from Egyptian media. The negative idea of cliques and favouritism belongs to a different word, الشللية, not to شلة itself. Kept. | https://www.alyaum.com/articles/6643464/الرأي/كلمة-ومقال/شلة-أبو-هادي ; https://midad.com/article/202403 ; https://lingolandedu.com/ar/english-arabic-dictionary/clique |
| mates | أصحاب / أصحابك | Common, warm, works in all regions. "Friends" (people kept across gigs) stays أصدقاء, which keeps the app's mates/friends distinction. | (usage; see reviewer note on صاحبتي) |
| fallback name "Mate" | صديق (changed) | See Changed. | — |
| gig / concert | حفلة | Standard for a concert or party everywhere. | — |
| Go live / Live / Hidden | اظهر / ظاهر / مخفي | Means visible/hidden, so it describes the feature exactly. WhatsApp's "Live location" is الموقع المباشر, and مباشر is kept for the story's LIVE badge. ظاهر has no slang meaning; it is also a man's name and a religious term (outward vs inner), which is harmless here. | https://blog.whatsapp.com/share-your-live-location?lang=ar |
| Ghost mode | وضع الشبح | The same term Arabic articles use for Snapchat's Ghost Mode. | https://e3arabi.com/technology/%D9%85%D8%B9%D9%84%D9%88%D9%85%D8%A7%D8%AA-%D8%B9%D9%86-%D8%AE%D8%B1%D9%8A%D8%B7%D8%A9-snap/ ; https://newsroom.snap.com/introducing-snap-map?lang=ar (seen in search results; could not open) |
| Need help | أحتاج مساعدة | Clear and neutral. The setting description quotes the same button text. | — |
| Heading home / check in / home safe | عائد إلى البيت / سجّل وصولك / وصلت البيت بأمان | Natural MSA. | — |
| flare | شعلة | Literally a flame or torch. Classical dictionaries give flame/spark (plus a Moroccan plant name). I found no drug, sex or crime slang. | https://arabiclexicon.hawramani.com/%d8%b4%d9%8e%d8%b9%d9%8e%d9%84%d9%8e/?book=33 |
| ping | تنبيه / نبّه | Neutral word for an alert. | — |
| pin / meet-up | دبوس / نقطة اللقاء | Google's Arabic Maps help uses دبوس for a map pin. | https://support.google.com/maps/?hl=AR ; https://www.guru99.com/ar/how-to-drop-a-pin-on-google-maps.html |
| plan | الخطة | — | — |
| Story / moment | القصة / لحظة | The same word Instagram and Snapchat use in Arabic. | https://e3arabi.com/technology/%D9%85%D8%B9%D9%84%D9%88%D9%85%D8%A7%D8%AA-%D8%B9%D9%86-%D8%AE%D8%B1%D9%8A%D8%B7%D8%A9-snap/ |
| Up next / Your gigs | القادم / حفلاتك | Short and clear. | — |
| Bump | تقريب الهواتف (changed) | See Changed. | — |
| Light me up | نوّر شاشتي | Means "light up my screen". نوّر is also a friendly greeting (نوّرت), with no bad meaning. | — |
| beacon / flashing | الشاشة الوامضة | — | — |
| Find / Ride | جِده / توصيلة | توصيلة is the everyday word for a lift or ride (Gulf, Egypt, Levant). | — |
| sound desk / encore | طاولة الصوت / الأغنية الأخيرة | Descriptive, so nothing can be misread. | — |
| nudge / invite | «مرحبًا %1$s، افتح Moshpoint واضغط «اظهر»…»; fallback صاحبي | Casual and friendly. | — |
| onboarding headlines | «جد أصحابك في أي زحمة»، «اظهر عندما تدخل»، «بماذا يناديك أصحابك؟» | Natural and casual. | — |
| colours | وردي، أزرق، أخضر، برتقالي، بنفسجي، أبيض | Standard and neutral. | — |

### Flare vibes (final)
| English | Arabic |
|---|---|
| Lost 😅 | ضعت 😅 (changed: تائه is masculine) |
| Bar time 🍺 | استراحة مشروبات 🥤 (changed; emoji swapped by coordinator decision) |
| At the rail 🎶 | في الصف الأمامي 🎶 |
| Food run 🍔 | وقت الأكل 🍔 (changed) |
| Toilets 🚻 | دورات المياه 🚻 (changed) |
| Outside for air 🌬️ | بالخارج أتنفس 🌬️ |
| Merch stand 👕 | كشك التذكارات 👕 |
| Leaving soon 👋 | سأغادر قريبًا 👋 |

## Changed

| Key | Old → New | Reason | Source |
|---|---|---|---|
| `crew_vibe_bar` | وقت البار 🍺 → استراحة مشروبات 🥤 | In Arabic, بار means an alcohol bar. Alcohol is banned in Saudi Arabia, and Saudi festivals (e.g. MDLBEAST Soundstorm) sell only soft drinks and mocktails. "Drinks break" is neutral everywhere. Coordinator decision: for Arabic only, the 🍺 emoji is also replaced with 🥤. | https://ibis.accor.com/en/ibis-magazine/travel-for-a-reason/mdlbeast-soundstorm.html ; https://www.yahoo.com/entertainment/since-does-middle-east-throw-195710697.html |
| `crew_plan_idea_bar` | يسار البار الرئيسي… → يسار ركن المشروبات الرئيسي في الاستراحة | Same reason. | same |
| `find_story_empty_crew`, `find_share_moment_help` | «المسرح، البار، أصحابك» → «المسرح، الأجواء، أصحابك» | Same reason; "the vibe" reads naturally here. | same |
| `crew_vibe_toilets`, `find_drop_pin_solo_help` | الحمّامات → دورات المياه | حمّام means toilet in the Levant and Egypt. In the Maghreb it usually means the public bath (hammam). دورات المياه is MSA, signposted that way in the Gulf, and clear everywhere. | https://sublearn.com/learn/ar/vocabulary/hmam ; https://asharq.com/culture/102620/الحمام-التقليدي-في-المغرب-ثقافة-التواصل-والتطهير |
| `home_bump_phones`, `setup_bump_title`, `setup_bump_joining`, `main_bumped_text` | تلامس (الهاتفين/الهواتف)، «تلامس»، تلامس الهاتفان! → قرّب الهاتفين من بعضهما، تقريب الهواتف، «تقريب الهواتف»، التقى الهاتفان! | تلامس ("touching") is common in body-contact, intimacy and harassment contexts, e.g. «التلامس الجسدي». As a bare feature name it could read oddly. تقريب ("bringing together") is unambiguous. The feature name is now the same in every string that quotes it. | https://www.aljazeera.net/blogs/2019/5/4/اللمسة-من-أجل-حياة-زوجية-أفضل ; https://www.youm7.com/7155317 |
| `crew_default_name` | صاحب → صديق | As a bare label, صاحب most often reads as "owner/holder" ("صاحب المحل"). صديق works as a stand-in name and matches `find_friend_fallback`. | — |
| `crew_vibe_food` | جولة أكل 🍔 → وقت الأكل 🍔 | جولة أكل sounds like a "food tour". "Food time" is natural. | — |
| `find_trend_warmer`, `find_trend_colder`, `find_warmer_help` | أدفأ / أبرد → أقرب / أبعد | Each dialect plays the hot/cold game with its own words (سخن/ساقع, حامي/بارد), so the MSA "warmer" reads as literal temperature. "Closer/farther" is clear everywhere. | — |
| `find_moment_privacy` | خادم التمرير → الخادم | تمرير means scroll/pass, so "scroll server" is a mistranslation of "relay". | — |

## Checked and safe (kept)
- **شلة**: friendly group-of-friends sense. The negative sense belongs to الشللية (cronyism/cliquishness), which the app does not use. Sources: Alyaum and Midad links above.
- **شعلة**: flame or torch. No slang meaning found, including in Darija sources. In Saudi slang, "شعلة" also praises an energetic person, which is positive.
- **ظاهر / اظهر**: plain "visible / appear". No regional slang found.
- **نوّر شاشتي**: نوّر carries only positive associations (light; the greeting نوّرت).
- **دبوس**: Google Maps' own Arabic word for a pin.
- **وضع الشبح**: Snapchat's established Arabic name for Ghost Mode.
- **توصيلة**: neutral "lift".
- **تائه** (lost), **في الصف الأمامي** (at the rail), **كشك التذكارات** (merch): neutral.

## Coordinator decisions (applied in round 2)

1. **Drinks flare emoji**: `crew_vibe_bar` is now «استراحة مشروبات 🥤». This is the one place where Arabic does not keep the source emoji.
2. **Gender-neutral sender lines**: no line that names a crew member uses a verb or adjective conjugated for that person any more, so a female sender never reads as masculine. The patterns used:
   - `%1$s: <message>`, e.g. «%1$s: في الطريق» and «%1$s: في البيت بأمان».
   - `<noun> من %1$s`, e.g. «سؤال من %1$s: أين أنت؟», «رسالة من %1$s», «شعلة من %1$s: %2$s», «خطة مثبّتة من %1$s: %2$s», «لحظة من %1$s», «طلب من %1$s: لنبقَ أصدقاء».
   - Verbal nouns or the passive, e.g. «%1$s: إزالة %2$s من الشلة.», «%1$s: لم يُسجَّل الوصول بعد», «أُزيلت الخطة (بواسطة %1$s)», «تم الضغط على «أحتاج مساعدة»».
   - Neutral prepositional phrases, e.g. «%1$s بحاجة إلى مساعدة!» and «%1$s على مقربة منك، في محاولة لإيجادك».
   - Strings changed:
     - Ping fragments and titles: `crew_ping_*` and `crew_ping_title_*`.
     - Chat system lines: `crew_chat_joined`, `crew_chat_pinned`, `crew_chat_cleared_plan`, `crew_chat_flare`, and the `crew_chat_you_*` lines.
     - Line templates `crew_chat_line_other` and `home_ping_line`: now `%1$s: %2$s`, so the ping fragments read as "name: message".
     - Crew notifications: `crew_notif_joined`, `crew_notif_overdue_title/text`, `crew_notif_help(_where)`, `crew_moment_title`, `crew_moving_title/text/text_away`, `crew_request_title/text`.
     - Friendship: `crew_friend_*` (gone, unreachable, asked, request/accepted titles, need_crew), `crew_add_need_name`, `main_wants_to_stay_friends`, `main_stay_friends_text`, `main_friends_now`, `main_out_of_crew`, `main_friend_added`.
     - Crew notes: `crew_note_*` (you_removed, you_reset, removed, reset).
     - Other screens: `find_not_sharing`, `home_tile_not_sharing`, `home_keep_friend`, `home_remove_from_crew_text`, `setup_bump_sharing`, `setup_bump_joining`.
   - **First-person messages the sender sends**: «عائد إلى البيت» became «في طريقي إلى البيت» in `crew_quick_going_home`, `crew_quick_check_in` and `home_ping_heading_home`. «تائه 😅» became «ضعت 😅». The question «عائد إلى البيت؟» became «في طريقك إلى البيت؟».
   - **"You" lines**: the masculine fatha on second-person verbs (أزلتَ، أعدتَ، وجدتَ، نسختَ…) was removed, so the written form fits either gender. The remaining instructions use the standard masculine imperative (اضغط، امسح), which is the norm in Arabic UI.
   - **Still masculine by grammar, but not about a known sender**: generic counts («انضم %d صاحب») and `main_nudge_mate` «صاحبي». A reviewer may want neutral forms there too.

## For a native reviewer
1. **Gender**: sender lines are now neutral (see above). Please check that the new «%1$s: …» and «… من %1$s» lines read naturally, and that `crew_chat_line_other` / `home_ping_line` with a colon look right in the chat and ping feed.
2. **شلة in the Maghreb** (medium confidence it's fine): people understand it via Egyptian and Gulf media, but Moroccan, Algerian and Tunisian youth may say «الجماعة» or «الصحاب». Worth a check with a Maghrebi speaker. Not offensive in any source found.
3. **«صاحبي» as the nudge fallback** (medium): it means "my friend" everywhere. Between a man and a woman in Gulf or Maghrebi dialect, the feminine form «صاحبتي» can imply girlfriend. I found no source to confirm this and the masculine form is used here, so low risk.
4. **Drinks emoji**: resolved; Arabic now uses 🥤.
5. **طاولة الصوت** for "sound desk" (medium): understandable but descriptive. Event crews may say «المكسر» or «منصة الصوت».
6. **«بالخارج %d د»** (night stats "out for N min"): compact; a reviewer may prefer «خرجتَ منذ…» or similar.

## UI review

No wording changes were needed: Arabic strings fit like English. Layout issues seen in the renders (not fixable by wording): several screens render left-to-right (home with no group, following home, settings sheet, finder distance-only / scanning / group-with-photos / small-phone one-friend, Up next), and the permission banner shows the English word "(location)" because the permission name is built in code.

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **خريطة المكان** | Passive «حُفظت» / «تُحفظ», so no line is gendered. «المكان» is the word `crew_at_venue` already uses for the venue. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ الطابق العلوي / ↓ الطابق السفلي** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | في الطابق العلوي / في الطابق السفلي | Said in full after the mate's direction. |

For a native reviewer: «الطابق العلوي» can also be read as "the top floor". If that confuses in a building with many floors, «طابق أعلى» / «طابق أسفل» ("a floor up / down") is the alternative. Confidence the current wording is understood: **medium-high**.
