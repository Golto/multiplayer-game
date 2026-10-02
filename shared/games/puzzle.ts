// Puzzle : formats, géométrie des pièces, règles de pose et messages partagés entre le serveur et
// le client.
//
// Le puzzle est posé au centre d'une table plus grande. Chaque pièce est repérée par la position du
// coin haut-gauche de sa case ; elle est à sa place quand cette position coïncide avec sa case sur
// le plateau. Des pièces voisines peuvent s'emboîter hors du plateau : elles forment alors un bloc
// (`group`) qui se déplace d'un seul geste.

export type FormatId = "paysage" | "panorama" | "portrait" | "carre";
export const FORMATS: { id: FormatId; name: string; w: number; h: number }[] = [
  { id: "paysage", name: "Paysage", w: 1200, h: 900 },
  { id: "panorama", name: "Panorama", w: 1600, h: 800 },
  { id: "portrait", name: "Portrait", w: 900, h: 1200 },
  { id: "carre", name: "Carré", w: 1050, h: 1050 },
];

/** Nombres de pièces proposés ; le nombre exact dépend du format (la grille reste à cases carrées). */
export const PIECE_COUNTS = [12, 24, 48, 108, 192, 300, 432] as const;
export type PieceCount = (typeof PIECE_COUNTS)[number];

export type ArtId = "sommets" | "archipel" | "bauhaus" | "orbite" | "foret" | "ville";
export const ARTS: { id: ArtId; name: string }[] = [
  { id: "sommets", name: "Sommets au crépuscule" },
  { id: "archipel", name: "Archipel" },
  { id: "bauhaus", name: "Bauhaus" },
  { id: "orbite", name: "Orbite" },
  { id: "foret", name: "Forêt de pins" },
  { id: "ville", name: "Ville la nuit" },
];
/** Les dessins sont faits sur une toile de 1200 × 900, recadrée selon le format. */
export const ART_W = 1200;
export const ART_H = 900;

export const RULES = {
  minPlayers: 1,
  maxPlayers: 8,
  /** Distance (en fraction de case) sous laquelle une pièce s'aimante… */
  snap: 0.28,
  /** …mais jamais moins que ceci (en unités de table) : les petites pièces des grands puzzles. */
  snapMin: 18,
} as const;

/** Tolérance d'aimantation pour une grille donnée. */
export function snapTolerance(L: Pick<Layout, "cw" | "ch">): number {
  return Math.max(RULES.snapMin, Math.min(L.cw, L.ch) * RULES.snap);
}

export interface PuzzleConfig {
  art: ArtId;
  count: PieceCount;
  format: FormatId;
}

/** Tout ce qui découle du format et du nombre de pièces. */
export interface Layout {
  cols: number;
  rows: number;
  /** Taille d'une case. */
  cw: number;
  ch: number;
  /** Taille du puzzle. */
  w: number;
  h: number;
  /** Taille de la table, et position du plateau dessus. */
  tableW: number;
  tableH: number;
  boardX: number;
  boardY: number;
}

export function layout(config: Pick<PuzzleConfig, "count" | "format">): Layout {
  const f = FORMATS.find((x) => x.id === config.format) ?? FORMATS[0]!;
  // La grille qui approche le mieux le nombre voulu avec des cases presque carrées.
  let cols = 2;
  let rows = 2;
  let best = Infinity;
  for (let r = 2; r <= 40; r++) {
    for (const c of [Math.floor(config.count / r), Math.ceil(config.count / r), Math.round((r * f.w) / f.h)]) {
      if (c < 2) continue;
      const score = Math.abs(c * r - config.count) / config.count + Math.abs(Math.log(f.w / c / (f.h / r))) * 0.6;
      if (score < best) [best, cols, rows] = [score, c, r];
    }
  }
  // La table laisse autour du plateau de quoi étaler toutes les pièces.
  const m = Math.max(f.w, f.h) / 2;
  const mx = m;
  const my = m * 0.75;
  return { cols, rows, cw: f.w / cols, ch: f.h / rows, w: f.w, h: f.h, tableW: f.w + 2 * mx, tableH: f.h + 2 * my, boardX: mx, boardY: my };
}

