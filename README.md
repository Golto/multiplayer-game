# Salle de jeux

Une salle de jeux de société multijoueur dans le navigateur. On choisit un jeu, on ouvre un salon privé et on partage son code (ou le lien `/r/CODE`). Le design suit le système **Golpex**.

| Adresse | Page |
| --- | --- |
| `/` | La salle : tous les jeux, et un raccourci pour rejoindre un salon par son code |
| `/rumeurs`, `/topologie`, `/puzzle`, `/puits`, `/cartographes`, `/echos`, `/zero`, `/tapis` | La page d'un jeu : ouvrir ou rejoindre un salon |
| `/r/CODE` | Un salon : lien d'invitation, puis la partie elle-même |

Jeux disponibles : **Rumeurs**, **Topologie**, **Puzzle**, **Puits**, **Cartographes**, **Échos**, **Zéro** et **Tapis** (`shared/catalog.ts`).

## Rumeurs

- Quatre marchandises : Safran, Cuivre, Cacao, Indigo. La vraie valeur de chacune vaut **20 écus + la somme de ses cartes**.
- Chaque joueur voit une carte de chaque marchandise. Une carte supplémentaire reste scellée et personne ne la voit.
- Une partie se joue en **4 séances**, chacune en trois temps :
  1. **Rumeurs** : chacun publie une affirmation signée, vraie ou fausse (sur sa carte, sur le cours final, en texte libre, ou il se tait).
  2. **Marché** : tout le monde passe ses ordres en même temps, ±3 lots par marchandise. Le prix bouge avec la demande nette.
  3. **Clôture** : les échanges de chacun sont rendus publics, puis la carte d'un joueur est retournée. Les rumeurs vérifiables sont tamponnées « Confirmé » ou « Démenti ».
- À la fin, toutes les cartes sont dévoilées. Le score est la caisse plus les lots au vrai cours. Des distinctions sont attribuées : Langue de vipère, Parole d'or, Flair de fouine…

## Topologie

Conquête de territoire en temps réel, de 2 à 8 joueurs, sur un plateau carré dont les bords se recollent.

