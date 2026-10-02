// Topologie : surfaces, règles et messages partagés entre le serveur et le client.
//
// Chaque plateau est un carré W × H dont les bords opposés sont recollés. La même fonction `step`
// sert au serveur (déplacements, remplissage) et au client (marges fantômes qui montrent ce qu'il
// y a de l'autre côté d'un bord).

export type SurfaceId = "tore" | "mobius" | "klein" | "projectif" | "cylindre" | "sphere";

/**
 * Recollement d'une paire de bords : droit, retourné (miroir), mur infranchissable, ou « adjacent »
 * (sphère) : le haut se recolle à la gauche et le bas à la droite, en tournant d'un quart de tour.
 */
export type Gluing = "droit" | "retourne" | "mur" | "adjacent";

export interface SurfaceInfo {
  id: SurfaceId;
  name: string;
  /** Bords gauche et droit. */
  sides: Gluing;
  /** Bords haut et bas. */
  ends: Gluing;
  orientable: boolean;
  /** Caractéristique d'Euler. */
  euler: number;
  /** Ce qu'il faut savoir pour jouer, en une phrase. */
  hint: string;
}

export const SURFACES: Record<SurfaceId, SurfaceInfo> = {
  tore: {
    id: "tore",
    name: "Tore",
    sides: "droit",
    ends: "droit",
    orientable: true,
    euler: 0,
    hint: "Sortir d'un côté fait rentrer de l'autre, sans surprise. Mais une boucle qui fait le tour du plateau n'enferme rien.",
  },
  mobius: {
    id: "mobius",
    name: "Ruban de Möbius",
    sides: "retourne",
    ends: "mur",
    orientable: false,
    euler: 0,
    hint: "Le haut et le bas sont des murs. Passer à gauche ou à droite te fait revenir de l'autre côté, la tête en bas.",
  },
  klein: {
    id: "klein",
    name: "Bouteille de Klein",
    sides: "droit",
    ends: "retourne",
    orientable: false,
    euler: 0,
    hint: "Gauche et droite se recollent normalement. Passer par le haut te ramène en bas, inversé de gauche à droite.",
  },
  projectif: {
    id: "projectif",
    name: "Plan projectif",
    sides: "retourne",
    ends: "retourne",
    orientable: false,
    euler: 1,
    hint: "Tous les bords se recollent en miroir : chaque sortie te renvoie de l'autre côté, inversé.",
  },
  cylindre: {
    id: "cylindre",
    name: "Cylindre",
    sides: "droit",
    ends: "mur",
    orientable: true,
    euler: 0,
    hint: "Gauche et droite se recollent ; le haut et le bas sont des murs. Une boucle qui fait le tour du cylindre n'enferme rien.",
  },
  sphere: {
    id: "sphere",
    name: "Sphère",
    sides: "adjacent",
    ends: "adjacent",
    orientable: true,
    euler: 2,
    hint: "Le haut se recolle à la gauche, le bas à la droite : en passant un bord, tu tournes d'un quart de tour. Et sur une sphère, toute boucle enferme quelque chose.",
  },
};

export const SURFACE_IDS: readonly SurfaceId[] = ["tore", "mobius", "klein", "projectif", "cylindre", "sphere"];

export const RULES = {
  minPlayers: 2,
  maxPlayers: 8,
  rounds: 3,
  tickMs: 125,
  roundSeconds: 120,
  countdownSeconds: 4,
  intermissionSeconds: 25,
  respawnTicks: 16,
  spawnRadius: 2,
} as const;

/** Taille du plateau selon le nombre de joueurs. */
export function boardSize(players: number): number {
  return players <= 3 ? 44 : players <= 5 ? 52 : 60;
}

// ---------------------------------------------------------------- géométrie

/** Directions : 0 haut, 1 droite, 2 bas, 3 gauche (y croît vers le bas). */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export function opposite(a: Dir, b: Dir): boolean {
  return (a + 2) % 4 === b;
}

