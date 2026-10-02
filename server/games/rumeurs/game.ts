// Logique d'une partie de Rumeurs, indépendante du transport réseau.

import { randomBytes } from "node:crypto";
import {
  COMMODITIES,
  COMMODITY_IDS,
  PLAYER_ACCENTS,
  RULES,
  emptyOrders,
  type Award,
  type CardView,
  type CommodityId,
  type FinalResult,
  type GameView,
  type Phase,
  type PublicPlayer,
  type RoundReport,
  type Rumor,
  type RumorInput,
  type RumeursAction,
} from "../../../shared/games/rumeurs.js";
import { NAME_MAX } from "../../../shared/platform.js";
import { GameError, type GameRoom } from "../../platform.js";

export type Rng = () => number;

interface PlayerState {
  id: string;
  name: string;
  accent: string;
  token: string;
  connected: boolean;
  cash: number;
  lots: Record<CommodityId, number>;
}

interface CardState {
  owner: string | null;
  value: number;
  revealed: boolean;
}

interface CommodityState {
  id: CommodityId;
  price: number;
  history: number[];
  cards: CardState[];
}

interface ExecutedTrade {
  player: string;
  commodity: CommodityId;
  qty: number;
  price: number;
}

export { GameError };

export class Game implements GameRoom {
  readonly code: string;
  players: PlayerState[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  round = 0;
  deadline: number | null = null;
  commodities: CommodityState[] = [];
  rumors: Rumor[] = [];
  reports: RoundReport[] = [];
  final: FinalResult | null = null;

  private pendingRumors = new Map<string, RumorInput>();
  private pendingOrders = new Map<string, Record<CommodityId, number>>();
  private ready = new Set<string>();
  private trades: ExecutedTrade[] = [];
  private nextRumorId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    code: string,
    private readonly onChange: () => void,
    private readonly rng: Rng = Math.random,
    private readonly useTimers = true,
  ) {
    this.code = code;
  }

  // ------------------------------------------------------------ joueurs

  addPlayer(rawName: string): PlayerState {
    if (this.phase !== "lobby") throw new GameError("La partie a déjà commencé dans ce salon.");
    if (this.players.length >= RULES.maxPlayers) throw new GameError("Le salon est complet.");
    const name = cleanName(rawName);
    if (!name) throw new GameError("Choisis un pseudo.");
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError("Ce pseudo est déjà pris dans ce salon.");
    }
    const used = new Set(this.players.map((p) => p.accent));
    const accent = PLAYER_ACCENTS.find((a) => !used.has(a)) ?? PLAYER_ACCENTS[0];
    const player: PlayerState = {
      id: randomId(10),
      name,
      accent,
      token: randomId(24),
      connected: true,
      cash: RULES.startCash,
      lots: startLots(),
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.onChange();
    return player;
  }

  resume(playerId: string, token: string): PlayerState {
    const p = this.players.find((x) => x.id === playerId && x.token === token);
    if (!p) throw new GameError("Impossible de reprendre ta place dans ce salon.");
    p.connected = true;
    this.onChange();
    return p;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.player(playerId);
    if (!p) return;
    p.connected = connected;
    if (!connected && this.hostId === playerId) this.passHost();
    this.onChange();
    this.checkAdvance();
  }

  leave(playerId: string): void {
    if (this.phase === "lobby" || this.phase === "final") {
      this.players = this.players.filter((x) => x.id !== playerId);
      if (this.hostId === playerId) this.hostId = this.players[0]?.id ?? null;
      this.onChange();
    } else {
      this.setConnected(playerId, false);
    }
  }

  get joinable(): boolean {
    return this.phase === "lobby" && this.players.length < RULES.maxPlayers;
  }

  get playerCount(): number {
    return this.players.length;
  }

  /** Aiguille une action de joueur vers la bonne méthode. */
  handle(playerId: string, action: unknown): void {
    const a = action as RumeursAction;
    switch (a?.t) {
      case "start":
        return this.start(playerId);
      case "rumor":
        return this.submitRumor(playerId, a.rumor);
      case "orders":
        return this.submitOrders(playerId, a.orders);
      case "ready":
        return this.markReady(playerId);
      case "rematch":
        return this.rematch(playerId);
      default:
        throw new GameError("Action inconnue.");
    }
  }

  get connectedCount(): number {
    return this.players.filter((p) => p.connected).length;
  }

  private passHost(): void {
    const next = this.players.find((p) => p.connected && p.id !== this.hostId);
    if (next) this.hostId = next.id;
  }

  private player(id: string): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  // ------------------------------------------------------------ déroulé

