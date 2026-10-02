// Puzzle coopératif : tout le salon assemble le même puzzle. Une pièce tenue par un joueur est
// verrouillée pour les autres ; lâchée assez près de sa case, elle s'y aimante et n'en bouge plus.

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  ARTS,
  BOARD_X,
  BOARD_Y,
  PIECE_COUNTS,
  PUZZLE_H,
  PUZZLE_W,
  RULES,
  TABLE_H,
  TABLE_W,
  grid,
  home,
  type Phase,
  type PieceCount,
  type PieceState,
  type PuzzleAction,
  type PuzzleConfig,
  type PuzzleEvent,
  type PuzzleView,
} from "../../../shared/games/puzzle.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  placed: number;
}

export class PuzzleGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  config: PuzzleConfig = { art: "sommets", count: 48 };
  seed = 1;
  pieces: PieceState[] = [];
  startedAt: number | null = null;
  finishedAt: number | null = null;

  constructor(
    code: string,
    private readonly host: RoomHost,
    private readonly rng: () => number = Math.random,
  ) {
    this.code = code;
  }

  get joinable(): boolean {
    // On peut rejoindre un puzzle en cours : plus on est de mains, mieux c'est.
    return this.players.length < RULES.maxPlayers && this.phase !== "done";
  }

  get playerCount(): number {
    return this.players.length;
  }

  addPlayer(rawName: string): Player {
    if (this.players.length >= RULES.maxPlayers) throw new GameError("Le salon est complet.");
    const name = String(rawName ?? "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, NAME_MAX);
    if (!name) throw new GameError("Choisis un pseudo.");
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError("Ce pseudo est déjà pris dans ce salon.");
    }
    const used = new Set(this.players.map((p) => p.slot));
    const usedAccents = new Set(this.players.map((p) => p.accent));
    const player: Player = {
      id: randomBytes(10).toString("base64url").slice(0, 10),
      token: randomBytes(24).toString("base64url").slice(0, 24),
      name,
      accent: PLAYER_ACCENTS.find((a) => !usedAccents.has(a)) ?? PLAYER_ACCENTS[0],
      slot: [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s))!,
      connected: true,
      placed: 0,
    };
    this.players.push(player);
    this.hostId ??= player.id;
    this.host.changed();
    return player;
  }

  resume(playerId: string, token: string): Player {
    const p = this.players.find((x) => x.id === playerId && x.token === token);
    if (!p) throw new GameError("Impossible de reprendre ta place dans ce salon.");
    p.connected = true;
    this.host.changed();
    return p;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      this.releaseAll(p.slot);
      if (this.hostId === playerId) {
        const next = this.players.find((x) => x.connected && x.id !== playerId);
        if (next) this.hostId = next.id;
      }
    }
    this.host.changed();
  }

  leave(playerId: string): void {
    const p = this.players.find((x) => x.id === playerId);
    if (p) this.releaseAll(p.slot);
    this.players = this.players.filter((x) => x.id !== playerId);
    if (this.hostId === playerId) this.hostId = this.players.find((x) => x.connected)?.id ?? this.players[0]?.id ?? null;
    this.host.changed();
  }

  dispose(): void {}

  handle(playerId: string, action: unknown): void {
    const a = action as PuzzleAction;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "configure":
        return this.configure(playerId, a.config);
      case "start":
        return this.start(playerId);
      case "grab":
        return this.grab(p, a.id);
      case "move":
        return this.move(p, a.id, a.x, a.y);
      case "drop":
        return this.drop(p, a.id, a.x, a.y);
      case "again":
        return this.again(playerId);
      default:
        throw new GameError("Action inconnue.");
    }
  }

  // ------------------------------------------------------------ préparation

  configure(by: string, config: Partial<PuzzleConfig>): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte choisit le puzzle.");
    if (this.phase !== "lobby") return;
    if (config?.art && ARTS.some((a) => a.id === config.art)) this.config.art = config.art;
    if (config?.count && PIECE_COUNTS.includes(Number(config.count) as PieceCount)) this.config.count = Number(config.count) as PieceCount;
    this.host.changed();
  }

  start(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut lancer le puzzle.");
    if (this.phase !== "lobby") throw new GameError("Le puzzle est déjà lancé.");
    this.seed = 1 + Math.floor(this.rng() * 1e9);
    this.pieces = this.scatter();
    for (const p of this.players) p.placed = 0;
    this.phase = "playing";
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.host.changed();
  }

  again(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut relancer.");
    if (this.phase !== "done") return;
    this.phase = "lobby";
    this.pieces = [];
    this.host.changed();
  }

  /**
   * Disperse les pièces autour du plateau : une grille d'emplacements un peu désordonnée, hors du
   * plateau, tirée au sort. Les pièces se chevauchent peu, on voit d'emblée tout le lot.
   */
  scatter(): PieceState[] {
    const { cols, rows, cw, ch } = grid(this.config.count);
    const n = cols * rows;
    // Marge fixe et modeste : avec de grosses pièces, les bandes au-dessus et au-dessous du plateau
    // doivent rester utilisables.
    const pad = Math.min(36, Math.min(cw, ch) * 0.3);
    const free = (x: number, y: number) =>
      x >= pad && y >= pad && x + cw <= TABLE_W - pad && y + ch <= TABLE_H - pad && !(x + cw > BOARD_X - pad && x < BOARD_X + PUZZLE_W + pad && y + ch > BOARD_Y - pad && y < BOARD_Y + PUZZLE_H + pad);
    // Espacement le plus large qui laisse assez de place pour toutes les pièces.
    let slots: [number, number][] = [];
    for (let spread = 1.5; spread >= 0.7 && slots.length < n; spread -= 0.1) {
      slots = [];
      const sx = cw * spread;
      const sy = ch * spread;
      for (let y = pad; y + ch <= TABLE_H - pad; y += sy) {
        for (let x = pad; x + cw <= TABLE_W - pad; x += sx) if (free(x, y)) slots.push([x, y]);
      }
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
    const pieces: PieceState[] = [];
    for (let id = 0; id < n; id++) {
      const slot = slots[id];
      let x: number;
      let y: number;
      if (slot) {
        // Un peu de jeu autour de l'emplacement, sans sortir de la zone libre.
        const jx = slot[0] + (this.rng() - 0.5) * cw * 0.12;
        const jy = slot[1] + (this.rng() - 0.5) * ch * 0.12;
        [x, y] = free(jx, jy) ? [jx, jy] : slot;
      } else {
        x = pad + this.rng() * (TABLE_W - cw - pad * 2);
        y = this.rng() < 0.5 ? pad : TABLE_H - ch - pad;
      }
      pieces.push({ id, x: Math.round(x), y: Math.round(y), placed: false, heldBy: 0 });
    }
    return pieces;
  }

  // ------------------------------------------------------------ manipulation

  private piece(id: number): PieceState | undefined {
    return this.pieces[Math.trunc(Number(id))];
  }

  private emit(event: PuzzleEvent): void {
    this.host.emit(event);
  }

  grab(p: Player, id: number): void {
    const piece = this.piece(id);
    if (this.phase !== "playing" || !piece || piece.placed) return;
    if (piece.heldBy && piece.heldBy !== p.slot) return;
    // Une seule pièce à la fois par joueur.
    this.releaseAll(p.slot, piece.id);
    piece.heldBy = p.slot;
    this.emit({ k: "grab", id: piece.id, slot: p.slot });
  }

  move(p: Player, id: number, x: number, y: number): void {
    const piece = this.piece(id);
    if (!piece || piece.heldBy !== p.slot || !Number.isFinite(x) || !Number.isFinite(y)) return;
    piece.x = clamp(Math.round(x), -200, TABLE_W);
    piece.y = clamp(Math.round(y), -200, TABLE_H);
    this.emit({ k: "move", id: piece.id, x: piece.x, y: piece.y, slot: p.slot });
  }

  drop(p: Player, id: number, x: number, y: number): void {
    const piece = this.piece(id);
    if (!piece || piece.heldBy !== p.slot) {
      // Lâcher refusé : on rappelle à tous la vraie position.
      if (piece) this.emit({ k: "drop", id: piece.id, x: piece.x, y: piece.y, placed: piece.placed, slot: 0 });
      return;
    }
    if (Number.isFinite(x) && Number.isFinite(y)) {
      piece.x = clamp(Math.round(x), -200, TABLE_W);
      piece.y = clamp(Math.round(y), -200, TABLE_H);
    }
    piece.heldBy = 0;
    const target = home(piece.id, this.config.count);
    const { cw, ch } = grid(this.config.count);
    const tolerance = Math.min(cw, ch) * RULES.snap;
    if (Math.hypot(piece.x - target.x, piece.y - target.y) <= tolerance) {
      piece.x = target.x;
      piece.y = target.y;
      piece.placed = true;
      p.placed += 1;
    }
    this.emit({ k: "drop", id: piece.id, x: piece.x, y: piece.y, placed: piece.placed, slot: p.slot });
    if (piece.placed && this.pieces.every((q) => q.placed)) {
      this.phase = "done";
      this.finishedAt = Date.now();
      this.host.changed();
    } else if (piece.placed) {
      // Le compteur de pièces posées a changé : on rafraîchit le tableau des joueurs.
      this.host.changed();
    }
  }

  private releaseAll(slot: number, except = -1): void {
    for (const q of this.pieces) {
      if (q.heldBy === slot && q.id !== except) {
        q.heldBy = 0;
        this.emit({ k: "drop", id: q.id, x: q.x, y: q.y, placed: q.placed, slot });
      }
    }
  }

  view(forId: string): PuzzleView {
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      config: { ...this.config },
      seed: this.seed,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        slot: p.slot,
        connected: p.connected,
        isHost: p.id === this.hostId,
        placed: p.placed,
      })),
      pieces: this.pieces.map((q) => ({ ...q })),
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      serverNow: Date.now(),
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
