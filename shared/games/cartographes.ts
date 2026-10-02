// Cartographes : carte, pictogrammes, règles et messages partagés entre le serveur et le client.
//
// La carte est découpée en zones de 4 × 4 cases. Chaque joueur voit une zone, mais c'est le joueur
// suivant qui la peint sur la carte commune : pour lui faire passer ce qu'il voit, il n'a qu'un
// vocabulaire de pictogrammes. Messages et coups de pinceau apparaissent à la fin de chaque tour.

export const RULES = {
  minPlayers: 3,
  maxPlayers: 6,
  /** Le chrono de la partie, en tours. */
  turns: 7,
  turnSeconds: 75,
  /** Pictogrammes par message, au plus. */
  message: 4,
  /** Cases peintes par tour, au plus. */
  paints: 4,
  /** Côté d'une zone, en cases. */
  zone: 4,
} as const;

export type Terrain = "eau" | "plaine" | "foret" | "montagne" | "village";
export const TERRAINS: { id: Terrain; name: string }[] = [
  { id: "eau", name: "Eau" },
  { id: "plaine", name: "Plaine" },
  { id: "foret", name: "Forêt" },
  { id: "montagne", name: "Montagne" },
  { id: "village", name: "Village" },
];
const TERRAIN_IDS = new Set<string>(TERRAINS.map((t) => t.id));
export const isTerrain = (t: unknown): t is Terrain => typeof t === "string" && TERRAIN_IDS.has(t);

// ---------------------------------------------------------------- pictogrammes

export type PictoGroup = "terrain" | "direction" | "nombre" | "forme" | "reponse";

export interface Picto {
  id: string;
  group: PictoGroup;
  /** Le sens « officiel » ; à chacun de l'interpréter. */
  label: string;
}

export const PICTO_GROUPS: { id: PictoGroup; name: string }[] = [
  { id: "terrain", name: "Terrains" },
  { id: "direction", name: "Directions" },
  { id: "nombre", name: "Nombres" },
  { id: "forme", name: "Formes" },
  { id: "reponse", name: "Réponses" },
];

export const PICTOS: Picto[] = [
  ...TERRAINS.map((t) => ({ id: t.id, group: "terrain" as const, label: t.name })),
  { id: "n", group: "direction", label: "Haut" },
  { id: "ne", group: "direction", label: "Haut droite" },
  { id: "e", group: "direction", label: "Droite" },
  { id: "se", group: "direction", label: "Bas droite" },
  { id: "s", group: "direction", label: "Bas" },
  { id: "so", group: "direction", label: "Bas gauche" },
  { id: "o", group: "direction", label: "Gauche" },
  { id: "no", group: "direction", label: "Haut gauche" },
  { id: "1", group: "nombre", label: "Un" },
  { id: "2", group: "nombre", label: "Deux" },
  { id: "3", group: "nombre", label: "Trois" },
  { id: "4", group: "nombre", label: "Quatre" },
  { id: "case", group: "forme", label: "Une case" },
  { id: "ligne", group: "forme", label: "Ligne" },
  { id: "colonne", group: "forme", label: "Colonne" },
  { id: "coin", group: "forme", label: "Coin" },
  { id: "bord", group: "forme", label: "Bord" },
  { id: "centre", group: "forme", label: "Centre" },
  { id: "tout", group: "forme", label: "Toute la zone" },
  { id: "oui", group: "reponse", label: "Oui, c'est juste" },
  { id: "non", group: "reponse", label: "Non, c'est faux" },
  { id: "quoi", group: "reponse", label: "Je n'ai pas compris" },
  { id: "vu", group: "reponse", label: "Bien vu, compris" },
  { id: "alerte", group: "reponse", label: "Attention" },
  { id: "toi", group: "reponse", label: "Toi" },
  { id: "fini", group: "reponse", label: "Ma zone est finie" },
];
const PICTO_IDS = new Set(PICTOS.map((p) => p.id));
export const isPicto = (p: unknown): p is string => typeof p === "string" && PICTO_IDS.has(p);

// ---------------------------------------------------------------- carte

export interface Zone {
  /** Lettre de la zone : A, B, C… */
  id: string;
  /** Coin haut gauche, en cases. */
  x: number;
  y: number;
  /** Slot du joueur qui la voit (0 : personne). */
  viewer: number;
  /** Slot du joueur qui la peint (0 : personne). */
  painter: number;
  /** Zone déjà cartographiée, visible de tous : un repère. */
  charted: boolean;
}

