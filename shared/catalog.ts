// Catalogue des jeux affichés dans la salle de jeux.

import type { GameId } from "./platform";

export interface PlayableGame {
  status: "jouable";
  id: GameId;
  name: string;
  tagline: string;
  pitch: string;
  players: string;
  duration: string;
  tags: string[];
}

export interface UpcomingGame {
  status: "bientot";
  name: string;
  tagline: string;
  players: string;
  tags: string[];
}

export type CatalogEntry = PlayableGame | UpcomingGame;

export const CATALOG: readonly CatalogEntry[] = [
  {
    status: "jouable",
    id: "rumeurs",
    name: "Rumeurs",
    tagline: "Bluff boursier au comptoir",
    pitch:
      "Chacun voit une carte de chaque marchandise. Lancez des rumeurs, vraies ou fausses, passez vos ordres en même temps, et voyez qui ment quand les cartes se retournent.",
    players: "3 à 8",
    duration: "15 min",
    tags: ["Bluff", "Déduction", "Tours simultanés"],
  },
  {
    status: "bientot",
    name: "Cartographes",
    tagline: "Reconstituer la carte à l'aveugle",
    players: "3 à 6",
    tags: ["Coopératif", "Communication"],
  },
  {
    status: "bientot",
    name: "Puits",
    tagline: "Gravité partagée, trajectoires croisées",
    players: "2 à 6",
    tags: ["Tactique", "Physique"],
  },
  {
    status: "bientot",
    name: "Topologie",
    tagline: "Conquête sur une bouteille de Klein",
    players: "2 à 8",
    tags: ["Temps réel", "Territoire"],
  },
];

export function playableGame(id: GameId): PlayableGame | undefined {
  return CATALOG.find((g): g is PlayableGame => g.status === "jouable" && g.id === id);
}
