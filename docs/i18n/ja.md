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
