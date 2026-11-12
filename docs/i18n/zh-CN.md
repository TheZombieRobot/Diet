# Simplified Chinese (zh-CN) translation review

Folder: `app/src/main/res/values-zh-rCN`. Validator: `check_translation.py` prints **OK**.

Overall: the translation is natural, casual and uses mainland vocabulary throughout (二维码, 流量, 视频, 相册, 微信 swapped in for WhatsApp in the invite line). I found no vulgar, sexual, drug, or political problems. Most fixes are about formatting and phrasing.

## Key terms

| English | Chosen | Why | Sources |
|---|---|---|---|
| crew | 小队 | A neutral, friendly word for a small group. No gang or criminal sense (unlike 帮/团伙). | Native usage; no risk found |
| mate / friends | 朋友 / 好友 (saved friends) | 好友 is the WeChat/QQ word for a contact you've added | Standard WeChat UI |
| fallback name "Mate" | 朋友 | Neutral | — |
| gig / concert | 演出 | Covers concerts and festivals; 音乐节 is used for festival | — |
| Go live / live / hidden | 上线 / 在线 / 已隐藏 | Reads as "online". It isn't a literal match for "live location" (WeChat says 共享实时位置), but it's short and clear as a switch | https://news.mydrivers.com/1/1077/1077957.htm |
| LIVE tag (story) | 实时 | Means "real time". Avoids 直播 (livestream), which suggests broadcasting | — |
| Ghost mode | 幽灵模式 | The established Chinese name for Snapchat's Ghost Mode | https://parental-control.flashget.com/zh-tw/what-is-snapchat-ghost-mode (search results, zh) |
| Need help | 需要帮助 / 🚨 我需要帮助 | Clear and serious | — |
| Heading home | 回家了 | Natural | — |
| check in / home safe | 报平安 / 安全到家 | The standard idiom for "let people know you got home safe" | — |
| flare | 信号弹 | Literally a signal flare. It's vivid and familiar from games, but its main sense is a distress or rescue signal (see note) | https://zh.moegirl.org.cn/%E4%BF%A1%E5%8F%B7%E5%BC%B9 |
| flare vibes | 迷路了 / 喝一杯 / 在最前排 / 去买吃的 / 上厕所 / 出去透透气 / 周边摊 / 快走了 | All natural. 周边 is the standard fan word for merch | — |
| ping | 提醒 | Neutral | — |
| pin / meet-up | 置顶 (pin a plan) / 集合点 (meet-up pin) / 标记 (map pin) | 置顶 is the WeChat word for pinning to the top. 集合点 is a normal meeting point (not 集会, a political assembly) | — |
| plan | 计划 | — | — |
| Story / moment | 故事 / 瞬间 | Instagram Stories is called 快拍 or 限时动态 in Chinese, but both imply posts that vanish after 24 hours. This Story is a lasting collage of the night, so 故事 is acceptable | https://ijnet.org/zh-hans/story/%E5%96%84%E7%94%A8%E9%99%90%E6%97%B6%E5%8A%A8%E6%80%81%E5%8A%9F%E8%83%BD%E6%9D%A5%E5%90%B8%E5%BC%95%E8%AF%BB%E8%80%85%E7%9A%84%E4%BA%94%E5%A4%A7%E6%8A%80%E5%B7%A7 ; https://zoviz.com/zh/instagram-story-maker/community-story-maker |
| Up next / Your gigs | 下一场 / 我的演出 | Natural | — |
| Bump | 碰一碰 | Established Chinese UI wording for tap-phones features (Huawei share, Alipay "碰一下"). No double meaning | Native usage |
| Light me up | 点亮我 / 点亮屏幕 | Literal "light up". No sexual or drug sense in Chinese | — |
| flashing (beacon) | 闪着…的屏幕 | See Changed | — |
| Find / Ride | 找 / 打车 | 打车 is the everyday mainland word for hailing a car | — |
| sound desk / encore | 调音台 / 返场 | 返场 and 安可 both mean encore. 返场 is the more mainland term | https://zh.moegirl.org.cn/%E5%AE%89%E5%8F%AF |
| nudge / invite | 叫他们上线 / 邀请 / 微信 in the share line | Natural | — |
| onboarding headlines | 人再多\n也能找到朋友 · 进场时\n点上线 · 出发吧 | Natural and punchy | — |
| colours | 粉色 蓝色 绿色 橙色 紫色 白色 | Standard. 绿色 on its own carries no 绿帽 (cuckold) sense | — |

