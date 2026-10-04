// Tapis : un Texas hold'em entre amis, avec trois entorses à la règle.
//
// Le fond est celui du hold'em sans limite :
// - Deux cartes cachées chacun, cinq cartes communes (flop, tournant, rivière), quatre tours
//   d'enchères. Petite et grosse blinde, le bouton tourne, les blindes montent avec le temps.
// - On se couche, on parle, on suit, on mise ou on relance (au moins du montant de la dernière
//   relance), ou l'on fait tapis. Pots annexes quand quelqu'un est à tapis.
// - À l'abattage, la meilleure main de cinq cartes parmi les sept gagne. Un joueur sans jetons
//   est éliminé ; le dernier en lice gagne (ou le plus gros tapis si la partie a une durée fixe).
//
// Les trois entorses (chacune se désactive dans le salon) :
// - **La folle** : à chaque donne, une carte est retournée au milieu de la table avant tout le
//   reste. Les trois autres cartes de sa hauteur sont folles pour la donne : chacune remplace
//   n'importe quelle carte. Avec elles, on peut faire « cinq d'une sorte », au-dessus de la quinte
//   flush.
// - **L'échange** : une fois par donne, à partir du flop et quand c'est à lui de parler, un joueur
//   peut payer une grosse blinde (au pot) pour remplacer une de ses deux cartes par celle du dessus
//   du paquet.
// - **La prime** : chaque donne affiche un défi (gagner avec 7-2, gagner sans abattage…). Qui
//   remporte le pot principal en le remplissant touche une grosse blinde de chacun des autres.

// ---------------------------------------------------------------- cartes

/** Une carte : hauteur de 2 à 14 (as), couleur 0 ♠, 1 ♥, 2 ♦, 3 ♣. */
export interface Card {
  r: number;
  s: number;
}

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const SUIT_NAMES = ["pique", "cœur", "carreau", "trèfle"] as const;
export const isRed = (c: Card) => c.s === 1 || c.s === 2;

/** Le symbole d'une hauteur sur la carte : 2…10, V, D, R, A. */
export function rankLabel(r: number): string {
  return r <= 10 ? String(r) : (["V", "D", "R", "A"][r - 11] ?? "?");
}

const RANK_WORDS: Record<number, [string, string]> = {
  11: ["valet", "valets"],
  12: ["dame", "dames"],
  13: ["roi", "rois"],
  14: ["as", "as"],
};
/** « roi », « 7 » ; au pluriel « rois », « 7 ». */
export function rankName(r: number, plural = false): string {
  const w = RANK_WORDS[r];
  return w ? w[plural ? 1 : 0] : String(r);
}
/** « de rois », « d'as », « de 7 ». */
const de = (r: number) => (r === 14 ? "d'as" : `de ${rankName(r, true)}`);
/** « à l'as », « au roi », « à la dame », « au 9 ». */
const au = (r: number) => (r === 14 ? "à l'as" : r === 12 ? "à la dame" : `au ${rankName(r)}`);

export function cardName(c: Card): string {
  return `${rankName(c.r)} de ${SUIT_NAMES[c.s]}`;
}
export function cardLabel(c: Card): string {
  return `${rankLabel(c.r)}${SUITS[c.s]}`;
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  return deck;
}

