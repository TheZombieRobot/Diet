# French (values-fr): translation review

Scope: France, Belgium, Switzerland and Quebec. Tone: casual, *tutoiement*, ages 18–35.
Validator: `check_translation.py app/src/main/res/values-fr` prints **OK**.

Note: fr.wiktionary.org and en.wiktionary.org could not be fetched from this session (blocked network), so dictionary evidence comes from Larousse, Le Robert, OQLF and search-result snippets.

## Key terms

| English | Chosen French | Why | Sources |
|---|---|---|---|
| crew | **crew** (feminine: *la crew, ta crew*) | Anglicism widely used by young French speakers. Usage splits between *le crew* and *la crew* (like *team*); kept feminine for consistency. See doubts below. | Académie française on *team* gender: https://dictionnaire-academie.fr/article/QR_0199 |
| mate / friends | **pote(s)**; *ami(s)* for the "keep as friend" feature | *Pote* is neutral, friendly, and understood everywhere, Quebec included. | — |
| fallback name "Mate" | **Pote** | Short, friendly, safe. | — |
| gig | **concert** | Natural word; *gig* is not used in French. | — |
| Go live / live / hidden | **Passer en live / Live / Invisible** | *Live* is common youth usage. *Invisible* is gender-neutral (see Changed). | — |
| Ghost mode | **Mode fantôme** | Same name as Snapchat's feature in French. | https://www.moyens.net/comment/comment-utiliser-le-mode-fantome-de-snapchat-pour-masquer-votre-position/ , https://parental-control.flashget.com/fr/what-is-snapchat-ghost-mode |
| Need help | **Besoin d'aide** / *J'ai besoin d'aide* | Clear and neutral. | — |
| Heading home / check in / home safe | **Je rentre / check-in / À la maison, tout va bien** | *Check-in* is an understood anglicism. "Home safe" was reworded to be gender-neutral. | — |
| flare | **fusée** | Means a signal flare. Not tied to stadium pyrotechnics, which French calls *fumigènes* or *torches*. | — |
| flare vibes | Je suis où ? 😅 / Pause bar / Contre la barrière / Je vais manger / Toilettes / Je prends l'air / Stand merch / Je pars bientôt | Natural, short, no slang traps. | — |
| ping | **ping / pinger** | Gaming and tech anglicism, understood. | — |
| pin / meet-up | **repère / RDV, point de RDV** | Google Maps in French also uses *repère*. | — |
| plan | **le plan** | Natural. | — |
| Story | **la story** | Same word Instagram and Snapchat users use. | — |
| moment | **moment** | Natural. | — |
| Up next | **À venir** | Natural. | — |
| Your gigs | **Tes concerts** | Natural. | — |
| Bump | **Check (des téléphones)** | *Faire un check* = fist bump, a fitting image. | https://wikimonde.com/article/Poing_contre_poing , https://www.pimsleur.com/blog/?p=12259 |
| Light me up | **Fais clignoter** | Deliberately avoids *allumer* ("light up"). *Allumer quelqu'un* is familiar French for sexually teasing someone. | https://www.larousse.fr/dictionnaires/francais/Allumer , https://dictionnaire.lerobert.com/en/synonyms/allumer |
| beacon / flashing | **clignoter / écran qui clignote** | Neutral. | — |
| Find | **Trouver / Retrouver** | Natural. | — |
| Ride | **Taxi** (was *VTC*) | See Changed. | — |
| sound desk / encore | **régie son / rappel** | Standard concert vocabulary. | — |
| nudge text | "Hé toi, ouvre Moshpoint et appuie sur Passer en live…" | Friendly. *toi* is the fallback when the name is unknown. | — |
| onboarding headlines | "Retrouve tes potes dans n'importe quelle foule", "Passe en live en arrivant", "Comment tes potes t'appellent ?" | Natural. | — |
| colours | rose, bleu, vert, orange, violet, blanc | Neutral. | — |

## Changed

