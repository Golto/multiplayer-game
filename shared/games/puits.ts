// Puits : physique, règles et messages partagés entre le serveur et le client.
//
// Les vaisseaux n'ont pas de moteur : ils tournent autour d'un soleil et chacun ne peut que poser,
// à chaque tour, un puits de gravité (qui attire) ou un répulseur (qui repousse). Tout le monde
// pose en même temps, puis la physique se joue pendant quelques secondes.
//
// La simulation est déterministe : elle n'utilise que +, −, ×, ÷ et la racine carrée, qui donnent
// le même résultat sur tous les moteurs JavaScript. Le serveur n'envoie donc que les poses, et
// chaque client rejoue le tour à l'identique.

export const RULES = {
  minPlayers: 2,
  maxPlayers: 6,
  rounds: 3,
  /** Tours par manche, au plus. */
  maxTurns: 8,
  planSeconds: 30,
  intermissionSeconds: 15,
  /** Durée simulée d'un tour, en pas de 1/60 s. */
  steps: 180,
  dt: 1 / 60,
  points: { shard: 1, kill: 2, survive: 3 },
} as const;

/** Rayon de l'arène : au-delà, c'est le vide. */
export const ARENA_R = 1000;
export const SUN_R = 60;
const SUN_GM = 4.5e7;
const SUN_SOFT = 30;
export const SHIP_R = 16;
export const SHARD_R = 20;
export const SHARD_COUNT = 6;
export const SPAWN_R = 520;
const MAX_SPEED = 900;

export type WellKind = "puits" | "repulseur";
const WELL_G = 6.5e6;
/** Douceur du puits : sous cette distance, l'attraction ne grandit plus. */
const WELL_SOFT = 70;
/** Force d'un puits selon son âge, en tours ; il disparaît ensuite. */
export const WELL_DECAY = [1, 0.6, 0.3] as const;
/** Pas de puits trop près du soleil ni trop près du vide. */
export const WELL_MIN_R = SUN_R + 60;
export const WELL_MAX_R = ARENA_R - 40;

/** Seuil (en vitesse cumulée) pour qu'une élimination soit attribuée à quelqu'un. */
const BLAME_MIN = 30;

