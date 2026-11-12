# Hindi (values-hi) translation review

Scope: all seven `strings*.xml` files in `app/src/main/res/values-hi`. Target: casual urban Hindi with common Hinglish loanwords (the way WhatsApp, Instagram and Uber word things in Hindi). Validator: `check_translation.py app/src/main/res/values-hi` printed **OK** before and after the edits.

Method: I read every string next to the English source and its comments, then checked risky words against dictionaries (Rekhta) and Hindi app and help pages. Some official pages (newsroom.snap.com) could not be opened from this session; those terms rest on search-result snippets.

## Key terms

| English | Chosen Hindi | Why | Sources |
|---|---|---|---|
| crew | ग्रुप (changed from गैंग) | Coordinator decision: the safe, neutral word, the same one WhatsApp uses in Hindi. गैंग is popular slang but also means a criminal gang, which family members following the night might read. | https://dictionary.langeek.co/en-HI/word/74702 ; https://trykaiwa.com/blog/hindi-gen-z-slang-phrases-2026 |
| mates / friends | दोस्त | Neutral and universal. | — |
| fallback name "Mate" | दोस्त | — | — |
| gig / concert | शो | Widely understood for any live show. "Gig" is mostly indie-scene jargon. | — |
| Go live / Live / Hidden | लाइव हों / लाइव / छिपे हुए | WhatsApp Hindi uses "लाइव लोकेशन", so "लाइव" is established UI vocabulary. | https://blog.whatsapp.com/share-your-live-location?lang=hi |
| Ghost mode | घोस्ट मोड | Hindi coverage of Snapchat keeps Ghost Mode as a loanword. "Ghosting" in Hinglish means ignoring someone, which is harmless here. | https://newsroom.snap.com/introducing-snap-map?lang=hi-IN (seen in search results; could not open) ; https://www.guru99.com/hi/how-to-freeze-snapchat-location.html |
| Need help | मदद चाहिए | Clear. The setting description quotes it the same way. | — |
| Heading home / check in / home safe | घर की ओर / चेक-इन / घर पहुँचकर सुरक्षित | "चेक-इन" is a familiar loanword. | — |
| flare | फ्लेयर | Loanword feature name, used the same way in every string. See reviewer note. | — |
| ping | पिंग | Common in Indian chat and office slang. | — |
| pin / meet-up | पिन / मिलने की जगह | Hindi guides for Google Maps use "पिन ड्रॉप". | https://www.guru99.com/hi/how-to-drop-a-pin-on-google-maps.html |
| plan | प्लान | — | — |
| Story / moment | स्टोरी / पल | Instagram's Hindi pages use "स्टोरी". | https://about.instagram.com/hi-in/features/stories |
| Up next | आगे के शो (changed) | See Changed. | — |
| Your gigs | आपके शो | Now quoted as a section name in the sentences that mention it. | — |
| Bump | बंप / फ़ोन बंप करें | Loanword with no vulgar Hindi meaning (everyday uses: speed bump, baby bump). The explanation text describes the gesture. | — |
| Light me up | मेरी स्क्रीन चमकाएँ (changed form) | See Changed. | https://rekhtadictionary.com/meaning-of-chamkaanaa |
| Find / Ride | ढूँढें / राइड | Uber's Hindi site uses "राइड". | https://uber.com/global/hi/ride/app/ |
| sound desk / encore | साउंड डेस्क / एनकोर | Loanwords used at Indian concerts. | — |
| nudge / invite | "अरे %1$s, Moshpoint खोलो और लाइव हों पर टैप करो…" | Friendly तुम register, right for a message between friends. | — |
| onboarding headlines | "किसी भी भीड़ में अपने दोस्त ढूँढें", "अंदर जाते समय लाइव हों", "आपके दोस्त आपको क्या बुलाएँ?" | Natural. | — |
| colours | गुलाबी, नीला, हरा, नारंगी, बैंगनी, सफ़ेद | Standard. | — |

