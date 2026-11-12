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

## UI review

Shortened so the text fits like English does in the rendered screens:

| Key | Old | New |
|---|---|---|
| `crew_chat_send_flare_hint` | Lanza una bengala: muestra dónde estás durante %d min | Lanza una bengala: tu ubicación por %d min |
| `find_spin_scan` | Escaneo giratorio | Escaneo 360° |
| `find_restart_scan` | Volver a empezar | Reiniciar |
| `find_last_seen_on_map` | Visto por última vez en el mapa | Última ubicación |
| `home_plan_gig` | Planear un concierto (búscalo, invita ya) | Planear concierto (búscalo, invita) |
| `home_invite_mates_tonight` | Invita a tus amigos para esta noche | Invita amigos esta noche |
| `home_tap_mate_hint` | Toca a un amigo para buscarlo · mantén presionado para más | Toca para buscar · mantén para opciones |
| `home_tile_not_sharing` | aún no comparte | sin compartir |
| `home_asleep_text` | … sin Bluetooth, sin ubicación, sin gastar batería. Tus amigos pueden unirse ya, y ese día te avisaremos. | … sin Bluetooth, ubicación ni gasto de batería. Tus amigos ya pueden unirse; ese día te avisamos. |
| `setup_take_selfie` | Tomarte una selfie | Tomar selfie |

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **mapa del lugar** | *Lugar* as in `crew_at_venue`. *Piso* is the usual word for a floor in Latin America. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Arriba / ↓ Abajo** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | en el piso de arriba / en el piso de abajo | Said in full after the mate's direction. |

For a native reviewer: *sin conexión* for "offline" (the other strings say *sin señal* for "no signal"; here the point is that the map is stored). Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **reloj** / **muñeca** / **vibraciones** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Celular fuera de alcance** | The watch has lost its Bluetooth link to the phone. *Fuera de alcance* is the usual phrase for a Bluetooth device that is too far away; phone reception is *señal*. |
| Hold (on the round button) / Hold to tell your crew | **Mantén** / Mantén presionado para avisar a tu grupo | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Mantén la muñeca plana** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Sigue las vibraciones** | Shown when there is a distance but no direction. |
| Not sent yet | **Aún no enviado** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Por ahora solo lo tiene el grupo que está cerca | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Amigo más cercano** / **Estado del grupo** | Names in the watch's pickers. |

For a native reviewer: *Mantén* alone on the round button (the line under it gives the full *Mantén presionado…*). *Amigo más cercano* is masculine, like the app's other uses of *amigo*. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.

## "I'm here" pin (`strings_here.xml`)

Eight strings: the **I'm here** button in the drop-a-pin dialog and the line under it, the
"pinned 3 min ago" note on a mate's face (map, list, radar, finder), and your own pin's row in
the map's list. Validator prints **OK**. See `docs/IM_HERE.md`.

| English | Chosen |
|---|---|
| I'm here (button) | **Estoy aquí** |
| Your crew sees you on this spot, with the floor, until you walk away (20 min at most). | Tu grupo te ve en este lugar, con el piso, hasta que te vayas (20 min como máximo). |
| pinned 3 min ago (%1$s = the app's "3 min ago" / "just now") | pin puesto %1$s |
| You're here / Pinned 3 min ago · your crew sees you here | Estás aquí / Pin puesto %1$s · tu grupo te ve aquí |
| Take your pin down (screen reader, ✕) | Quitar tu pin |

Uses **grupo** and **pin** (*pin puesto*), as in the meet-up pin strings. Floor = *piso* (Latin America). Written without a native reviewer. Confidence: **medium**.

## Private messages (`strings_private.xml`)

Ten strings: **Message Sam** (in a crew mate's options and the finder), the private thread's
subtitle, empty note, Mute and its note, and the notification (with what a locked phone shows).
Validator prints **OK**. See `docs/PRIVATE_MESSAGES.md`.

| English | Chosen |
|---|---|
| Message %1$s (button and menu item) | **Escribir a %1$s** |
| Private · only you two can read it | Privado · solo ustedes dos lo pueden leer |
| Only you and %1$s can read what's sent here: not the rest of the crew, and not us. | Solo tú y %1$s pueden leer lo que se envía aquí: ni el resto del grupo, ni nosotros. |
| Mute / Unmute | Silenciar / Quitar silencio |
| Muted on this phone. %1$s's messages still arrive here, without a notification. | Silenciado en este teléfono. Los mensajes de %1$s siguen llegando aquí, sin notificación. |
| %1$s · private (notification title) | %1$s · privado |
| Private message (locked phone) | Mensaje privado |
| %d new private messages | %d mensajes privados nuevos |
| %d unread private messages (screen reader, the count on a face) | %d mensajes privados sin leer |

Uses **grupo**, as elsewhere, and *ustedes* for "you two" (Latin America). *Silenciar* / *Quitar silencio*. Reuses the existing words for "Sent", "Sent nearby", "Waiting for signal" and the no-signal notes. Written without a native reviewer. Confidence: **medium**.
