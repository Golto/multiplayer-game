// Logique d'une partie de Topologie : conquête de territoire en temps réel sur une surface recollée.
//
// Chaque joueur possède des cases. Hors de chez lui, il laisse une traîne ; en rentrant, il
// s'approprie sa traîne et toutes les régions qu'elle sépare du reste du plateau, sauf la plus
// grande. Sur un tore, une boucle qui fait le tour du plateau ne sépare rien : elle ne rapporte
// que sa propre traîne. Couper la traîne d'un autre le fait tomber ; couper la sienne aussi.

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  RULES,
  SURFACE_IDS,
  boardSize,
  encodeGrid,
  opposite,
  step,
  type Dir,
  type Head,
  type Phase,
  type RoundResult,
  type SurfaceId,
  type TickEvent,
  type TickMessage,
  type TopoAction,
  type TopoView,
} from "../../../shared/games/topologie.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

export type Rng = () => number;

/** Durée d'une manche ; TOPO_ROUND_SECONDS la raccourcit pour les tests de bout en bout. */
const ROUND_SECONDS = Number(process.env.TOPO_ROUND_SECONDS) || RULES.roundSeconds;

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  ready: boolean;
}

interface HeadState extends Head {
  queue: Dir[];
  respawnAt: number;
  trailLength: number;
}