export function shuffle<T>(list: T[], r: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** Générateur pseudo-aléatoire reproductible (tests, aperçus). */
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

// ---------------------------------------------------------------- mains

export const CATEGORIES = [
  "Hauteur",
  "Paire",
  "Double paire",
  "Brelan",
  "Quinte",
  "Couleur",
  "Full",
  "Carré",
  "Quinte flush",
  "Cinq d'une sorte",
] as const;
export const CAT = { high: 0, pair: 1, twoPair: 2, trips: 3, straight: 4, flush: 5, full: 6, quads: 7, straightFlush: 8, five: 9 } as const;

/** Une main évaluée. `value` se compare directement : plus grand, meilleur. */
export interface HandValue {
  value: number;
  cat: number;
  /** Hauteurs qui départagent, dans l'ordre (la plus haute de la quinte, le brelan puis la paire du full…). */
  ranks: number[];
}

const BASE = 15;
function pack(cat: number, ranks: number[]): number {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * BASE + (ranks[i] ?? 0);
  return v;
}

/** Évalue de 1 à 5 cartes réelles (sans folle). Quintes et couleurs demandent 5 cartes. */
export function evaluateCards(cards: readonly Card[]): HandValue {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
  // Les hauteurs groupées : d'abord les plus nombreuses, puis les plus hautes.
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ranks = groups.map((g) => g[0]);
  const shape = groups.map((g) => g[1]);
  const five = cards.length === 5;
  const flush = five && cards.every((c) => c.s === cards[0]!.s);
  let straightTop = 0;
  if (five && groups.length === 5) {
    const desc = [...ranks].sort((a, b) => b - a);
    if (desc[0]! - desc[4]! === 4) straightTop = desc[0]!;
    else if (desc.join() === "14,5,4,3,2") straightTop = 5;
  }
  let cat: number = CAT.high;
  let tie = ranks;
  if (shape[0] === 5) cat = CAT.five;
  else if (straightTop && flush) [cat, tie] = [CAT.straightFlush, [straightTop]];
  else if (shape[0] === 4) cat = CAT.quads;
  else if (shape[0] === 3 && shape[1] === 2) cat = CAT.full;
  // Une couleur se départage sur ses cinq cartes, doublons de folles compris (as, as, roi…).
  else if (flush) [cat, tie] = [CAT.flush, cards.map((c) => c.r).sort((x, y) => y - x)];
  else if (straightTop) [cat, tie] = [CAT.straight, [straightTop]];
  else if (shape[0] === 3) cat = CAT.trips;
  else if (shape[0] === 2 && shape[1] === 2) cat = CAT.twoPair;
  else if (shape[0] === 2) cat = CAT.pair;
  return { value: pack(cat, tie), cat, ranks: tie };
}

/** La meilleure main, avec les cartes qui la composent (indices dans la liste donnée). */
export interface BestHand extends HandValue {
  used: number[];
  /** Ce que représente chaque folle utilisée, dans l'ordre de `used`. */
  as: (Card | null)[];
}

function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === k) return void out.push([...acc]);
    for (let i = start; i < n; i++) pick(i + 1, [...acc, i]);
  };
  pick(0, []);
  return out;
}

/**
 * La meilleure main de cinq cartes (ou moins s'il y en a moins) parmi celles données. Une carte de
 * hauteur `wild` devient n'importe quelle carte, y compris une carte déjà présente : deux as de
 * pique dans une couleur, ou cinq rois, sont permis.
 */
export function bestHand(cards: readonly Card[], wild: number | null = null): BestHand {
  const size = Math.min(5, cards.length);
  let best: BestHand = { value: -1, cat: 0, ranks: [], used: [], as: [] };
  if (!size) return { ...best, value: 0 };
  for (const idx of combos(cards.length, size)) {
    const chosen = idx.map((i) => cards[i]!);
    const naturals = chosen.filter((c) => c.r !== wild);
    const k = chosen.length - naturals.length;
    if (k === 0) {
      const v = evaluateCards(chosen);
      if (v.value > best.value) best = { ...v, used: idx, as: idx.map(() => null) };
      continue;
    }
    // Les folles prennent toutes les valeurs utiles : n'importe quelle hauteur, et pour la
    // couleur, celle des cartes naturelles si elles en partagent une.
    const suit = naturals[0]?.s ?? 0;
    const sameSuit = naturals.every((c) => c.s === suit);
    const options: Card[] = [];
    for (let r = 2; r <= 14; r++) {
      options.push({ r, s: suit });
      if (sameSuit) options.push({ r, s: (suit + 1) % 4 });
    }
    const subs: Card[] = [];
    const tryAll = (from: number) => {
      if (subs.length === k) {
        const v = evaluateCards([...naturals, ...subs]);
        if (v.value > best.value) {
          let w = 0;
          best = { ...v, used: idx, as: chosen.map((c) => (c.r === wild ? subs[w++]! : null)) };
        }
        return;
      }
      for (let i = from; i < options.length; i++) {
        subs.push(options[i]!);
        tryAll(i);
        subs.pop();
      }
    };
    tryAll(0);
  }
  return best;
}

