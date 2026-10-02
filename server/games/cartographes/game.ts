// Logique d'une partie de Cartographes : tours simultanés, information cachée, carte commune.
//
// Pendant un tour, chacun prépare en secret un message de pictogrammes et quelques coups de
// pinceau dans la zone qu'il peint. Quand tout le monde a fini (ou que le temps est écoulé), les
// coups de pinceau s'appliquent et les messages s'affichent ensemble.

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  RULES,
  isPicto,
  isTerrain,
  setupMap,
  zoneCells,
  zoneOf,
  type CartoAction,
  type CartoView,
  type Message,
  type Phase,
  type Submission,
  type Terrain,
  type Zone,
} from "../../../shared/games/cartographes.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

/** Durée d'un tour ; CARTO_TURN_SECONDS la raccourcit pour les tests de bout en bout. */
const TURN_SECONDS = Number(process.env.CARTO_TURN_SECONDS) || RULES.turnSeconds;

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
}

export class CartoGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  turn = 0;
  cols = 0;
  rows = 0;
  zones: Zone[] = [];
  truth: Terrain[] = [];
  painted: (Terrain | null)[] = [];
  log: Message[] = [];
  /** Ce que chacun a envoyé pour le tour en cours, par slot. */
  pending = new Map<number, Submission>();
  spoken = new Map<number, number>();
  deadline: number | null = null;
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
    if (!connected && this.hostId === playerId) {
      const next = this.players.find((x) => x.connected && x.id !== playerId);
      if (next) this.hostId = next.id;
    }
    this.host.changed();
    // Un absent ne bloque personne.
    this.checkTurn();
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
    const a = action as CartoAction;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "start":
        return this.start(playerId);
      case "end":
        return this.submit(p, a);
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
    // L'ordre de la chaîne « je vois → tu peins » est tiré au sort.
    const order = this.players.map((p) => p.slot);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const map = setupMap(order, Math.floor(this.rng() * 2 ** 32));
    this.cols = map.cols;
    this.rows = map.rows;
    this.zones = map.zones;
    this.truth = map.truth;
    // Les zones de repère sont déjà dessinées.
    this.painted = this.truth.map((t, i) => (zoneOf(this.zones, this.cols, i)?.charted ? t : null));
    this.log = [];
    this.spoken.clear();
    this.turn = 0;
    this.beginTurn();
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

  beginTurn(): void {
    this.dispose();
    this.phase = "turn";
    this.pending.clear();
    this.deadline = Date.now() + TURN_SECONDS * 1000;
    if (this.useTimers) this.timer = setTimeout(() => this.resolve(), TURN_SECONDS * 1000);
    this.host.changed();
  }

  submit(p: Player, a: Partial<Submission>): void {
    if (this.phase !== "turn") return;
    if (this.pending.has(p.slot)) throw new GameError("Tu as déjà fini ce tour.");
    const pictos = Array.isArray(a.pictos) ? a.pictos.filter(isPicto).slice(0, RULES.message) : [];
    const mine = new Set(this.zones.filter((z) => z.painter === p.slot).flatMap((z) => zoneCells(z, this.cols)));
    const paints: [number, Terrain][] = [];
    const seen = new Set<number>();
    for (const entry of Array.isArray(a.paints) ? a.paints : []) {
      if (!Array.isArray(entry)) continue;
      const [cell, terrain] = entry as [unknown, unknown];
      const i = Number(cell);
      if (!Number.isInteger(i) || !mine.has(i) || !isTerrain(terrain) || seen.has(i)) continue;
      seen.add(i);
      paints.push([i, terrain]);
    }
    if (paints.length > RULES.paints) throw new GameError(`Pas plus de ${RULES.paints} cases par tour.`);
    this.pending.set(p.slot, { pictos, paints, done: !!a.done });
    this.host.changed();
    this.checkTurn();
  }

  private checkTurn(): void {
    if (this.phase !== "turn") return;
    const active = this.players.filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => this.pending.has(p.slot))) this.resolve();
  }

  /** Fin du tour : on peint, on affiche les messages, puis tour suivant ou fin de partie. */
  resolve(): void {
    if (this.phase !== "turn") return;
    this.dispose();
    const subs = [...this.pending].sort(([a], [b]) => a - b);
    for (const [, s] of subs) for (const [i, t] of s.paints) this.painted[i] = t;
    for (const [slot, s] of subs) {
      if (!s.pictos.length) continue;
      this.log.push({ turn: this.turn, slot, pictos: s.pictos });
      this.spoken.set(slot, (this.spoken.get(slot) ?? 0) + s.pictos.length);
    }
    const active = this.players.filter((p) => p.connected);
    const allDone = active.length > 0 && active.every((p) => this.pending.get(p.slot)?.done);
    this.turn += 1;
    if (allDone || this.turn >= RULES.turns) {
      this.phase = "final";
      this.deadline = null;
      this.pending.clear();
      this.host.changed();
    } else {
      this.beginTurn();
    }
  }

  view(forId: string): CartoView {
    const me = this.players.find((p) => p.id === forId);
    const final = this.phase === "final";
    const visible = new Set<number>();
    for (const z of this.zones) if (z.charted || z.viewer === me?.slot) for (const i of zoneCells(z, this.cols)) visible.add(i);
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      turn: this.turn,
      turns: RULES.turns,
      cols: this.cols,
      rows: this.rows,
      zones: this.zones,
      // Le terrain des autres zones ne quitte jamais le serveur avant la fin.
      truth: this.truth.map((t, i) => (final || visible.has(i) ? t : null)),
      painted: this.painted,
      log: this.log,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        slot: p.slot,
        connected: p.connected,
        isHost: p.id === this.hostId,
        locked: this.pending.has(p.slot),
        done: !!this.pending.get(p.slot)?.done,
      })),
      mine: me ? (this.pending.get(me.slot) ?? null) : null,
      spoken: Object.fromEntries(this.spoken),
      deadline: this.deadline,
      serverNow: Date.now(),
    };
  }
}
