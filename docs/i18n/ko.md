# Korean (values-ko) translation review

Scope: all 7 files in `app/src/main/res/values-ko/`. Validator: `check_translation.py app/src/main/res/values-ko` prints **OK**.

Register: UI text uses 해요체 (friendly-polite), the norm for Korean consumer apps such as KakaoTalk and Toss. Quick pings and the nudge invite are 반말 (어디야?, 거기 있어, 눌러 줘), because they are messages between friends. That is natural. I fixed one flare vibe that broke the noun/반말 pattern.

## Key terms

| English | Chosen Korean | Why | Sources |
|---|---|---|---|
| crew | 크루 | Everyday MZ-generation word (러닝크루, 댄스 크루) | https://kbthink.com/main/living-finance/consumption-life/mz-consumption/mz-running.html , https://www.newsis.com/view/NISX20241008_0002912290 |
| mate / friends, fallback "Mate" | 친구 | Neutral | — |
| gig | 공연 | Standard | — |
| **Go live / Live / Hidden / Go hidden** | **위치 공유 켜기 / 공유 중 / 숨김 / 내 위치 숨기기** | In Korean, 라이브 means a live *broadcast*: Instagram's button is 라이브 and its feature is "라이브 방송". KakaoMap's location feature uses 위치 공유 and 내 위치 숨기기. | https://about.instagram.com/ko-kr/blog/tips-and-tricks/instagram-live-tips-tricks , https://www.newsis.com/view/NISX20251117_0003406094 , https://biz.sbs.co.kr/amp/article/20000272802 |
| Ghost mode | 고스트 모드 | The Korean name of Snapchat's feature | https://parental-control.flashget.com/ko/what-is-snapchat-ghost-mode |
| Need help | 도움 요청 (button) / 🚨 도와줘 (ping) | Clear | — |
| Heading home / check in / home safe | 집에 가는 중 / 체크인 / 집에 잘 도착 | Korean coverage of Apple's Check In calls it 체크인 | Search summary of Korean coverage. Apple KR pages could not be fetched. |
| flare | 플레어 | Neutral loanword | — |
| ping | 호출 | Natural for "call / buzz the crew" | — |
| pin / meet-up | 고정 / 만남 핀, 만남 장소 | KakaoTalk also uses 고정 for pinning | — |
| plan | 계획 | — | — |
| Story / moment | 스토리 / 순간 | Instagram KR uses 스토리 | — |
| Up next / Your gigs / Memories | 다가오는 공연 / 내 공연 / 추억 | Natural | — |
| Bump | 폰 맞대기 | Back-to-back phone gesture, the same verb Samsung users use | https://r1.community.samsung.com/t5/%EA%B0%A4%EB%9F%AD%EC%8B%9C-a-j-%EB%85%B8%ED%8A%B8/%ED%8C%81-%ED%80%B5%EC%89%90%EC%96%B4%EB%A1%9C-%ED%8C%8C%EC%9D%BC%EC%9D%84-%EC%B4%88%EC%8A%A4%ED%94%BC%EB%93%9C%EB%A1%9C-%EA%B3%B5%EC%9C%A0%ED%95%B4%EB%B3%B4%EC%9E%90/m-p/8206829/highlight/true |
| Light me up | 화면 밝히기 | Clear. See the safety note below. | — |
| sound desk | 음향 부스 | Understandable to fans | — |
| Ride | 택시 | Kakao T taxi is what Koreans use | — |
| At the rail / Merch | 펜스 앞 / MD 부스 | Real Korean concert-fan words (펜스 잡다, MD) | https://theqoo.net/ktalk/4304254985 , https://nol.yanolja.com/ticket/products/26015421 , https://www.trvlogue.com/ko/coldplay-sydney-concert-accor-stadium |
| colours | 핑크, 파란색, 초록색, 주황색, 보라색, 흰색 | Normal everyday colour words | — |
| End the night | 오늘 밤 마무리 | Natural "wrap up tonight" | — |

## Changed