export interface Step {
  x: number;
  y: number;
  /** Le joueur vient de traverser un bord recollé. */
  wrapped: boolean;
  /** …et ce bord était retourné : il revient en miroir (ou, sur la sphère, en tournant). */
  twisted: boolean;
  /** Nouvelle direction de marche, quand le recollement la fait tourner (sphère). */
  dir?: Dir;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * Case voisine dans la direction donnée, en tenant compte des recollements. Renvoie null contre un
 * mur. Les déplacements sont axiaux : on ne traverse jamais deux bords à la fois, donc la direction
 * de marche à l'écran ne change pas, seule la position est renvoyée en miroir.
 */
export function step(surface: SurfaceId, w: number, h: number, x: number, y: number, dir: Dir): Step | null {
  const s = SURFACES[surface];
  if (s.sides === "adjacent") return stepSphere(w, x, y, dir);
  let nx = x + DX[dir];
  let ny = y + DY[dir];
  let wrapped = false;
  let twisted = false;
  if (nx < 0 || nx >= w) {
    if (s.sides === "mur") return null;
    nx = mod(nx, w);
    wrapped = true;
    if (s.sides === "retourne") {
      ny = h - 1 - y;
      twisted = true;
    }
  } else if (ny < 0 || ny >= h) {
    if (s.ends === "mur") return null;
    ny = mod(ny, h);
    wrapped = true;
    if (s.ends === "retourne") {
      nx = w - 1 - x;
      twisted = true;
    }
  }
  return { x: nx, y: ny, wrapped, twisted };
}

/**
 * Sphère (plateau carré, côté n) : sortir par le haut en colonne x fait entrer par la gauche en
 * ligne x, en marchant vers la droite ; sortir par le bas fait entrer par la droite, vers la gauche.
 * Et réciproquement.
 */
function stepSphere(n: number, x: number, y: number, dir: Dir): Step {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  if (ny < 0) return { x: 0, y: x, wrapped: true, twisted: true, dir: 1 };
  if (nx < 0) return { x: y, y: 0, wrapped: true, twisted: true, dir: 2 };
  if (ny >= n) return { x: n - 1, y: x, wrapped: true, twisted: true, dir: 3 };
  if (nx >= n) return { x: y, y: n - 1, wrapped: true, twisted: true, dir: 0 };
  return { x: nx, y: ny, wrapped: false, twisted: false };
}

/**
 * Case du plateau qui apparaît en (gx, gy) hors du carré, pour dessiner les marges : ce que le
 * joueur verrait en regardant par-dessus un bord. Null dans les coins (deux recollements à la fois)
 * et derrière un mur.
 */
export function ghostCell(surface: SurfaceId, w: number, h: number, gx: number, gy: number): { x: number; y: number } | null {
  const s = SURFACES[surface];
  const outX = gx < 0 || gx >= w;
  const outY = gy < 0 || gy >= h;
  if (outX && outY) return null;
  if (s.sides === "adjacent") {
    // Ce qu'on verrait en continuant tout droit à travers le bord : la bande voisine, tournée.
    if (gy < 0) return { x: -gy - 1, y: gx };
    if (gx < 0) return { x: gy, y: -gx - 1 };
    if (gy >= h) return { x: w - 1 - (gy - h), y: gx };
    if (gx >= w) return { x: gy, y: h - 1 - (gx - w) };
    return { x: gx, y: gy };
  }
  if (outX) {
    if (s.sides === "mur") return null;
    return { x: mod(gx, w), y: s.sides === "retourne" ? h - 1 - gy : gy };
  }
  if (outY) {
    if (s.ends === "mur") return null;
    return { x: s.ends === "retourne" ? w - 1 - gx : gx, y: mod(gy, h) };
  }
  return { x: gx, y: gy };
}

// ---------------------------------------------------------------- état

export type Phase = "lobby" | "countdown" | "playing" | "intermission" | "final";

export interface TopoPlayer {
  id: string;
  name: string;
  accent: string;
  /** Numéro de 1 à 8, utilisé dans les grilles. */
  slot: number;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
}

export interface Head {
  slot: number;
  x: number;
  y: number;
  dir: Dir;
  alive: boolean;
}

export interface RoundResult {
  round: number;
  surface: SurfaceId;
  /** Par slot : cases possédées à la fin, coupures infligées, chutes. */
  cells: Record<number, number>;
  kills: Record<number, number>;
  deaths: Record<number, number>;
  total: number;
}

export interface TopoView {
  code: string;
  you: string;
  phase: Phase;
  round: number;
  rounds: number;
  surface: SurfaceId | null;
  /** Ordre des surfaces de la partie, connu dès le départ. */
  surfaces: SurfaceId[];
  size: number;
  tick: number;
  deadline: number | null;
  serverNow: number;
  players: TopoPlayer[];
  heads: Head[];
  /** Propriétaire de chaque case, un caractère par case ('0' = personne, '1'…'8' = slot). */
  owner: string;
  /** Traîne de chaque case, même codage. */
  trail: string;
  results: RoundResult[];
}

/** Ce qui arrive pendant un tick, pour les sons et les animations. */
export type TickEvent =
  | { k: "capture"; slot: number; cells: number }
  | { k: "death"; slot: number; by: number | null; reason: "coupe" | "soi" | "choc" | "mur" }
  | { k: "twist"; slot: number }
  | { k: "respawn"; slot: number };

/** Diffusé à chaque tick : seulement ce qui a changé. */
export interface TickMessage {
  tick: number;
  heads: Head[];
  /** Triplets aplatis : index de case, propriétaire, traîne. */
  cells: number[];
  events: TickEvent[];
}

export type TopoAction = { t: "start" } | { t: "turn"; dir: Dir } | { t: "ready" } | { t: "rematch" };

export function encodeGrid(grid: Uint8Array): string {
  let s = "";
  for (let i = 0; i < grid.length; i++) s += String.fromCharCode(48 + grid[i]!);
  return s;
}

export function decodeGrid(s: string): Uint8Array {
  const grid = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) grid[i] = s.charCodeAt(i) - 48;
  return grid;
}