  start(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut lancer la partie.");
    if (this.phase !== "lobby") throw new GameError("La partie est déjà lancée.");
    if (this.connectedCount < RULES.minPlayers) {
      throw new GameError(`Il faut au moins ${RULES.minPlayers} joueurs connectés.`);
    }
    // Les places restées vides au moment du départ sont libérées.
    this.players = this.players.filter((p) => p.connected);
    for (const p of this.players) {
      p.cash = RULES.startCash;
      p.lots = startLots();
    }
    this.commodities = COMMODITIES.map((c) => {
      const cards: CardState[] = this.players.map((p) => ({
        owner: p.id,
        value: this.drawValue(),
        revealed: false,
      }));
      cards.push({ owner: null, value: this.drawValue(), revealed: false });
      return { id: c.id, price: RULES.basePrice, history: [RULES.basePrice], cards };
    });
    this.rumors = [];
    this.reports = [];
    this.trades = [];
    this.final = null;
    this.round = 0;
    this.enter("rumor");
  }

  submitRumor(playerId: string, input: RumorInput): void {
    if (this.phase !== "rumor") throw new GameError("Ce n'est pas le moment des rumeurs.");
    if (!this.player(playerId)) throw new GameError("Joueur inconnu.");
    this.pendingRumors.set(playerId, validateRumor(input));
    this.onChange();
    this.checkAdvance();
  }

