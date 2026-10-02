// Plateforme : salons privés, codes et messages communs à tous les jeux.

export type GameId = "rumeurs";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;
export const NAME_MAX = 16;

export type ClientMessage =
  | { t: "create"; game: GameId; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "resume"; code: string; playerId: string; token: string }
  | { t: "leave" }
  /** Action propre au jeu du salon, interprétée par lui seul. */
  | { t: "action"; action: unknown };

export type ServerMessage =
  | { t: "joined"; code: string; game: GameId; playerId: string; token: string }
  | { t: "state"; game: GameId; state: unknown }
  | { t: "error"; message: string; fatal?: boolean };

/** Réponse de GET /api/rooms/:code, pour savoir à quel jeu mène un lien d'invitation. */
export interface RoomInfo {
  code: string;
  game: GameId;
  players: number;
  joinable: boolean;
}
