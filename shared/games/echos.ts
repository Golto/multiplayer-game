// Échos : salles, déplacements, plaques et portes, règles et messages partagés.
//
// Chaque manche dure 30 secondes. À la fin d'une manche, ce que chacun a joué est enregistré (une
// direction par pas de simulation) et rejoué à la manche suivante par un « écho », à côté de son
// auteur. En coopération, il faut couvrir en même temps toutes les plaques dorées d'une salle ;
// en versus, chaque instant passé seul sur une plaque rapporte des points, et les corps des
// différents joueurs se bousculent, échos compris.
//
// Le serveur fait autorité : il simule tout, échos compris, et diffuse les positions. Le client
// prédit seulement son propre corps, avec les mêmes fonctions de déplacement.

export const RULES = {
  minPlayers: 2,
  maxPlayers: 6,
  /** Un pas de simulation. */
  tickMs: 50,
  /** Une manche : 30 s. */
  roundTicks: 600,
  /** Manches par salle en coopération, avant le paradoxe. */
  maxRounds: 4,
  /** Manches d'une partie en versus. */
  versusRounds: 4,
  briefingMs: 3500,
  rewindMs: 2600,
  clearedMs: 4200,
  /** Vitesse, en cases par pas (4,4 cases par seconde). */
  speed: 0.22,
  radius: 0.34,
} as const;

export type Mode = "coop" | "versus";

// ---------------------------------------------------------------- salles
//
// '#' mur · '.' sol · 'S' départ (coop) · '1'…'6' départs (versus)
// '+' plaque dorée possible, choisie en priorité · '*' plaque dorée possible
// 'a' 'b' 'c' plaques de porte · 'A' 'B' 'C' portes, ouvertes tant qu'une plaque de leur lettre est tenue
// 'o' plaque neutre possible (versus)

export interface Level {
  id: string;
  name: string;
  hint: string;
  rows: string[];
}

export const LEVELS: Level[] = [
  {
    id: "vestibule",
    name: "Le vestibule",
    hint: "Pas de piège : il y a simplement plus de plaques que de joueurs. Laisse des échos derrière toi.",
    rows: [
      "############################",
      "#..........................#",
      "#..*......*........*....*..#",
      "#..........................#",
      "#.....######......######...#",
      "#..*..#....#..+...#....#.*.#",
      "#.....#.+..#......#..+.#...#",
      "#.....#....#......#....#...#",
      "#..........................#",
      "#.*........SSSSSS.......*..#",
      "#..........................#",
      "#.....#....#......#....#...#",
      "#..*..#.+..#..+...#..+.#.*.#",
      "#.....######......######...#",
      "#..........................#",
      "#..*.......*......*......*.#",
      "#..........................#",
      "############################",
    ],
  },
  {
    id: "porte",
    name: "La porte",
    hint: "La porte bleue ne s'ouvre que si quelqu'un tient la plaque bleue. Ce quelqu'un peut être un écho.",
    rows: [
      "############################",
      "#............#.............#",
      "#..*.........#...+.....+...#",
      "#............#.............#",
      "#............A......+......#",
      "#..a.........A.............#",
      "#....*.......#...+.....+...#",
      "#............#.............#",
      "#..SSSSSS....#######A#######",
      "#............#.............#",
      "#....*.......#..+.......+..#",
      "#............#.............#",
      "#..*.........#.....+.......#",
      "#.......*....#.............#",
      "#............#..+......+...#",
      "#.......a....#.............#",
      "#............#.............#",
      "############################",
    ],
  },
  {
    id: "ailes",
    name: "Les deux ailes",
    hint: "La plaque du hall ouvre l'aile droite ; la plaque de l'aile droite ouvre l'aile gauche.",
    rows: [
      "############################",
      "#........#.......#.........#",
      "#..+..+..#...*...#..+...+..#",
      "#........#.......#.........#",
      "#..+.....A...b...B.....+...#",
      "#........A.......B.........#",
      "#...+....#.......#....a....#",
      "#........#..SSS..#.........#",
      "#..+.....#..SSS..#...+..+..#",
      "#........#.......#.........#",
      "#....+...#...*...#.....+...#",
      "#........#.......#.........#",
      "#..+.....#.......#...+.....#",
      "#........#...*...#.........#",
      "#...+....#.......#..+......#",
      "#........#.......#.........#",
      "#........#.......#.........#",
      "############################",
    ],
  },
  {
    id: "sas",
    name: "Le sas",
    hint: "Deux portes de suite : la première s'ouvre du dehors, la seconde depuis l'intérieur du sas.",
    rows: [
      "############################",
      "#..........................#",
      "#.*....*.....a.....*....*..#",
      "#..........................#",
      "#...########AA########.....#",
      "#...#................#..*..#",
      "#.*.#..+....b....+...#.....#",
      "#...#................#.....#",
      "#...#######BB#########..*..#",
      "#...#..+........+....#.....#",
      "#.*.#.......+........#.....#",
      "#...#..+........+....#..*..#",
      "#...##################.....#",
      "#..........................#",
      "#..SSSSSS..........*....*..#",
      "#..........................#",
      "#.*.....*......*...........#",
      "############################",
    ],
  },
  {
    id: "coeur",
    name: "Le cœur",
    hint: "Trois portes sur la chambre centrale, trois plaques aux quatre coins du monde. Ou presque.",
    rows: [
      "############################",
      "#a........................b#",
      "#..*.......*....*.......*..#",
      "#..........................#",
      "#.....#######AA#######.....#",
      "#..*..#..............#..*..#",
      "#.....#..+........+..#.....#",
      "#.....C......++......B.....#",
      "#.....C......++......B.....#",
      "#.....#..+........+..#.....#",
      "#..*..#..............#..*..#",
      "#.....################.....#",
      "#..........................#",
      "#..*.....SSSSSS.......*....#",
      "#..........................#",
      "#.c........*.......*.......#",
      "#..........................#",
      "############################",
    ],
  },
];

