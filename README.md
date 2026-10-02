# Salle de jeux

Une salle de jeux de société multijoueur dans le navigateur. On choisit un jeu, on ouvre un salon privé et on partage son code (ou le lien `/r/CODE`). Le design suit le système **Golpex**.

| Adresse | Page |
| --- | --- |
| `/` | La salle : tous les jeux, et un raccourci pour rejoindre un salon par son code |
| `/rumeurs` | La page d'un jeu : ouvrir ou rejoindre un salon |
| `/r/CODE` | Un salon : lien d'invitation, puis la partie elle-même |

Jeu disponible : **Rumeurs**. Cartographes, Puits et Topologie apparaissent comme « Bientôt » (`shared/catalog.ts`).

## Rumeurs

- Quatre marchandises : Safran, Cuivre, Cacao, Indigo. La vraie valeur de chacune vaut **20 écus + la somme de ses cartes**.
- Chaque joueur voit une carte de chaque marchandise. Une carte supplémentaire reste scellée et personne ne la voit.
- Une partie se joue en **4 séances**, chacune en trois temps :
  1. **Rumeurs** : chacun publie une affirmation signée, vraie ou fausse (sur sa carte, sur le cours final, en texte libre, ou il se tait).
  2. **Marché** : tout le monde passe ses ordres en même temps, ±3 lots par marchandise. Le prix bouge avec la demande nette.
  3. **Clôture** : les échanges de chacun sont rendus publics, puis la carte d'un joueur est retournée. Les rumeurs vérifiables sont tamponnées « Confirmé » ou « Démenti ».
- À la fin, toutes les cartes sont dévoilées. Le score est la caisse plus les lots au vrai cours. Des distinctions sont attribuées : Langue de vipère, Parole d'or, Flair de fouine…

## Développer

```bash
npm install
npm run dev        # serveur WebSocket sur :3001 + client Vite sur http://localhost:5173
npm test           # tests de la logique de jeu
npm run typecheck
```

Pour tester seul, ouvre trois onglets ou fenêtres de navigation privée. Chaque onglet garde sa place grâce au `localStorage`, donc les fenêtres privées séparées sont le plus simple.

## Structure

La plateforme (salons, codes, reconnexion, thème, sons, salle de jeux) ne sait rien des règles. Chaque jeu se branche dessus.

| Dossier | Rôle |
| --- | --- |
| `shared/platform.ts` | Messages communs : créer, rejoindre, reprendre, quitter, et `action` (propre au jeu) |
| `shared/catalog.ts` | Les jeux affichés dans la salle, jouables ou à venir |
| `shared/games/rumeurs.ts` | Types, règles et actions de Rumeurs |
| `server/index.ts` | HTTP, API `/api/rooms/:code`, WebSocket `/ws`, salons et reconnexion |
| `server/platform.ts` | Le contrat `GameRoom` qu'un jeu implémente côté serveur |
| `server/games/registry.ts` | Les jeux disponibles côté serveur |
| `server/games/rumeurs/` | Logique de Rumeurs et ses tests |
| `client/src/main.tsx` | Coquille : connexion, routes, salon en cours |
| `client/src/hub/` | La salle de jeux et les couvertures des jeux à venir |
| `client/src/games/registry.ts` | Les jeux disponibles côté client |
| `client/src/games/rumeurs/` | Page, couverture, écrans, cartes et sons de Rumeurs |
| `client/src/ui/` | En-tête, icônes, guillochis, pseudo mémorisé |
| `client/src/sound/` | Moteur sonore et sons d'interface communs |
| `client/src/tokens.css` | Tokens Golpex (couleurs, typo, espacements, rayons) |

## Ajouter un jeu

1. **Partagé** : ajouter son identifiant à `GameId` (`shared/platform.ts`), ses types et actions dans `shared/games/<jeu>.ts`, et passer son entrée de `shared/catalog.ts` en `status: "jouable"`.
2. **Serveur** : écrire une classe qui implémente `GameRoom` (`server/platform.ts`) dans `server/games/<jeu>/`, puis l'enregistrer dans `server/games/registry.ts`. La méthode `handle` reçoit les actions des joueurs, `view` renvoie ce que chaque joueur a le droit de voir.
3. **Client** : fournir `Home`, `Cover` et `Room` (`client/src/games/types.ts`) dans `client/src/games/<jeu>/`, puis les enregistrer dans `client/src/games/registry.ts`.

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
