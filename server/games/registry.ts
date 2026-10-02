// Les jeux disponibles côté serveur. Ajouter un jeu : l'importer ici.

import type { GameId } from "../../shared/platform.js";
import type { GameDefinition } from "../platform.js";
import { Game as Rumeurs } from "./rumeurs/game.js";
import { TopoGame } from "./topologie/game.js";
import { PuzzleGame } from "./puzzle/game.js";
import { PuitsGame } from "./puits/game.js";
import { CartoGame } from "./cartographes/game.js";
import { EchoGame } from "./echos/game.js";

export const GAMES: Record<GameId, GameDefinition> = {
  rumeurs: { id: "rumeurs", create: (code, host) => new Rumeurs(code, () => host.changed()) },
  topologie: { id: "topologie", create: (code, host) => new TopoGame(code, host) },
  puzzle: { id: "puzzle", create: (code, host) => new PuzzleGame(code, host) },
  puits: { id: "puits", create: (code, host) => new PuitsGame(code, host) },
  cartographes: { id: "cartographes", create: (code, host) => new CartoGame(code, host) },
  echos: { id: "echos", create: (code, host) => new EchoGame(code, host) },
};

export function gameDefinition(id: unknown): GameDefinition | undefined {
  return typeof id === "string" && Object.hasOwn(GAMES, id) ? GAMES[id as GameId] : undefined;
}