export const ARENA: Level = {
  id: "arene",
  name: "L'arène",
  hint: "Chaque instant passé seul sur une plaque rapporte des points. Tes échos gardent tes plaques… et gênent les autres.",
  rows: [
    "############################",
    "#1........................2#",
    "#.....o..............o.....#",
    "#..........................#",
    "#...####....#....#....####.#",
    "#...#.......#.o..#.......#.#",
    "#...#..o....#....#....o..#.#",
    "#..........................#",
    "#3.......o....##....o.....4#",
    "#.............##...........#",
    "#..........................#",
    "#...#..o....#....#....o..#.#",
    "#...#.......#..o.#.......#.#",
    "#...####....#....#....####.#",
    "#..........................#",
    "#.....o..............o.....#",
    "#5........................6#",
    "############################",
  ],
};

// ---------------------------------------------------------------- lecture d'une salle

export interface Plate {
  index: number;
  x: number;
  y: number;
  kind: "gold" | "door" | "neutral";
  /** Lettre de la porte commandée (plaques de porte). */
  letter?: string;
}

export interface Arena {
  w: number;
  h: number;
  rows: string[];
  plates: Plate[];
  /** Cases de chaque porte, par lettre. */
  doors: Map<string, [number, number][]>;
  /** Départs, dans l'ordre des joueurs. */
  spawns: [number, number][];
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], r: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Nombre de plaques dorées d'une salle : deux par joueur, donc au moins deux manches. */
export function goldCount(players: number): number {
  return players * 2;
}

/**
 * Choisit les plaques d'une partie dans les emplacements possibles : en coopération, deux par
 * joueur (moitié parmi les emplacements prioritaires) ; en versus, deux de plus que de joueurs.
 * Le résultat est une salle « figée », que le client lit telle quelle.
 */
export function prepare(level: Level, players: number, seed: number, mode: Mode): string[] {
  const r = rng(seed);
  const cells = level.rows.map((row) => [...row]);
  const slots = (chars: string) => {
    const out: [number, number][] = [];
    cells.forEach((row, y) => row.forEach((ch, x) => chars.includes(ch) && out.push([x, y])));
    return out;
  };
  const chosen = new Set<string>();
  if (mode === "coop") {
    const want = goldCount(players);
    const first = shuffle(slots("+"), r);
    const second = shuffle(slots("*"), r);
    const fromFirst = Math.min(first.length, Math.ceil(want / 2));
    const pick = [...first.slice(0, fromFirst), ...second.slice(0, want - fromFirst)];
    if (pick.length < want) pick.push(...first.slice(fromFirst, fromFirst + want - pick.length));
    for (const [x, y] of pick) chosen.add(`${x},${y}`);
    cells.forEach((row, y) =>
      row.forEach((ch, x) => {
        if (ch === "+" || ch === "*") row[x] = chosen.has(`${x},${y}`) ? "*" : ".";
      }),
    );
  } else {
    for (const [x, y] of shuffle(slots("o"), r).slice(0, players + 2)) chosen.add(`${x},${y}`);
    cells.forEach((row, y) =>
      row.forEach((ch, x) => {
        if (ch === "o") row[x] = chosen.has(`${x},${y}`) ? "o" : ".";
        // Seuls les départs des joueurs présents restent.
        if (ch >= "1" && ch <= "6") row[x] = Number(ch) <= players ? ch : ".";
      }),
    );
  }
  return cells.map((row) => row.join(""));
}

