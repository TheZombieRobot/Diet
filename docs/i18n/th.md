# Thai (values-th): translation review

Scope: every string in `app/src/main/res/values-th/strings*.xml`, read against the English source and its comments.
Validator: `check_translation.py app/src/main/res/values-th` prints **OK**.

Note on sources: web search worked, but direct page fetches were blocked in this session (Wiktionary, Sanook and Longdo could not be opened). The links below are the dictionary and news pages that came back in search results, with the snippets the search returned. Treat any claim marked "own knowledge" as unverified.

## Key terms

| English | Thai | Why | Sources |
|---|---|---|---|
| crew | แก๊ง (แชทแก๊ง, QR แก๊ง, ตั้งแก๊ง) | The usual casual word for a friend group ("แก๊งเพื่อน"). On its own the Royal Institute dictionary marks it as colloquial and says it is "often used in a bad sense" (แก๊งโจร, แก๊งอันธพาล). In this app it always refers to your friends, so it reads as "the squad". Kept. | Royal Institute entry (via Sanook): https://www.sanook.com/dictionary/dict/dict-th-th-royal-institute/search/%E0%B9%81%E0%B8%81%E0%B9%8A%E0%B8%87/ ; "แก๊งเพื่อน" defined as an ordinary friend group: https://getidiom.com/dictionary/thai/%E0%B9%81%E0%B8%81%E0%B9%8A%E0%B8%87%E0%B9%80%E0%B8%9E%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%99 ; spelling note: https://www.wordyguru.com/a/%E0%B8%84%E0%B8%B3%E0%B9%84%E0%B8%97%E0%B8%A2%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B8%A1%E0%B8%B1%E0%B8%81%E0%B9%80%E0%B8%82%E0%B8%B5%E0%B8%A2%E0%B8%99%E0%B8%9C%E0%B8%B4%E0%B8%94/q/%E0%B9%81%E0%B8%81%E0%B9%8A%E0%B8%87 |
| gig group (default) | กลุ่มไปคอน | Neutral "group going to the concert" | n/a |
| mate / friends | เพื่อน / เพื่อนๆ | Standard word | n/a |
| fallback name "Mate" | เพื่อน | Reads as "Friend". It does not clash with "คุณ" (You). | n/a |
| gig | คอน (ไปคอน, วันคอน, คอนของคุณ) | Common short form of คอนเสิร์ต. The press uses it too, e.g. Time Out "คอนที่เป็นสุข" and "สายคอน" for regular concert-goers. | https://www.timeout.com/bangkok/th/things-to-do/คอนที่เป็นสุข-ปาร์ตี้ฉลอง-30-ปี-yokee-playboy-เมื่อศิลปะและความเชื่อรวมเป็นหนึ่ง ; https://shopee.co.th/blog/world-tour-concert-in-bangkok/amp/ |
| Go live / Live / Hidden | เริ่มแชร์ / แชร์อยู่ / ซ่อนอยู่ | Avoids ไลฟ์, which means live streaming in Thai | n/a |
| Ghost mode | โหมดล่องหน / ล่องหน | ล่องหน means "invisible" and has no bad slang meaning. I found no official Thai Snap Map wording (search returned English pages only). | n/a |
| Need help | ขอความช่วยเหลือ | Plain and clear, right for a safety feature | n/a |
| Heading home / Home safe | กำลังกลับบ้าน / ถึงบ้านปลอดภัย | Natural | n/a |
| check in | เช็กอิน | Royal Institute spelling เช็ก. Also used for location check-ins, but context makes it clear. | n/a |
| flare / send a flare | พลุ / ยิงพลุ | Longdo: ยิงพลุ = "let off fireworks". Its subtitle examples also use it for flare guns and signal flares. Searches found no sexual or drug slang meaning. | https://dict.longdo.com/search/%E0%B8%A2%E0%B8%B4%E0%B8%87%E0%B8%9E%E0%B8%A5%E0%B8%B8 ; https://dict.longdo.com/search/%E0%B8%9E%E0%B8%A5%E0%B8%B8 ; http://www.thai-language.com/id/139142 |
| flare vibes | หลงอยู่ 😅, ไปบาร์ 🍺, ติดขอบเวที 🎶, หาของกิน 🍔, เข้าห้องน้ำ 🚻, ออกไปสูดอากาศ 🌬️, บูธเมอร์ช 👕, ใกล้กลับแล้ว 👋 | All literal and casual. "ไปบาร์" is neutral ("going to the bar"). | n/a |
| ping / quick pings | ปิง / ปิงด่วน; "pinged the crew" = ส่งสัญญาณหาแก๊ง | Loanword, understood by app users | n/a |
| pin / meet-up | ปักหมุด / หมุด / จุดนัดเจอ | Standard map wording (Google Maps Thai uses ปักหมุด) | n/a |
| plan | แผน | Neutral | n/a |
| Story / moment | สตอรี่ / โมเมนต์ | Same loanwords Instagram users use in Thai | n/a |
| Up next | เร็วๆ นี้ | "Coming soon". The same word is used for "Coming up". | n/a |
| Your gigs | คอนของคุณ | Consistent with คอน | n/a |
| Bump | ชนมือถือ | Literal "bump phones". ชน also means to clash or challenge, but "ชนมือถือ" can only be read literally. | n/a |
| Light me up / flashing | เปิดไฟจอ / จอที่กะพริบ | Literal "turn on the screen light". No slang meaning found. | n/a |
| Find / Ride | หา / เรียกรถ | เรียกรถ = "call a car", as ride-hailing apps say it | n/a |
| sound desk | บูธเสียง | Understood as "the sound booth". Thai engineers say FOH, but fans would not. | n/a |
| encore | อังกอร์ | The usual Thai transliteration | n/a |
| nudge | "เฮ้ %1$s เปิด Moshpoint แล้วแตะ เริ่มแชร์ หน่อย…" | Friendly; uses เรา for "I" | n/a |
| onboarding | หาเพื่อนเจอ / แม้คนแน่นแค่ไหน; เริ่มแชร์ / ตอนเข้างาน; อยากให้เพื่อน / เรียกว่าอะไร? | Natural | n/a |
| colours | ชมพู, ฟ้า, เขียว, ส้ม, ม่วง, ขาว | ฟ้า (sky blue) is the everyday word for a bright blue | n/a |
| invite apps | LINE, Messenger | LINE is the main messenger in Thailand | n/a |

