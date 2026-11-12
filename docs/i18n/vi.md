# Vietnamese (values-vi): translation review

Scope: every string in `app/src/main/res/values-vi/strings*.xml`, read against the English source and its comments.
Validator: `check_translation.py app/src/main/res/values-vi` prints **OK**.

Note on sources: web search worked, but direct page fetches were blocked in this session. The links below are pages that came back in search results, with the snippets the search returned. Claims marked "own knowledge" are unverified.

## Key terms

| English | Vietnamese | Why | Sources |
|---|---|---|---|
| crew | nhóm | Neutral, clear and universal. "hội/team" would be slangier but optional. | n/a |
| mate / friends | bạn bè / bạn | Standard | n/a |
| fallback name "Mate" | **Một người bạn** (changed) | See Changed | n/a |
| gig | show (đi show, ngày diễn, Show của bạn) | Young people say "đi show" and "đi concert". The search found no slang or prostitution meaning for "đi show". "chạy show" is the performer's term for doing many gigs. | https://www.vjol.info/chay-so-la-gi ; https://hoanghamobile.com/tin-tuc/show/ |
| plan | **kèo** (Ghim kèo, KÈO TỐI NAY, Lên kèo đi show) | Youth slang for "a plan, a date, an outing": lên kèo / hủy kèo / bể kèo. It comes from betting odds, and betting sites still use it, but the everyday sense is widespread. Kept, with a reviewer note. | VOV Giao thông "Bể kèo" (traces it from gambling to "a plan that falls through"): https://vovgiaothong.vn/newsaudio/be-keo-d30391.html ; https://www.vjol.info/keo-nghia-la-gi |
| Go live / Live / Hidden | Bật chia sẻ / Đang chia sẻ / Đang ẩn | Avoids "live", which means livestreaming | n/a |
| Ghost mode | Chế độ tàng hình | "Invisible mode", a common phrase in VN apps | n/a |
| Need help | Cần giúp đỡ / Mình cần giúp đỡ | Clear | n/a |
| Heading home / Home safe | Đang về nhà / Về nhà an toàn | Natural | n/a |
| check in | check-in | Loanword. See reviewer note. | n/a |
| flare / send a flare | **tín hiệu / Phát tín hiệu** (changed) | See Changed | n/a |
| flare vibes | Lạc rồi 😅, Ra bar 🍺, Sát rào 🎶, Đi kiếm đồ ăn 🍔, Đi vệ sinh 🚻, Ra ngoài hít thở 🌬️, Quầy merch 👕, Sắp về 👋 | Natural and casual. "Sát rào" = right at the barrier. | n/a |
| ping | ping / ping nhanh | Loanword, understood by app users | n/a |
| pin / meet-up | ghim / Thả ghim / điểm hẹn | "ghim" is the standard verb for pinning (Messenger/Zalo "ghim tin nhắn") | n/a |
| Story / moment | Story / khoảnh khắc | Instagram VN labels it "Tin", but users say "story" ("đăng story") | https://quantrimang.com/cach-khoi-phuc-story-da-xoa-tren-instagram-179852 ; https://dienthoaivui.com.vn/font-chu-instagram |
| Up next | Sắp tới | Natural | n/a |
| Your gigs | Show của bạn | Consistent with show | n/a |
| Bump | Chạm máy / Chạm hai máy vào nhau | Literal "touch phones". No slang meaning. | n/a |
| Light me up / flashing | Nháy màn hình / màn hình đang nháy | "Flash the screen". No slang meaning. | n/a |
| Find / Ride | Tìm / Gọi xe | Gọi xe is the Grab/Be wording | n/a |
| sound desk | bàn âm thanh | Literal and understandable. VN festival-goers also know "FOH" (Vietcetera explainer). | https://vietcetera.com/vn/6-tu-tieng-anh-giup-ban-bot-ngo-ngac-khi-du-le-hoi-am-nhac |
| encore | encore | Loanword used by VN fans | n/a |
| "out" time stat | quẩy %d giờ %d phút | quẩy = slang for partying or going hard. Wiktionary: "to go to a bar, club… to party". No drug meaning. | https://vietcetera.com/vn/yeet-la-gi-ma-luc-quay-khong-the-quen ; https://kaweah.freedombox.rocks/kiwix/wiktionary_en_all_maxi_2023-04/qu%E1%BA%A9y |
| nudge | "Ê %1$s, mở Moshpoint và chạm Bật chia sẻ … nha!" / fallback "bạn ơi" | "Ê" is a very casual "hey", fine between friends | n/a |
| police | Công an | The correct term in Vietnam | n/a |
| colours | hồng, xanh dương, xanh lá, cam, tím, trắng | Standard | n/a |
| invite apps | Zalo, Messenger | Zalo is the main messenger in VN | n/a |

## Changed

