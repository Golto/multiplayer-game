// Les jeux disponibles côté client. Ajouter un jeu : l'importer ici et dans shared/catalog.ts.

import type { GameId } from "../../../shared/platform";
import { rumeurs } from "./rumeurs";
import { topologie } from "./topologie";
import type { GameClient } from "./types";

export const GAME_CLIENTS: Record<GameId, GameClient> = { rumeurs, topologie };