/** Le nom d'une main, en français : « Full aux rois par les 3 », « Couleur à l'as »… */
export function handName(h: HandValue): string {
  const [a = 0, b = 0] = h.ranks;
  switch (h.cat) {
    case CAT.five:
      return `Cinq ${rankName(a, true)}`;
    case CAT.straightFlush:
      return a === 14 ? "Quinte flush royale" : `Quinte flush ${au(a)}`;
    case CAT.quads:
      return `Carré ${de(a)}`;
    case CAT.full:
      return `Full aux ${rankName(a, true)} par les ${rankName(b, true)}`;
    case CAT.flush:
      return `Couleur ${au(a)}`;
    case CAT.straight:
      return `Quinte ${au(a)}`;
    case CAT.trips:
      return `Brelan ${de(a)}`;
    case CAT.twoPair:
      return `Double paire ${rankName(a, true)} et ${rankName(b, true)}`;
    case CAT.pair:
      return `Paire ${de(a)}`;
    default:
      return a ? `Hauteur ${rankName(a)}` : "—";
  }
}

// ---------------------------------------------------------------- primes

export interface BountyContext {
  /** Les deux cartes du gagnant, après un éventuel échange. */
  hole: Card[];
  /** Catégorie de sa meilleure main (si abattage). */
  cat: number;
  showdown: boolean;
  allIn: boolean;
  exchanged: boolean;
  wild: number | null;
}

export interface Bounty {
  id: string;
  name: string;
  text: string;
  /** La prime n'existe que si l'entorse correspondante est en jeu. */
  needs?: "wild" | "exchange";
  check: (c: BountyContext) => boolean;
}

export const BOUNTIES: readonly Bounty[] = [
  { id: "sept-deux", name: "Le 7-2", text: "Gagner en tenant un 7 et un 2, la pire main de départ.", check: (c) => [2, 7].every((r) => c.hole.some((x) => x.r === r)) },
  { id: "bluff", name: "Sans montrer", text: "Gagner sans abattage : tous les autres se couchent.", check: (c) => !c.showdown },
  { id: "petite", name: "Petite main", text: "Gagner l'abattage avec une paire ou moins.", check: (c) => c.showdown && c.cat <= CAT.pair },
  { id: "couleur", name: "Belle couleur", text: "Gagner avec une couleur ou mieux.", check: (c) => c.showdown && c.cat >= CAT.flush },
  { id: "brelan", name: "Le brelan", text: "Gagner l'abattage avec un brelan, pas plus, pas moins.", check: (c) => c.showdown && c.cat === CAT.trips },
  { id: "tapis", name: "Quitte ou double", text: "Gagner un pot en étant à tapis.", check: (c) => c.allIn },
  { id: "rouges", name: "Tout rouge", text: "Gagner avec deux cartes rouges en main.", check: (c) => c.hole.length === 2 && c.hole.every(isRed) },
  { id: "figures", name: "Têtes couronnées", text: "Gagner avec deux figures (valet, dame, roi) en main.", check: (c) => c.hole.length === 2 && c.hole.every((x) => x.r >= 11 && x.r <= 13) },
  { id: "folle", name: "Folie douce", text: "Gagner en tenant une carte folle en main.", needs: "wild", check: (c) => c.wild !== null && c.hole.some((x) => x.r === c.wild) },
  { id: "echange", name: "Bon échange", text: "Gagner après avoir échangé une carte.", needs: "exchange", check: (c) => c.exchanged },
];

export function bountyById(id: string | null): Bounty | undefined {
  return BOUNTIES.find((b) => b.id === id);
}

/** Les primes possibles avec ces réglages. */
export function availableBounties(config: TapisConfig): Bounty[] {
  return BOUNTIES.filter((b) => (b.needs === "wild" ? config.wild : b.needs === "exchange" ? config.exchange : true));
}

// ---------------------------------------------------------------- réglages

export const SPEEDS = ["calme", "normal", "rapide"] as const;
export type Speed = (typeof SPEEDS)[number];
/** Nombre de donnes par niveau de blindes. */
export const LEVEL_HANDS: Record<Speed, number> = { calme: 10, normal: 6, rapide: 4 };

/** 0 : jusqu'au dernier en lice. */
export const LENGTHS = [0, 15, 30] as const;
export type Length = (typeof LENGTHS)[number];

/** Petite et grosse blinde, niveau par niveau. */
export const BLINDS: readonly [number, number][] = [
  [10, 20],
  [15, 30],
  [25, 50],
  [40, 80],
  [60, 120],
  [100, 200],
  [150, 300],
  [250, 500],
  [400, 800],
  [600, 1200],
  [1000, 2000],
  [1500, 3000],
  [2500, 5000],
];

