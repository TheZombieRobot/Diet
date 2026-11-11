# Spanish (Latin America, neutral) — `values-es`

Reviewed against the English source and every string in `values-es/strings*.xml`. Target: neutral Latin American Spanish that reads naturally in Mexico, Colombia, Argentina, Chile and Peru (and is also the fallback for any other `es-*` locale except Spain, which has its own folder).

Validator: `check_translation.py app/src/main/res/values-es` → **OK**.

## Key terms

| English | Chosen | Why | Sources |
|---|---|---|---|
| crew | grupo | Neutral everywhere. Slang words for a group of friends are regional (parche CO, banda/bandita MX, piño CL, la barra AR), so they would sound foreign elsewhere. `grupo` also means "band", but the one place that matters ("Name it, e.g. the band") already says "el grupo que toca". | — (standard vocabulary) |
| mate / friends | amigo(s) | Neutral; regional words (cuate, pana, parcero, compa, wey) are all country-marked and some (wey/güey) are rude out of context. | — |
| fallback name "Mate" | Amigo | Neutral, safe. | — |
| gig | concierto | Standard. "Tocada" (MX) / "toque" (CO) are regional. | — |
| Go live / live / hidden | Activar en vivo / En vivo / Oculto | "En vivo" is the Latin American norm for "live" (Instagram/TikTok LatAm: "en vivo"). | [Digital Trends es: "videos en vivo"](https://es.digitaltrends.com/sociales/instagram-cambia-videos-en-vivo/) |
| Ghost mode | Modo fantasma | Same as Snapchat's Spanish name for the same feature. | [Snap newsroom es-AR](https://newsroom.snap.com/introducing-snap-map?lang=es-AR), [Digital Trends es](https://es.digitaltrends.com/sociales/snapchat-actualizacion-modo-fantasma/) |
| Need help | Necesito ayuda | Plain, unambiguous; matched in the Settings description. | — |
| Heading home / check in / home safe | Vuelvo a casa / avisar / Ya en casa | Natural, no slang. | — |
| flare | bengala | A signal flare / sparkler; no slang meaning found. Note "bengala" is also a pyro item fans light at football grounds — appropriate for gig culture. | [Larousse es-en "bengala" (flare / sparkler)](https://www.larousse.fr/dictionnaires/espagnol-anglais/bengala/4629), [DLE "luz de Bengala"](https://dle.rae.es/luz?m=form) |
| vibe | vibra | "Buena vibra" is the Latin American colloquial form (Spain uses "rollo"). | [SpanishDict "buena vibra"](https://www.spanishdict.com/translate/buena%20vibra) |
| flare vibes | Me perdí 😅 / A la barra 🍺 / En primera fila 🎶 / Por comida 🍔 / Baños 🚻 / Afuera, tomando aire 🌬️ / En el merch 👕 / Me voy pronto 👋 | See "Changed" for the two fixes. | — |
| ping | aviso | Natural, neutral. | — |
| pin / meet-up | fijar / pin / punto de encuentro | "Fijar" is WhatsApp's Spanish verb for pinning. | [El Cronista: "fijar los mensajes en un chat"](https://www.cronista.com/infotechnology/actualidad/la-nueva-funcion-de-whatsapp-para-no-olvidarte-nunca-de-nada-como-fijar-los-mensajes-en-un-chat) |
| plan | plan | Standard. | — |
| Story / moment | historia / momento | Instagram's Spanish word is "historia". | — |
| Up next | Próximos | Fine as a section title. | — |
| Your gigs | Tus conciertos | — | — |
| Bump | Chocar (los celulares) | Kept, see "Checked and safe". | — |
| Light me up | Ilumíname | No slang meaning; clear. Avoided "prender" (MX slang: arouse / get high). | — |
| Find / Ride | Buscar / Viaje | Uber's Spanish uses "viaje" ("solicitar un viaje"). | [Uber es-MX](https://www.uber.com/mx/es/ride/), [Uber es-CO blog](https://www.uber.com/es-CO/blog/como-pedir-uber-para-otra-persona-colombia) |
| sound desk / encore | mesa de sonido / bis | Standard concert vocabulary. | — |
| Take a photo | Tomar una foto | "Tomar" is the safe LatAm verb (never "coger"). | [SpanishDict forum on tomar/sacar/hacer](https://www.spanishdict.com/answers/221557/which-spanish-verb-should-be-used-for-take-a-photo) |
| colours | rosa, azul, verde, naranja, morado, blanco | All neutral. | — |
| phone | celular | LatAm norm. | — |
| car / tent | auto / carpa | Widely understood across LatAm ("carro" is also common in MX/CO but "auto" is understood). | — |

## Changed

| Key | Old → New | Reason | Source |
|---|---|---|---|
| `find_trend_warmer`, `find_trend_colder`, `find_warmer_help` | "Caliente" / "Frío" → "Más cerca" / "Más lejos"; help text "Caliente significa que te acercas" → "Más cerca significa que vas bien" | "Caliente" also means sexually aroused across the Spanish-speaking world. A chip that says just "Caliente" next to a friend's name invites the wrong reading. | [DLE "caliente" (acepciones 5–6: lujurioso / excitado sexualmente)](https://dle.rae.es/caliente) |
| `crew_chat_night_tools_later` | "¡Vayan calentando!" → "¡Que empiece la cuenta regresiva!" | "Calentar" also means to arouse someone sexually. With no object, "Vayan calentando" can read that way (and in AR/UY "calentarse" also means to get angry). | [DLE "calentar" (acepción 4)](https://dle.rae.es/calentar?m=form) |
| `main_qr_hint_planned` | "Chateen y vengan con ganas" → "Chateen y vayan preparándose" | "venir(se)" + "con ganas" is an easy sexual double reading in MX and elsewhere ("venirse" = to climax). Low risk, but cheap to avoid. | [Costa Rica judicial usage dictionary, synonym "correrse"](https://diccionariousual.poder-judicial.go.cr/index.php/diccionario/correrse) |
| `main_bumped_text` | "¡Chocados!" → "¡Conectados!" | "Chocado" as an adjective reads as "shocked / upset", and "me choca" means "it annoys me" in MX/CO/VE. | [SpanishDict "choca" (CO/MX/VE: to annoy)](https://www.spanishdict.com/translate/choca) |
| `crew_vibe_lost` | "Perdido 😅" → "Me perdí 😅" | The adjective is masculine only. "Me perdí" is gender-neutral and is how people actually text it. | — |
| `crew_vibe_air` | "Fuera, tomando aire" → "Afuera, tomando aire" | "Afuera" is the normal Latin American form for "outside" ("fuera" sounds Spanish from Spain). | — |
| `crew_notif_overdue_text` | "Llámalo." → "Llama para ver cómo está." | "Llámalo" assumes a man. The new wording is gender-neutral. | — |
| `find_spin_scan` | "Escaneo girando" → "Escaneo giratorio" | Ungrammatical calque. | — |
| `find_map_title` | "Mosh mapa" → "Mapa Mosh" | Spanish word order. | — |

## Checked and safe (kept)

- **Bengala** (flare): no vulgar or drug meaning found. In everyday use it is a sparkler or flare. In some areas it can also mean a walking cane, which is harmless. [Larousse](https://www.larousse.fr/dictionnaires/espagnol-anglais/bengala/4629)
- **Chocar los celulares** (Bump): literally "knock the phones together". "Chocar los cinco" is high-five, so the playful tone fits. I found no sexual or drug meaning. Only the participle "¡Chocados!" was changed (see above).
- **Ilumíname** (Light me up): has no slang meaning. I deliberately did not use "prender/préndeme", which in Mexico is slang for arousing someone or getting high.
- **Tomar una foto**: Latin American usage. The file never uses "coger", which is vulgar in MX, AR and others. I searched every es file for these traps and none appear: coger, pico, concha, polla, paja, verga, pija, chucha, chingar, pinche, cajeta, papaya, huevo, leche, correrse, venirse, follar, culo, bicho.
- **Pin**: understood across LatAm and used by Google Maps users. It has no slang meaning there. ("Pico" would be dangerous in Chile, but it is not used.)
- **Fantasma**: harmless. It matches Snapchat.
- **Vibra**: Latin American colloquial word for "vibe". [SpanishDict](https://www.spanishdict.com/translate/buena%20vibra)

## For a native reviewer

1. **"Chocar los celulares" for Bump** (medium confidence, about 70%). It might sound like it means smashing the phones. "Juntar los celulares" is the alternative if testers prefer it. If you change it, update `home_bump_phones`, `setup_bump_title` and the quoted "Chocar" in `setup_bump_joining`.
2. **"Ilumíname"** (about 75%). It is clear, but a bit poetic or religious in tone. Testers may prefer something like "Haz brillar mi pantalla".
3. **"Por comida 🍔"** for "Food run" (about 75%). It is natural in MX ("voy por comida"). Argentines might prefer "A buscar comida".
4. **"Desde %1$s."** in `crew_friend_request_text` (crew name). It reads acceptably, but "Del grupo %1$s" may be clearer (about 70%).
5. **"auto" / "carpa"**: understood everywhere, but MX/CO/VE say "carro" (about 85% fine).