## Changed

| Key(s) | Old | New | Reason |
|---|---|---|---|
| 12 strings with QR codes (home_add_mates_text, home_show_crew_qr, home_start_crew_show_qr, home_scan_qr, home_my_friend_qr, home_crew_qr_desc, home_start_gig_group_text, main_invite_reset, crew_note_you_reset, crew_note_reset, setup_qr_reset_text …) | `小队 二维码`, `扫 二维码`, `旧的 二维码` … | `小队二维码`, `扫二维码`, `旧的二维码` … | A stray space was left where "QR" had been replaced. Chinese puts no space between Chinese words. The space after the Latin word "Moshpoint" was kept |
| home_just_tell_them | 只告诉他们 | 直接告诉他们 | 只 reads as "tell ONLY them". The button means "just notify them, without a timer" |
| find_look_for_flashing | 找找正在闪屏的 %1$s！ | 找找闪着%1$s的屏幕！ | %1$s is "colour (name)", e.g. 粉色（Jo）. The old sentence came out as "look for the flashing-screen PINK (Jo)". 闪屏 is also the usual word for a "splash screen" or screen flicker |
| crew_status_phone_died | %1$s 手机没电了 | %1$s的手机没电了 | Adds the possessive. Reads "Jo's phone died" |

## Checked and safe

- **Political and censorship scan.** I searched all strings for terms that are sensitive or censored in mainland China: 六四, 广场, 坦克, 蜡烛, 集会, 游行, 民主, 自由, 维尼, 习, 翻墙, 白纸, 台湾/中国/国家, and so on. None appear. 集合 / 集合点 (meeting point) is ordinary everyday language, unlike 集会 (assembly). 点亮 (light up) is neutral.
- **Out of scope (product, not wording).** Some services the app relies on are blocked or unavailable in mainland China: Facebook login, Google-based maps, and the Uber deep link behind 打车. The strings mention them correctly, but the features may not work for mainland users.
- **Douyin/WeChat style.** Wording such as 搞定, 预热, 开聊, 原地别动 and 马上到 matches the casual tone of WeChat chats.

## For a native reviewer

1. **信号弹 for "flare"** (medium confidence it's OK). Its main sense is a distress or rescue signal, so it could be confused with 需要帮助. Lighter alternatives are 冒个泡 (net slang for "showing up") or 位置快闪. I kept it for consistency and because the English "flare" carries the same idea.
2. **上线 / 在线 for "live"** (medium-high). It reads as "online" rather than "sharing location". 共享位置中 would be more literal but longer.
3. **故事 for Story** (medium). Some users may expect 快拍. Another option is 今晚相册.
4. **Battery setting names** (main_battery_text: 不优化 / 无限制) (medium). These match MIUI and older Android. Stock Android 12+ says 不受限制, and Huawei says 允许后台活动.

## UI review

All screens checked against English: no clipping, wrapping or overlap needing a wording change. No strings changed.

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **场馆地图** | 场馆 as in `crew_at_venue`. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ 楼上 / ↓ 楼下** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | 在楼上 / 在楼下 | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **手表** / **手腕** / **振动** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **连不上手机** | The watch has lost its Bluetooth link to the phone. *连不上手机* (can't connect to the phone); reception is *信号*. |
| Hold (on the round button) / Hold to tell your crew | **按住** / 按住通知小队 | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **把手腕放平** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **跟着振动走** | Shown when there is a distance but no direction. |
| Not sent yet | **还没发送** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | 目前只有附近的队友收到 | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **最近的朋友** / **小队状态** | Names in the watch's pickers. |

For a native reviewer: *这块手表* as the measure word. *按住* on the button. *帮手表找人* for the phone's notification. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.
