// Logique d'une partie d'Échos : simulation en temps réel, enregistrement des manches, échos.
//
// Le serveur avance la partie 20 fois par seconde. Chaque joueur envoie sa direction quand elle
// change ; à chaque pas, elle est appliquée à son corps et notée. En fin de manche, ces notes
// deviennent un écho qui rejouera la même suite de directions à la manche suivante. Un écho n'est
// pas un enregistrement de positions : bloqué par une porte fermée, il se cogne et dévie.

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  ARENA,
  LEVELS,
  RULES,
  move,
  openDoors,
  parseArena,
  prepare,
  pressedBy,
  pushOut,
  spawnOf,
  trapped,
  type Arena,
  type BodyInfo,
  type EchoAction,
  type EchoView,
  type LevelResult,
  type Mode,
  type Phase,
  type TickMessage,
} from "../../../shared/games/echos.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

/** Longueur d'une manche ; ECHOS_ROUND_TICKS la raccourcit pour les tests de bout en bout. */
const ROUND_TICKS = Number(process.env.ECHOS_ROUND_TICKS) || RULES.roundTicks;
/** Pour les tests de bout en bout seulement : chaque salle est franchie au bout de ce nombre de pas. */
const AUTOCLEAR = Number(process.env.ECHOS_AUTOCLEAR) || 0;

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
}

interface Echo {
  owner: number;
  /** Manche (dans la salle) où il a été enregistré, à partir de 1. */
  generation: number;
  inputs: Uint8Array;
  /** Parcours réel de la manche enregistrée, un point tous les TRACE_EVERY pas. */
  trace: number[];
}

const TRACE_EVERY = 6;

interface LiveBody extends BodyInfo {
  x: number;
  y: number;
  /** Indice de l'écho rejoué, ou -1 pour le joueur en direct. */
  replay: number;
}