/** Position de la case d'une pièce sur le plateau, dans les coordonnées de la table. */
export function home(id: number, L: Layout): { x: number; y: number } {
  return { x: L.boardX + (id % L.cols) * L.cw, y: L.boardY + Math.floor(id / L.cols) * L.ch };
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
 * Contour d'une pièce en coordonnées du puzzle (0..w × 0..h).
 * Un bord droit, ou une courbe en tenon (sortant) ou en mortaise (rentrant).
 */
export function piecePath(id: number, L: Pick<Layout, "cols" | "rows" | "cw" | "ch">, seed: number, cut = cuts(seed, L.cols, L.rows)): string {
  const { cols, rows, cw, ch } = L;
  const c = id % cols;
  const r = Math.floor(id / cols);
  const { h, v } = cut;
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
export function isEdge(id: number, L: Pick<Layout, "cols" | "rows">): boolean {
  const c = id % L.cols;
  const r = Math.floor(id / L.cols);
  return c === 0 || r === 0 || c === L.cols - 1 || r === L.rows - 1;
}

export function isCorner(id: number, L: Pick<Layout, "cols" | "rows">): boolean {
  const c = id % L.cols;
  const r = Math.floor(id / L.cols);
  return (c === 0 || c === L.cols - 1) && (r === 0 || r === L.rows - 1);
}

/** Voisines dans la grille (haut, droite, bas, gauche). */
export function neighbours(id: number, L: Pick<Layout, "cols" | "rows">): number[] {
  const c = id % L.cols;
  const r = Math.floor(id / L.cols);
  const out: number[] = [];
  if (r > 0) out.push(id - L.cols);
  if (c < L.cols - 1) out.push(id + 1);
  if (r < L.rows - 1) out.push(id + L.cols);
  if (c > 0) out.push(id - 1);
  return out;
}

// ---------------------------------------------------------------- pose

export interface PieceState {
  id: number;
  x: number;
  y: number;
  placed: boolean;
  /** Slot du joueur qui la tient, ou 0. */
  heldBy: number;
  /** Bloc auquel elle appartient : l'identifiant de la plus petite pièce du bloc. */
  group: number;
}

export function members(pieces: PieceState[], group: number): PieceState[] {
  return pieces.filter((p) => p.group === group);
}

/** Déplace tout un bloc, sans arrondi : les décalages entre pièces restent exacts. */
function shift(block: PieceState[], dx: number, dy: number): void {
  for (const p of block) {
    p.x += dx;
    p.y += dy;
  }
}

export interface DropResult {
  /** Pièces dont la position ou l'état a changé (tout le bloc final). */
  changed: PieceState[];
  /** Pièces posées sur le plateau par ce lâcher. */
  placed: number;
  /** Le bloc s'est emboîté avec d'autres pièces, hors du plateau. */
  merged: boolean;
}

/**
 * Ce qui se passe quand on lâche le bloc de la pièce `id` là où il est.
 *
 * 1. Sur le plateau : le bloc s'aimante à sa place s'il en est assez près **et** s'il tient à quelque
 *    chose : un coin du puzzle, ou une pièce déjà posée à côté. Une pièce isolée au milieu du plateau
 *    ne se valide pas, même bien placée : pas de pose « à l'aveugle ».
 * 2. Sinon, hors du plateau : s'il arrive au bon endroit à côté d'une de ses voisines, il s'emboîte
 *    avec elle et les deux blocs n'en font plus qu'un.
 *
 * Modifie `pieces` (indexées par identifiant) et renvoie ce qui a changé.
 */
export function resolveDrop(pieces: PieceState[], L: Layout, id: number): DropResult {
  const tol = snapTolerance(L);
  let block = members(pieces, pieces[id]!.group);
  const inBlock = () => new Set(block.map((p) => p.id));

  // 1. Le plateau.
  const ids = inBlock();
  const anchored = block.some((p) => isCorner(p.id, L) || neighbours(p.id, L).some((n) => !ids.has(n) && pieces[n]!.placed));
  if (anchored) {
    let best: { p: PieceState; d: number } | null = null;
    for (const p of block) {
      const t = home(p.id, L);
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d <= tol && (!best || d < best.d)) best = { p, d };
    }
    if (best) {
      for (const p of block) {
        const t = home(p.id, L);
        p.x = t.x;
        p.y = t.y;
        p.placed = true;
      }
      return { changed: block, placed: block.length, merged: false };
    }
  }

  // 2. Les voisines hors du plateau (on peut enchaîner plusieurs emboîtements d'un coup).
  let merged = false;
  for (let pass = 0; pass < 4; pass++) {
    const mine = inBlock();
    let joined = false;
    for (const p of block) {
      for (const n of neighbours(p.id, L)) {
        const q = pieces[n]!;
        if (mine.has(n) || q.placed || q.heldBy) continue;
        // Où devrait être p, si q ne bouge pas.
        const ex = q.x + ((p.id % L.cols) - (n % L.cols)) * L.cw;
        const ey = q.y + (Math.floor(p.id / L.cols) - Math.floor(n / L.cols)) * L.ch;
        if (Math.hypot(p.x - ex, p.y - ey) > tol) continue;
        shift(block, ex - p.x, ey - p.y);
        const other = members(pieces, q.group);
        const group = Math.min(...block.map((b) => b.group), q.group);
        for (const b of [...block, ...other]) b.group = group;
        block = members(pieces, group);
        merged = joined = true;
        break;
      }
      if (joined) break;
    }
    if (!joined) break;
  }
  return { changed: block, placed: 0, merged };
}

// ---------------------------------------------------------------- état et messages

export type Phase = "lobby" | "playing" | "done";

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
  /** Le bloc de la pièce `id` est pris par le joueur `slot`. */
  | { k: "grab"; id: number; slot: number }
  /** Le bloc de la pièce `id` est déplacé : la pièce `id` arrive en (x, y), le reste suit. */
  | { k: "move"; id: number; x: number; y: number; slot: number }
  /** Lâcher (ou bloc relâché d'office) : l'état final de toutes les pièces concernées. */
  | { k: "drop"; slot: number; pieces: PieceState[]; placed: number; merged: boolean };
