# Japanese (values-ja) translation review

Scope: all 7 files in `app/src/main/res/values-ja/`. Validator: `check_translation.py app/src/main/res/values-ja` prints **OK**.

Overall the machine translation was already good: it uses real Japanese gig vocabulary (ライブ, 物販, PA卓, 最前列) and avoids the ライブ-vs-"go live" clash by calling location sharing シェア. Register is casual-polite. UI statements use です/ます and friendly instructions end in 〜してね, which is normal for Japanese consumer apps aimed at people in their 20s. Quick pings between friends are plain form (今行く, どこにいる？). I kept this split on purpose.

## Key terms

| English | Chosen Japanese | Why | Sources |
|---|---|---|---|
| crew | クルー | Young people use it for a friend group (hip-hop and dance crews). Neutral, no bad meanings. | Reasoning; same loanword family as Korean 크루 (see ko.md) |
| mate / friends | 仲間 / 友達 | 仲間 is the warm word for "your people" at a gig. 友達 is used for the persistent friend list. | Reasoning |
| fallback name "Mate" | 仲間 | Neutral, never rude | Reasoning |
| gig / concert | ライブ | The standard Japanese word for a concert. Japanese "live house" culture. | https://utaten.com/live/live-alone/ , https://www.ticket.co.jp/entx/?p=466 |
| Go live / Live / Hidden | シェア開始 / シェア中 / 非表示 | Avoids ライブ (= concert). Google Maps and LINE call this 共有/シェア. | Reasoning |
| Ghost mode | ゴーストモード | The same term Snapchat and Zenly/whoo use in Japan | https://parental-control.flashget.com/ja/what-is-snapchat-ghost-mode , https://appllio.com/zenly-ghost-function |
| Need help | 助けて | Short and unambiguous | — |
| Heading home / check in / home safe | 帰るね / **到着確認** / 無事に帰ったよ | The Japanese iOS name for Apple's "Check In" safety feature is 到着確認 | https://www.apollomaniacs.com/ipod/howto_touch_sms_checkin.htm (search result), https://getnavi.jp/digital/975586/ |
| flare | フレア | Neutral loanword (fashion, solar flare). No slang meaning. | Reasoning |
| ping | 通知 (stats), quick buttons by name | Natural | — |
| pin / meet-up | ピン留め / 集合ピン, 集合場所 | ピン留め is the exact LINE term | https://appllio.com/line-pin-feature |
| plan | 予定 | Natural | — |
| Story / moment | ストーリー / モーメント | Instagram-style loanwords that are well known | — |
| Up next / Your gigs / Memories | 次の予定 / あなたのライブ / 思い出 | Natural | — |
| Bump | スマホをタッチ | Clear and harmless | — |
| Light me up | 画面を光らせる | Literal and clear. Japanese "find me by screen colour" apps use the same idea. | https://www.lifehacker.jp/article/150216lookfor/ |
| sound desk | PA卓 | The actual term Japanese gig-goers and engineers use | Reasoning, plus the general PA glossary https://musicradar.com/news/pa-speaker-jargon-buster-everything-you-need-to-know-about-pa-systems-and-live-sound |
| Ride | 配車 | Uber and GO taxi apps use 配車 | Reasoning |
| encore | アンコール | Standard | — |
| Flare vibes | 迷子 / バーカウンター / 最前列 / ごはん調達中 / トイレ / 外で休憩中 / 物販 / そろそろ帰る | Real venue words | https://www.ticket.co.jp/entx/?p=466 |
| colours | ピンク, ブルー, グリーン, オレンジ, パープル, ホワイト | Katakana colour names are normal in UI | — |
| End the night | 今夜は解散 | 解散 is what Japanese friend groups say at the end of a night out | https://www.tkgje.jp/entries/26000/26229_genchikaisan.html |

## Changed

- `crew_vibe_bar`: バータイム → **バーカウンター** 🍺. Nobody says "バータイム". At live houses you swap your drink ticket at the バーカウンター. Source: https://www.ticket.co.jp/entx/?p=466
- `find_chip_locked`: ロック → **正確**. In a concert app ロック reads first as "rock music". 正確 pairs naturally with the "だいたい" (rough) chip. Reasoning, no source.
- Check-in strings (`crew_quick_check_in`, `crew_notif_overdue_title`, `crew_ping_check_in`, `crew_ping_title_check_in`, `home_heading_home_text`, `home_check_in_by`): チェックイン → **到着確認**. In Japanese, チェックイン means hotels and airports. Apple's identical safety feature is called 到着確認 in Japanese. Sources: search results for apollomaniacs.com and getnavi.jp. The page itself could not be fetched from this sandbox.
- `home_end_night`, `main_end_the_night`, `setup_qr_end_night`: 夜を終了 → **今夜は解散**. Also updated `main_recap_text` and `main_night_ended` to match. "夜を終了" is a stiff word-for-word translation. Source: https://www.tkgje.jp/entries/26000/26229_genchikaisan.html
- `find_ask` / `find_ask_them`: お願い / お願いする → **シェアをお願い** / **シェア開始をお願い**. Without these words, a bare "お願い" button says "please" and doesn't say what it does.