  submitOrders(playerId: string, orders: Record<CommodityId, number>): void {
    if (this.phase !== "market") throw new GameError("Le marché est fermé.");
    const p = this.player(playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    const clean = emptyOrders();
    for (const id of COMMODITY_IDS) {
      const raw = Math.trunc(Number(orders?.[id] ?? 0)) || 0;
      clean[id] = clamp(raw, -Math.min(RULES.maxOrder, p.lots[id]), RULES.maxOrder);
    }
    this.pendingOrders.set(playerId, clean);
    this.onChange();
    this.checkAdvance();
  }

  markReady(playerId: string): void {
    if (this.phase !== "report") return;
    this.ready.add(playerId);
    this.onChange();
    this.checkAdvance();
  }

  rematch(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut relancer.");
    if (this.phase !== "final") throw new GameError("La partie n'est pas terminée.");
    this.players = this.players.filter((p) => p.connected);
    if (!this.players.some((p) => p.id === this.hostId)) this.hostId = this.players[0]?.id ?? null;
    this.phase = "lobby";
    this.deadline = null;
    this.final = null;
    this.commodities = [];
    this.rumors = [];
    this.reports = [];
    this.onChange();
  }

  /** Force la fin de la phase courante (fin du chrono). */
  advance(): void {
    switch (this.phase) {
      case "rumor":
        return this.closeRumors();
      case "market":
        return this.closeMarket();
      case "report":
        return this.closeReport();
      default:
        return;
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.pendingRumors.clear();
    this.pendingOrders.clear();
    this.ready.clear();
    this.dispose();
    const seconds =
      phase === "rumor"
        ? RULES.rumorSeconds
        : phase === "market"
          ? RULES.marketSeconds
          : phase === "report"
            ? RULES.reportSeconds
            : null;
    this.deadline = seconds ? Date.now() + seconds * 1000 : null;
    if (seconds && this.useTimers) {
      this.timer = setTimeout(() => this.advance(), seconds * 1000);
    }
    this.onChange();
  }

  private checkAdvance(): void {
    const active = this.players.filter((p) => p.connected);
    if (active.length === 0) return;
    const done = (set: { has(id: string): boolean }) => active.every((p) => set.has(p.id));
    if (this.phase === "rumor" && done(this.pendingRumors)) this.closeRumors();
    else if (this.phase === "market" && done(this.pendingOrders)) this.closeMarket();
    else if (this.phase === "report" && done(this.ready)) this.closeReport();
  }

  private closeRumors(): void {
    for (const p of this.players) {
      const input = this.pendingRumors.get(p.id) ?? { kind: "silence" as const };
      this.rumors.push({ id: this.nextRumorId++, round: this.round, author: p.id, input, verdict: null });
    }
    this.enter("market");
  }

  private closeMarket(): void {
    const impact = this.players.length <= 4 ? 2 : 1;
    const orders = new Map(this.players.map((p) => [p.id, this.pendingOrders.get(p.id) ?? emptyOrders()]));
    const report: RoundReport = {
      round: this.round,
      trades: [],
      prices: {} as RoundReport["prices"],
      reveal: null,
    };

    // Prix de compensation : un seul prix par marchandise, après l'impact de la demande nette.
    const clearing = {} as Record<CommodityId, number>;
    for (const c of this.commodities) {
      let net = 0;
      for (const o of orders.values()) net += o[c.id];
      clearing[c.id] = Math.max(1, c.price + impact * net);
    }

    for (const p of this.players) {
      const o = orders.get(p.id)!;
      // Les ventes d'abord, puis on rabote les achats que la caisse ne couvre pas.
      let cash = p.cash;
      for (const id of COMMODITY_IDS) if (o[id] < 0) cash += -o[id] * clearing[id];
      const buys = COMMODITY_IDS.filter((id) => o[id] > 0).sort((a, b) => clearing[b] - clearing[a]);
      let cost = buys.reduce((s, id) => s + o[id] * clearing[id], 0);
      for (const id of buys) {
        while (cost > cash && o[id] > 0) {
          o[id] -= 1;
          cost -= clearing[id];
        }
      }
      p.cash = cash - cost;
      for (const id of COMMODITY_IDS) {
        if (o[id] === 0) continue;
        p.lots[id] += o[id];
        this.trades.push({ player: p.id, commodity: id, qty: o[id], price: clearing[id] });
      }
      report.trades.push({ player: p.id, orders: { ...o } });
    }

    for (const c of this.commodities) {
      report.prices[c.id] = { before: c.price, after: clearing[c.id] };
      c.price = clearing[c.id];
      c.history.push(c.price);
    }

    // Révélation de la séance : une carte de joueur de la marchandise du jour.
    const target = this.commodities[this.round % this.commodities.length]!;
    const hidden = target.cards.filter((card) => card.owner && !card.revealed);
    const card = hidden[Math.floor(this.rng() * hidden.length)];
    if (card) {
      card.revealed = true;
      target.price = Math.max(1, target.price + card.value);
      target.history.push(target.price);
      report.reveal = {
        commodity: target.id,
        owner: card.owner!,
        value: card.value,
        priceAfter: target.price,
      };
      this.judgeCardRumors(target.id, card);
    }

    this.reports.push(report);
    this.enter("report");
  }

  private closeReport(): void {
    this.round += 1;
    if (this.round >= RULES.rounds) this.finish();
    else this.enter("rumor");
  }

  private finish(): void {
    const finals = {} as Record<CommodityId, number>;
    for (const c of this.commodities) {
      for (const card of c.cards) {
        if (!card.revealed) {
          card.revealed = true;
          this.judgeCardRumors(c.id, card);
        }
      }
      finals[c.id] = finalValue(c);
    }
    for (const r of this.rumors) {
      if (r.input.kind !== "value") continue;
      const v = finals[r.input.commodity];
      r.verdict = (r.input.claim === "gte" ? v >= r.input.value : v <= r.input.value) ? "true" : "false";
    }

    const standings = this.players
      .map((p) => {
        const lotsValue = COMMODITY_IDS.reduce((s, id) => s + p.lots[id] * finals[id], 0);
        return { player: p.id, cash: p.cash, lotsValue, total: p.cash + lotsValue };
      })
      .sort((a, b) => b.total - a.total);

    this.final = { standings, awards: this.computeAwards(finals) };
    this.enter("final");
  }

  private judgeCardRumors(commodity: CommodityId, card: CardState): void {
    if (!card.owner) return;
    for (const r of this.rumors) {
      if (r.author !== card.owner || r.input.kind !== "card" || r.input.commodity !== commodity) continue;
      r.verdict = cardClaimHolds(r.input.claim, r.input.value, card.value) ? "true" : "false";
    }
  }

  private computeAwards(finals: Record<CommodityId, number>): Award[] {
    const awards: Award[] = [];
    const stats = this.players.map((p) => {
      const mine = this.rumors.filter((r) => r.author === p.id);
      const flair = this.trades
        .filter((t) => t.player === p.id)
        .reduce((s, t) => s + t.qty * (finals[t.commodity] - t.price), 0);
      return {
        p,
        lies: mine.filter((r) => r.verdict === "false").length,
        truths: mine.filter((r) => r.verdict === "true").length,
        silences: mine.filter((r) => r.input.kind === "silence").length,
        flair,
      };
    });
    const best = <T>(list: T[], score: (x: T) => number) =>
      list.reduce<T | null>((acc, x) => (acc === null || score(x) > score(acc) ? x : acc), null);

    const liar = best(stats, (s) => s.lies);
    if (liar && liar.lies > 0) {
      awards.push({
        id: "vipere",
        title: "Langue de vipère",
        player: liar.p.id,
        detail: `${liar.lies} rumeur${liar.lies > 1 ? "s" : ""} démentie${liar.lies > 1 ? "s" : ""}`,
      });
    }
    const honest = best(
      stats.filter((s) => s.lies === 0),
      (s) => s.truths,
    );
    if (honest && honest.truths > 0) {
      awards.push({
        id: "or",
        title: "Parole d'or",
        player: honest.p.id,
        detail: `${honest.truths} rumeur${honest.truths > 1 ? "s" : ""} confirmée${honest.truths > 1 ? "s" : ""}, aucun mensonge`,
      });
    }
    const nose = best(stats, (s) => s.flair);
    if (nose && nose.flair > 0) {
      awards.push({
        id: "flair",
        title: "Flair de fouine",
        player: nose.p.id,
        detail: `+${nose.flair} écus gagnés sur ses échanges`,
      });
    }
    const pigeon = best(stats, (s) => -s.flair);
    if (pigeon && pigeon.flair < 0) {
      awards.push({
        id: "pigeon",
        title: "Pigeon du comptoir",
        player: pigeon.p.id,
        detail: `${pigeon.flair} écus perdus sur ses échanges`,
      });
    }
    const mute = best(stats, (s) => s.silences);
    if (mute && mute.silences >= 2) {
      awards.push({
        id: "carpe",
        title: "Muet comme une carpe",
        player: mute.p.id,
        detail: `${mute.silences} séances sans un mot`,
      });
    }
    return awards;
  }

  private drawValue(): number {
    const values = RULES.cardValues;
    return values[Math.floor(this.rng() * values.length)]!;
  }

  // ------------------------------------------------------------ vue

  view(forId: string): GameView {
    const players: PublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      accent: p.accent,
      connected: p.connected,
      isHost: p.id === this.hostId,
      cash: p.cash,
      lots: { ...p.lots },
      done:
        (this.phase === "rumor" && this.pendingRumors.has(p.id)) ||
        (this.phase === "market" && this.pendingOrders.has(p.id)) ||
        (this.phase === "report" && this.ready.has(p.id)),
    }));
    const commodities = this.commodities.map((c) => ({
      id: c.id,
      price: c.price,
      history: [...c.history],
      cards: c.cards.map<CardView>((card) => ({
        owner: card.owner,
        value: card.revealed || card.owner === forId ? card.value : null,
        revealed: card.revealed,
      })),
      finalValue: this.phase === "final" ? finalValue(c) : null,
    }));
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      deadline: this.deadline,
      serverNow: Date.now(),
      you: forId,
      players,
      commodities,
      rumors: this.rumors.map((r) => ({ ...r })),
      reports: this.reports,
      yourRumor: this.pendingRumors.get(forId) ?? null,
      yourOrders: this.pendingOrders.get(forId) ?? null,
      final: this.final,
    };
  }
}