export function parseArena(rows: string[]): Arena {
  const plates: Plate[] = [];
  const doors = new Map<string, [number, number][]>();
  const coop: [number, number][] = [];
  const versus: [number, [number, number]][] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "*") plates.push({ index: plates.length, x, y, kind: "gold" });
      else if (ch === "o") plates.push({ index: plates.length, x, y, kind: "neutral" });
      else if (ch >= "a" && ch <= "c") plates.push({ index: plates.length, x, y, kind: "door", letter: ch.toUpperCase() });
      else if (ch >= "A" && ch <= "C") doors.set(ch, [...(doors.get(ch) ?? []), [x, y]]);
      else if (ch === "S") coop.push([x, y]);
      else if (ch >= "1" && ch <= "6") versus.push([Number(ch), [x, y]]);
    }),
  );
  const spawns = coop.length ? coop : versus.sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  return { w: rows[0]?.length ?? 0, h: rows.length, rows, plates, doors, spawns };
}

// ---------------------------------------------------------------- déplacements

/** 0 : immobile ; 1 à 16 : seize directions, 1 vers la droite, dans le sens des aiguilles d'une montre. */
export const DIRS: [number, number][] = [[0, 0]];
for (let k = 0; k < 16; k++) {
  const a = (k * Math.PI) / 8;
  DIRS.push([Math.round(Math.cos(a) * 1e6) / 1e6, Math.round(Math.sin(a) * 1e6) / 1e6]);
}

/** Direction la plus proche d'un vecteur (manette, flèches). */
export function dirOf(dx: number, dy: number): number {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI * 2;
  return (Math.round(a / (Math.PI / 8)) % 16) + 1;
}

export interface Body {
  x: number;
  y: number;
}

function solid(arena: Arena, tx: number, ty: number, open: Set<string>, escape: Set<number>): boolean {
  if (tx < 0 || ty < 0 || tx >= arena.w || ty >= arena.h) return true;
  const ch = arena.rows[ty]![tx]!;
  if (ch === "#") return true;
  if (ch >= "A" && ch <= "C") return !open.has(ch) && !escape.has(ty * arena.w + tx);
  return false;
}

/** Portes fermées sur lesquelles le corps se trouve déjà : il peut en sortir. */
export function trapped(arena: Arena, b: Body, open: Set<string>): Set<number> {
  const out = new Set<number>();
  const r = RULES.radius;
  for (let ty = Math.floor(b.y - r); ty <= Math.floor(b.y + r); ty++) {
    for (let tx = Math.floor(b.x - r); tx <= Math.floor(b.x + r); tx++) {
      const ch = arena.rows[ty]?.[tx];
      if (!ch || ch < "A" || ch > "C" || open.has(ch)) continue;
      // Un vrai chevauchement, pas un simple contact.
      const cx = Math.max(tx, Math.min(b.x, tx + 1));
      const cy = Math.max(ty, Math.min(b.y, ty + 1));
      if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < (r - 1e-3) ** 2) out.add(ty * arena.w + tx);
    }
  }
  return out;
}

