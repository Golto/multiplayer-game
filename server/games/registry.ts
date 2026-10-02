// Les jeux disponibles côté serveur. Ajouter un jeu : l'importer ici.

import type { GameId } from "../../shared/platform.js";
import type { GameDefinition } from "../platform.js";
import { Game as Rumeurs } from "./rumeurs/game.js";

export const GAMES: Record<GameId, GameDefinition> = {
  rumeurs: { id: "rumeurs", create: (code, onChange) => new Rumeurs(code, onChange) },
};

export function gameDefinition(id: unknown): GameDefinition | undefined {
  return typeof id === "string" && Object.hasOwn(GAMES, id) ? GAMES[id as GameId] : undefined;
}