- Hors de ton territoire, tu laisses une traîne. En rentrant, la traîne devient territoire, ainsi que chaque région qu'elle sépare du reste du plateau, sauf la plus grande. Sur un tore, une boucle qui fait le tour du plateau ne sépare rien : elle ne rapporte que sa traîne.
- Traverser la traîne d'un joueur le fait tomber, traverser la sienne aussi ; deux têtes qui se percutent tombent toutes les deux. On revient deux secondes plus tard au cœur de son territoire.
- 3 manches de 2 minutes, chacune sur une surface tirée au sort parmi le **tore**, le **ruban de Möbius** (murs en haut et en bas), la **bouteille de Klein**, le **plan projectif**, le **cylindre** (murs en haut et en bas, côtés recollés droit) et la **sphère** (le haut se recolle à la gauche et le bas à la droite : passer un bord fait tourner d'un quart de tour). Les flèches sur les bords suivent la notation des topologues : même sens, recollement droit ; sens contraires, recollement en miroir. Les marges autour du plateau montrent ce qu'il y a de l'autre côté de chaque bord.
- Commandes : flèches, ZQSD ou WASD ; glissés du doigt ou croix directionnelle sur téléphone.
- Le serveur avance la partie 8 fois par seconde et n'envoie que les cases qui ont changé (`TickMessage`) ; l'état complet ne part qu'aux changements de phase et aux reconnexions.

## Puzzle

Puzzle coopératif de 1 à 8 joueurs : tout le salon assemble le même puzzle, et on peut y jouer seul.

- L'hôte choisit le dessin parmi six illustrations SVG minimalistes (Sommets au crépuscule, Archipel, Bauhaus, Orbite, Forêt de pins, Ville la nuit), le format (**paysage** 4:3, **panorama** 2:1, **portrait** 3:4, **carré**) et le nombre de pièces, de 12 à 432 (300 et 432 : tailles XL). La grille est choisie pour garder des cases presque carrées ; le dessin est recadré au format.
- Les pièces sont dispersées autour du plateau et se déplacent par glisser-déposer.
- **Pose** : une pièce ne se valide sur le plateau que si elle touche une pièce déjà posée, ou si c'est un coin. Pas de pose « à l'aveugle » : on commence par les coins, comme avec un vrai puzzle.
- **Blocs** : hors du plateau, une pièce lâchée au bon endroit à côté d'une de ses voisines s'emboîte avec elle. Le bloc se déplace ensuite d'un seul geste, et se pose en entier s'il contient un coin ou touche le reste.
- Un bloc tenu est verrouillé pour les autres, et ses déplacements s'affichent chez tout le monde en direct. On peut rejoindre un puzzle en cours.
- La règle de pose (`resolveDrop` dans `shared/games/puzzle.ts`) est la même pour le serveur et le client : l'écran réagit tout de suite, le serveur confirme.
- Outils : molette ou boutons pour zoomer, glisser le fond pour se déplacer, « Modèle » pour afficher l'image en filigrane, « Bords d'abord » pour estomper les pièces intérieures.
- La découpe (tenons et mortaises) est tirée au sort à chaque partie à partir d'une graine partagée : seule la graine circule, le client recalcule les contours.

## Puits

Versus en tours simultanés, de 2 à 6 joueurs. On ne pilote pas son vaisseau : on pose des puits de gravité.

- Les vaisseaux tournent autour d'un soleil. Toucher le soleil ou sortir de l'arène (le vide) élimine.
- Chaque tour, chacun pose en secret un **puits** (attire) ou un **répulseur** (repousse), ou passe. Pendant la planification, des pointillés montrent la trajectoire prévue de chaque vaisseau avec sa propre pose ; celles des autres restent cachées jusqu'à la résolution.
- Puis 3 secondes de physique : tous les puits agissent sur tous les vaisseaux. Un puits dure trois tours en faiblissant. Les vaisseaux rebondissent entre eux (chocs élastiques), d'où les réactions en chaîne.
- Points : éclat ramassé +1, élimination provoquée +2 (attribuée au joueur qui a le plus poussé la victime pendant le tour, ricochets compris), encore en vol à la fin de la manche +3. Un joueur éliminé continue de poser des puits.
- 3 manches de 8 tours au plus ; une manche s'arrête quand il ne reste qu'un vaisseau.
- La simulation (`shared/games/puits.ts`) n'utilise que +, −, ×, ÷ et la racine carrée : elle donne le même résultat partout. Le serveur n'envoie que l'état de départ et les poses, chaque client rejoue le tour lui-même.

`PUITS_PLAN_SECONDS=12 npm start` raccourcit la planification, pratique pour tester.

## Cartographes

Coopératif asymétrique, tour par tour, de 3 à 6 joueurs.

- Une carte est tirée au hasard (eau, plaine, forêt, montagne, villages) et découpée en zones de 4 × 4 cases. Chaque joueur voit une zone, mais c'est le joueur suivant qui la peint sur la carte commune : il faut la lui décrire. À 3 ou 5 joueurs, une zone de plus est déjà dessinée et sert de repère.
- On ne communique qu'avec des pictogrammes : terrains, directions, nombres, formes (case, ligne, colonne, coin, bord, centre, toute la zone) et réponses. Réponses et directions reprennent les icônes Golpex ; les autres sont dessinés au même trait.
- Chaque tour, en même temps : un message de 4 pictogrammes au plus et 4 cases peintes au plus. Messages et peinture apparaissent ensemble à la fin du tour.
- Le carnet de celui qui voit une zone marque ce que la carte commune en a juste ou faux : à lui de le faire comprendre.
- 7 tours (75 s chacun), ou moins si tout le monde déclare la carte terminée. On compare alors la carte dressée au vrai territoire.
- Le terrain des autres zones ne quitte jamais le serveur avant la fin de la partie.

`CARTO_TURN_SECONDS=20 npm start` raccourcit les tours, pratique pour tester.

## Échos

Temps réel, de 2 à 6 joueurs, en coopération ou en versus, vue de dessus.

- Chaque manche dure 30 secondes. À la suivante, tout le monde repart du départ, et ce que chacun a joué revient en **écho** : un fantôme qui refait exactement les mêmes gestes (la même direction à chaque pas), à côté de son auteur. Les pointillés montrent le parcours qu'il rejoue. Un écho rejoue des gestes, pas des positions : si une porte se ferme devant lui, il se cogne.
- **Coopération** : 5 salles. Il faut couvrir toutes les plaques dorées au même instant, et il y en a deux par joueur, donc au moins deux manches. Une porte s'ouvre tant qu'un corps (vivant ou écho) tient la plaque de sa couleur. Au-delà de 4 manches, c'est le paradoxe : les échos s'effacent et on reprend la salle. L'hôte peut aussi effacer les échos lui-même. Trois étoiles en deux manches, deux en trois, une au-delà.
- **Versus** : 4 manches dans l'arène. Chaque instant où seuls tes corps sont sur une plaque te rapporte des points. Les corps de joueurs différents se bousculent, échos compris.
- Réseau : le serveur fait autorité et simule tout 20 fois par seconde, échos compris. Les clients n'envoient que leur direction quand elle change, et reçoivent les positions à chaque pas. Chaque client prédit son propre corps avec les mêmes fonctions de déplacement (`shared/games/echos.ts`) et se recale en douceur sur le serveur.

`ECHOS_ROUND_TICKS=200 npm start` raccourcit les manches à 10 s ; `ECHOS_AUTOCLEAR=40` franchit chaque salle au bout de 2 s, pour tester l'enchaînement des salles.

## Zéro

Le Skyjo des polynômes, de 2 à 8 joueurs, tour par tour. Au degré 0, c'est exactement le Skyjo.

- Les cartes sont des polynômes à coefficients entiers, de degré au plus 0, 1, 2 ou 3 (au choix de l'hôte). En x = 1, le paquet suit exactement la répartition du Skyjo (cinq −2, dix −1, quinze 0, dix de chaque valeur de 1 à 12) ; mais chaque valeur est partagée entre plusieurs polynômes tirés au hasard à chaque partie, aux coefficients de signes mêlés (−2x² + 5x + 8, 3x² − 4x + 5…). Les coefficients dominants sont symétriques, si bien qu'en moyenne une carte vaut sa valeur Skyjo quel que soit x. Au degré 0, c'est le paquet du Skyjo.
- Comme au Skyjo : chacun révèle deux cartes ; à son tour, on pioche au paquet ou à la défausse, puis on échange avec une carte de sa grille, ou (carte du paquet seulement) on la défausse et on retourne une carte cachée.
- **Score** : à la fin de la manche, x sort d'un sac contenant −1, 0 et 1, et chaque carte vaut P(x). Le sac ne se remplit qu'une fois vide : chaque valeur sort une fois toutes les trois manches, dans un ordre au hasard, et le panneau de droite montre ce qu'il reste dedans. En x = 1, chaque carte vaut sa valeur Skyjo ; en x = 0, seule sa constante compte ; en x = −1, les termes de degré impair changent de signe. Chaque carte affiche sa valeur en x = 1 et ses trois valeurs possibles ; son fond va de la couleur de sa plus grande valeur (coin haut droit) à celle de sa plus petite (coin bas gauche), si bien qu'une carte unie vaut la même chose quel que soit x ; le panneau de droite donne ce que vaut sa grille pour chaque tirage.
- **Colonnes** : une colonne entièrement révélée s'efface quand ses cartes ont le même terme dominant (3x² + 1, 3x² − x, 3x²). Au degré 0, ce sont des cartes identiques.
- Quand quelqu'un a tout révélé, chacun rejoue une fois ; celui qui a clos la manche double son score s'il n'est pas strictement le plus bas. La partie s'arrête à 50, 100 ou 150 points ; le plus bas gagne.
- Grilles au choix : 2 × 3, 3 × 3, 3 × 4 (classique), 3 × 5, 4 × 4, 4 × 5. La table tient sur un seul écran : la taille des cartes se calcule d'après la fenêtre, la grille et le nombre de joueurs.
- Les cartes cachées ne quittent jamais le serveur ; un joueur absent joue tout seul.

## Tapis

Un Texas hold'em sans limite entre amis, de 2 à 8 joueurs, avec des jetons pour rire et trois petites entorses que l'hôte peut désactiver une à une. Sans elles, c'est un hold'em classique. Les cartes, la table et les jetons suivent le style des autres jeux (cadres guillochés, accents Golpex, thème clair ou sombre).

- **Le fond** : 2 000 jetons chacun, blindes 10/20 qui montent toutes les 10, 6 ou 4 donnes selon la vitesse choisie. Deux cartes cachées, flop, tournant, rivière ; on se couche, parle, suit, mise, relance (au moins du montant de la dernière relance) ou fait tapis. Une relance incomplète à tapis ne rouvre pas les enchères à qui a déjà parlé. Pots annexes, partage des pots à égalité (les jetons en trop vont aux premiers à gauche du bouton), mise non suivie rendue. À deux, le bouton est petite blinde.
- **La folle** : avant la distribution, une carte est retournée au milieu. Sa jumelle (même hauteur, même couleur, l'autre enseigne : le 7♥ désigne le 7♦) est la seule carte folle de la donne : elle remplace n'importe quelle carte, même une carte déjà présente. « Cinq d'une sorte » reste possible (un carré et la folle), au-dessus de la quinte flush.
- **L'échange** : une fois par donne, au flop seulement et quand c'est à lui de parler, un joueur paie deux grosses blindes (argent mort, au pot principal) pour remplacer une de ses deux cartes par celle du dessus du paquet. La carte rendue est montrée à toute la table.
- **La prime** : chaque donne tire un défi parmi sept, tous assez rares (gagner avec 7-2, avec deux figures, l'abattage avec une paire ou moins, avec un brelan pile, avec une couleur ou mieux, avec la folle en main, après un échange). Qui remporte le pot principal en le relevant touche une petite blinde de chacun des autres joueurs encore en lice.
- Fin de partie : au dernier en lice, ou après 15 ou 30 donnes (le plus gros tapis gagne). Les éliminés regardent la suite.
- 40 secondes de parole ; ensuite, ou si le joueur est absent, il parle s'il le peut, sinon il se couche. Les cartes cachées ne quittent jamais le serveur : elles ne sont montrées qu'à l'abattage, quand tout le monde est à tapis, ou si leur propriétaire décide de les montrer après la donne.
- La table s'adapte : le tapis ovale et les places se calculent d'après la fenêtre, de 2 à 8 joueurs, sur ordinateur comme au téléphone.

## Sébastopol (`/station`)

Hors jeu et hors salon : une station orbitale rétro-futuriste à explorer seul en vue subjective, hommage libre à l'esthétique d'*Alien: Isolation* (aucune ressource ni marque du jeu : tout est généré par le code). Three.js, page séparée (`client/station.html`).

- **Spatioport** : sas d'amarrage (départ), hall des arrivées et sa baie sur la géante gazeuse, poste de sécurité, quai A.
- **Navette** : ligne A à travers un tunnel de 280 m, appelée et lancée depuis les bornes (`E`).
- **Habitation** : quai B, atrium sur trois niveaux (escaliers, balcons, ascenseur vitré), centre médical, coursive et logements, salon panorama.
- Souris pour regarder, ZQSD/WASD (lus par position de touche, donc corrects en AZERTY comme en QWERTY), Maj pour courir, `E` pour utiliser, `M` pour le plan, chiffres pour choisir un niveau dans l'ascenseur.
- `?spot=atrium` (ou `hall`, `salon`, `medical`, `logement`, `navette`…) démarre ailleurs ; `?q=basse` réduit la qualité.

| Fichier | Rôle |
| --- | --- |
| `client/src/station/world.ts` | Plan de la station : salles, couloirs, mobilier, zones nommées, points de départ |
| `client/src/station/kit.ts` | Kit de construction : salles percées, couloirs chanfreinés à nervures, escaliers, garde-corps ; fusion de la géométrie par matériau, collisions et sols |
| `client/src/station/dynamic.ts` | Portes automatiques, ascenseur, navette, écrans cathodiques animés |
| `client/src/station/props.ts` | Mobilier : bancs, consoles, lits, couchettes, casiers, bar… |
| `client/src/station/textures.ts` | Textures dessinées dans des canvas (panneaux rivetés, caillebotis, enseignes, écrans) |
| `client/src/station/lights.ts` | Réserve de 12 lumières réattribuées aux lampes les plus proches |
| `client/src/station/sky.ts`, `post.ts`, `audio.ts`, `player.ts` | Ciel et planète, rendu rétro, ambiance sonore synthétisée, déplacement et collisions |

## Développer

```bash
npm install
npm run dev        # serveur WebSocket sur :3001 + client Vite sur http://localhost:5173
npm test           # tests de la logique de jeu
npm run typecheck
```

`TOPO_ROUND_SECONDS=20 npm start` raccourcit les manches de Topologie, pratique pour tester.

Pour tester seul, ouvre trois onglets ou fenêtres de navigation privée. Chaque onglet garde sa place grâce au `localStorage`, donc les fenêtres privées séparées sont le plus simple.

## Structure

La plateforme (salons, codes, reconnexion, thème, sons, salle de jeux) ne sait rien des règles. Chaque jeu se branche dessus.

| Dossier | Rôle |
| --- | --- |
| `shared/platform.ts` | Messages communs : créer, rejoindre, reprendre, quitter, et `action` (propre au jeu) |
| `shared/catalog.ts` | Les jeux affichés dans la salle, jouables ou à venir |
| `shared/games/rumeurs.ts` | Types, règles et actions de Rumeurs |
| `shared/games/topologie.ts` | Surfaces et recollements, règles, messages de Topologie |
| `shared/games/puzzle.ts` | Formats et grilles, découpe des pièces, règle de pose et blocs, messages du Puzzle |
| `shared/games/puits.ts` | Simulation déterministe, règles et messages de Puits |
| `shared/games/cartographes.ts` | Génération de la carte, zones, pictogrammes, règles et messages de Cartographes |
| `shared/games/echos.ts` | Salles, déplacements et collisions, plaques et portes, règles et messages d'Échos |
| `shared/games/zero.ts` | Polynômes (évaluation, terme dominant, écriture), paquet, colonnes et score de Zéro |
| `shared/games/tapis.ts` | Cartes, évaluation des mains (folles comprises) et leurs noms, primes, blindes, messages de Tapis |
| `server/index.ts` | HTTP (dont les balises d'aperçu de lien par page), API `/api/rooms/:code`, WebSocket `/ws`, salons et reconnexion |
| `server/platform.ts` | Le contrat `GameRoom` qu'un jeu implémente côté serveur |
| `server/games/registry.ts` | Les jeux disponibles côté serveur |
| `server/games/rumeurs/` | Logique de Rumeurs et ses tests |
| `server/games/topologie/` | Simulation de Topologie et ses tests |
| `server/games/puzzle/` | Table du Puzzle (verrous, blocs, pose) et ses tests |
| `server/games/puits/` | Tours de Puits (poses secrètes, résolution, scores) et ses tests |
| `server/games/cartographes/` | Tours de Cartographes (information cachée, carte commune) et ses tests |
| `server/games/echos/` | Simulation d'Échos (enregistrement, échos, paradoxe, versus) et ses tests |
| `server/games/zero/` | Tours de Zéro (pioche, colonnes, dernier tour, doublement) et ses tests |
| `server/games/tapis/` | Donnes de Tapis (enchères, pots annexes, échange, prime, éliminations) et ses tests |
| `client/src/main.tsx` | Coquille : connexion, routes, salon en cours |
| `client/src/hub/` | La salle de jeux et les couvertures des jeux à venir |
| `client/src/games/registry.ts` | Les jeux disponibles côté client |
| `client/src/games/rumeurs/` | Page, couverture, écrans, cartes et sons de Rumeurs |
| `client/src/games/topologie/` | Page, couverture, arène en canvas, schémas de surfaces |
| `client/src/games/puzzle/` | Page, couverture, dessins SVG, table de jeu en glisser-déposer |
| `client/src/games/puits/` | Page, couverture, arène en canvas, aperçu des trajectoires, relecture des tours |
| `client/src/games/cartographes/` | Page, couverture, pictogrammes, carte en SVG, carnet, journal |
| `client/src/games/echos/` | Page, couverture, salle en canvas, prédiction, manette tactile |
| `client/src/games/zero/` | Page, couverture, cartes polynômes, table, décompte |
| `client/src/games/tapis/` | Page, couverture, cartes à jouer et jetons, table ovale, paroles, classement |
| `client/src/ui/` | En-tête, salle d'attente et formulaire d'entrée communs, icônes, guillochis |
| `client/src/sound/` | Moteur sonore et sons d'interface communs |
| `client/src/tokens.css` | Tokens Golpex (couleurs, typo, espacements, rayons) |

## Ajouter un jeu

1. **Partagé** : ajouter son identifiant à `GameId` (`shared/platform.ts`), ses types et actions dans `shared/games/<jeu>.ts`, et passer son entrée de `shared/catalog.ts` en `status: "jouable"`.
2. **Serveur** : écrire une classe qui implémente `GameRoom` (`server/platform.ts`) dans `server/games/<jeu>/`, puis l'enregistrer dans `server/games/registry.ts`. La méthode `handle` reçoit les actions des joueurs, `view` renvoie ce que chaque joueur a le droit de voir. Le `RoomHost` reçu à la création sert à prévenir d'un changement (`changed`, chaque joueur reçoit sa vue) ou à diffuser un événement léger (`emit`, pour le temps réel).
3. **Client** : fournir `Home`, `Cover` et `Room` (`client/src/games/types.ts`) dans `client/src/games/<jeu>/`, puis les enregistrer dans `client/src/games/registry.ts`. `RoomLobby` et `EntryPanel` (`client/src/ui/`) donnent la salle d'attente et le formulaire d'entrée ; `subscribe` reçoit les événements diffusés par `emit`.

La salle, les routes `/<jeu>` et `/r/CODE`, la reconnexion, le thème et les sons d'interface fonctionnent alors sans autre code.

## Déployer sur Render

Le dépôt contient un `render.yaml`.

1. Sur Render : **New → Blueprint**, puis choisis ce dépôt GitHub. Render lit `render.yaml` et crée le service web `rumeurs`.
2. Sinon, crée un **Web Service** à la main avec :
   - Build : `npm ci --include=dev && npm run build`
   - Start : `npm start`
   - Health check : `/healthz`
3. Partage l'URL `https://<ton-service>.onrender.com`. Les invitations ont la forme `/r/CODE`.

Avec l'offre gratuite, le service s'endort après 15 minutes sans visite et le premier chargement prend alors environ une minute. Les salons sont gardés en mémoire : un redéploiement ou une mise en veille les efface.

## Sound design

Les sons sont synthétisés en direct avec Web Audio, sans fichier audio. `client/src/sound/engine.ts` est un portage du moteur de [soundboard-design](https://github.com/Golto/soundboard-design) (voies chirp et bruit, passe-bas relatif à la note, compresseur et limiteur de bus) :

- `palette-goutte.json` : l'export de la palette (Fa4 +43 ¢, gamme majeure, matière « Goutte ») ;
- `note-extras.json` : frappe, brillance et attaque de chaque note, reprises du catalogue car absentes de l'export ;
- `GAME_TUNING` adoucit la palette pour le jeu : une quarte plus bas, moins de grain et de brillance, niveau réduit ;
- deux jetons propres au jeu jouent sur une matière « carton » (le papier de soundboard-design, assombri) : `card.hover` au survol d'une carte et `card.flip` quand une carte se retourne.

`play("feedback.success")` joue un jeton et `client/src/sound/wiring.ts` les relie à l'interface :

- chaque bouton joue son attribut `data-sound` (par défaut `button.primary` ou `button.tap`, `none` pour le rendre muet) ;
- la saisie joue `input.key` / `input.delete`, le survol d'une carte `card.hover` ;
- les événements de partie : arrivée d'un joueur, lancement, ouverture et clôture du marché, révélation, tampons Confirmé/Démenti, compte à rebours, dévoilement final, perte de connexion.

La cloche dans l'en-tête coupe les sons (préférence gardée dans le navigateur).

## Écarts par rapport à Golpex

- `danger-strong` et `success-strong` ont été ajoutés sur le modèle de `warning-strong`, pour que les valeurs positives et négatives atteignent 4.5:1 sur les surfaces claires.
- Le titre d'accueil dépasse l'échelle `heading-1` (taille d'affiche).
- Le logo reste en couleur (`golpex.svg`) dans les deux thèmes.
