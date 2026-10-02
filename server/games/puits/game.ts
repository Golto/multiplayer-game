// Logique d'une partie de Puits : tours simultanés, puis physique partagée.
//
// Pendant la planification, chacun pose un puits ou un répulseur sans voir les poses des autres.
// Quand tout le monde a posé (ou que le temps est écoulé), le serveur joue le tour, envoie l'état
// de départ et les poses, et chaque client rejoue la même simulation pendant que le serveur attend
// la fin de l'animation. Un joueur éliminé continue de poser : ses puits gênent toujours.

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  RULES,
  initialState,
  runTurn,
  validWell,
  type Phase,
  type Placement,
  type PuitsAction,
  type PuitsView,
  type RoundResult,
  type RoundScore,
  type SimEvent,
  type SimState,
} from "../../../shared/games/puits.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

/** Durée de planification ; PUITS_PLAN_SECONDS la raccourcit pour les tests de bout en bout. */
const PLAN_SECONDS = Number(process.env.PUITS_PLAN_SECONDS) || RULES.planSeconds;
/** Temps laissé aux clients pour jouer l'animation du tour, plus une courte pause. */
const RESOLVE_MS = (RULES.steps * RULES.dt + 1.2) * 1000;

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  ready: boolean;
}

export class PuitsGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  round = 0;
  turn = 0;
  sim: SimState = { ships: [], wells: [], shards: [], seed: 1 };
  /** Poses du tour en cours, par slot ; `null` : le joueur passe. */
  placements = new Map<number, Placement | null>();
  /** Poses du tour joué, montrées pendant la résolution. */
  played: Placement[] = [];
  /** État obtenu à la fin du tour joué, appliqué quand l'animation est finie. */
  private after: { state: SimState; events: SimEvent[] } | null = null;
  scores = new Map<number, RoundScore>();
  results: RoundResult[] = [];
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
    // Un absent ne bloque personne.
    this.checkPlanned();
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
    const a = action as PuitsAction;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "start":
        return this.start(playerId);
      case "place":
        return this.place(p, Number(a.x), Number(a.y), a.kind);
      case "pass":
        return this.pass(p);
      case "ready":
        if (this.phase !== "intermission") return;
        p.ready = true;
        this.host.changed();
        return this.checkReady();
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
    this.round = 0;
    this.beginRound();
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
    this.host.changed();
  }

  beginRound(): void {
    this.dispose();
    const slots = this.players.map((p) => p.slot);
    this.sim = initialState(slots, Math.floor(this.rng() * 2 ** 32), this.rng() * Math.PI * 2);
    this.scores = new Map(slots.map((s) => [s, { shards: 0, kills: 0, survived: false, points: 0 }]));
    for (const p of this.players) p.ready = false;
    this.turn = 0;
    this.beginPlan();
  }

  beginPlan(): void {
    this.dispose();
    this.phase = "plan";
    this.placements.clear();
    this.played = [];
    this.deadline = Date.now() + PLAN_SECONDS * 1000;
    if (this.useTimers) this.timer = setTimeout(() => this.resolve(), PLAN_SECONDS * 1000);
    this.host.changed();
  }

  place(p: Player, x: number, y: number, kind: unknown): void {
    if (this.phase !== "plan") return;
    if (this.placements.has(p.slot)) throw new GameError("Tu as déjà posé pour ce tour.");
    if (!validWell(x, y)) throw new GameError("Pas si près du soleil ni du bord.");
    this.placements.set(p.slot, { slot: p.slot, x: Math.round(x), y: Math.round(y), kind: kind === "repulseur" ? "repulseur" : "puits" });
    this.host.changed();
    this.checkPlanned();
  }

  pass(p: Player): void {
    if (this.phase !== "plan" || this.placements.has(p.slot)) return;
    this.placements.set(p.slot, null);
    this.host.changed();
    this.checkPlanned();
  }

  private checkPlanned(): void {
    if (this.phase !== "plan") return;
    const active = this.players.filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => this.placements.has(p.slot))) this.resolve();
  }

  /** Joue le tour : les clients reçoivent l'état de départ et les poses, et l'animent. */
  resolve(): void {
    if (this.phase !== "plan") return;
    this.dispose();
    this.played = [...this.placements.values()].filter((x): x is Placement => !!x).sort((a, b) => a.slot - b.slot);
    this.after = runTurn(this.sim, this.played);
    for (const e of this.after.events) {
      if (e.k === "shard") this.score(e.slot, "shards");
      if (e.k === "death" && e.by) this.score(e.by, "kills");
    }
    this.phase = "resolve";
    this.deadline = Date.now() + RESOLVE_MS;
    if (this.useTimers) this.timer = setTimeout(() => this.afterResolve(), RESOLVE_MS);
    this.host.changed();
  }

  afterResolve(): void {
    if (this.phase !== "resolve" || !this.after) return;
    this.sim = this.after.state;
    this.after = null;
    this.turn += 1;
    const alive = this.sim.ships.filter((s) => s.alive).length;
    if (alive <= 1 || this.turn >= RULES.maxTurns) this.endRound();
    else this.beginPlan();
  }

  endRound(): void {
    this.dispose();
    for (const s of this.sim.ships) {
      const sc = this.scores.get(s.slot);
      if (sc && s.alive) {
        sc.survived = true;
        sc.points += RULES.points.survive;
      }
    }
    this.results.push({ round: this.round, turns: this.turn, scores: Object.fromEntries([...this.scores].map(([k, v]) => [k, { ...v }])) });
    for (const p of this.players) p.ready = false;
    this.played = [];
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

  private score(slot: number, what: "shards" | "kills"): void {
    const sc = this.scores.get(slot);
    if (!sc) return;
    sc[what] += 1;
    sc.points += what === "shards" ? RULES.points.shard : RULES.points.kill;
  }

  view(forId: string): PuitsView {
    const me = this.players.find((p) => p.id === forId);
    const mine = me ? this.placements.get(me.slot) : undefined;
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      round: this.round,
      rounds: RULES.rounds,
      turn: this.turn,
      maxTurns: RULES.maxTurns,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        slot: p.slot,
        connected: p.connected,
        isHost: p.id === this.hostId,
        locked: this.placements.has(p.slot),
        ready: p.ready,
      })),
      sim: this.sim,
      // Les poses des autres restent secrètes jusqu'à la résolution.
      placements: this.phase === "resolve" ? this.played : mine ? [mine] : [],
      // Pendant la résolution, les points du tour n'apparaissent qu'à la fin de l'animation côté
      // client : on envoie quand même le total, le client sait le différer.
      scores: Object.fromEntries([...this.scores].map(([k, v]) => [k, { ...v }])),
      results: this.results,
      deadline: this.deadline,
      serverNow: Date.now(),
    };
  }
}