export interface Ship {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

export interface Well {
  slot: number;
  x: number;
  y: number;
  kind: WellKind;
  /** Tours écoulés depuis la pose. */
  age: number;
}

export interface Shard {
  x: number;
  y: number;
}

export interface SimState {
  ships: Ship[];
  wells: Well[];
  shards: Shard[];
  /** Graine du tirage des éclats qui réapparaissent. */
  seed: number;
}

export interface Placement {
  slot: number;
  x: number;
  y: number;
  kind: WellKind;
}

export type SimEvent =
  | { k: "shard"; step: number; slot: number; x: number; y: number }
  /** `by` : joueur qui a le plus poussé la victime, ou 0 (accident). */
  | { k: "death"; step: number; slot: number; by: number; cause: "soleil" | "vide"; x: number; y: number }
  | { k: "bump"; step: number; a: number; b: number; x: number; y: number };

export function validWell(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const r = Math.sqrt(x * x + y * y);
  return r >= WELL_MIN_R && r <= WELL_MAX_R;
}

/** Générateur pseudo-aléatoire sur 32 bits, identique partout. */
function next(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** Tire une position d'éclat dans la couronne jouable, loin des vaisseaux. */
export function drawShard(state: SimState): Shard {
  for (let tries = 0; ; tries++) {
    let a: number;
    let b: number;
    [state.seed, a] = next(state.seed);
    [state.seed, b] = next(state.seed);
    const x = (a * 2 - 1) * 850;
    const y = (b * 2 - 1) * 850;
    const r2 = x * x + y * y;
    if (r2 < 220 * 220 || r2 > 850 * 850) continue;
    const near = state.ships.some((s) => s.alive && (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) < 120 * 120);
    if (near && tries < 40) continue;
    return { x: Math.round(x), y: Math.round(y) };
  }
}

/** Disposition de départ : les vaisseaux sur une même orbite circulaire, régulièrement espacés. */
export function initialState(slots: number[], seed: number, phase: number): SimState {
  const v = Math.sqrt(SUN_GM / SPAWN_R);
  const ships = slots.map((slot, i) => {
    const a = phase + (i / slots.length) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Arrondis : l'état initial voyage en JSON, autant qu'il soit exact.
    return { slot, x: round(c * SPAWN_R), y: round(s * SPAWN_R), vx: round(-s * v), vy: round(c * v), alive: true };
  });
  const state: SimState = { ships, wells: [], shards: [], seed: seed >>> 0 };
  for (let i = 0; i < SHARD_COUNT; i++) state.shards.push(drawShard(state));
  return state;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function cloneState(s: SimState): SimState {
  return {
    ships: s.ships.map((x) => ({ ...x })),
    wells: s.wells.map((x) => ({ ...x })),
    shards: s.shards.map((x) => ({ ...x })),
    seed: s.seed,
  };
}

/**
 * Un tour de simulation. Au départ, les puits existants vieillissent et les nouvelles poses
 * s'ajoutent ; chaque appel à `advance` fait ensuite un pas de 1/60 s.
 */
export class Sim {
  readonly state: SimState;
  step = 0;
  readonly events: SimEvent[] = [];
  /** Pour chaque vaisseau : combien chaque joueur l'a poussé pendant ce tour. */
  private blame = new Map<number, Map<number, number>>();

  constructor(start: SimState, placements: Placement[]) {
    this.state = cloneState(start);
    this.state.wells = this.state.wells
      .map((w) => ({ ...w, age: w.age + 1 }))
      .filter((w) => w.age < WELL_DECAY.length)
      .concat(
        [...placements]
          .filter((p) => validWell(p.x, p.y))
          .sort((a, b) => a.slot - b.slot)
          .map((p) => ({ slot: p.slot, x: p.x, y: p.y, kind: p.kind === "repulseur" ? "repulseur" : "puits", age: 0 }) as Well),
      );
    for (const s of this.state.ships) this.blame.set(s.slot, new Map());
  }

  get done(): boolean {
    return this.step >= RULES.steps || this.state.ships.filter((s) => s.alive).length === 0;
  }

  private push(victim: number, by: number, amount: number): void {
    const b = this.blame.get(victim);
    if (b) b.set(by, (b.get(by) ?? 0) + amount);
  }

  /** Un pas de simulation ; renvoie les événements de ce pas. */
  advance(): SimEvent[] {
    const out: SimEvent[] = [];
    const dt = RULES.dt;
    const ships = this.state.ships.filter((s) => s.alive);

    // Accélérations : soleil, puits et répulseurs (potentiel de Plummer, sans singularité).
    for (const s of ships) {
      let ax = 0;
      let ay = 0;
      {
        const dx = -s.x;
        const dy = -s.y;
        const d2 = dx * dx + dy * dy + SUN_SOFT * SUN_SOFT;
        const k = SUN_GM / (d2 * Math.sqrt(d2));
        ax += dx * k;
        ay += dy * k;
      }
      for (const w of this.state.wells) {
        const dx = w.x - s.x;
        const dy = w.y - s.y;
        const d2 = dx * dx + dy * dy + WELL_SOFT * WELL_SOFT;
        const sign = w.kind === "puits" ? 1 : -1;
        const k = (sign * WELL_G * WELL_DECAY[w.age]!) / (d2 * Math.sqrt(d2));
        const wx = dx * k;
        const wy = dy * k;
        ax += wx;
        ay += wy;
        this.push(s.slot, w.slot, Math.sqrt(wx * wx + wy * wy) * dt);
      }
      // Euler semi-implicite : stable sur une orbite.
      s.vx += ax * dt;
      s.vy += ay * dt;
      const v2 = s.vx * s.vx + s.vy * s.vy;
      if (v2 > MAX_SPEED * MAX_SPEED) {
        const f = MAX_SPEED / Math.sqrt(v2);
        s.vx *= f;
        s.vy *= f;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    // Chocs élastiques entre vaisseaux de même masse : c'est là que naissent les réactions en chaîne.
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i]!;
        const b = ships[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * SHIP_R * SHIP_R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          a.vx -= rel * nx;
          a.vy -= rel * ny;
          b.vx += rel * nx;
          b.vy += rel * ny;
          this.transfer(b.slot, a.slot, rel);
          this.transfer(a.slot, b.slot, rel);
          out.push({ k: "bump", step: this.step, a: a.slot, b: b.slot, x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) });
        }
        // On sépare les deux coques pour qu'elles ne restent pas collées.
        const overlap = (2 * SHIP_R - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
      }
    }

    for (const s of ships) {
      // Éclats.
      for (let k = 0; k < this.state.shards.length; k++) {
        const sh = this.state.shards[k]!;
        const dx = sh.x - s.x;
        const dy = sh.y - s.y;
        if (dx * dx + dy * dy < (SHIP_R + SHARD_R) * (SHIP_R + SHARD_R)) {
          out.push({ k: "shard", step: this.step, slot: s.slot, x: sh.x, y: sh.y });
          this.state.shards[k] = drawShard(this.state);
        }
      }
      // Soleil et vide.
      const r2 = s.x * s.x + s.y * s.y;
      const cause = r2 < (SUN_R + SHIP_R * 0.5) ** 2 ? "soleil" : r2 > ARENA_R * ARENA_R ? "vide" : null;
      if (cause) {
        s.alive = false;
        out.push({ k: "death", step: this.step, slot: s.slot, by: this.culprit(s.slot), cause, x: round(s.x), y: round(s.y) });
      }
    }

    this.step += 1;
    this.events.push(...out);
    return out;
  }

  /**
   * Le choc transmet la responsabilité : `victim` est poussé par le vaisseau `by`, et pour moitié
   * par ceux qui avaient poussé `by` jusque-là.
   */
  private transfer(victim: number, by: number, amount: number): void {
    const before = this.blame.get(by);
    this.push(victim, by, amount * 0.5);
    let total = 0;
    for (const [, v] of before ?? []) total += v;
    if (!before || total <= 0) {
      this.push(victim, by, amount * 0.5);
      return;
    }
    for (const [who, v] of [...before]) this.push(victim, who, (amount * 0.5 * v) / total);
  }

  private culprit(victim: number): number {
    let best = 0;
    let most = BLAME_MIN;
    for (const [who, v] of this.blame.get(victim) ?? []) {
      if (who !== victim && v > most) {
        best = who;
        most = v;
      }
    }
    return best;
  }
}

export function runTurn(start: SimState, placements: Placement[]): { state: SimState; events: SimEvent[] } {
  const sim = new Sim(start, placements);
  while (!sim.done) sim.advance();
  return { state: sim.state, events: sim.events };
}

/** Trajectoires prévues (un point tous les `every` pas), pour l'aperçu pendant la planification. */
export function predict(start: SimState, placements: Placement[], every = 3): Map<number, number[]> {
  const sim = new Sim(start, placements);
  const paths = new Map<number, number[]>();
  for (const s of sim.state.ships) if (s.alive) paths.set(s.slot, [s.x, s.y]);
  while (!sim.done) {
    sim.advance();
    if (sim.step % every === 0 || sim.done) {
      for (const s of sim.state.ships) if (s.alive) paths.get(s.slot)?.push(s.x, s.y);
    }
  }
  // Le dernier point d'un vaisseau perdu : là où il disparaît.
  for (const e of sim.events) if (e.k === "death") paths.get(e.slot)?.push(e.x, e.y);
  return paths;
}

// ---------------------------------------------------------------- état et messages

export type Phase = "lobby" | "plan" | "resolve" | "intermission" | "final";

export interface PuitsPlayer {
  id: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
  /** A posé (ou passé) pour ce tour. */
  locked: boolean;
  /** Prêt pour la manche suivante. */
  ready: boolean;
}

export interface RoundScore {
  shards: number;
  kills: number;
  survived: boolean;
  points: number;
}

export interface RoundResult {
  round: number;
  turns: number;
  scores: Record<number, RoundScore>;
}

export interface PuitsView {
  code: string;
  you: string;
  phase: Phase;
  round: number;
  rounds: number;
  turn: number;
  maxTurns: number;
  players: PuitsPlayer[];
  /** Pendant la planification : l'état courant ; pendant la résolution : l'état au début du tour. */
  sim: SimState;
  /** Planification : ta pose seulement ; résolution : toutes les poses du tour. */
  placements: Placement[];
  /** Scores de la manche en cours. */
  scores: Record<number, RoundScore>;
  results: RoundResult[];
  deadline: number | null;
  serverNow: number;
}

export type PuitsAction =
  | { t: "start" }
  | { t: "place"; x: number; y: number; kind: WellKind }
  | { t: "pass" }
  | { t: "ready" }
  | { t: "rematch" };

/** Total des points d'un joueur sur les manches jouées et la manche en cours. */
export function totalPoints(view: Pick<PuitsView, "results" | "scores" | "phase">, slot: number): number {
  const done = view.results.reduce((s, r) => s + (r.scores[slot]?.points ?? 0), 0);
  // Pendant la manche, les points en cours s'ajoutent ; une fois la manche close, ils sont dans `results`.
  const live = view.phase === "plan" || view.phase === "resolve" ? (view.scores[slot]?.points ?? 0) : 0;
  return done + live;
}
