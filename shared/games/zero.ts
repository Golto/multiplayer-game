// Zéro : un Skyjo dont les cartes sont des polynômes à coefficients entiers.
//
// Règles (celles du Skyjo, deux seulement changent) :
// - Chacun a devant lui une grille de cartes face cachée (3 × 4 au classique) et en révèle deux.
// - À son tour, on pioche (paquet ou défausse). Une carte prise à la défausse s'échange forcément
//   contre une carte de sa grille ; une carte du paquet s'échange, ou se défausse et l'on retourne
//   alors une de ses cartes cachées.
// - **Score** : à la fin de la manche, un dé tire x parmi −1, 0 et 1, et chaque carte vaut P(x).
//   Avec x = 1, chaque carte vaut sa valeur « Skyjo » (de −2 à 12) ; avec x = 0, seule sa constante
//   compte ; avec x = −1, les termes de degré impair changent de signe.
// - **Colonnes** : une colonne entièrement révélée s'efface si ses cartes ont le même terme dominant
//   (3x² + 1, 3x² − x et 3x² par exemple).
// - Quand quelqu'un a tout révélé, chacun des autres joue une dernière fois. Celui qui a clos la
//   manche voit son score doublé s'il n'est pas strictement le plus bas (et positif).
// - La partie s'arrête quand quelqu'un atteint l'objectif (100 au classique) ; le plus bas gagne.
//
// Au degré 0, les cartes sont des constantes : x ne change rien, le terme dominant est la valeur,
// et le paquet est celui du Skyjo. On retrouve exactement le Skyjo.

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
  /** Les faces du dé qui tire x en fin de manche. */
  xValues: [-1, 0, 1],
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

/** Valeur d'un polynôme en x. */
export function evaluate(p: Poly, x: number): number {
  return p.reduce((s, c, i) => s + c * x ** i, 0);
}

/** Terme dominant : [degré, coefficient], ou null pour le polynôme nul. */
export function leadingTerm(p: Poly): [number, number] | null {
  const d = degreeOf(p);
  return d < 0 ? null : [d, p[d]!];
}

/**
 * Une colonne entièrement révélée s'efface si toutes ses cartes ont le même terme dominant (ou sont
 * toutes nulles). Au degré 0, c'est la règle du Skyjo : des cartes identiques.
 */
export function columnClears(cards: Poly[]): boolean {
  if (cards.length < 2) return false;
  const key = (p: Poly) => leadingTerm(p)?.join(",") ?? "0";
  return cards.every((c) => key(c) === key(cards[0]!));
}

/** Valeur d'une grille (cartes restantes) pour un tirage de x. */
export function gridValue(cards: Poly[], x: number): number {
  return cards.reduce((s, p) => s + evaluate(p, x), 0);
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
  /** Somme des P(x) des cartes restantes. */
  cards: number;
  doubled: boolean;
  score: number;
}

export interface RoundResult {
  round: number;
  closer: number;
  /** La valeur de x tirée pour cette manche. */
  x: number;
  scores: Record<number, RoundScore>;
}

/** Ce qui vient de se passer, pour les animations et le fil de la partie. */
export type ZeroEvent =
  | { k: "draw"; slot: number; from: "deck" | "discard" }
  | { k: "swap"; slot: number; index: number; out: Poly }
  | { k: "discard"; slot: number }
  | { k: "flip"; slot: number; index: number }
  | { k: "column"; slot: number; col: number }
  | { k: "closed"; slot: number };

export interface ZeroView {
  code: string;
  you: string;
  phase: Phase;
  config: ZeroConfig;
  round: number;
  players: ZeroPlayer[];
  grids: Record<number, PublicCell[]>;
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
