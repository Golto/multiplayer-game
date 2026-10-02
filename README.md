# Rumeurs

Jeu de bluff boursier multijoueur dans le navigateur, de 3 à 8 joueurs, avec des salons privés rejoints par code. Le design suit le système **Golpex**.

## Le principe

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

| Dossier | Rôle |
| --- | --- |
| `shared/protocol.ts` | Types, règles et messages partagés entre client et serveur |
| `server/game.ts` | Logique de partie, autoritaire et indépendante du réseau |
| `server/index.ts` | HTTP (fichiers du client) + WebSocket `/ws`, salons, codes, reconnexion |
| `client/src/art.tsx` | Cartes, guillochis (hypotrochoïdes), illustrations SVG |
| `client/src/screens/` | Accueil, salon, jeu, clôture, dévoilement final |
| `client/src/tokens.css` | Tokens Golpex (couleurs, typo, espacements, rayons) |

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
