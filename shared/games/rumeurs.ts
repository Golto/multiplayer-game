// Rumeurs : types, règles et actions partagés entre le serveur et le client.

export type CommodityId = "safran" | "cuivre" | "cacao" | "indigo";

export interface CommodityInfo {
  id: CommodityId;
  name: string;
  /** Accent Golpex utilisé comme couleur de donnée. */
  accent: string;
  /** Petite phrase d'ambiance affichée sur la carte. */
  motto: string;
}

export const COMMODITIES: readonly CommodityInfo[] = [
  { id: "safran", name: "Safran", accent: "peach", motto: "L'or rouge des crocus" },
  { id: "cuivre", name: "Cuivre", accent: "turquoise", motto: "Vert-de-gris et fils tendus" },
  { id: "cacao", name: "Cacao", accent: "strawberry", motto: "Fèves fermentées au soleil" },
  { id: "indigo", name: "Indigo", accent: "royalblue", motto: "Le bleu qu'on garde en cuve" },
];

export const COMMODITY_IDS: readonly CommodityId[] = COMMODITIES.map((c) => c.id);

/** Couleurs de joueurs, prises dans les accents Golpex restants. */
export const PLAYER_ACCENTS = [
  "amethyst",
  "green",
  "yellow",
  "pink",
  "bluesky",
  "magenta",
  "greenlemon",
  "crystalblue",
] as const;

export const RULES = {
  minPlayers: 3,
  maxPlayers: 8,
  rounds: 4,
  basePrice: 20,
  startCash: 100,
  startLots: 2,
  maxOrder: 3,
  cardValues: [-8, -6, -4, -2, -1, 0, 0, 1, 2, 4, 6, 8],
  rumorSeconds: 90,
  marketSeconds: 75,
  reportSeconds: 30,
  freeTextMax: 90,
} as const;

// ---------------------------------------------------------------- rumeurs

export type CardClaim = "pos" | "neg" | "zero" | "eq";
export type ValueClaim = "gte" | "lte";

export type RumorInput =
  | { kind: "card"; commodity: CommodityId; claim: CardClaim; value?: number }
  | { kind: "value"; commodity: CommodityId; claim: ValueClaim; value: number }
  | { kind: "free"; text: string }
  | { kind: "silence" };

export type Verdict = "true" | "false" | null;

export interface Rumor {
  id: number;
  round: number;
  author: string;
  input: RumorInput;
  verdict: Verdict;
}

// ---------------------------------------------------------------- état

export type Phase = "lobby" | "rumor" | "market" | "report" | "final";

export interface PublicPlayer {
  id: string;
  name: string;
  accent: string;
  connected: boolean;
  isHost: boolean;
  cash: number;
  lots: Record<CommodityId, number>;
  /** A déjà soumis pour la phase en cours. */
  done: boolean;
}

export interface CardView {
  /** Joueur qui voit cette carte, ou null pour la carte scellée. */
  owner: string | null;
  /** Valeur si visible pour ce client (sa propre carte ou carte révélée). */
  value: number | null;
  revealed: boolean;
}

export interface CommodityView {
  id: CommodityId;
  price: number;
  /** Prix après chaque événement (départ, marchés, révélations). */
  history: number[];
  cards: CardView[];
  /** Valeur finale, connue en fin de partie. */
  finalValue: number | null;
}

export interface TradeLine {
  player: string;
  orders: Record<CommodityId, number>;
}

export interface RoundReport {
  round: number;
  trades: TradeLine[];
  prices: Record<CommodityId, { before: number; after: number }>;
  reveal: { commodity: CommodityId; owner: string; value: number; priceAfter: number } | null;
}

export interface Award {
  id: string;
  title: string;
  player: string;
  detail: string;
}

export interface FinalResult {
  standings: { player: string; total: number; cash: number; lotsValue: number }[];
  awards: Award[];
}

export interface GameView {
  code: string;
  phase: Phase;
  round: number;
  /** Timestamp (ms) de fin de la phase en cours, ou null. */
  deadline: number | null;
  serverNow: number;
  you: string;
  players: PublicPlayer[];
  commodities: CommodityView[];
  rumors: Rumor[];
  reports: RoundReport[];
  /** Ce que ce client a déjà soumis pour la phase en cours. */
  yourRumor: RumorInput | null;
  yourOrders: Record<CommodityId, number> | null;
  final: FinalResult | null;
}

// ---------------------------------------------------------------- actions

/** Actions qu'un joueur envoie au jeu, dans l'enveloppe `{ t: "action" }` de la plateforme. */
export type RumeursAction =
  | { t: "start" }
  | { t: "rumor"; rumor: RumorInput }
  | { t: "orders"; orders: Record<CommodityId, number> }
  | { t: "ready" }
  | { t: "rematch" };

// ---------------------------------------------------------------- utilitaires

export function emptyOrders(): Record<CommodityId, number> {
  return { safran: 0, cuivre: 0, cacao: 0, indigo: 0 };
}

export function commodityName(id: CommodityId): string {
  return COMMODITIES.find((c) => c.id === id)?.name ?? id;
}

export function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** Phrase lisible pour une rumeur structurée. */
export function describeRumor(r: RumorInput): string {
  switch (r.kind) {
    case "card": {
      const c = commodityName(r.commodity);
      if (r.claim === "pos") return `Ma carte ${c} est positive.`;
      if (r.claim === "neg") return `Ma carte ${c} est négative.`;
      if (r.claim === "zero") return `Ma carte ${c} vaut zéro.`;
      return `Ma carte ${c} vaut exactement ${formatSigned(r.value ?? 0)}.`;
    }
    case "value": {
      const c = commodityName(r.commodity);
      return r.claim === "gte"
        ? `Le ${c} finira à ${r.value} écus ou plus.`
        : `Le ${c} finira à ${r.value} écus ou moins.`;
    }
    case "free":
      return r.text;
    case "silence":
      return "Pas de commentaire.";
  }
}