export class TopoGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  round = 0;
  surfaces: SurfaceId[] = [];
  size = 0;
  tick = 0;
  deadline: number | null = null;
  owner = new Uint8Array(0);
  trail = new Uint8Array(0);
  heads = new Map<number, HeadState>();
  counts = new Map<number, number>();
  kills = new Map<number, number>();
  deaths = new Map<number, number>();
  results: RoundResult[] = [];

  private changed = new Map<number, true>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    code: string,
    private readonly host: RoomHost,
    private readonly rng: Rng = Math.random,
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

  get surface(): SurfaceId {
    return this.surfaces[this.round] ?? "tore";
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
    const usedSlots = new Set(this.players.map((p) => p.slot));
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !usedSlots.has(s))!;
    const usedAccents = new Set(this.players.map((p) => p.accent));
    const player: Player = {
      id: randomBytes(10).toString("base64url").slice(0, 10),
      token: randomBytes(24).toString("base64url").slice(0, 24),
      name,
      accent: PLAYER_ACCENTS.find((a) => !usedAccents.has(a)) ?? PLAYER_ACCENTS[0],
      slot,
      connected: true,
      ready: false,
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

  handle(playerId: string, action: unknown): void {
    const a = action as TopoAction;
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "start":
        return this.start(playerId);
      case "turn":
        return this.turn(player.slot, a.dir);
      case "ready":
        player.ready = true;
        this.host.changed();
        return this.checkReady();
      case "rematch":
        return this.rematch(playerId);
      default:
        throw new GameError("Action inconnue.");
    }
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    this.interval = null;
    this.timer = null;
  }

  // ------------------------------------------------------------ déroulé

  start(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut lancer la partie.");
    if (this.phase !== "lobby") throw new GameError("La partie est déjà lancée.");
    const connected = this.players.filter((p) => p.connected);
    if (connected.length < RULES.minPlayers) {
      throw new GameError(`Il faut au moins ${RULES.minPlayers} joueurs connectés.`);
    }
    this.players = connected;
    // Chaque manche sur une surface différente, dans un ordre tiré au sort.
    const pool = [...SURFACE_IDS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    this.surfaces = pool.slice(0, RULES.rounds);
    this.results = [];
    this.round = 0;
    this.beginRound();
  }

  turn(slot: number, dir: Dir): void {
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    if (![0, 1, 2, 3].includes(dir)) return;
    const head = this.heads.get(slot);
    if (!head) return;
    if (this.phase === "countdown") {
      // Avant le départ, on choisit simplement sa direction.
      head.dir = dir;
      this.host.changed();
      return;
    }
    if (head.queue.length < 3) head.queue.push(dir);
  }

  rematch(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut relancer.");
    if (this.phase !== "final") throw new GameError("La partie n'est pas terminée.");
    this.dispose();
    this.players = this.players.filter((p) => p.connected);
    if (!this.players.some((p) => p.id === this.hostId)) this.hostId = this.players[0]?.id ?? null;
    this.phase = "lobby";
    this.deadline = null;
    this.results = [];
    this.heads.clear();
    this.host.changed();
  }

  /** Prépare la manche courante : plateau vide, territoires de départ, compte à rebours. */
  beginRound(): void {
    this.dispose();
    this.size = boardSize(this.players.length);
    const cells = this.size * this.size;
    this.owner = new Uint8Array(cells);
    this.trail = new Uint8Array(cells);
    this.heads.clear();
    this.counts.clear();
    this.kills.clear();
    this.deaths.clear();
    this.tick = 0;

    const n = this.players.length;
    const turnOffset = this.rng() * Math.PI * 2;
    this.players.forEach((p, i) => {
      p.ready = false;
      const angle = turnOffset + (i / n) * Math.PI * 2;
      const r = this.size * 0.3;
      const cx = Math.round(this.size / 2 + r * Math.cos(angle));
      const cy = Math.round(this.size / 2 + r * Math.sin(angle));
      this.claimSquare(p.slot, cx, cy, RULES.spawnRadius);
      this.heads.set(p.slot, {
        slot: p.slot,
        x: cx,
        y: cy,
        dir: Math.floor(this.rng() * 4) as Dir,
        alive: true,
        queue: [],
        respawnAt: 0,
        trailLength: 0,
      });
    });
    this.changed.clear();

    this.phase = "countdown";
    this.deadline = Date.now() + RULES.countdownSeconds * 1000;
    if (this.useTimers) this.timer = setTimeout(() => this.beginPlay(), RULES.countdownSeconds * 1000);
    this.host.changed();
  }

  beginPlay(): void {
    this.dispose();
    this.phase = "playing";
    this.deadline = Date.now() + ROUND_SECONDS * 1000;
    if (this.useTimers) {
      this.interval = setInterval(() => this.advanceTick(), RULES.tickMs);
      this.timer = setTimeout(() => this.endRound(), ROUND_SECONDS * 1000);
    }
    this.host.changed();
  }

  endRound(): void {
    this.dispose();
    const cells: Record<number, number> = {};
    const kills: Record<number, number> = {};
    const deaths: Record<number, number> = {};
    for (const p of this.players) {
      cells[p.slot] = this.counts.get(p.slot) ?? 0;
      kills[p.slot] = this.kills.get(p.slot) ?? 0;
      deaths[p.slot] = this.deaths.get(p.slot) ?? 0;
    }
    this.results.push({ round: this.round, surface: this.surface, cells, kills, deaths, total: this.size * this.size });
    for (const p of this.players) p.ready = false;
    if (this.round + 1 >= RULES.rounds) {
      this.phase = "final";
      this.deadline = null;
    } else {
      this.phase = "intermission";
      this.deadline = Date.now() + RULES.intermissionSeconds * 1000;
      if (this.useTimers) this.timer = setTimeout(() => this.nextRound(), RULES.intermissionSeconds * 1000);
    }
    this.host.changed();
  }

  nextRound(): void {
    if (this.phase !== "intermission") return;
    this.round += 1;
    this.beginRound();
  }

  private checkReady(): void {
    if (this.phase !== "intermission") return;
    const active = this.players.filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => p.ready)) this.nextRound();
  }

  // ------------------------------------------------------------ simulation

  private index(x: number, y: number): number {
    return y * this.size + x;
  }

  private setOwner(i: number, slot: number): void {
    const before = this.owner[i]!;
    if (before === slot) return;
    if (before) this.counts.set(before, (this.counts.get(before) ?? 0) - 1);
    if (slot) this.counts.set(slot, (this.counts.get(slot) ?? 0) + 1);
    this.owner[i] = slot;
    this.changed.set(i, true);
  }

  private setTrail(i: number, slot: number): void {
    if (this.trail[i] === slot) return;
    this.trail[i] = slot;
    this.changed.set(i, true);
  }

  /** Carré de territoire centré sur (cx, cy), rogné aux bords du plateau. */
  private claimSquare(slot: number, cx: number, cy: number, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.min(this.size - 1, Math.max(0, cx + dx));
        const y = Math.min(this.size - 1, Math.max(0, cy + dy));
        this.setOwner(this.index(x, y), slot);
      }
    }
  }

  /** Un pas de simulation. Public pour les tests. */
  advanceTick(): TickMessage {
    this.tick += 1;
    const events: TickEvent[] = [];
    const surface = this.surface;

    // Retour en jeu des joueurs tombés.
    for (const h of this.heads.values()) {
      if (!h.alive && h.respawnAt <= this.tick) {
        this.respawn(h);
        events.push({ k: "respawn", slot: h.slot });
      }
    }

    const alive = [...this.heads.values()].filter((h) => h.alive);
    for (const h of alive) {
      while (h.queue.length) {
        const d = h.queue.shift()!;
        if (d !== h.dir && !opposite(d, h.dir)) {
          h.dir = d;
          break;
        }
      }
    }

    const moves = alive.map((h) => ({ h, to: step(surface, this.size, this.size, h.x, h.y, h.dir) }));
    const fallen = new Map<number, { by: number | null; reason: "coupe" | "soi" | "choc" | "mur" }>();
    const fall = (slot: number, by: number | null, reason: "coupe" | "soi" | "choc" | "mur") => {
      if (!fallen.has(slot)) fallen.set(slot, { by, reason });
    };

    for (const m of moves) if (!m.to) fall(m.h.slot, null, "mur");

    // Chocs frontaux : même case visée, ou deux têtes qui se croisent.
    for (let i = 0; i < moves.length; i++) {
      for (let j = i + 1; j < moves.length; j++) {
        const a = moves[i]!;
        const b = moves[j]!;
        if (!a.to || !b.to) continue;
        const same = a.to.x === b.to.x && a.to.y === b.to.y;
        const swap = a.to.x === b.h.x && a.to.y === b.h.y && b.to.x === a.h.x && b.to.y === a.h.y;
        if (same || swap) {
          fall(a.h.slot, b.h.slot, "choc");
          fall(b.h.slot, a.h.slot, "choc");
        }
      }
    }

    // Traînes coupées.
    for (const m of moves) {
      if (!m.to || fallen.has(m.h.slot)) continue;
      const tr = this.trail[this.index(m.to.x, m.to.y)]!;
      if (tr === m.h.slot) fall(m.h.slot, null, "soi");
      else if (tr && this.heads.get(tr)?.alive) fall(tr, m.h.slot, "coupe");
    }

    for (const [slot, { by, reason }] of fallen) {
      this.knockOut(slot);
      this.deaths.set(slot, (this.deaths.get(slot) ?? 0) + 1);
      if (by !== null && reason === "coupe") this.kills.set(by, (this.kills.get(by) ?? 0) + 1);
      events.push({ k: "death", slot, by, reason });
    }

    for (const m of moves) {
      const h = m.h;
      if (!m.to || !h.alive) continue;
      h.x = m.to.x;
      h.y = m.to.y;
      if (m.to.twisted) events.push({ k: "twist", slot: h.slot });
      const i = this.index(h.x, h.y);
      if (this.owner[i] === h.slot) {
        if (h.trailLength > 0) {
          const cells = this.capture(h.slot);
          h.trailLength = 0;
          events.push({ k: "capture", slot: h.slot, cells });
        }
      } else {
        this.setTrail(i, h.slot);
        h.trailLength += 1;
      }
    }

    const cells: number[] = [];
    for (const i of this.changed.keys()) cells.push(i, this.owner[i]!, this.trail[i]!);
    this.changed.clear();
    const message: TickMessage = { tick: this.tick, heads: this.publicHeads(), cells, events };
    if (this.useTimers) this.host.emit(message);
    return message;
  }

  private knockOut(slot: number): void {
    const h = this.heads.get(slot);
    if (!h) return;
    h.alive = false;
    h.queue = [];
    h.trailLength = 0;
    h.respawnAt = this.tick + RULES.respawnTicks;
    for (let i = 0; i < this.trail.length; i++) if (this.trail[i] === slot) this.setTrail(i, 0);
  }

  private respawn(h: HeadState): void {
    // De préférence au cœur de son territoire ; sinon un petit carré neuf sur une zone libre.
    const own: number[] = [];
    const deep: number[] = [];
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] !== h.slot) continue;
      own.push(i);
      const x = i % this.size;
      const y = Math.floor(i / this.size);
      const inner = ([0, 1, 2, 3] as Dir[]).every((d) => {
        const n = step(this.surface, this.size, this.size, x, y, d);
        return n && this.owner[this.index(n.x, n.y)] === h.slot;
      });
      if (inner) deep.push(i);
    }
    const pool = deep.length ? deep : own;
    let i: number;
    if (pool.length) {
      i = pool[Math.floor(this.rng() * pool.length)]!;
    } else {
      i = this.findFreeSpot();
      this.claimSquare(h.slot, i % this.size, Math.floor(i / this.size), 1);
    }
    h.x = i % this.size;
    h.y = Math.floor(i / this.size);
    h.alive = true;
    h.queue = [];
    h.trailLength = 0;
  }

  private findFreeSpot(): number {
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = 2 + Math.floor(this.rng() * (this.size - 4));
      const y = 2 + Math.floor(this.rng() * (this.size - 4));
      let free = true;
      for (let dy = -1; dy <= 1 && free; dy++) {
        for (let dx = -1; dx <= 1 && free; dx++) {
          const i = this.index(x + dx, y + dy);
          if (this.owner[i] || this.trail[i]) free = false;
        }
      }
      if (free) return this.index(x, y);
    }
    return this.index(Math.floor(this.size / 2), Math.floor(this.size / 2));
  }

  /**
   * Rentrer chez soi : la traîne devient territoire, puis chaque région que le territoire sépare
   * du reste est conquise, sauf la plus grande. Renvoie le nombre de cases gagnées.
   */
  capture(slot: number): number {
    let gained = 0;
    for (let i = 0; i < this.trail.length; i++) {
      if (this.trail[i] !== slot) continue;
      this.setTrail(i, 0);
      if (this.owner[i] !== slot) gained += 1;
      this.setOwner(i, slot);
    }

    const total = this.owner.length;
    const component = new Int32Array(total).fill(-1);
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let start = 0; start < total; start++) {
      if (this.owner[start] === slot || component[start] !== -1) continue;
      const id = sizes.length;
      let count = 0;
      component[start] = id;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!;
        count += 1;
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
          const n = step(this.surface, this.size, this.size, x, y, d);
          if (!n) continue;
          const j = this.index(n.x, n.y);
          if (this.owner[j] === slot || component[j] !== -1) continue;
          component[j] = id;
          stack.push(j);
        }
      }
      sizes.push(count);
    }

    if (sizes.length > 1) {
      const keep = sizes.indexOf(Math.max(...sizes));
      for (let i = 0; i < total; i++) {
        const c = component[i]!;
        if (c !== -1 && c !== keep) {
          this.setOwner(i, slot);
          gained += 1;
        }
      }
    }
    return gained;
  }

  private publicHeads(): Head[] {
    return [...this.heads.values()].map(({ slot, x, y, dir, alive }) => ({ slot, x, y, dir, alive }));
  }

  // ------------------------------------------------------------ vue

  view(forId: string): TopoView {
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      round: this.round,
      rounds: RULES.rounds,
      surface: this.phase === "lobby" ? null : this.surface,
      surfaces: this.surfaces,
      size: this.size,
      tick: this.tick,
      deadline: this.deadline,
      serverNow: Date.now(),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        slot: p.slot,
        connected: p.connected,
        isHost: p.id === this.hostId,
        ready: p.ready,
      })),
      heads: this.publicHeads(),
      owner: encodeGrid(this.owner),
      trail: encodeGrid(this.trail),
      results: this.results,
    };
  }
}