| Old → New | Reason | Source |
|---|---|---|
| Inclusive point médian forms (*Caché·e, Perdu·e, Bien rentré·e, ami·e, ajouté·e, déplacé·e, Vu·e, trouvé·e, Seul·e, seul·e, arrivé·e, vu·e*) → gender-neutral rewording, e.g. *Invisible*, *Je suis où ? 😅*, *À la maison, tout va bien*, *veut rester en contact*, *et toi êtes amis*, *A bougé de…*, *Dernière position sur la carte*, *Ta crew ne te voit pas*, *c'est toi qui l'actives*, *Tes infos ne vont qu'à %2$s*, *est dans tes amis*, *Passe-lui un coup de fil* | In France the point médian is a political flashpoint. It was banned from official texts in 2017 and from schools in 2021, and those bans were upheld by the Conseil d'État. In Quebec it is contested, and screen readers handle it badly. Neutral wording avoids all of that. | https://www.leclubdesjuristes.com/archives-cdj/3-questions-a-pascal-jan-sur-la-circulaire-concernant-lecriture-inclusive-2050/ , https://conseil-etat.fr/actualites/l-interdiction-de-recourir-a-certains-elements-de-l-ecriture-inclusive-notamment-le-point-median-pour-l-enseignement-est-legale , https://www.senat.fr/cra/s20231030/s20231030_5.html , https://www.usherbrooke.ca/actualites/nouvelles/details/46748 |
| *Shoote la scène… / Shoote là où tu es* → *Prends en photo…* | *Shooter* / *se shooter* means injecting drugs in familiar French. Not worth the risk in a nightlife app. | https://www.larousse.fr/conjugaison/francais/se%20shooter/8467 , https://dictionnaire.lerobert.com/en/synonyms/shooter |
| *Police, pompiers, SAMU* → *Police, pompiers, ambulance*; *SAMU et pompiers* → *Ambulance et pompiers* | SAMU exists only in France. Belgium uses 112, Switzerland 144, and Quebec 911. | https://www.ch.ch/fr/police , https://www.police.be/5301/node/685 , https://www.service-public.gouv.fr/particuliers/vosdroits/F33954 |
| *Numéro de portable / Portable* → *Numéro de mobile / Mobile* | In Quebec *portable* usually means a laptop. *Mobile* is understood in every region and matches Android's contact label. | https://vitrinelinguistique.oqlf.gouv.qc.ca/fiche-gdt/fiche/8393991/telephone-cellulaire , https://vitrinelinguistique.oqlf.gouv.qc.ca/fiche-gdt/fiche/8874365/ordinateur-portable |
| *VTC* → *Taxi* | *VTC* is French-administrative jargon and unknown in Quebec. *Taxi* is universal. | https://www.uber.com/fr-CA/newsroom/uber-est-bien-implantee-au-quebec |
| *Papotez et chauffez-vous* → *Papotez et faites monter la hype*; *lance la hype* → *fais monter la hype* | *(Se) chauffer* also has a flirt or sexual sense in familiar French ("chauffer quelqu'un"). *Chauffe l'ambiance* was kept because it is a fixed, safe idiom. | (native-usage judgement, see doubts) |
| *Calé* (direction locked) → *Précis* | *Calé* reads as "knowledgeable" or "stuck", not "accurate". | — |
| *Dehors, je respire* → *Je prends l'air* | More idiomatic. | — |
| *%d min dehors* → *%d min de sortie* | "Time out" means time spent out for the night (*sortie*), not time spent outdoors. | — |
| *pas de batterie* → *zéro conso de batterie* | The original read as "no battery". | — |
| *Touche un pote…* → *Appuie sur un pote…* (3 strings) | Avoids "touch a mate" reading physically. Android French uses *appuyer*. | — |
| *Prends Moshpoint* → *Installe Moshpoint* | Clearer. | — |

## Checked and safe (kept)
- **Pote, potes**: friendly, no bad meaning in any region.
- **fusée** (flare): primary meaning is "rocket" or "signal flare". Stadium pyrotechnics are *fumigènes* or *torches*, so there is no crime association.
- **Check** (bump): *faire un check* = fist bump. https://wikimonde.com/article/Poing_contre_poing
- **Fais clignoter**: chosen over *allume-moi*, which carries a sexual sense. https://www.larousse.fr/dictionnaires/francais/Allumer
- **Contre la barrière**, **Pause bar**: standard concert-goer phrases. Alcohol is mentioned but not glorified.
- **Mode fantôme**: matches Snapchat FR.
- **pinger, story, live, merch**: established anglicisms in youth usage.

## For a native reviewer
1. **Gender of *crew*** (*la crew* vs *le crew*). Both are heard: hip-hop and graffiti speakers often say *le crew*, younger speakers often *la crew*. I found no dictionary entry. Confidence that *la crew* sounds fine: **medium**. Changing it means switching ~60 strings and their agreements.
2. **Quebec flavour.** *Pote*, *check-in*, *RDV* and *story* are understood, but Quebecers might prefer *chum/ami*, *gang*. Confidence the strings work in Quebec: **medium-high**. A `values-fr-rCA` override could be added later.
3. **Fusée** as a light "where I am" status. Natural enough? Confidence **medium**.
4. **Remaining *Touche pour…*** hints (e.g. *Touche pour réessayer*). Fine French, but Android itself uses *Appuie/Appuyez*. Confidence **high** that they are acceptable.
5. **Crew vibe *Je suis où ? 😅*** for "Lost". Playful and gender-neutral. Check it reads as intended. Confidence **medium-high**.
