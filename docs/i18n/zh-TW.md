# Traditional Chinese, Taiwan (zh-TW) translation review

Folder: `app/src/main/res/values-zh-rTW`. Validator: `check_translation.py` prints **OK**.

Overall: this is a proper Taiwan localisation, not just converted characters. It uses Taiwan vocabulary throughout (QR 碼, 行動數據, 影片, 相片, 螢幕, 簡訊, 訊息, 揪, 安可, 控台, 保全, LINE in the invite line). I found no vulgar, sexual, drug or political problems. There are four small fixes, one of which corrects a meaning error.

## Key terms

| English | Chosen | Why | Sources |
|---|---|---|---|
| crew | 小隊 | Friendly and neutral | — |
| mate / friends | 朋友 / 好友 | 好友 is LINE's word for an added contact | — |
| fallback "Mate" | 朋友 | — | — |
| gig | 演出 (festival: 音樂祭) | 音樂祭 is the usual Taiwan word for a music festival | — |
| Go live / live / hidden | 上線 / 上線中 / 已隱藏 | Clear on/off states | — |
| Ghost mode | 幽靈模式 | Matches what Taiwan users call Snapchat's Ghost Mode | https://parental-control.flashget.com/zh-tw/what-is-snapchat-ghost-mode |
| Need help | 需要幫忙 / 🚨 我需要幫忙 | Natural Taiwan wording | — |
| Heading home / check in / home safe | 要回家了 / 報平安 / 平安到家 | Natural idioms | — |
| flare | 信號彈 | Literal signal flare (see the zh-CN note on its distress sense) | https://zh.moegirl.org.cn/%E4%BF%A1%E5%8F%B7%E5%BC%B9 |
| flare vibes | 迷路了 / 喝一杯 / 在最前排 / 去買吃的 / 上廁所 / 出去透透氣 / 周邊攤位 / 快走了 | Natural | — |
| ping | 提醒 | — | — |
| pin / meet-up | 置頂 / 集合點 / 標記 | 置頂 matches LINE's "pin to top" | — |
| Story / moment | 故事 / 瞬間 | Instagram TW uses 限時動態 (24-hour stories). This app's story is a lasting collage, so 故事 avoids a wrong "disappears" hint. (Instagram TW's "Close Friends" is 摯友, for reference) | https://www.businesstoday.com.tw/article/category/80409/post/201806050040/ ; https://www.bnext.com.tw/article/41794/instagram-stories-mentions-links-boomerangs |
| invite (verb) | 揪 / 邀請 | 揪 is very Taiwanese and casual ("揪朋友", "揪團", and LINE has a 揪團 feature). Good for the audience | https://news.tvbs.com.tw/life/1561816 ; https://www.inside.com.tw/article/3889-beetalk-interview |
| Bump | 碰一下 | Natural, no double meaning | — |
| Light me up | 點亮我 / 點亮螢幕 | Neutral | — |
| Ride | 叫車 | Taiwan's usual word for calling a taxi or Uber | — |
| sound desk / encore | 控台 / 安可 | 安可 is the standard Taiwan word for encore. 控台 is fan shorthand for the sound/lighting desk | https://zh.moegirl.org.cn/%E5%AE%89%E5%8F%AF |
| Your gigs / Up next | 我的演出 / 下一場 | — | — |
| colours | 粉紅色 藍色 綠色 橘色 紫色 白色 | 橘色 is the Taiwan form (mainland: 橙色) | — |

## Changed

| Key | Old | New | Reason |
|---|---|---|---|
| main_perm_notifications | 通知：顯示你是否找得到 | 通知：顯示你目前能不能被找到 | **Meaning error.** The old text said "shows whether YOU can find (others)". The English means "shows when you're visible" |
| home_just_tell_them | 只跟他們說 | 直接跟他們說 | 只 reads as "tell only them". The button means "just tell them, no timer" |
| find_look_for_flashing | 找找正在閃螢幕的 %1$s！ | 找找閃著%1$s的螢幕！ | %1$s is "colour (name)". This now reads "look for the screen flashing PINK (Jo)" |
| crew_status_phone_died | %1$s 手機沒電了 | %1$s的手機沒電了 | Adds the possessive ("Jo's phone died") |

## Checked and safe

- **Political scan.** Same term list as zh-CN; nothing found. No strings name countries or regions.
- **嗨 / 搞定 / 揪.** These are casual but not crude.
- **報警 / 消防 / 救護車.** These are the correct emergency-call wording.

## How it reads in Hong Kong

A Hong Kong reader will understand everything, but several words will look Taiwanese:
- **揪 (invite).** Rare in Hong Kong, where people say 約 or 叫埋. It could look like Taiwan slang.
- **行動數據.** Hong Kong says 流動數據.
- **簡訊.** Hong Kong says 短訊 or SMS.
- **螢幕.** Hong Kong usually writes 屏幕 or 熒幕.
- **保全.** Hong Kong says 保安.
- **影片.** Fine in Hong Kong.
- **QR 碼.** Fine in Hong Kong.

If Hong Kong is a target market, add a `values-zh-rHK` folder rather than changing the Taiwan file.

## For a native reviewer

1. **控台 for sound desk** (medium). I couldn't find a written Taiwan source confirming fan usage. 音控台 is the fuller, safer form if 控台 feels too insider.
2. **信號彈 for flare** (medium). It has a distress-signal sense; see zh-CN.
3. **上線中 vs 分享位置中 for "live"** (medium-high).
4. **Battery settings** (main_battery_text: 不要最佳化 / 不受限制) (high). These match Android Traditional Chinese.

## UI review

| Key | Old | New | Why |
|---|---|---|---|
| find_colour_legend | 亮粉紅代表還很遠。越靠近，箭頭越亮出朋友的顏色。 | 亮粉紅表示還遠。越近，箭頭越亮出朋友的顏色。 | "色。" wrapped alone |

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **場地地圖** | 場地 as in `crew_at_venue`. 儲存 / 連線, Taiwan usage. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ 樓上 / ↓ 樓下** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | 在樓上 / 在樓下 | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.
