// Zéro : un Skyjo dont les cartes sont des polynômes à coefficients entiers.
//
// Règles (adaptées du Skyjo) :
// - Chacun a devant lui une grille de cartes face cachée (3 × 4 au classique) et en révèle deux.
// - À son tour, on pioche (paquet ou défausse). Une carte prise à la défausse s'échange forcément
//   contre une carte de sa grille ; une carte du paquet s'échange, ou se défausse et l'on retourne
//   alors une de ses cartes cachées.
// - Le **poids** d'un polynôme est la somme des valeurs absolues de ses coefficients.
// - Une colonne compte le poids de la **somme** de ses cartes : les coefficients se compensent
//   avant d'être comptés, ranger ses cartes pour qu'elles s'annulent est tout le jeu.
// - Une colonne entièrement révélée s'efface si ses cartes sont identiques (comme au Skyjo), ou si
//   elles s'annulent (somme nulle) : c'est une annulation, qui rapporte un bonus.
// - Quand quelqu'un a tout révélé, chacun des autres joue une dernière fois. Celui qui a clos la
//   manche voit son score doublé s'il n'est pas strictement le plus bas (et positif).
// - La partie s'arrête quand quelqu'un atteint l'objectif (100 au classique) ; le plus bas gagne.

/** Un polynôme : ses coefficients, du terme constant au plus haut degré. */
export type Poly = number[];

export const DEGREES = [0, 1, 2, 3] as const;
export type Degree = (typeof DEGREES)[number];

export const GRIDS: { rows: number; cols: number; name: string }[] = [
  { rows: 2, cols: 3, name: "Express" },
  { rows: 3, cols: 3, name: "Carré" },
  { rows: 3, cols: 4, name: "Classique" },
  { rows: 3, cols: 5, name: "Large" },
  { rows: 4, cols: 4, name: "Haut" },
  { rows: 4, cols: 5, name: "Géant" },
];

export const TARGETS = [50, 100, 150] as const;
export type Target = (typeof TARGETS)[number];

export const RULES = {
  minPlayers: 2,
  maxPlayers: 8,
  /** Cartes révélées par chacun en début de manche. */
  revealAtStart: 2,
  /** Bonus d'une annulation, par carte de la colonne. */
  cancelBonus: -2,
} as const;

export interface ZeroConfig {
  rows: number;
  cols: number;
  degree: Degree;
  target: Target;
}

export const DEFAULT_CONFIG: ZeroConfig = { rows: 3, cols: 4, degree: 2, target: 100 };

// ---------------------------------------------------------------- algèbre

export function add(a: Poly, b: Poly): Poly {
  const out: Poly = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push((a[i] ?? 0) + (b[i] ?? 0));
  return out;
}

export function neg(a: Poly): Poly {
  return a.map((c) => (c === 0 ? 0 : -c));
}

export function sum(list: Poly[]): Poly {
  return list.reduce<Poly>((s, p) => add(s, p), []);
}

export function isZero(a: Poly): boolean {
  return a.every((c) => c === 0);
}

export function equals(a: Poly, b: Poly): boolean {
  return isZero(add(a, neg(b)));
}

/** Le poids : somme des valeurs absolues des coefficients. */
export function weight(a: Poly): number {
  return a.reduce((s, c) => s + Math.abs(c), 0);
}

export function degreeOf(a: Poly): number {
  for (let i = a.length - 1; i >= 0; i--) if (a[i]) return i;
  return -1;
}

const SUP = ["", "", "²", "³", "⁴", "⁵", "⁶"];

/** Écriture usuelle : 2x² − x + 3, avec un vrai signe moins. */
export function format(a: Poly): string {
  const terms: string[] = [];
  for (let i = a.length - 1; i >= 0; i--) {
    const c = a[i]!;
    if (!c) continue;
    const abs = Math.abs(c);
    const body = i === 0 ? String(abs) : `${abs === 1 ? "" : abs}x${SUP[i] ?? `^${i}`}`;
    const sign = c < 0 ? "−" : "+";
    terms.push(terms.length ? ` ${sign} ${body}` : c < 0 ? `−${body}` : body);
  }
  return terms.length ? terms.join("") : "0";
}

// ---------------------------------------------------------------- paquet

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

export interface CardKind {
  card: Poly;
  copies: number;
}

/**
 * Les sortes de cartes d'une partie, à la manière des 150 cartes du Skyjo :
 * - quinze polynômes nuls ;
 * - douze polynômes à coefficients positifs, de poids 1 à 12 (les « 1 à 12 » du Skyjo), dix fois
 *   chacun, de degré au plus `degree` et utilisant chaque degré ;
 * - quelques cartes négatives, des monômes : −2 (cinq fois), −1 (dix fois), et −x, −x², … (cinq
 *   fois chacun). Rares, elles servent à compenser un terme précis dans une colonne.
 * Au degré 0, on retrouve presque exactement le Skyjo.
 */