export function blindsFor(hand: number, speed: Speed): { sb: number; bb: number; level: number; nextIn: number } {
  const per = LEVEL_HANDS[speed];
  const level = Math.min(BLINDS.length - 1, Math.floor(hand / per));
  const [sb, bb] = BLINDS[level]!;
  const nextIn = level === BLINDS.length - 1 ? 0 : per - (hand % per);
  return { sb, bb, level, nextIn };
}

export interface TapisConfig {
  wild: boolean;
  exchange: boolean;
  bounty: boolean;
  speed: Speed;
  length: Length;
}

export const DEFAULT_CONFIG: TapisConfig = { wild: true, exchange: true, bounty: true, speed: "normal", length: 0 };

export const RULES = {
  minPlayers: 2,
  maxPlayers: 8,
  /** Jetons de départ : cent grosses blindes. */
  stack: 2000,
  /** Temps de parole, en secondes ; ensuite on parle (ou se couche) pour lui. */
  turnSeconds: 40,
  /** Pause entre deux donnes, en secondes (plus longue après un abattage). */
  pauseSeconds: 4,
  showdownSeconds: 8,
};

// ---------------------------------------------------------------- vue

export type Phase = "lobby" | "play" | "final";
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export const STREET_NAMES: Record<Street, string> = { preflop: "Avant le flop", flop: "Flop", turn: "Tournant", river: "Rivière", showdown: "Abattage" };

export interface TapisPlayer {
  id: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
  stack: number;
  /** Éliminé : sa place finale (1 = vainqueur), sinon null. */
  place: number | null;
  /** Dans la donne en cours. */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Mise du tour d'enchères en cours. */
  bet: number;
  /** Tout ce qu'il a mis dans le pot pendant la donne. */
  committed: number;
  exchanged: boolean;
  /** Il a montré ses cartes à tout le monde. */
  shown: boolean;
  /** Ses cartes : null si cachées pour toi, vide s'il n'en a pas. */
  cards: (Card | null)[];
}

export interface PotResult {
  amount: number;
  winners: number[];
  /** Seul à y avoir droit : c'est une mise que personne n'a suivie, rendue. */
  returned: boolean;
}

export interface HandResult {
  hand: number;
  showdown: boolean;
  pots: PotResult[];
  /** Par place : nom de la main et cartes utilisées (indices : 0-1 en main, 2-6 au tableau). */
  hands: Record<number, { name: string; cat: number; used: number[] } | undefined>;
  /** Gains nets de la donne, prime comprise. */
  delta: Record<number, number>;
  bounty: { id: string; winners: number[]; each: number } | null;
  eliminated: number[];
}

export type TapisEvent =
  | { k: "deal"; hand: number }
  | { k: "fold" | "check" | "call" | "bet" | "raise" | "allin"; slot: number; amount: number }
  | { k: "exchange"; slot: number }
  | { k: "street"; street: Street }
  | { k: "win"; slots: number[] }
  | { k: "show"; slot: number };

export interface LogLine {
  slot: number | null;
  text: string;
}

export interface TapisView {
  code: string;
  you: string;
  phase: Phase;
  config: TapisConfig;
  players: TapisPlayer[];
  /** Numéro de la donne (0 pour la première). */
  hand: number;
  blinds: { sb: number; bb: number; level: number; nextIn: number };
  button: number;
  sbSlot: number | null;
  bbSlot: number | null;
  street: Street;
  board: Card[];
  /** La carte retournée qui désigne les folles (sa hauteur). */
  wildCard: Card | null;
  bounty: string | null;
  /** À qui de parler, et jusqu'à quand (horodatage serveur, ms). */
  toAct: number | null;
  deadline: number | null;
  /** Ce que doit faire celui qui parle. */
  currentBet: number;
  minRaiseTo: number;
  /** Peut-il relancer (non après une relance incomplète à tapis s'il a déjà parlé). */
  canRaise: boolean;
  pot: number;
  result: HandResult | null;
  /** Fin de la pause entre deux donnes. */
  nextAt: number | null;
  log: LogLine[];
  lastEvent: TapisEvent | null;
  /** Heure du serveur, pour caler les comptes à rebours. */
  now: number;
}

export type TapisAction =
  | { t: "configure"; config: Partial<TapisConfig> }
  | { t: "start" }
  | { t: "fold" }
  | { t: "check" }
  | { t: "call" }
  /** Miser ou relancer jusqu'à ce total pour le tour d'enchères. */
  | { t: "bet"; to: number }
  | { t: "allin" }
  | { t: "exchange"; index: number }
  | { t: "show" }
  | { t: "ready" }
  | { t: "rematch" };
