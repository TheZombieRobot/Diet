# Spanish (Spain) — `values-es-rES`

I reviewed this folder against the English source and every string in `values-es-rES/strings*.xml`. The register is Spain: vosotros forms, móvil, coche, tienda (de campaña), añadir, ajustes.

Validator: `check_translation.py app/src/main/res/values-es-rES` → **OK**.

## Key terms

| English | Chosen | Why | Sources |
|---|---|---|---|
| crew | grupo | Neutral and natural. "Peña" or "panda" sound dated or regional. | — |
| mate / friends | amigos; fallback name **Colega** | "Colega" is exactly how Spaniards say "mate". "Amigos" is used in lists. | — |
| gig | concierto | Standard. "Bolo" is musicians' jargon. | — |
| Go live / live / hidden | Activar en directo / En directo / Oculto | In Spain "en directo" is the norm for live streams and broadcasts ("hacer un directo"). "En vivo" is the Latin American form. | [Xataka: "Cómo hacer un directo de Instagram"](https://www.xataka.com/basics/como-hacer-directo-instagram), [Publer es: "Cómo salir en directo en Instagram"](https://publer.com/blog/es/como-salir-en-directo-en-instagram-consejos-para-atraer-a-tu-audiencia/amp/) |
| Ghost mode | Modo fantasma | Same as Snapchat Spain. | [Snap newsroom es-ES](https://newsroom.snap.com/introducing-snap-map?lang=es-ES) |
| Need help / Heading home / Home safe | Necesito ayuda / Vuelvo a casa / Ya en casa | Plain. | — |
| flare | bengala | Flare or sparkler. No slang meaning. | [Larousse "bengala"](https://www.larousse.fr/dictionnaires/espagnol-anglais/bengala/4629) |
| vibe | rollo | "Buen rollo" is the Spanish (Spain) equivalent of "good vibes". | [SpanishDict "buena vibra" note / regional table](https://www.spanishdict.com/translate/buena%20vibra) |
| flare vibes | Me he perdido 😅 / A la barra 🍺 / En primera fila 🎶 / A por comida 🍔 / Baños 🚻 / Fuera, tomando aire 🌬️ / En el merch 👕 / Me voy pronto 👋 | "A por" is natural colloquial Spain usage. | — |
| ping | aviso | — | — |
| pin | fijar / pin / punto de encuentro | Matches WhatsApp's "Fijar". | [El Cronista (WhatsApp "fijar")](https://www.cronista.com/infotechnology/actualidad/la-nueva-funcion-de-whatsapp-para-no-olvidarte-nunca-de-nada-como-fijar-los-mensajes-en-un-chat) |
| Story / moment | historia / momento | — | — |
| Up next / Your gigs | Próximos / Tus conciertos | — | — |
| Bump | Chocar (los móviles) | See below. | — |
| Light me up | Ilumíname | — | — |
| Ride | Viaje | Uber Spain: "Solicita un viaje". | [Uber es-ES](https://www.uber.com/es-ES/ride) |
| Take a photo | Hacer una foto | The usual Spain verb. | [SpanishDict forum](https://www.spanishdict.com/answers/221557/which-spanish-verb-should-be-used-for-take-a-photo) |
| venue | recinto | Spain's festival/venue word. | — |
| signal | cobertura | Spain says "no tengo cobertura". | — |

## Changed

| Key | Old → New | Reason | Source |
|---|---|---|---|
| all "live" strings (about 20 keys: `home_go_live`, `home_live`, `crew_tile_live`, `find_pill_live`, `find_live_tag`, `time_live`, `visibility_*`, `setup_stay_live*`, `setup_onb_*live*`, `main_nudge_*`, `crew_wake_text*`, `home_hidden_hint`, `find_searching_help`, `find_map_no_mates`, `find_story_empty_following`, `setup_about_text`) | "en vivo" → "en directo" (also "EN VIVO" → "EN DIRECTO") | Spain's term for "live" (see sources above). The button name quoted in sentences ("Activar en directo") was kept consistent everywhere. | Xataka / Publer links above |
| `find_trend_warmer/colder`, `find_warmer_help` | "Caliente"/"Frío" → "Más cerca"/"Más lejos" | "Caliente" also means sexually aroused (estar caliente). | [DLE "caliente"](https://dle.rae.es/caliente) |
| `crew_chat_night_tools_later` | "¡Id calentando!" → "¡Id calentando motores!" | Bare "calentar" can mean to arouse. The set phrase "calentar motores" (to get ready) removes the ambiguity and keeps the energy. | [DLE "calentar"](https://dle.rae.es/calentar?m=form), [RAE Diccionario del estudiante "calentar motores"](https://www.rae.es/diccionario-estudiante/motora) |
| `main_bumped_text` | "¡Chocados!" → "¡Conectados!" | "Chocado" reads as "shocked / taken aback". | [SpanishDict "choca"](https://www.spanishdict.com/translate/choca) |
| `find_ride` | "Coche" → "Viaje" | "Coche" next to the user's own "car" pin was ambiguous. Uber Spain says "viaje". | [Uber es-ES](https://www.uber.com/es-ES/ride) |
| `find_share_moment_help` | "Saca dónde estás" → "Haz una foto de dónde estás" | "Sacar" without "una foto" reads as "take out where you are". | — |
| `find_story_empty_crew` | "Saca el escenario, la barra, a tus amigos." → "Haz fotos del escenario, la barra, tus amigos." | Same reason. | — |
| `crew_vibe_lost` | "Perdido 😅" → "Me he perdido 😅" | Gender-neutral and natural in a text. | — |
| `crew_notif_overdue_text` | "Llámale." → "Llama para ver cómo está." | Gender-neutral. | — |
| `find_spin_scan` | "Escaneo girando" → "Escaneo giratorio" | Grammar. | — |
| `find_map_title` | "Mosh mapa" → "Mapa Mosh" | Spanish word order. | — |
| `setup_onb_body_find` | "apunta directo a él" → "apunta directamente a él" | More standard in Spain (and avoids a clash with "en directo"). | — |

## Checked and safe (kept)

- **Leísmo** ("Invítales", "buscarle", "les sigues", "¡Le has encontrado!"): this is normal in central Spain and accepted by the RAE for masculine persons. The current DPD also tolerates the plural. Kept, because it sounds native in Spain. [RAE DPD "leísmo"](https://www.rae.es/dpd/le%C3%ADsmo)
- **"Venid con ganas"** (`main_qr_hint_planned`): in Spain this commonly means "come up for it / come keen". The verb is non-reflexive "venir", not "correrse". Low risk, kept.
- **Colega**: the standard Spain word for "mate". It has no negative meaning.
- **Tienda** (tent): in a festival context, "tienda (de campaña)" is the normal word.
- **Bengala, Ilumíname, fantasma, fijar**: no slang meanings (see the es report).
- I searched for these trap words and none appear: polla, coño, follar, paja, correrse, cachondo, pillar (can mean "to score drugs"), petar, pedo (also "drunk").

## For a native reviewer

1. **"Activar en directo"** as the Go live switch label (about 75%). It is clear, but a native may prefer the shorter "Ponerme en directo" or just "En directo". If you change it, also update the quoted name in `home_hidden_hint` and `main_nudge_text`.
2. **"Chocar los móviles"** for Bump (about 70%). An alternative is "Juntar los móviles".
3. **"En el merch"** (about 80%). Young Spanish gig-goers do say "merch", but "En el puesto de merch" is safer if testers find the short form odd.
4. **Leísmo**: kept (see above). A reviewer from Andalusia or the Canary Islands might prefer "lo/los" (about 85% fine either way).

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
| `home_tap_mate_hint` | Toca a un amigo para buscarle · mantén pulsado para más | Toca para buscar · mantén para opciones |
| `home_tile_not_sharing` | aún no comparte | sin compartir |
| `home_asleep_text` | … sin Bluetooth, sin ubicación, sin gastar batería. Tus amigos pueden unirse ya, y ese día te avisaremos. | … sin Bluetooth, ubicación ni gasto de batería. Tus amigos ya pueden unirse; ese día te avisamos. |
| `setup_take_selfie` | Hacer un selfie | Hacer selfie |

## Venue map (`strings_venue.xml`)

Ten strings: the crew card's offline-map line, the upstairs/downstairs tag on a mate's face, and "Finding the venue…". Validator prints **OK**.

| English | Chosen | Why |
|---|---|---|
| venue map | **mapa del recinto** | *Recinto* as in `crew_at_venue`. *Planta* is the usual word for a floor in Spain. |
| ↑ Upstairs / ↓ Downstairs (on a small photo) | **↑ Arriba / ↓ Abajo** | Short, with the arrow kept. |
| upstairs / downstairs (screen reader) | en la planta de arriba / en la planta de abajo | Said in full after the mate's direction. |

For a native reviewer: Nothing doubtful. Confidence: **high**.

## Watch app (`wear/…/strings.xml`, `strings_watch.xml`)

The Wear OS companion: 62 strings on the watch and 4 on the phone (the notification shown while the phone finds a mate for the watch). 22 of the watch strings are copied key for key from the phone app's files (the quick messages, "live", the four message states, the warmer/colder hints, units), so the wrist says things the way the phone does. The rest are new. Validator prints **OK** for both folders.

| English | Chosen | Why |
|---|---|---|
| watch / wrist / buzzes | **reloj** / **muñeca** / **vibraciones** | Plain everyday words. "Buzzes" are the watch's vibrations: in a loud venue they do the guiding. |
| Phone out of reach | **Móvil fuera de alcance** | The watch has lost its Bluetooth link to the phone. *Fuera de alcance* for Bluetooth range; phone reception is *cobertura*, as in the rest of the app. |
| Hold (on the round button) / Hold to tell your crew | **Mantén** / Mantén pulsado para avisar a tu grupo | The button is about 8 letters wide, so one short word or two very short ones. |
| Hold your wrist flat | **Mantén la muñeca plana** | The arrow only shows with the watch face level, like a compass. |
| Follow the buzzes | **Sigue las vibraciones** | Shown when there is a distance but no direction. |
| Not sent yet | **Aún no enviado** | Big, above the phone's own "Waiting for signal": the message is still on the phone. |
| Only crew nearby have it so far | Por ahora solo lo tiene el grupo que está cerca | Under the phone's own "Sent nearby". |
| Nearest mate (watch-face complication) / Crew status (tile) | **Amigo más cercano** / **Estado del grupo** | Names in the watch's pickers. |

For a native reviewer: *Mantén* alone on the round button (the line under it says *Mantén pulsado…*). *Se ha parado* (present perfect) for a find that has just stopped. The watch screens are in `docs/screenshots/watch/` (English, German, Thai, Arabic, Japanese) and every language is on the `ui-screenshots-watch` branch. Confidence: **medium-high**.