/** Repousse un corps hors des murs et des portes fermées qu'il chevauche. */
export function pushOut(arena: Arena, b: Body, open: Set<string>, escape: Set<number>): void {
  const r = RULES.radius;
  for (let pass = 0; pass < 2; pass++) {
    for (let ty = Math.floor(b.y - r); ty <= Math.floor(b.y + r); ty++) {
      for (let tx = Math.floor(b.x - r); tx <= Math.floor(b.x + r); tx++) {
        if (!solid(arena, tx, ty, open, escape)) continue;
        const cx = Math.max(tx, Math.min(b.x, tx + 1));
        const cy = Math.max(ty, Math.min(b.y, ty + 1));
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        if (d > 1e-9) {
          b.x += (dx / d) * (r - d);
          b.y += (dy / d) * (r - d);
        } else {
          // Centre dans la case : on sort par le côté le plus proche.
          const left = b.x - tx;
          const right = tx + 1 - b.x;
          const top = b.y - ty;
          const bottom = ty + 1 - b.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) b.x = tx - r;
          else if (m === right) b.x = tx + 1 + r;
          else if (m === top) b.y = ty - r;
          else b.y = ty + 1 + r;
        }
      }
    }
  }
}

/** Un pas de déplacement, murs et portes fermées compris. */
export function move(arena: Arena, b: Body, dir: number, open: Set<string>, scale = 1): void {
  const d = DIRS[dir] ?? DIRS[0]!;
  if (!dir) return;
  const escape = trapped(arena, b, open);
  b.x += d[0] * RULES.speed * scale;
  b.y += d[1] * RULES.speed * scale;
  pushOut(arena, b, open, escape);
}

/** Plaques sous au moins un corps : le centre du corps est dans la case. */
export function pressedBy(arena: Arena, bodies: Body[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  bodies.forEach((b, k) => {
    const tx = Math.floor(b.x);
    const ty = Math.floor(b.y);
    for (const p of arena.plates) if (p.x === tx && p.y === ty) out.set(p.index, [...(out.get(p.index) ?? []), k]);
  });
  return out;
}

export function openDoors(arena: Arena, pressed: Iterable<number>): Set<string> {
  const open = new Set<string>();
  for (const i of pressed) {
    const p = arena.plates[i];
    if (p?.kind === "door" && p.letter) open.add(p.letter);
  }
  return open;
}

/** Départ d'un corps : la case de départ de son joueur, au centre. */
export function spawnOf(arena: Arena, order: number): Body {
  const s = arena.spawns[order % Math.max(1, arena.spawns.length)] ?? [1, 1];
  return { x: s[0] + 0.5, y: s[1] + 0.5 };
}

// ---------------------------------------------------------------- état et messages

export type Phase = "lobby" | "briefing" | "round" | "rewind" | "cleared" | "final";

export interface EchoPlayer {
  id: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
}

export interface BodyInfo {
  owner: number;
  /** 0 : le joueur en direct ; n : l'écho de sa n-ième manche. */
  echo: number;
}

export interface LevelResult {
  level: string;
  /** Manches jouées pour réussir (paradoxes compris). */
  rounds: number;
  paradoxes: number;
  /** Pas écoulés dans la manche gagnante. */
  ticks: number;
}

export interface EchoView {
  code: string;
  you: string;
  phase: Phase;
  mode: Mode;
  level: number;
  levels: number;
  levelName: string;
  levelHint: string;
  rows: string[];
  round: number;
  maxRounds: number;
  bodies: BodyInfo[];
  /** Pour chaque écho, le parcours de la manche d'où il vient (centièmes de case) ; vide pour les vivants. */
  traces: number[][];
  /** Positions des corps (x, y entrelacés, en centièmes de case). */
  positions: number[];
  pressed: number[];
  tick: number;
  paradoxes: number;
  results: LevelResult[];
  /** Versus : pas passés seul sur une plaque, par slot, au total et par manche. */
  points: Record<number, number>;
  roundPoints: Record<number, number>[];
  deadline: number | null;
  serverNow: number;
  players: EchoPlayer[];
}

/** Un pas de simulation, diffusé à tous. */
export interface TickMessage {
  k: "t";
  t: number;
  /** Positions en centièmes de case, dans l'ordre de `bodies`. */
  p: number[];
  /** Plaques tenues. */
  on: number[];
  /** Versus : points de la manche par slot, tous les dix pas. */
  s?: Record<number, number>;
}

export type EchoAction =
  | { t: "configure"; mode: Mode }
  | { t: "start" }
  | { t: "input"; d: number }
  | { t: "paradox" }
  | { t: "rematch" };

export function stars(r: Pick<LevelResult, "rounds" | "paradoxes">): number {
  if (r.paradoxes > 0) return 1;
  return r.rounds <= 2 ? 3 : r.rounds === 3 ? 2 : 1;
}