export class EchoGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  mode: Mode = "coop";
  level = 0;
  round = 0;
  rows: string[] = [];
  arena: Arena = parseArena(["#"]);
  echoes: Echo[] = [];
  bodies: LiveBody[] = [];
  tick = 0;
  pressed = new Map<number, number[]>();
  paradoxes = 0;
  /** Manches jouées dans la salle en cours, paradoxes compris. */
  played = 0;
  results: LevelResult[] = [];
  /** Versus : points (pas passés seul sur une plaque) de la manche en cours, puis de chaque manche. */
  roundScore = new Map<number, number>();
  roundPoints: Record<number, number>[] = [];
  deadline: number | null = null;
  /** Direction courante de chaque joueur, et ce qu'il a joué pendant la manche. */
  private input = new Map<number, number>();
  private recording = new Map<number, Uint8Array>();
  private tracing = new Map<number, number[]>();
  private interval: ReturnType<typeof setInterval> | null = null;
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
    // Un absent s'arrête là où il est.
    if (!connected) this.input.set(p.slot, 0);
    if (!connected && this.hostId === playerId) {
      const next = this.players.find((x) => x.connected && x.id !== playerId);
      if (next) this.hostId = next.id;
    }
    this.host.changed();
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
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    this.interval = null;
    this.timer = null;
  }

  handle(playerId: string, action: unknown): void {
    const a = action as EchoAction;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "input": {
        const d = Math.trunc(Number(a.d));
        if (d >= 0 && d <= 16) this.input.set(p.slot, d);
        return;
      }
      case "configure":
        if (playerId !== this.hostId) throw new GameError("Seul l'hôte choisit le mode.");
        if (this.phase !== "lobby") return;
        this.mode = a.mode === "versus" ? "versus" : "coop";
        this.host.changed();
        return;
      case "start":
        return this.start(playerId);
      case "paradox":
        return this.paradox(playerId);
      case "rematch":
        return this.rematch(playerId);
      default:
        throw new GameError("Action inconnue.");
    }
  }

  // ------------------------------------------------------------ déroulé

  start(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut lancer la partie.");
    if (this.phase !== "lobby") throw new GameError("La partie est déjà lancée.");
    const connected = this.players.filter((p) => p.connected);
    if (connected.length < RULES.minPlayers) throw new GameError(`Il faut au moins ${RULES.minPlayers} joueurs connectés.`);
    this.players = connected;
    this.results = [];
    this.roundPoints = [];
    this.level = 0;
    this.beginLevel();
  }

  rematch(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut relancer.");
    if (this.phase !== "final") throw new GameError("La partie n'est pas terminée.");
    this.dispose();
    this.players = this.players.filter((p) => p.connected);
    if (!this.players.some((p) => p.id === this.hostId)) this.hostId = this.players[0]?.id ?? null;
    this.phase = "lobby";
    this.deadline = null;
    this.host.changed();
  }

  get levelDef() {
    return this.mode === "versus" ? ARENA : LEVELS[this.level]!;
  }

  beginLevel(): void {
    this.rows = prepare(this.levelDef, this.players.length, Math.floor(this.rng() * 2 ** 32), this.mode);
    this.arena = parseArena(this.rows);
    this.echoes = [];
    this.round = 0;
    this.paradoxes = 0;
    this.played = 0;
    this.beginRound();
  }

  /** Remet tout le monde au départ, échos compris, puis compte à rebours. */
  beginRound(): void {
    this.dispose();
    this.tick = 0;
    this.input.clear();
    this.recording.clear();
    this.roundScore.clear();
    const order = new Map(this.players.map((p, i) => [p.slot, i]));
    this.bodies = [
      ...this.echoes.map((e, k) => ({ owner: e.owner, echo: e.generation, replay: k, ...spawnOf(this.arena, order.get(e.owner) ?? 0) })),
      ...this.players.map((p, i) => ({ owner: p.slot, echo: 0, replay: -1, ...spawnOf(this.arena, i) })),
    ];
    for (const p of this.players) this.recording.set(p.slot, new Uint8Array(ROUND_TICKS));
    this.tracing.clear();
    for (const b of this.bodies) if (b.echo === 0) this.tracing.set(b.owner, [Math.round(b.x * 100), Math.round(b.y * 100)]);
    this.pressed = pressedBy(this.arena, this.bodies);
    this.phase = "briefing";
    this.deadline = Date.now() + RULES.briefingMs;
    if (this.useTimers) this.timer = setTimeout(() => this.beginPlay(), RULES.briefingMs);
    this.host.changed();
  }

  beginPlay(): void {
    if (this.phase !== "briefing") return;
    this.dispose();
    this.phase = "round";
    this.deadline = Date.now() + ROUND_TICKS * RULES.tickMs;
    if (this.useTimers) this.interval = setInterval(() => this.step(), RULES.tickMs);
    this.host.changed();
  }

  /** Un pas : les portes suivent les plaques du pas précédent, puis tout le monde bouge. */
  step(): void {
    if (this.phase !== "round") return;
    const open = openDoors(this.arena, this.pressed.keys());
    for (const b of this.bodies) {
      let dir: number;
      if (b.replay >= 0) dir = this.echoes[b.replay]?.inputs[this.tick] ?? 0;
      else {
        dir = this.input.get(b.owner) ?? 0;
        const rec = this.recording.get(b.owner);
        if (rec && this.tick < rec.length) rec[this.tick] = dir;
      }
      move(this.arena, b, dir, open);
    }
    if (this.mode === "versus") this.jostle(open);
    this.pressed = pressedBy(this.arena, this.bodies);
    this.tick += 1;
    if (this.tick % TRACE_EVERY === 0) {
      for (const b of this.bodies) if (b.echo === 0) this.tracing.get(b.owner)?.push(Math.round(b.x * 100), Math.round(b.y * 100));
    }

    if (this.mode === "versus") {
      for (const [plate, who] of this.pressed) {
        if (this.arena.plates[plate]?.kind !== "neutral") continue;
        const owners = new Set(who.map((k) => this.bodies[k]!.owner));
        if (owners.size === 1) {
          const [o] = owners;
          this.roundScore.set(o!, (this.roundScore.get(o!) ?? 0) + 1);
        }
      }
    }
    if (this.useTimers) this.host.emit(this.tickMessage());

    const golds = this.arena.plates.filter((p) => p.kind === "gold");
    if (this.mode === "coop" && golds.length && golds.every((p) => this.pressed.has(p.index))) return this.clear();
    if (this.mode === "coop" && AUTOCLEAR && this.tick >= AUTOCLEAR) return this.clear();
    if (this.tick >= ROUND_TICKS) this.endRound();
  }

  /** Versus : les corps de joueurs différents ne se traversent pas. */
  private jostle(open: Set<string>): void {
    const r = RULES.radius;
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i]!;
        const b = this.bodies[j]!;
        if (a.owner === b.owner) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 2 * r) continue;
        const nx = d > 1e-9 ? dx / d : 1;
        const ny = d > 1e-9 ? dy / d : 0;
        const push = (2 * r - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    for (const b of this.bodies) pushOut(this.arena, b, open, trapped(this.arena, b, open));
  }

  tickMessage(): TickMessage {
    const msg: TickMessage = { k: "t", t: this.tick, p: this.positions(), on: [...this.pressed.keys()] };
    if (this.mode === "versus" && this.tick % 10 === 0) msg.s = Object.fromEntries(this.roundScore);
    return msg;
  }

  private positions(): number[] {
    return this.bodies.flatMap((b) => [Math.round(b.x * 100), Math.round(b.y * 100)]);
  }

  /** Fin de manche sans succès : chacun laisse un écho, ou c'est le paradoxe. */
  endRound(): void {
    this.dispose();
    for (const p of this.players) {
      const inputs = this.recording.get(p.slot);
      if (inputs) this.echoes.push({ owner: p.slot, generation: this.round + 1, inputs, trace: this.tracing.get(p.slot) ?? [] });
    }
    this.round += 1;
    this.played += 1;
    if (this.mode === "versus") {
      this.roundPoints.push(Object.fromEntries(this.players.map((p) => [p.slot, this.roundScore.get(p.slot) ?? 0])));
      this.roundScore.clear();
      if (this.round >= RULES.versusRounds) return this.finish();
    } else if (this.round >= RULES.maxRounds) {
      // Trop d'échos : le temps se déchire, on efface tout et on reprend la salle.
      this.echoes = [];
      this.paradoxes += 1;
      this.round = 0;
    }
    this.phase = "rewind";
    this.deadline = Date.now() + RULES.rewindMs;
    if (this.useTimers) this.timer = setTimeout(() => this.beginRound(), RULES.rewindMs);
    this.host.changed();
  }

  /** L'hôte efface les échos de la salle (coopération). */
  paradox(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut effacer les échos.");
    if (this.mode !== "coop" || !["briefing", "round", "rewind"].includes(this.phase)) return;
    this.dispose();
    if (this.phase === "round") this.played += 1;
    this.echoes = [];
    this.paradoxes += 1;
    this.round = 0;
    this.phase = "rewind";
    this.deadline = Date.now() + RULES.rewindMs;
    if (this.useTimers) this.timer = setTimeout(() => this.beginRound(), RULES.rewindMs);
    this.host.changed();
  }

  /** Toutes les plaques dorées tenues en même temps : la salle est franchie. */
  clear(): void {
    this.dispose();
    this.results.push({ level: this.levelDef.id, rounds: this.played + 1, paradoxes: this.paradoxes, ticks: this.tick });
    if (this.useTimers) this.host.emit(this.tickMessage());
    this.phase = "cleared";
    this.deadline = Date.now() + RULES.clearedMs;
    if (this.useTimers) {
      this.timer = setTimeout(() => {
        if (this.level + 1 >= LEVELS.length) this.finish();
        else {
          this.level += 1;
          this.beginLevel();
        }
      }, RULES.clearedMs);
    }
    this.host.changed();
  }

  finish(): void {
    this.dispose();
    this.phase = "final";
    this.deadline = null;
    this.host.changed();
  }

  view(forId: string): EchoView {
    const def = this.levelDef;
    const total: Record<number, number> = {};
    for (const p of this.players) total[p.slot] = this.roundPoints.reduce((s, r) => s + (r[p.slot] ?? 0), 0) + (this.roundScore.get(p.slot) ?? 0);
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      mode: this.mode,
      level: this.level,
      levels: this.mode === "versus" ? 1 : LEVELS.length,
      levelName: def.name,
      levelHint: def.hint,
      rows: this.rows,
      round: this.round,
      maxRounds: this.mode === "versus" ? RULES.versusRounds : RULES.maxRounds,
      bodies: this.bodies.map((b) => ({ owner: b.owner, echo: b.echo })),
      traces: this.bodies.map((b) => (b.replay >= 0 ? (this.echoes[b.replay]?.trace ?? []) : [])),
      positions: this.positions(),
      pressed: [...this.pressed.keys()],
      tick: this.tick,
      paradoxes: this.paradoxes,
      results: this.results,
      points: total,
      roundPoints: this.roundPoints,
      deadline: this.deadline,
      serverNow: Date.now(),
      players: this.players.map((p) => ({ id: p.id, name: p.name, accent: p.accent, slot: p.slot, connected: p.connected, isHost: p.id === this.hostId })),
    };
  }
}