- **Live → 위치 공유** in every string. That covers `visibility_channel`, `visibility_notification`, `crew_wake_text(_venue)`, `crew_tile_live`, `crew_go_hidden`, `find_pill_live`, `find_searching_help`, `find_map_no_mates`, `time_live`, `home_go_live`, `home_live(_ghost)`, `home_tile_live`, `home_hidden_hint`, `main_nudge_text`, `main_nudge_title`, `setup_stay_live(_desc)`, `setup_about_text`, `setup_onb_title_live`, `setup_onb_body_live` and `setup_onb_need_notifications_why`. Reason: "라이브 켜기" reads as "start a live stream", which is a scary privacy misunderstanding for a location app. Korea had a public backlash over KakaoMap friend-location sharing in Nov 2025, so the wording must be clear. Sources above. The story tag "LIVE" stays as is.
- `crew_vibe_leaving`: 곧 나가요 → **곧 나갈 예정**. The other vibes are nouns or 반말, and this one was 해요체.
- `find_chip_locked`: 고정됨 → **정확**. 고정 already means "pinned" in this app, and 정확 pairs with 대략.
- Colours: 파랑/초록/주황/보라/하양 → **파란색/초록색/주황색/보라색/흰색**. 하양 sounds childish.
- `find_beacon_help`: "내 색은 %1$s예요" → "내 색: %1$s." The particle was wrong after a consonant (파란색이에요, not 파란색예요).
- `setup_onb_im_name`: "저는 %1$s예요" → "나는 %1$s!". This had the same 예요/이에요 problem with names ending in a consonant (e.g. 민준).
- `crew_memory_headline_with`: "%3$s와 함께한" → "%3$s님과 함께한". 와/과 depends on the final consonant, and 님과 always works.
- Bump: 폰 맞닿기 → **폰 맞대기** (`home_bump_phones`, `setup_bump_title`, `setup_bump_joining`, `main_bumped_text`). 맞대다 is the active verb and is already used in the instructions.
- End the night: 밤 끝내기 → **오늘 밤 마무리**. Also updated `main_recap_text` and `main_night_ended`.
- `crew_help_no_signal`: 경호 요원 / 의무 텐트 → **안전 요원 / 의무실**. 경호 means bodyguard, while Korean festivals use 안전요원 and 의무실.

## Checked and safe (kept)

- **밝히기** (Light me up): 밝히다 has a slang sense of "being lustful" (여자를 밝히다). That sense needs a person or appetite as the object, so **화면** 밝히기 (lighting the *screen*) is safe. I avoided using 밝혀 on its own without 화면. Source: https://kaweah.freedombox.rocks/kiwix/wiktionary_en_all_maxi_2023-04/%EB%B0%9D%ED%9E%88%EB%8B%A4 (Wiktionary entry)
- **한잔하는 중** 🍺: an ordinary "having a drink", not a binge connotation.
- **맞대기**: no gambling or fight meaning (unlike 맞대결).
- **플레어, 호출, 고스트, 크루**: no slang, sexual, or drug meanings found.
- **얘들아** (nudge fallback): a friendly "hey guys", fine for 18 to 35.

## For a native reviewer

1. 위치 공유 켜기 vs 내 위치 공개 (confidence: high that 라이브 was wrong, medium on the exact replacement).
2. 체크인 vs 도착 알림 (medium). Koreans understand 체크인 (Apple uses it), but 도착 알림 might be clearer.
3. 나는 %1$s! (medium). It is casual next to the 해요체 onboarding, but particle-safe. The alternative is "제 이름은 %1$s".
4. 음향 부스 (medium). Some fans say 콘솔 or FOH.
5. 호출 for "pinged the crew" (medium). It may sound a bit like summoning.

## UI review
Shortened so the text fits the way English does:
- `find_last_seen_on_map`: *지도에서 마지막 위치* → *마지막 위치* (the button wrapped and left "치" alone on line 2)

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **공연장 지도** | 공연장 as in `crew_at_venue`. 해요체, as elsewhere. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ 위층 / ↓ 아래층** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | 위층 / 아래층 | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **워치** / **손목** / **진동** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **폰과 연결이 안 돼요** | The watch has lost its Bluetooth link to the phone. *폰과 연결이 안 돼요* (not connected to the phone); reception is *신호* in the app. |
| Hold (on the round button) / Hold to tell your crew | **길게 누르기** / 길게 누르면 크루에 알려요 | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **손목을 평평하게 들어요** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **진동을 따라가요** | Shown when there is a distance but no direction. |
| Not sent yet | **아직 전송 안 됨** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | 지금은 근처 크루에게만 전달됐어요 | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **가장 가까운 친구** / **크루 상태** | Names in the watch's pickers. |

For a native reviewer: *길게 누르기* on the round button (two short words). *%1$s님은 이제 크루에 없어요* uses 님 as the chat lines do. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.
