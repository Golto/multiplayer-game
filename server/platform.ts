// Contrat entre la plateforme (salons, sockets, reconnexion) et un jeu.

import type { GameId } from "../shared/platform.js";

/** Erreur destinée au joueur : son message est affiché tel quel. */
export class GameError extends Error {}

export interface Seat {
  id: string;
  token: string;
}

/** Une partie en cours dans un salon. La plateforme ne connaît rien d'autre du jeu. */
export interface GameRoom {
  readonly code: string;
  /** Faux une fois la partie lancée : les nouveaux venus sont refusés. */
  readonly joinable: boolean;
  readonly playerCount: number;
  addPlayer(name: string): Seat;
  resume(playerId: string, token: string): Seat;
  setConnected(playerId: string, connected: boolean): void;
  leave(playerId: string): void;
  /** Action propre au jeu, envoyée par un joueur. Lève GameError si elle est refusée. */
  handle(playerId: string, action: unknown): void;
  /** État vu par un joueur : chaque jeu cache ce que ce joueur ne doit pas voir. */
  view(playerId: string): unknown;
  dispose(): void;
}

/** Ce que la plateforme offre à un jeu pour parler à ses joueurs. */
export interface RoomHost {
  /** L'état a changé : chaque joueur reçoit sa vue complète (`view`). */
  changed(): void;
  /** Événement léger diffusé tel quel à tous les joueurs du salon. */
  emit(event: unknown): void;
}

export interface GameDefinition {
  id: GameId;
  create(code: string, host: RoomHost): GameRoom;
}