## Checked and safe (kept)

- **フレア**: only fashion and astronomy meanings, no slang.
- **タッチ** (Bump): only means touch or tap, nothing sexual in this context.
- **光らせる**: no drug meaning. Smoking or drugs would be 火をつける or 吸う.
- **ゴースト**: established by Snapchat and Zenly. Source above.
- **迷子**: friendly and self-deprecating, fine for adults.
- **助けて**: strong but appropriate for an SOS button.
- **お出かけ** (time out): mild and cute. Acceptable.

## For a native reviewer

1. 到着確認 vs 到着連絡 (confidence: medium-high). 到着確認 matches Apple. 到着連絡 may feel more natural in casual chat bubbles ("%d分以内に到着確認するね").
2. 今夜は解散 (medium-high). Check that it doesn't sound like the *band* is splitting up when shown on its own as a button.
3. Mixed です/ます and 〜してね register (medium). It is typical for casual apps. If you want a stricter style, convert 〜してね to 〜してください.
4. クルー vs グループ (medium). LINE users are used to グループ. クルー sounds cooler but slightly niche.
5. 仲間 as a fallback *name* (medium). It works as a label, but someone might prefer ゲスト.

## UI review
Shortened so the text fits the way English does:
- `find_restart_scan`: *スキャンし直す* → *再スキャン* (the button wrapped and left "す" alone on line 2)
- `find_last_seen_on_map`: *マップで最後に見た場所* → *最後の場所* (the button wrapped)
- `find_ask_them`: *シェア開始をお願い* → *シェアをお願い* (the button wrapped and left "い" alone. It still says what the button asks for, so the concern behind the earlier fix still holds)
- `find_not_sharing`, `home_tile_not_sharing`: *まだシェアしてない* → *未シェア* (the label under the avatar wrapped onto 2 lines)

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **会場マップ** | 会場 as in `crew_at_venue`. Full-width colon and 、 as elsewhere. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ 上の階 / ↓ 下の階** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | 上の階 / 下の階 | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **ウォッチ** / **手首** / **振動** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **スマホとつながりません** | The watch has lost its Bluetooth link to the phone. *スマホとつながりません* (can't connect to the phone). *圏外* was avoided: it means the phone has no reception, which is a different problem. |
| Hold (on the round button) / Hold to tell your crew | **長押し** / 長押しでクルーに知らせる | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **手首を水平にしてね** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **振動を頼りに進んで** | Shown when there is a distance but no direction. |
| Not sent yet | **まだ未送信** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | 今は近くの仲間にだけ届いています | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **いちばん近い仲間** / **クルーの状況** | Names in the watch's pickers. |

For a native reviewer: *まだ未送信* for "Not sent yet" (short enough for one line; the phone's "Not sent" is 未送信). *振動を頼りに進んで* for "Follow the buzzes". Friendly *〜してね* endings as in the phone app. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium**.

## "I'm here" pin (`strings_here.xml`)

Eight strings: the **I'm here** button in the drop-a-pin dialog and the line under it, the
"pinned 3 min ago" note on a mate's face (map, list, radar, finder), and your own pin's row in
the map's list. Validator prints **OK**. See `docs/IM_HERE.md`.

| English | Chosen |
|---|---|
| I'm here (button) | **ここにいる** |
| Your crew sees you on this spot, with the floor, until you walk away (20 min at most). | その場から離れるまで（最長20分）、クルーにはあなたがこの場所に、階の情報付きで表示されます。 |
| pinned 3 min ago (%1$s = the app's "3 min ago" / "just now") | ピン留め・%1$s |
| You're here / Pinned 3 min ago · your crew sees you here | ここにいます / ピン留め・%1$s · クルーにはここに表示中 |
| Take your pin down (screen reader, ✕) | ピンを外す |

Uses **クルー** and **ピン** (*ピン留め*). The time phrase follows a middle dot (*ピン留め・3分前*) so it works with *たった今* too. Written without a native reviewer. Confidence: **medium**.