### Flare vibes (final)
| English | Hindi |
|---|---|
| Lost 😅 | भटक गए 😅 |
| Bar time 🍺 | बार टाइम 🍺 |
| At the rail 🎶 | एकदम आगे 🎶 |
| Food run 🍔 | खाना लेने 🍔 |
| Toilets 🚻 | टॉयलेट 🚻 |
| Outside for air 🌬️ | बाहर ताज़ी हवा में 🌬️ (changed) |
| Merch stand 👕 | मर्च स्टॉल 👕 |
| Leaving soon 👋 | जल्द निकल रहे हैं 👋 |

## Changed

| Key | Old → New | Reason | Source |
|---|---|---|---|
| `crew_vibe_air` | बाहर हवा खाने 🌬️ → बाहर ताज़ी हवा में 🌬️ | "हवा खाओ" is also a rude brush-off ("get lost!") in Hindi and Urdu. A flare broadcast to the crew shouldn't risk sounding like "go get lost". | https://rekhtadictionary.com/meaning-of-havaa-khaao |
| `find_light_me_up` | मेरी स्क्रीन चमकाओ → मेरी स्क्रीन चमकाएँ | Buttons use the polite आप form everywhere else. The bare imperative चमकाओ was inconsistent, and चमकाना can also mean "to threaten/scold" in casual speech. With the object स्क्रीन the meaning stays literal. | https://rekhtadictionary.com/meaning-of-chamkaanaa |
| `find_trend_warmer`, `find_trend_colder`, `find_warmer_help` | गरम / ठंडा → और पास / और दूर | The hot/cold guessing game isn't a universal reference in India, so "गरम/ठंडा" reads as temperature. "Closer/farther" is unambiguous. | — |
| `home_up_next`, `main_eyebrow_up_next`, `main_eyebrow_up_next_countdown`, `main_joined_up_next`, `main_added_up_next` | आने वाले → आगे के शो (quoted in sentences) | "आने वाले" ("upcoming…") is a dangling adjective as a heading, and "यह आने वाले में है" was ungrammatical. "आगे के शो" is a full noun phrase. | — |
| `crew_notif_done_saved`, `main_recap_text`, `main_night_ended` | आपके शो → "आपके शो" | Quoted so it reads as the section name, not "in your shows". | — |
| `crew_plan_by` | %1$s ने किया → %1$s ने पिन किया | "X did it" was vague. The line credits who pinned the plan. | — |

## Checked and safe (kept)
- **शो**: neutral.
- **बंप**: no Hindi slang meaning found. (In English, "a bump" can be drug slang, but Hindi speakers know the loanword mainly from "speed bump" and "baby bump".)
- **घोस्ट मोड**: established Snapchat terminology.
- **लाइव**: established WhatsApp terminology ("लाइव लोकेशन").
- **बार टाइम 🍺**: alcohol is legal for adults in most Indian states and bars are normal at urban gigs. Gujarat, Bihar, Nagaland and Mizoram are dry, but the phrase is descriptive, not encouraging. Kept.
- **भटक गए** (lost), **एकदम आगे** (at the rail), **मर्च स्टॉल**, **टॉयलेट**: neutral.
- **सीने से लगाकर** (hold the phone to your chest): literal in context; no issue.

## Coordinator decision (applied in round 2): गैंग → ग्रुप

