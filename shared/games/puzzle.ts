// Puzzle : géométrie des pièces, règles et messages partagés entre le serveur et le client.
//
// Le puzzle mesure toujours 1200 × 900 unités, posé au centre d'une table plus grande. Chaque pièce
// est repérée par la position du coin haut-gauche de sa case ; elle est à sa place quand cette
// position coïncide avec sa case sur le plateau.

export const PUZZLE_W = 1200;
export const PUZZLE_H = 900;
export const TABLE_W = 2400;
export const TABLE_H = 1700;
export const BOARD_X = (TABLE_W - PUZZLE_W) / 2;
export const BOARD_Y = (TABLE_H - PUZZLE_H) / 2;

/** Nombre de pièces proposé, et la grille correspondante (format 4:3). */
export const SIZES = {
  12: [4, 3],
  24: [6, 4],
  48: [8, 6],
  108: [12, 9],
  192: [16, 12],
} as const;
export type PieceCount = keyof typeof SIZES;
export const PIECE_COUNTS = Object.keys(SIZES).map(Number) as PieceCount[];

export type ArtId = "sommets" | "archipel" | "bauhaus" | "orbite" | "foret" | "ville";
export const ARTS: { id: ArtId; name: string }[] = [
  { id: "sommets", name: "Sommets au crépuscule" },
  { id: "archipel", name: "Archipel" },
  { id: "bauhaus", name: "Bauhaus" },
  { id: "orbite", name: "Orbite" },
  { id: "foret", name: "Forêt de pins" },
  { id: "ville", name: "Ville la nuit" },
];

export const RULES = {
  minPlayers: 1,
  maxPlayers: 8,
  /** Distance (en fraction de case) sous laquelle une pièce s'aimante à sa place. */
  snap: 0.28,
} as const;

export function grid(count: PieceCount): { cols: number; rows: number; cw: number; ch: number } {
  const [cols, rows] = SIZES[count];
  return { cols, rows, cw: PUZZLE_W / cols, ch: PUZZLE_H / rows };
}

/** Position de la case d'une pièce sur le plateau, dans les coordonnées de la table. */
export function home(id: number, count: PieceCount): { x: number; y: number } {
  const { cols, cw, ch } = grid(count);
  return { x: BOARD_X + (id % cols) * cw, y: BOARD_Y + Math.floor(id / cols) * ch };
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

// ---------------------------------------------------------------- découpe

/**
 * Sens des tenons : pour chaque bord intérieur, +1 si le tenon sort vers la droite (ou le bas),
 * -1 sinon. `h[r][c]` : bord vertical à droite de la case (c, r) ; `v[r][c]` : bord sous la case.
 */
export function cuts(seed: number, cols: number, rows: number): { h: number[][]; v: number[][] } {
  const r = rng(seed);
  const h = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => (r() < 0.5 ? 1 : -1)));
  const v = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => (r() < 0.5 ? 1 : -1)));
  return { h, v };
}

/**
 * Contour d'une pièce en coordonnées du puzzle (0..1200 × 0..900).
 * Un bord droit, ou une courbe en tenon (sortant) ou en mortaise (rentrant).
 */
export function piecePath(id: number, count: PieceCount, seed: number): string {
  const { cols, rows, cw, ch } = grid(count);
  const c = id % cols;
  const r = Math.floor(id / cols);
  const { h, v } = cuts(seed, cols, rows);
  const x0 = c * cw;
  const y0 = r * ch;
  const x1 = x0 + cw;
  const y1 = y0 + ch;
  // Tenon de chaque côté : 0 = bord droit ; sinon +1 sort de la pièce, -1 rentre.
  const top = r === 0 ? 0 : v[r - 1]![c]!;
  const right = c === cols - 1 ? 0 : h[r]![c]!;
  const bottom = r === rows - 1 ? 0 : v[r]![c]!;
  const left = c === 0 ? 0 : -h[r]![c - 1]!;
  // `top` et `left` sont vus depuis la pièce voisine : on retourne leur sens.
  const out = { top: -top, right, bottom, left };

  /** Un côté de (ax, ay) à (bx, by) ; la normale extérieure est (nx, ny). */
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, tab: number) => {
    if (!tab) return `L${bx.toFixed(1)} ${by.toFixed(1)}`;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const k = Math.min(cw, ch);
    const d = tab * k * 0.24;
    const p = (t: number, n: number) => `${(ax + ux * len * t + nx * n).toFixed(1)} ${(ay + uy * len * t + ny * n).toFixed(1)}`;
    return [
      `L${p(0.36, 0)}`,
      `C${p(0.42, 0)} ${p(0.42, d * 0.25)} ${p(0.38, d * 0.55)}`,
      `C${p(0.33, d * 1.05)} ${p(0.67, d * 1.05)} ${p(0.62, d * 0.55)}`,
      `C${p(0.58, d * 0.25)} ${p(0.58, 0)} ${p(0.64, 0)}`,
      `L${p(1, 0)}`,
    ].join(" ");
  };

  return [
    `M${x0.toFixed(1)} ${y0.toFixed(1)}`,
    edge(x0, y0, x1, y0, 0, -1, out.top),
    edge(x1, y0, x1, y1, 1, 0, out.right),
    edge(x1, y1, x0, y1, 0, 1, out.bottom),
    edge(x0, y1, x0, y0, -1, 0, out.left),
    "Z",
  ].join(" ");
}

/** Pièce de bord (au moins un côté droit) : utile pour trier. */
export function isEdge(id: number, count: PieceCount): boolean {
  const { cols, rows } = grid(count);
  const c = id % cols;
  const r = Math.floor(id / cols);
  return c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
}

// ---------------------------------------------------------------- état et messages

export type Phase = "lobby" | "playing" | "done";

export interface PuzzleConfig {
  art: ArtId;
  count: PieceCount;
}

export interface PuzzlePlayer {
  id: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
  /** Pièces mises en place par ce joueur. */
  placed: number;
}

export interface PieceState {
  id: number;
  x: number;
  y: number;
  placed: boolean;
  /** Slot du joueur qui la tient, ou 0. */
  heldBy: number;
}

export interface PuzzleView {
  code: string;
  you: string;
  phase: Phase;
  config: PuzzleConfig;
  seed: number;
  players: PuzzlePlayer[];
  pieces: PieceState[];
  startedAt: number | null;
  finishedAt: number | null;
  serverNow: number;
}

export type PuzzleAction =
  | { t: "configure"; config: Partial<PuzzleConfig> }
  | { t: "start" }
  | { t: "grab"; id: number }
  | { t: "move"; id: number; x: number; y: number }
  | { t: "drop"; id: number; x: number; y: number }
  | { t: "again" };

/** Événements légers diffusés à tous pendant la partie. */
export type PuzzleEvent =
  | { k: "grab"; id: number; slot: number }
  | { k: "move"; id: number; x: number; y: number; slot: number }
  | { k: "drop"; id: number; x: number; y: number; placed: boolean; slot: number };