/** Disposition des zones : 2 × 2 jusqu'à 4 joueurs, 3 × 2 au-delà. */
export function layout(players: number): { zx: number; zy: number } {
  return players <= 4 ? { zx: 2, zy: 2 } : { zx: 3, zy: 2 };
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

/**
 * Un relief et une humidité faits de quelques bosses gaussiennes, puis un terrain par case :
 * l'eau dans les creux, la montagne sur les sommets, la forêt où il pleut, des villages en plaine.
 */
export function generateTerrain(cols: number, rows: number, seed: number): Terrain[] {
  const r = rng(seed);
  const field = (bumps: number, spread: number) => {
    const b = Array.from({ length: bumps }, () => ({ x: r() * cols, y: r() * rows, h: r() * 2 - 1, s: spread * (0.6 + r() * 0.8) }));
    return (x: number, y: number) => b.reduce((sum, k) => sum + k.h * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / (2 * k.s * k.s)), 0);
  };
  const elevation = field(Math.round((cols * rows) / 7), 2.2);
  const moisture = field(Math.round((cols * rows) / 10), 2.8);
  const cells: { e: number; m: number }[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ e: elevation(x + 0.5, y + 0.5), m: moisture(x + 0.5, y + 0.5) });
  // Seuils par rang : la part de chaque terrain reste raisonnable quel que soit le tirage.
  const rank = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return (v: number) => sorted.indexOf(v) / values.length;
  };
  const eRank = rank(cells.map((c) => c.e));
  const mRank = rank(cells.map((c) => c.m));
  const out: Terrain[] = cells.map((c) => {
    const e = eRank(c.e);
    if (e < 0.24) return "eau";
    if (e > 0.82) return "montagne";
    return mRank(c.m) > 0.55 ? "foret" : "plaine";
  });
  // Quelques villages, en plaine, jamais collés.
  const villages = Math.max(2, Math.round((cols * rows) / 18));
  for (let tries = 0, placed = 0; placed < villages && tries < 500; tries++) {
    const i = Math.floor(r() * out.length);
    const x = i % cols;
    const y = Math.floor(i / cols);
    if (out[i] !== "plaine") continue;
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => out[(y + dy) * cols + (x + dx)] === "village" && x + dx >= 0 && x + dx < cols));
    if (near) continue;
    out[i] = "village";
    placed++;
  }
  return out;
}

export interface MapSetup {
  cols: number;
  rows: number;
  zones: Zone[];
  truth: Terrain[];
}

/**
 * Prépare une partie : les zones, qui voit quoi, qui peint quoi, et un terrain assez varié pour
 * que chaque zone à décrire contienne au moins trois sortes de cases.
 * `slots` donne l'ordre de jeu : le joueur i peint la zone vue par le joueur i − 1.
 */
export function setupMap(slots: number[], seed: number): MapSetup {
  const { zx, zy } = layout(slots.length);
  const cols = zx * RULES.zone;
  const rows = zy * RULES.zone;
  const r = rng(seed ^ 0x5bd1e995);
  // Les zones de jeu, dans un ordre tiré au sort ; celle qui reste est déjà cartographiée.
  const order = Array.from({ length: zx * zy }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const zones: Zone[] = Array.from({ length: zx * zy }, (_, i) => ({
    id: String.fromCharCode(65 + i),
    x: (i % zx) * RULES.zone,
    y: Math.floor(i / zx) * RULES.zone,
    viewer: 0,
    painter: 0,
    charted: true,
  }));
  slots.forEach((slot, k) => {
    const z = zones[order[k]!]!;
    z.charted = false;
    z.viewer = slot;
    z.painter = slots[(k + 1) % slots.length]!;
  });
  let truth: Terrain[] = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    truth = generateTerrain(cols, rows, (seed + attempt * 7919) >>> 0);
    const varied = zones.every((z) => z.charted || new Set(zoneCells(z, cols).map((i) => truth[i])).size >= 3);
    if (varied) break;
  }
  return { cols, rows, zones, truth };
}

/** Indices des cases d'une zone, ligne par ligne. */
export function zoneCells(z: Pick<Zone, "x" | "y">, cols: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < RULES.zone; dy++) for (let dx = 0; dx < RULES.zone; dx++) out.push((z.y + dy) * cols + z.x + dx);
  return out;
}

export function zoneOf(zones: Zone[], cols: number, index: number): Zone | undefined {
  const x = index % cols;
  const y = Math.floor(index / cols);
  return zones.find((z) => x >= z.x && x < z.x + RULES.zone && y >= z.y && y < z.y + RULES.zone);
}

/** Cases justes d'une zone. */
export function zoneScore(z: Zone, cols: number, truth: (Terrain | null)[], painted: (Terrain | null)[]): { right: number; total: number } {
  const cells = zoneCells(z, cols);
  return { right: cells.filter((i) => painted[i] && painted[i] === truth[i]).length, total: cells.length };
}

export function rating(share: number): { title: string; line: string } {
  if (share >= 0.95) return { title: "Carte royale", line: "Le roi la fera graver sur cuivre." };
  if (share >= 0.8) return { title: "Carte fiable", line: "On peut voyager avec, en gardant l'œil ouvert." };
  if (share >= 0.6) return { title: "Carte de contrebandier", line: "Les grandes lignes y sont, les détails sont… créatifs." };
  if (share >= 0.35) return { title: "Carte de pirate", line: "Quelque part, il y a sûrement un trésor. Ou un marais." };
  return { title: "Terra incognita", line: "Hic sunt dracones." };
}

// ---------------------------------------------------------------- état et messages

export type Phase = "lobby" | "turn" | "final";

export interface CartoPlayer {
  id: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
  /** A fini son tour. */
  locked: boolean;
  /** Pense que la carte est terminée. */
  done: boolean;
}

export interface Message {
  turn: number;
  slot: number;
  pictos: string[];
}

export interface Submission {
  pictos: string[];
  /** Coups de pinceau : [case, terrain]. */
  paints: [number, Terrain][];
  done: boolean;
}

export interface CartoView {
  code: string;
  you: string;
  phase: Phase;
  turn: number;
  turns: number;
  cols: number;
  rows: number;
  zones: Zone[];
  /** Le vrai terrain, seulement là où tu le vois (ta zone et les repères) ; tout, à la fin. */
  truth: (Terrain | null)[];
  painted: (Terrain | null)[];
  log: Message[];
  players: CartoPlayer[];
  /** Ce que tu as envoyé pour ce tour, en attendant sa fin. */
  mine: Submission | null;
  /** Pictogrammes envoyés par chacun sur toute la partie. */
  spoken: Record<number, number>;
  deadline: number | null;
  serverNow: number;
}

export type CartoAction = { t: "start" } | ({ t: "end" } & Submission) | { t: "rematch" };
