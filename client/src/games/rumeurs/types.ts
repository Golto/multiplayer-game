import type { RumeursAction } from "../../../../shared/games/rumeurs";

/** Envoie une action de Rumeurs au serveur. */
export type Send = (action: RumeursAction) => void;
