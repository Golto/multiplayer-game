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
      "Trace des boucles pour agrandir ton territoire sur un tore, un ruban de Möbius, une bouteille de Klein, un plan projectif, un cylindre ou une sphère. Les bords se recollent, parfois en miroir : sers-t'en pour piéger les autres.",
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
      "Choisis un dessin, un format (paysage, panorama, portrait, carré) et de 12 à 432 pièces, puis assemblez-le ensemble par glisser-déposer. Les pièces s'emboîtent aussi hors du plateau, et on peut jouer seul.",
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
    status: "jouable",
    id: "cartographes",
    name: "Cartographes",
    tagline: "Reconstituer la carte à l'aveugle",
    pitch:
      "Chacun ne voit que son morceau d'une carte tirée au hasard. Pour la reconstituer ensemble avant la fin du chrono, vous n'avez que des pictogrammes. Les malentendus font tout le sel du jeu.",
    players: "3 à 6",
    duration: "15 min",
    tags: ["Coopératif", "Asymétrique", "Communication"],
  },
  {
    status: "jouable",
    id: "echos",
    name: "Échos",
    tagline: "Jouer avec ses anciens soi",
    pitch:
      "Chaque manche dure 30 secondes. À la suivante, tout ce que vous avez joué revient en fantômes à côté de vous : coopérez avec vos anciens vous pour couvrir toutes les plaques, ou laissez vos échos gêner ceux des autres.",
    players: "2 à 6",
    duration: "15 min",
    tags: ["Temps réel", "Coopératif ou versus", "Boucles temporelles"],
  },
  {
    status: "jouable",
    id: "zero",
    name: "Zéro",
    tagline: "Le Skyjo des polynômes",
    pitch:
      "Comme au Skyjo, mais les cartes sont des polynômes. À la fin de la manche, x sort d'un sac contenant −1, 0 et 1, et chaque carte vaut P(x). Une colonne s'efface quand ses cartes ont le même terme dominant. Grille et degré au choix.",
    players: "2 à 8",
    duration: "20 min",
    tags: ["Cartes", "Mathématiques", "Tour par tour"],
  },
];

export function playableGame(id: GameId): PlayableGame | undefined {
  return CATALOG.find((g): g is PlayableGame => g.status === "jouable" && g.id === id);
}

export interface PageMeta {
  title: string;
  description: string;
  /** Image d'aperçu (chemin servi par le client), si le jeu en a une. */
  image: string;
}

const SITE = "La salle de jeux";
const SITE_LINE = "Des jeux de société à jouer à plusieurs dans le navigateur, en salon privé. Pas de compte, rien à installer.";

/** Titre, description et image d'une page : la salle, un jeu, ou l'invitation dans un salon. */
export function pageMeta(game?: GameId | null, code?: string | null): PageMeta {
  const entry = game ? playableGame(game) : undefined;
  if (!entry) return { title: SITE, description: SITE_LINE, image: "/og/salle.png" };
  const image = `/og/${entry.id}.png`;
  if (code) {
    return {
      title: `${entry.name} · salon ${code}`,
      description: `Une partie de ${entry.name} t'attend (${entry.players} joueurs). ${entry.pitch}`,
      image,
    };
  }
  return { title: `${entry.name} · ${SITE}`, description: `${entry.tagline}. ${entry.pitch}`, image };
}
