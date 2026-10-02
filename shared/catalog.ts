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
    status: "jouable",
    id: "topologie",
    name: "Topologie",
    tagline: "Conquête sur des surfaces recollées",
    pitch:
      "Trace des boucles pour agrandir ton territoire sur un tore, un ruban de Möbius, une bouteille de Klein ou un plan projectif. Les bords se recollent, parfois en miroir : sers-t'en pour piéger les autres.",
    players: "2 à 8",
    duration: "8 min",
    tags: ["Temps réel", "Territoire", "Mathématiques"],
  },
  {
    status: "jouable",
    id: "puzzle",
    name: "Puzzle",
    tagline: "À plusieurs mains, en direct",
    pitch:
      "Choisis un dessin et un nombre de pièces, de 12 à 192, puis assemblez-le ensemble par glisser-déposer. On voit les pièces que les autres déplacent, et on peut aussi jouer seul.",
    players: "1 à 8",
    duration: "5 à 60 min",
    tags: ["Coopératif", "Détente", "Solo possible"],
  },
  {
    status: "jouable",
    id: "puits",
    name: "Puits",
    tagline: "Gravité partagée, trajectoires croisées",
    pitch:
      "Tu ne pilotes pas ton vaisseau : tu poses des puits de gravité. Tout le monde planifie en même temps, puis la physique se joue, et les puits de chacun dévient tous les vaisseaux.",
    players: "2 à 6",
    duration: "10 min",
    tags: ["Tours simultanés", "Physique", "Versus"],
  },
  {
    status: "bientot",
    name: "Cartographes",
    tagline: "Reconstituer la carte à l'aveugle",
    players: "3 à 6",
    tags: ["Coopératif", "Communication"],
  },
];

export function playableGame(id: GameId): PlayableGame | undefined {
  return CATALOG.find((g): g is PlayableGame => g.status === "jouable" && g.id === id);
}