All 74 occurrences of "गैंग" are now "ग्रुप". I rewrote each sentence by hand rather than find-and-replace, because गैंग is feminine and ग्रुप is masculine:
- **Possessives:** आपकी/मेरी/अपनी गैंग → आपका/मेरा/अपना ग्रुप. Before a postposition they become आपके/मेरे/अपने ग्रुप (e.g. "आपके ग्रुप को", "मेरे ग्रुप \"%1$s\" में").
- **Named crews:** "%1$s की गैंग" → "%1$s का ग्रुप", "आज रात की गैंग" → "आज रात का ग्रुप", "आज रात की आपकी गैंग" → "आज रात का आपका ग्रुप", "नई गैंग" → "नया ग्रुप", "आपकी मेन गैंग" → "आपका मेन ग्रुप".
- **Verbs with the crew as subject:** पढ़ सकती → पढ़ सकता, देख सकती → देख सकता, शेयर करती → शेयर करता, बंद हो जाती → बंद हो जाता, चली जाएगी → चला जाएगा, चालू होगी → चालू होगा.
- **Crew as an implied subject:** "सो रही है" → "सो रहा है" (`home_asleep_text`), "सोती रहती है" → "सोता रहता है" (`setup_plan_desc`), "चालू हो जाएगी" → "चालू हो जाएगा" (`main_joined_up_next`).
- **Left as is:** phrases where की agrees with the following noun, e.g. "ग्रुप की नई चाबी", "ग्रुप की फ़ोटो", "ग्रुप की मदद की रिक्वेस्ट".

## For a native reviewer
1. **ग्रुप**: resolved by switching from गैंग. A reviewer may check that the crew still feels distinct from a generic WhatsApp group; if not, "स्क्वाड" is an option.
2. **फ्लेयर** (medium): many Hindi users won't know English "flare" (and may hear "flair"). The 🔥 and the explanation help. An alternative is "सिग्नल" or "लोकेशन फ्लैश".
3. **शो for "gig"** (high confidence it's fine): "आपके शो" ("your shows") could sound like shows you perform. "आपके कॉन्सर्ट" is an option.
4. **Gendered/plural verbs**: "भटक गए", "जल्द निकल रहे हैं" use the plural/honorific form, which avoids gender. That is natural for statuses, but a reviewer may prefer first-person singular forms.
5. **घर पहुँचकर सुरक्षित ✅** (low): understandable but slightly stiff. "सही-सलामत घर पहुँच गए ✅" may sound more natural.

## UI review
Shortened so the text fits the way English does:
- `find_restart_scan`: *स्कैन फिर से शुरू करें* → *फिर स्कैन करें* (the button wrapped and left one word alone on line 2)
- `find_last_seen_on_map`: *मैप पर आखिरी बार दिखे* → *मैप पर आखिरी जगह* (the button wrapped)
- `find_not_sharing`, `home_tile_not_sharing`: *अभी शेयर नहीं कर रहे* → *अभी शेयर नहीं* (the label under the avatar wrapped onto 2 lines)

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **वेन्यू का मैप** | वेन्यू and मैप as in the existing strings. The tag is just "up / down" with the arrow, to stay short; the screen-reader text names the floor. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ ऊपर / ↓ नीचे** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | ऊपर की मंज़िल पर / नीचे की मंज़िल पर | Said in full after the mate's direction. |

For a native reviewer: Whether ऊपर / नीचे alone reads as "upstairs / downstairs" on a face. Confidence: **medium-high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **घड़ी** / **कलाई** / **वाइब्रेशन** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **फ़ोन कनेक्ट नहीं है** | The watch has lost its Bluetooth link to the phone. *फ़ोन कनेक्ट नहीं है* (the phone isn't connected). *पहुँच से बाहर* was avoided: it is the phone network's own "out of coverage" message. |
| Hold (on the round button) / Hold to tell your crew | **दबाए रखें** / ग्रुप को बताने के लिए दबाए रखें | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **कलाई सपाट रखें** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **वाइब्रेशन के हिसाब से चलें** | Shown when there is a distance but no direction. |
| Not sent yet | **अभी नहीं भेजा गया** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | अभी सिर्फ़ आस-पास के ग्रुप वालों को मिला है | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **सबसे पास का दोस्त** / **ग्रुप स्टेटस** | Names in the watch's pickers. |

For a native reviewer: *घड़ी* rather than *वॉच* for the watch. *कन्फ़र्म नहीं हुआ* for "Not confirmed". *कलाई सपाट रखें* for holding the wrist level. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium**.