| Key(s) | Old | New | Reason / source |
|---|---|---|---|
| crew_chat_send_flare_hint, crew_chat_you_flare, crew_chat_flare, crew_flare_title, crew_ping_flare, crew_ping_title_flare, crew_notif_flare, crew_chat_night_tools_later, home_chat_subtitle | bắn pháo sáng / pháo sáng | phát tín hiệu / tín hiệu | In Vietnam "pháo sáng" is the hand-held pyro flare that is banned at concerts. Concert rule lists name it explicitly, and fans who light them at stadiums face fines and even prison. In a concert app, "Bắn pháo sáng" literally tells people to set off a banned flare in the crowd. "Phát tín hiệu" ("send out a signal") keeps the idea without that risk. Sources: Thanh Xuân concert banned items: https://tienphong.vn/concert-thanh-xuan-doi-vong-ra-sao-co-duoc-mang-may-anh-vao-post1854544.tpo ; Hạ Long 2025 concert rules: https://baovanhoa.vn/nghe-thuat/thong-bao-nhan-ve-huong-dan-tham-du-concert-ha-long-2025-176051.html ; penalties at stadiums: https://luatvietnam.vn/tin-phap-luat/dot-phao-sang-tren-san-bong-da-bi-phat-the-nao-230-18299-article.html ; https://hethongphapluat.com/phap-luat/chinh-sach-phap-luat/dot-phao-sang-tren-san-co-co-dong-vien-doi-mat-tu-ban-chuc-bi-phat-nang.html |
| find_searching_help | Chưa có tín hiệu hay vị trí nào từ họ | Chưa bắt được sóng hay vị trí nào từ họ | Stops "tín hiệu" (now the flare word) from also meaning a radio signal on the same screen family |
| crew_default_name, find_friend_fallback | Bạn | Một người bạn | "Bạn" also means "you". This fallback is sent to other people as *your* name, so they would see "Bạn đã gửi tin nhắn" ("You sent a message"), which is the same as the app's own "You" label (crew_you = Bạn). "Một người bạn" ("a friend") cannot be confused with "you". |
| crew_memory_text, home_memories_count | Chạm để sống lại | Chạm để xem lại | "sống lại" means "come back to life / resurrect", so "Tap to resurrect" was odd. "xem lại" = "look back at it". |
| crew_plan_by | bởi %1$s | do %1$s ghim | "bởi X" is a stiff calque of English "by X". "do X ghim" means "pinned by X". |

## Checked and safe (risky-looking words I kept)

- **kèo**: gambling origin, but the everyday youth sense is "a plan or hangout" (lên kèo, hủy kèo, bể kèo). In this app it is always about meeting up. Kept (see reviewer note).
- **show / đi show**: searches found no sexual or prostitution slang meaning.
- **quẩy**: means partying. No drug meaning. Drug-party slang in VN is "bay/lắc", which appears nowhere in the strings.
- **Ra bar 🍺**: neutral.
- **Chạm máy, Nháy màn hình, tàng hình**: literal, with no slang meanings found.

## For a native reviewer

1. **kèo** for "the plan" (confidence it is fine: medium-high). It is casual and youthful, but it appears in uppercase as a header ("KÈO TỐI NAY") on a card people share. Could older users or parents read it as betting? The neutral alternative is "Kế hoạch" (formal) or "Lịch hẹn".
2. **Phát tín hiệu** for "send a flare" (medium). It is safe but less playful. Is there a more fun youth term that avoids "pháo sáng"? "Thả tín hiệu" is one idea; avoid "bắn tín hiệu", which can mean flirting.
3. **check-in** for the safety check (medium). In VN "check-in" mostly means Facebook location or hotel check-in. "Báo đã về" or "báo bình an" might be clearer.
4. **Một người bạn** as the fallback name (medium). It reads well in sentences ("Một người bạn đã gửi tin nhắn"), but it is long in lists.
5. **bàn âm thanh** for "sound desk" (medium). Maybe "khu FOH" or "khu điều khiển âm thanh"?
6. Pronouns: tabs use "Tôi" (Me), as Shopee does. Other casual text uses "mình". This is acceptable but slightly mixed (low risk).

## UI review

Shortened after checking the rendered screens against English (validator: OK).

| Key | Old | New | Why |
|---|---|---|---|
| home_family_can_follow | Gia đình có thể theo dõi đêm nay từ nhà | Gia đình theo dõi đêm nay từ nhà | Wrapped to 2 lines |
| home_one_thing_first_more | MỘT VIỆC TRƯỚC ĐÃ · CÒN %d | TRƯỚC TIÊN · CÒN %d | Kicker wrapped |
| home_plan_gig | Lên kế hoạch đi show (tìm show, rủ luôn) | Lên lịch đi show (tìm, rủ luôn) | Button wrapped |
| find_last_seen_on_map | Thấy lần cuối trên bản đồ | Vị trí cuối | Button wrapped |
| setup_stay_live | Chia sẻ tiếp sau khi khởi động lại | Khởi động lại vẫn chia sẻ | "lại" wrapped alone on small phones |
| setup_onb_body_find | Chạm vào một người… | Chạm một người… | Lone word on last line |

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **bản đồ địa điểm** | *Địa điểm* as in `crew_from_venue`. "Offline" is said as *khi mất sóng* ("when there's no signal"), matching `find_drop_pin_solo_help`. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Tầng trên / ↓ Tầng dưới** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | ở tầng trên / ở tầng dưới | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **đồng hồ** / **cổ tay** / **rung** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Mất kết nối với điện thoại** | The watch has lost its Bluetooth link to the phone. *Mất kết nối với điện thoại* (lost the connection to the phone); reception is *sóng* in the app. |
| Hold (on the round button) / Hold to tell your crew | **Nhấn giữ** / Nhấn giữ để báo cho nhóm | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Giữ cổ tay nằm ngang** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Đi theo nhịp rung** | Shown when there is a distance but no direction. |
| Not sent yet | **Chưa gửi được** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Mới chỉ tới người trong nhóm ở gần | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Bạn ở gần nhất** / **Trạng thái nhóm** | Names in the watch's pickers. |

For a native reviewer: *Điện thoại* throughout, not the app's shorter *máy*, so the phone and the watch can't be confused. *Chưa gửi được* serves for both "Not sent" (the app's wording) and "Not sent yet". The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium**.