## Changed

| Key | Old | New | Reason |
|---|---|---|---|
| crew_chat_night_tools_later | ปั่นกระแสกันเลย! … | อุ่นเครื่องกันก่อนเลย! … | ปั่นกระแส usually means artificially stirring up a trend or hype, e.g. with bots, and often reads negatively (own knowledge; the Thai dictionary searches returned nothing usable). อุ่นเครื่อง ("warm up") is the normal word for getting hyped before a show, and Thai entertainment news uses it this way. Source: https://www.sanook.com/music/2374385/ |
| main_qr_hint_planned | แชทปั่นกระแสกันได้เลย | แชทอุ่นเครื่องกันได้เลย | Same as above |
| main_added_up_next | ชวนเพื่อนมาปั่นกระแสกันเลย! | ชวนเพื่อนมาอุ่นเครื่องกันเลย! | Same as above |
| crew_chat_on_today | คอนนี้คือวันนี้ … | คอนนี้จัดวันนี้ … | The old text meant "this concert *is* today", which is ungrammatical. The new text means "this concert is held today". |

## Checked and safe (risky-looking words I kept)

- **แก๊ง**: see the table. The dictionary warns of a negative tendency when the word stands alone or is paired with crime words. Here it is always "your group", which is how Thai young people say "แก๊งเพื่อน".
- **ยิงพลุ / พลุ**: the literal meaning is fireworks or flares. No slang meaning found (Longdo, thai-language.com).
- **ชนมือถือ**: literal.
- **ไปบาร์ 🍺**: neutral, with no implication of heavy drinking.
- **ล่องหน**: neutral ("invisible").

## For a native reviewer

1. **แก๊ง** for crew (confidence it is fine: medium-high). Ask whether "แก๊งของคุณ" on a widget, or "หาแก๊ง", could sound like a criminal gang to an older user. The alternative is กลุ่ม (neutral but bland).
2. **ยิงพลุ** for "send a flare" (high). Check that it reads as a fun signal and not as a real pyrotechnic you would set off in a venue.
3. **บูธเสียง** for "sound desk" (medium). Do Thai concert-goers say this, or something like "หน้าบูธคอนโทรล"?
4. **ติดขอบเวที** for "At the rail" (medium). A possible alternative is ชิดรั้วหน้าเวที.
5. **เช็กอิน** for the safety "check in" (medium). It might be read as a location check-in. A possible alternative is แจ้งว่าถึงแล้ว.
6. **อุ่นเครื่อง** (new) (high).

## UI review

All screens checked against English: no clipping, wrapping or overlap needing a wording change. No strings changed.
