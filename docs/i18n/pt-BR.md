# Portuguese (Brazil) — `values-pt`

I reviewed this folder against the English source and every string in `values-pt/strings*.xml`. The register is casual Brazilian: "você", "pra", "tô", "bora", "cadê", "celular". Because the folder is plain `values-pt`, Portuguese users in Portugal (pt-PT) will also see these strings. Notes on that are below.

Validator: `check_translation.py app/src/main/res/values-pt` → **OK**.

## Key terms

| English | Chosen | Why | Sources |
|---|---|---|---|
| crew | galera | The everyday Brazilian word for "your group of friends". It is young and casual, which suits the app. | [Cidadania e Visto: "galera" vs "malta"](https://www.cidadaniaevisto.com.br/blog/girias-brasileiras-que-confundem-portugueses) |
| mate / friends; fallback "Mate" | amigo(s); **Amigo** | Neutral. | — |
| gig | show | The Brazilian word for a concert. | — |
| Go live / live / hidden | Ficar ao vivo / Ao vivo / Escondido | "Ao vivo" is the standard Brazilian term for live. | — |
| Ghost mode | Modo fantasma | Same as Snapchat. | [Snap newsroom pt-BR](https://newsroom.snap.com/introducing-snap-map?lang=pt-BR), [FamiSafe BR on "modo fantasma"](https://famisafe.wondershare.com/br/parental-control/snapchat-track-and-ghost-mode.html) |
| Need help | Preciso de ajuda | Plain. It is quoted the same way in Settings. | — |
| Heading home / check in / home safe | Indo pra casa / dar check-in / Cheguei bem | "Dar check-in" is common Brazilian usage. | — |
| flare | sinalizador | The Brazilian word for a pyro flare (the ones fans light in stadiums). It fits gig culture and has no slang meaning. | [Goal BR "rua de fogo" (sinalizadores)](https://www.goal.com/br/not%C3%ADcias/ruas-de-fogo-por-que-a-festa-da-torcida-e-proibida-na-libertadores-e-sul-americana/blt83e036934431ee2a) |
| vibe | vibe | Very common in Brazilian youth speech. | — |
| flare vibes | Me perdi 😅 / Hora do bar 🍺 / Na grade 🎶 / Atrás de comida 🍔 / Banheiro 🚻 / Lá fora tomando ar 🌬️ / No merch 👕 / Saindo daqui a pouco 👋 | "Na grade" is exactly what Brazilian fans say for "at the rail" ("colado na grade"). | [IstoÉ on fans "na grade"](https://istoe.com.br/desidratacao/), [Billboard BR](https://billboard.com.br/famosos-recebem-vaias-do-publico-durante-show-do-rbd-no-rj-assista/) |
| ping | aviso | — | — |
| pin / meet-up | fixar / pin / ponto de encontro | "Fixar" is WhatsApp Brazil's verb for pinning. | [Canaltech: WhatsApp "fixar até 3 mensagens"](https://canaltech.com.br/apps/whatsapp-libera-opcao-de-fixar-ate-3-mensagens-numa-conversa-283187/) |
| plan | plano | — | — |
| Story / moment | história / momento | See the reviewer notes. | — |
| Up next / Your gigs / Memories | Próximos / Seus shows / Memórias | — | — |
| Bump | Encostar (os celulares) | Literally "touch / hold against". This is exactly the gesture. | — |
| Light me up | Me ilumina | See below. | — |
| Ride | Corrida | Uber Brazil's word for a trip ("pedir uma corrida"). | [TecMundo: "Solicitar uma corrida de Uber"](https://www.tecmundo.com.br/transportes/254933-chamar-uber-whatsapp-brasil.htm) |
| sound desk / encore | mesa de som / bis | Standard. | — |
| Take a photo | Tirar uma foto | Standard. | — |
| colours | rosa, azul, verde, laranja, roxo, branco | Neutral. | — |

## Changed

| Key | Old → New | Reason | Source |
|---|---|---|---|
| `find_chip_locked` | "Travado" → "Na mira" | In phone UI, "travado/travou" means frozen or crashed ("o app travou"), so a chip saying "Travado" looks like an error. It is also used colloquially for "stuck / out of it". "Na mira" (on target) says the direction is reliable. I avoided "Preciso", which also means "I need". | [Wiktionary "travado" / plainspell: "impossibilitado de se mover"](https://plainspell.com/pt/palavra/travado) |
| `crew_status_phone_died` | "%1$s celular morreu" → "%1$s sem bateria" | The old text was ungrammatical after a name ("Ana celular morreu"). | — |
| `home_tile_phone_died` | "celular morreu" → "sem bateria" | Consistency with the line above. | — |
| `crew_wake_text`, `crew_wake_text_venue` | "Começa %1$s" → "Começa às %1$s" | The placeholder is a clock time ("Começa às 20:00"). The preposition was missing. | — |
| `crew_vibe_lost` | "Perdido 😅" → "Me perdi 😅" | Gender-neutral, and this is how people actually text it. | — |
| `find_asked_light_up` | "o celular dele vai oferecer acender" → "o celular da pessoa vai oferecer acender a tela" | Removed the assumed gender ("dele") and finished the phrase. | — |
| `find_map_title` | "Mosh mapa" → "Mapa Mosh" | Portuguese word order. | — |

## Checked and safe (kept)

- **"Ficar ao vivo", "Fica aí", "ficar escondido"**: "ficar com alguém" is Brazilian slang for hooking up, but only with "com + person". None of the strings use that construction.
- **"Encostar / Encostou!"** (Bump): no sexual or drug slang meaning in this use.
- **"Quente / Frio"** (warmer/colder): this is the well-known "tá quente, tá frio" children's game, and the help text explains it. "Quente" can also mean "hot/sexy", but the chip only ever shows the bare word in the game context. Kept, with medium confidence (see reviewer notes).
- **"Me ilumina"**: it has a slight religious ring ("Deus me ilumine") but nothing vulgar. I deliberately avoided **"acender / me acende"** as a feature name because "acender (um baseado)" is common slang for lighting a joint. "Acender a tela" (light up the screen) is fine because the object makes the meaning clear.
- **"sinalizador"**: a pyro flare. Its football-stadium association suits gig culture, and it has no drug or crime meaning. [Goal BR](https://www.goal.com/br/not%C3%ADcias/ruas-de-fogo-por-que-a-festa-da-torcida-e-proibida-na-libertadores-e-sul-americana/blt83e036934431ee2a)
- **"Bora", "Tô indo", "Cadê você?", "print"**: normal casual Brazilian usage.
- I searched every pt file for these trap words and none appear: pau, rola, pinto, piroca, gozar, comer, transar, foder, porra, caralho, cu, bicha, veado, rapariga, punheta, tesão, chupar, bater, pegar, dar (only appears in "dar check-in").

## Portugal (pt-PT) reading

The folder is plain `values-pt`, so Portugal sees these strings. Nothing is offensive there, but much of it reads as clearly Brazilian:
- **"galera"** is not native in Portugal, where the word is "malta". Brazilian "galera" sounds foreign or childish to some Portuguese speakers. [Cidadania e Visto](https://www.cidadaniaevisto.com.br/blog/girias-brasileiras-que-confundem-portugueses), [Mais Goiás on Brazilian slang reaching Portuguese kids](https://www.maisgoias.com.br/entretenimento/youtubers-brasileiros-mudam-o-jeito-de-falar-das-criancas-portuguesas/)
- **"celular"** is "telemóvel" in Portugal, **"tela"** is "ecrã", **"Salvar"** is "Guardar", **"banheiro"** is "casa de banho", **"show"** is usually "concerto", and **"print"** (screenshot) is "captura de ecrã". "Você + pra / tô / cadê / bora / Ache" are clearly Brazilian colloquial forms.
- Recommendation: add a `values-pt-rPT` folder later if Portugal matters. Until then, it reads like a Brazilian app, which Portuguese users are used to.

## For a native reviewer

1. **"Quente / Frio"** for warmer/colder (about 75%). If testers smirk at a "Quente" chip, switch to "Mais perto / Mais longe" (and update `find_warmer_help`).
2. **"Me ilumina"** for Light me up (about 70%). It is clear but slightly churchy. "Acende minha tela" is clearer but plainer.
3. **"História"** for Story (about 70%). Brazilian Instagram users say "story/stories" in English. "Story" might feel more native for the tab name.
4. **"Na mira"** for the reliable-direction chip (about 75%). The alternative is "Certeiro".
5. **"Memórias"** vs "Lembranças" for the memories section (about 80%). Both are used by big apps.

## UI review

Shortened after checking the rendered screens against English (validator: OK).

| Key | Old | New | Why |
|---|---|---|---|
| home_family_can_follow | A família pode acompanhar a noite de casa | A família acompanha a noite de casa | Wrapped to 2 lines |
| home_one_thing_first_more | ANTES, UMA COISA · MAIS %d | PRIMEIRO ISTO · MAIS %d | Kicker wrapped |
| home_plan_gig | Planejar um show (ache e convide já) | Planejar show (ache e convide) | Button wrapped |
| home_chat_subtitle | Mensagens, o plano, sinalizadores | Chat, plano, sinalizadores | Truncated with "…" |
| home_tile_not_sharing | ainda não compartilha | não compartilha | Tile status wrapped |
| crew_chat_send_flare_hint (plural) | Solte um sinalizador: mostre onde você está por %d min | Sinalizador: mostre onde está por %d min | "30 min" wrapped alone |
| find_from_gps | Pelo GPS: fica mais preciso enquanto você anda | Pelo GPS: melhora ao andar | Wrapped to 2 lines |
| find_last_seen_on_map | Visto por último no mapa | Último local | Button wrapped |