export function cardKinds(degree: Degree, r: () => number): CardKind[] {
  const len = degree + 1;
  const mono = (k: number, c: number): Poly => {
    const p: Poly = new Array(len).fill(0);
    p[k] = c;
    return p;
  };
  const kinds: CardKind[] = [{ card: new Array(len).fill(0), copies: 15 }];
  const seen = new Set<string>();
  for (let w = 1; w <= 12; w++) {
    let p: Poly = [];
    for (let tries = 0; tries < 200; tries++) {
      p = new Array(len).fill(0);
      // Le degré de la carte : les petits poids vont aux petits degrés, mais tous les degrés servent.
      const top = degree === 0 ? 0 : Math.min(degree, Math.floor(((w - 1) * (degree + 1)) / 12 + r() * 1.5));
      let rest = w;
      p[top] = 1;
      rest -= 1;
      // On répartit le reste du poids sur le terme dominant et quelques autres.
      while (rest > 0) {
        const k = r() < 0.5 ? top : Math.floor(r() * (top + 1));
        p[k]! += 1;
        rest -= 1;
      }
      if (!seen.has(p.join(","))) break;
    }
    seen.add(p.join(","));
    kinds.push({ card: p, copies: 10 });
  }
  kinds.push({ card: mono(0, -2), copies: 5 }, { card: mono(0, -1), copies: 10 });
  for (let k = 1; k <= degree; k++) kinds.push({ card: mono(k, -1), copies: 5 });
  return kinds;
}

/** Le paquet : les sortes ci-dessus, avec plus d'exemplaires si la table est grande. */
export function buildDeck(config: ZeroConfig, players: number, r: () => number): Poly[] {
  const kinds = cardKinds(config.degree, r);
  const base = kinds.reduce((s, k) => s + k.copies, 0);
  const need = players * config.rows * config.cols + 40;
  const scale = Math.max(1, Math.ceil(need / base));
  const deck: Poly[] = [];
  for (const k of kinds) for (let c = 0; c < k.copies * scale; c++) deck.push([...k.card]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

// ---------------------------------------------------------------- grille et score

/** Une case de la grille : une carte, visible ou non ; null si sa colonne a été effacée. */
export interface Cell {
  card: Poly | null;
  up: boolean;
}

export function columnCells(cols: number, rows: number, c: number): number[] {
  return Array.from({ length: rows }, (_, r) => r * cols + c);
}

export type ColumnFate = "identique" | "annulation" | null;

/** Une colonne entièrement révélée s'efface si ses cartes sont identiques ou s'annulent. */
export function columnFate(cards: Poly[]): ColumnFate {
  if (cards.length < 2) return null;
  // Une vraie compensation : au moins une carte non nulle (trois zéros sont simplement identiques).
  if (isZero(sum(cards)) && cards.some((c) => !isZero(c))) return "annulation";
  if (cards.every((c) => equals(c, cards[0]!))) return "identique";
  return null;
}

/** Score d'une colonne : le poids de la somme de ses cartes (toutes, révélées ou non). */
export function columnScore(cards: Poly[]): number {
  return weight(sum(cards));
}

// ---------------------------------------------------------------- état et messages

export type Phase = "lobby" | "setup" | "play" | "reveal" | "final";

export interface ZeroPlayer {
  id: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
  /** Total des manches jouées. */
  total: number;
}

/** Ce que tout le monde voit d'une grille : les cartes cachées n'ont pas de valeur. */
export interface PublicCell {
  card: Poly | null;
  up: boolean;
  removed: boolean;
}

export interface RoundScore {
  /** Poids des colonnes restantes. */
  columns: number;
  /** Bonus des annulations. */
  bonus: number;
  doubled: boolean;
  score: number;
}

export interface RoundResult {
  round: number;
  closer: number;
  scores: Record<number, RoundScore>;
}

/** Ce qui vient de se passer, pour les animations et le fil de la partie. */
export type ZeroEvent =
  | { k: "draw"; slot: number; from: "deck" | "discard" }
  | { k: "swap"; slot: number; index: number; out: Poly }
  | { k: "discard"; slot: number }
  | { k: "flip"; slot: number; index: number }
  | { k: "column"; slot: number; col: number; fate: Exclude<ColumnFate, null> }
  | { k: "closed"; slot: number };

export interface ZeroView {
  code: string;
  you: string;
  phase: Phase;
  config: ZeroConfig;
  round: number;
  players: ZeroPlayer[];
  grids: Record<number, PublicCell[]>;
  /** Bonus d'annulation de la manche en cours, par slot. */
  bonus: Record<number, number>;
  deckCount: number;
  discardTop: Poly | null;
  /** Joueur dont c'est le tour. */
  turn: number;
  /** « draw » : il doit piocher ; « place » : il a une carte en main ; « flip » : il doit retourner. */
  step: "draw" | "place" | "flip";
  /** La carte piochée, visible de tous, et d'où elle vient. */
  hand: Poly | null;
  handFrom: "deck" | "discard" | null;
  /** Celui qui a tout révélé : les autres jouent leur dernier tour. */
  closer: number | null;
  results: RoundResult[];
  lastEvent: ZeroEvent | null;
}

export type ZeroAction =
  | { t: "configure"; config: Partial<ZeroConfig> }
  | { t: "start" }
  | { t: "reveal"; index: number }
  | { t: "draw"; from: "deck" | "discard" }
  | { t: "swap"; index: number }
  | { t: "discard" }
  | { t: "ready" }
  | { t: "rematch" };
