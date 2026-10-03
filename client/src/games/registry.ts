// Les jeux disponibles côté client. Ajouter un jeu : l'importer ici et dans shared/catalog.ts.

import type { GameId } from "../../../shared/platform";
import { rumeurs } from "./rumeurs";
import { topologie } from "./topologie";
import { puzzle } from "./puzzle";
import { puits } from "./puits";
import { cartographes } from "./cartographes";
import { echos } from "./echos";
import { zero } from "./zero";
import type { GameClient } from "./types";

export const GAME_CLIENTS: Record<GameId, GameClient> = { rumeurs, topologie, puzzle, puits, cartographes, echos, zero };
