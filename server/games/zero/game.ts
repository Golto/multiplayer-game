// Logique d'une partie de Zéro : le Skyjo des polynômes (voir shared/games/zero.ts pour les règles).

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  DEFAULT_CONFIG,
  DEGREES,
  GRIDS,
  RULES,
  TARGETS,
  buildDeck,
  columnCells,
  columnClears,
  evaluate,
  gridValue,
  drawX,
  xLeft,
  type Cell,
  type Degree,
  type Phase,
  type Poly,
  type RoundResult,
  type RoundScore,
  type Target,
  type ZeroAction,
  type ZeroConfig,
  type ZeroEvent,
  type ZeroView,
} from "../../../shared/games/zero.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

/** Délai avant qu'un absent joue automatiquement son tour. */
const AUTOPLAY_MS = 1500;

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  ready: boolean;
  total: number;
}

export class ZeroGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  config: ZeroConfig = { ...DEFAULT_CONFIG };
  round = 0;
  deck: Poly[] = [];
  discard: Poly[] = [];
  grids = new Map<number, Cell[]>();
  turn = 0;
  step: "draw" | "place" | "flip" = "draw";
  hand: Poly | null = null;
  handFrom: "deck" | "discard" | null = null;
  closer: number | null = null;
  /** Joueurs qui doivent encore jouer leur dernier tour. */
  pendingFinal = new Set<number>();
  /** Celui qui ouvre la manche suivante (celui qui a clos la précédente). */
  nextStarter: number | null = null;
  results: RoundResult[] = [];
  /** Le sac d'où sort x : chaque valeur une fois toutes les trois manches. */
  xBag: number[] = [];
  lastEvent: ZeroEvent | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    code: string,
    private readonly host: RoomHost,
    private readonly rng: () => number = Math.random,
    private readonly useTimers = true,
  ) {
    this.code = code;
  }

  // ------------------------------------------------------------ contrat de salon

  get joinable(): boolean {
    return this.phase === "lobby" && this.players.length < RULES.maxPlayers;
  }

  get playerCount(): number {
    return this.players.length;
  }

  addPlayer(rawName: string): Player {
    if (this.phase !== "lobby") throw new GameError("La partie a déjà commencé dans ce salon.");
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
      ready: false,
      total: 0,
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
    if (!connected && this.hostId === playerId) {
      const next = this.players.find((x) => x.connected && x.id !== playerId);
      if (next) this.hostId = next.id;
    }
    this.host.changed();
    this.schedule();
    this.checkSetup();
    this.checkReady();
  }

  leave(playerId: string): void {
    if (this.phase === "lobby" || this.phase === "final") {
      this.players = this.players.filter((x) => x.id !== playerId);
      if (this.hostId === playerId) this.hostId = this.players[0]?.id ?? null;
      this.host.changed();
    } else {
      this.setConnected(playerId, false);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  handle(playerId: string, action: unknown): void {
    const a = action as ZeroAction;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "configure":
        return this.configure(playerId, a.config);
      case "start":
        return this.start(playerId);
      case "reveal":
        return this.phase === "setup" ? this.setupReveal(p.slot, Number(a.index)) : this.flip(p.slot, Number(a.index));
      case "draw":
        return this.draw(p.slot, a.from);
      case "swap":
        return this.swap(p.slot, Number(a.index));
      case "discard":
        return this.discardHand(p.slot);
      case "ready":
        if (this.phase !== "reveal") return;
        p.ready = true;
        this.host.changed();
        return this.checkReady();
      case "rematch":
        return this.rematch(playerId);
      default:
        throw new GameError("Action inconnue.");
    }
  }

  // ------------------------------------------------------------ préparation

  configure(by: string, config: Partial<ZeroConfig>): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte règle la partie.");
    if (this.phase !== "lobby") return;
    const grid = GRIDS.find((g) => g.rows === Number(config?.rows ?? this.config.rows) && g.cols === Number(config?.cols ?? this.config.cols));
    if (grid) [this.config.rows, this.config.cols] = [grid.rows, grid.cols];
    if (DEGREES.includes(Number(config?.degree) as Degree)) this.config.degree = Number(config.degree) as Degree;
    if (TARGETS.includes(Number(config?.target) as Target)) this.config.target = Number(config.target) as Target;
    this.host.changed();
  }

  start(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut lancer la partie.");
    if (this.phase !== "lobby") throw new GameError("La partie est déjà lancée.");
    const connected = this.players.filter((p) => p.connected);
    if (connected.length < RULES.minPlayers) throw new GameError(`Il faut au moins ${RULES.minPlayers} joueurs connectés.`);
    this.players = connected;
    for (const p of this.players) p.total = 0;
    this.results = [];
    this.xBag = [];
    this.round = 0;
    this.nextStarter = null;
    this.beginRound();
  }

  rematch(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut relancer.");
    if (this.phase !== "final") throw new GameError("La partie n'est pas terminée.");
    this.dispose();
    this.players = this.players.filter((p) => p.connected);
    if (!this.players.some((p) => p.id === this.hostId)) this.hostId = this.players[0]?.id ?? null;
    this.phase = "lobby";
    this.host.changed();
  }

  /** Nouveau paquet, nouvelles grilles face cachée, une carte retournée sur la défausse. */
  beginRound(): void {
    this.dispose();
    const r = () => this.rng();
    this.deck = buildDeck(this.config, this.players.length, r);
    this.discard = [];
    this.grids.clear();
    const cells = this.config.rows * this.config.cols;
    for (const p of this.players) {
      this.grids.set(
        p.slot,
        Array.from({ length: cells }, () => ({ card: this.deck.pop()!, up: false })),
      );
      p.ready = false;
    }
    this.discard.push(this.deck.pop()!);
    this.hand = null;
    this.handFrom = null;
    this.closer = null;
    this.pendingFinal.clear();
    this.lastEvent = null;
    this.phase = "setup";
    this.host.changed();
    this.schedule();
  }

  setupReveal(slot: number, index: number): void {
    if (this.phase !== "setup") return;
    const grid = this.grids.get(slot);
    const cell = grid?.[index];
    if (!grid || !cell?.card || cell.up) return;
    if (grid.filter((c) => c.up).length >= RULES.revealAtStart) return;
    cell.up = true;
    this.host.changed();
    this.checkSetup();
  }

  private checkSetup(): void {
    if (this.phase !== "setup") return;
    const waiting = this.players.filter((p) => p.connected && this.revealed(p.slot) < RULES.revealAtStart);
    if (waiting.length) return;
    // Les absents retournent leurs deux premières cartes.
    for (const p of this.players) {
      const grid = this.grids.get(p.slot)!;
      for (const c of grid) if (this.revealed(p.slot) < RULES.revealAtStart && !c.up) c.up = true;
    }
    // Première manche : la plus grosse main visible commence ; ensuite, celui qui a clos la précédente.
    let starter = this.players[0]!.slot;
    if (this.nextStarter !== null && this.players.some((p) => p.slot === this.nextStarter)) starter = this.nextStarter;
    else {
      let best = -Infinity;
      for (const p of this.players) {
        // Comme au Skyjo : la valeur des cartes visibles (x = 1).
        const shown = this.grids.get(p.slot)!.filter((c) => c.up && c.card).reduce((s, c) => s + evaluate(c.card!, 1), 0);
        if (shown > best) [best, starter] = [shown, p.slot];
      }
    }
    this.turn = starter;
    this.step = "draw";
    this.phase = "play";
    this.host.changed();
    this.schedule();
  }

  private revealed(slot: number): number {
    return this.grids.get(slot)?.filter((c) => c.up).length ?? 0;
  }

  // ------------------------------------------------------------ tour de jeu

  private mustPlay(slot: number, step: "draw" | "place" | "flip"): void {
    if (this.phase !== "play") throw new GameError("Ce n'est pas le moment.");
    if (this.turn !== slot) throw new GameError("Ce n'est pas ton tour.");
    if (this.step !== step) throw new GameError(step === "draw" ? "Tu as déjà pioché." : step === "flip" ? "Retourne d'abord une carte." : "Pioche d'abord.");
  }

  draw(slot: number, from: "deck" | "discard"): void {
    this.mustPlay(slot, "draw");
    if (from === "discard") {
      const top = this.discard.pop();
      if (!top) throw new GameError("La défausse est vide.");
      this.hand = top;
    } else {
      if (!this.deck.length) this.reshuffle();
      this.hand = this.deck.pop() ?? null;
      if (!this.hand) throw new GameError("Plus de cartes.");
    }
    this.handFrom = from === "discard" ? "discard" : "deck";
    this.step = "place";
    this.lastEvent = { k: "draw", slot, from: this.handFrom };
    this.host.changed();
    this.schedule();
  }

  /** Pioche vide : on remélange la défausse, sauf sa carte du dessus. */
  private reshuffle(): void {
    const top = this.discard.pop();
    this.deck = this.discard;
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j]!, this.deck[i]!];
    }
    this.discard = top ? [top] : [];
  }

  swap(slot: number, index: number): void {
    this.mustPlay(slot, "place");
    const cell = this.grids.get(slot)?.[index];
    if (!cell?.card) throw new GameError("Cette case est vide.");
    const out = cell.card;
    cell.card = this.hand!;
    cell.up = true;
    this.discard.push(out);
    this.hand = null;
    this.handFrom = null;
    this.lastEvent = { k: "swap", slot, index, out };
    this.endAction(slot);
  }

  discardHand(slot: number): void {
    this.mustPlay(slot, "place");
    if (this.handFrom !== "deck") throw new GameError("Une carte prise à la défausse doit être échangée.");
    this.discard.push(this.hand!);
    this.hand = null;
    this.handFrom = null;
    this.step = "flip";
    this.lastEvent = { k: "discard", slot };
    this.host.changed();
    this.schedule();
  }

  flip(slot: number, index: number): void {
    this.mustPlay(slot, "flip");
    const cell = this.grids.get(slot)?.[index];
    if (!cell?.card || cell.up) throw new GameError("Choisis une carte cachée.");
    cell.up = true;
    this.lastEvent = { k: "flip", slot, index };
    this.endAction(slot);
  }

  /** Après un échange ou un retournement : colonnes, fin de manche, joueur suivant. */
  private endAction(slot: number): void {
    this.checkColumns(slot);
    const grid = this.grids.get(slot)!;
    if (this.closer === null && grid.every((c) => !c.card || c.up)) {
      this.closer = slot;
      this.pendingFinal = new Set(this.players.filter((p) => p.slot !== slot).map((p) => p.slot));
      this.lastEvent = { k: "closed", slot };
    } else if (this.closer !== null) {
      this.pendingFinal.delete(slot);
    }
    if (this.closer !== null && this.pendingFinal.size === 0) return this.endRound();
    this.turn = this.nextPlayer(slot);
    this.step = "draw";
    this.host.changed();
    this.schedule();
  }

  private nextPlayer(slot: number): number {
    const order = this.players.map((p) => p.slot);
    let i = order.indexOf(slot);
    for (let k = 0; k < order.length; k++) {
      i = (i + 1) % order.length;
      const s = order[i]!;
      if (this.closer === null || this.pendingFinal.has(s)) return s;
    }
    return slot;
  }

  /** Colonnes entièrement révélées dont les cartes ont le même terme dominant : elles s'effacent. */
  private checkColumns(slot: number): void {
    const grid = this.grids.get(slot)!;
    const { rows, cols } = this.config;
    for (let c = 0; c < cols; c++) {
      const cells = columnCells(cols, rows, c).map((i) => grid[i]!);
      if (!cells[0]!.card || !cells.every((x) => x.up)) continue;
      if (!columnClears(cells.map((x) => x.card!))) continue;
      for (const x of cells) {
        this.discard.push(x.card!);
        x.card = null;
        x.up = true;
      }
      this.lastEvent = { k: "column", slot, col: c };
    }
  }

  // ------------------------------------------------------------ fin de manche

  /** Tout le monde révèle, x sort du sac, chaque carte vaut P(x). */
  endRound(x: number = drawX(this.xBag, this.rng)): void {
    this.dispose();
    const scores: Record<number, RoundScore> = {};
    for (const p of this.players) {
      const grid = this.grids.get(p.slot)!;
      for (const c of grid) c.up = true;
      // Les colonnes complétées par la révélation finale s'effacent aussi.
      this.checkColumns(p.slot);
      const value = gridValue(grid.map((c) => c.card).filter((c): c is Poly => !!c), x);
      scores[p.slot] = { cards: value, doubled: false, score: value };
    }
    // Celui qui a clos la manche double, s'il n'est pas strictement le plus bas (et si c'est positif).
    if (this.closer !== null) {
      const mine = scores[this.closer]!;
      const strictlyLowest = this.players.every((p) => p.slot === this.closer || scores[p.slot]!.score > mine.score);
      if (!strictlyLowest && mine.score > 0) {
        mine.doubled = true;
        mine.score *= 2;
      }
    }
    for (const p of this.players) {
      p.total += scores[p.slot]!.score;
      p.ready = false;
    }
    this.results.push({ round: this.round, closer: this.closer ?? 0, x, scores });
    this.nextStarter = this.closer;
    this.hand = null;
    this.phase = "reveal";
    this.host.changed();
  }

  get gameOver(): boolean {
    return this.players.some((p) => p.total >= this.config.target);
  }

  private checkReady(): void {
    if (this.phase !== "reveal") return;
    const active = this.players.filter((p) => p.connected);
    if (!active.length || !active.every((p) => p.ready)) return;
    if (this.gameOver) {
      this.phase = "final";
      this.host.changed();
      return;
    }
    this.round += 1;
    this.beginRound();
  }

  // ------------------------------------------------------------ absents

  /** Un joueur absent joue tout seul : il pioche, défausse et retourne sa première carte cachée. */
  private schedule(): void {
    if (!this.useTimers) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const absent = (slot: number) => !this.players.find((p) => p.slot === slot)?.connected;
    if (this.phase === "setup" && this.players.some((p) => !p.connected)) {
      this.timer = setTimeout(() => this.checkSetup(), AUTOPLAY_MS);
    } else if (this.phase === "play" && absent(this.turn)) {
      this.timer = setTimeout(() => this.autoplay(), AUTOPLAY_MS);
    }
  }

  autoplay(): void {
    if (this.phase !== "play") return;
    const slot = this.turn;
    const grid = this.grids.get(slot)!;
    const hidden = grid.findIndex((c) => c.card && !c.up);
    if (this.step === "draw") this.draw(slot, "deck");
    else if (this.step === "place") {
      if (this.handFrom === "deck" && hidden >= 0) this.discardHand(slot);
      else this.swap(slot, grid.findIndex((c) => c.card));
    } else if (this.step === "flip") this.flip(slot, hidden);
  }

  // ------------------------------------------------------------ vue

  view(forId: string): ZeroView {
    const grids: ZeroView["grids"] = {};
    for (const [slot, grid] of this.grids) {
      // Une carte cachée ne quitte jamais le serveur, pas même vers son propriétaire.
      grids[slot] = grid.map((c) => ({ card: c.up ? c.card : null, up: c.up, removed: !c.card }));
    }
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      config: { ...this.config },
      round: this.round,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        slot: p.slot,
        connected: p.connected,
        isHost: p.id === this.hostId,
        ready: p.ready,
        total: p.total,
      })),
      grids,
      deckCount: this.deck.length,
      discardTop: this.discard[this.discard.length - 1] ?? null,
      turn: this.turn,
      step: this.step,
      hand: this.hand,
      handFrom: this.handFrom,
      closer: this.closer,
      results: this.results,
      xLeft: xLeft(this.xBag),
      lastEvent: this.lastEvent,
    };
  }
}