// ---------------------------------------------------------------- aides

export function finalValue(c: { cards: { value: number }[] }): number {
  return Math.max(0, RULES.basePrice + c.cards.reduce((s, card) => s + card.value, 0));
}

export function cardClaimHolds(claim: string, claimed: number | undefined, actual: number): boolean {
  switch (claim) {
    case "pos":
      return actual > 0;
    case "neg":
      return actual < 0;
    case "zero":
      return actual === 0;
    case "eq":
      return actual === claimed;
    default:
      return false;
  }
}

export function validateRumor(input: RumorInput): RumorInput {
  if (!input || typeof input !== "object") throw new GameError("Rumeur invalide.");
  switch (input.kind) {
    case "silence":
      return { kind: "silence" };
    case "free": {
      const text = String(input.text ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, RULES.freeTextMax);
      if (!text) throw new GameError("La rumeur est vide.");
      return { kind: "free", text };
    }
    case "card": {
      if (!COMMODITY_IDS.includes(input.commodity)) throw new GameError("Marchandise inconnue.");
      if (!["pos", "neg", "zero", "eq"].includes(input.claim)) throw new GameError("Affirmation inconnue.");
      if (input.claim === "eq") {
        const value = Math.trunc(Number(input.value));
        if (!Number.isFinite(value) || Math.abs(value) > 8) throw new GameError("Valeur de carte hors limites.");
        return { kind: "card", commodity: input.commodity, claim: "eq", value };
      }
      return { kind: "card", commodity: input.commodity, claim: input.claim };
    }
    case "value": {
      if (!COMMODITY_IDS.includes(input.commodity)) throw new GameError("Marchandise inconnue.");
      if (input.claim !== "gte" && input.claim !== "lte") throw new GameError("Affirmation inconnue.");
      const value = Math.trunc(Number(input.value));
      if (!Number.isFinite(value) || value < 0 || value > 200) throw new GameError("Valeur hors limites.");
      return { kind: "value", commodity: input.commodity, claim: input.claim, value };
    }
    default:
      throw new GameError("Rumeur invalide.");
  }
}

function cleanName(raw: string): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

function startLots(): Record<CommodityId, number> {
  const lots = emptyOrders();
  for (const id of COMMODITY_IDS) lots[id] = RULES.startLots;
  return lots;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function randomId(length: number): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}
