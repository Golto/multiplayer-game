// Logique d'une partie de Tapis : un hold'em sans limite, avec la folle, l'échange et la prime
// (voir shared/games/tapis.ts pour les règles).

import { randomBytes } from "node:crypto";
import { NAME_MAX, PLAYER_ACCENTS } from "../../../shared/platform.js";
import {
  DEFAULT_CONFIG,
  LENGTHS,
  RULES,
  SPEEDS,
  STREET_NAMES,
  availableBounties,
  bestHand,
  blindsFor,
  bountyById,
  cardLabel,
  handName,
  newDeck,
  wildOf,
  shuffle,
  type BestHand,
  type Card,
  type HandResult,
  type Length,
  type LogLine,
  type Phase,
  type PotResult,
  type Speed,
  type Street,
  type TapisAction,
  type TapisConfig,
  type TapisEvent,
  type TapisView,
} from "../../../shared/games/tapis.js";
import { GameError, type GameRoom, type RoomHost } from "../../platform.js";

/** Délai avant qu'un absent parle (en se couchant ou en parlant). */
const AUTOPLAY_MS = 1500;
/** Pause entre deux cartes quand tout le monde est à tapis. */
const RUNOUT_MS = 1300;

interface Player {
  id: string;
  token: string;
  name: string;
  accent: string;
  slot: number;
  connected: boolean;
  ready: boolean;
  stack: number;
  place: number | null;
  // La donne en cours.
  inHand: boolean;
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  bet: number;
  committed: number;
  /** A parlé dans ce tour d'enchères. */
  acted: boolean;
  /** A parlé depuis la dernière relance complète : il ne peut plus relancer après une relance incomplète. */
  actedFull: boolean;
  exchanged: boolean;
  /** La carte rendue lors d'un échange, montrée à tous. */
  discarded: Card | null;
  shown: boolean;
  startStack: number;
}

const ORDER: Street[] = ["preflop", "flop", "turn", "river", "showdown"];

export class TapisGame implements GameRoom {
  readonly code: string;
  players: Player[] = [];
  hostId: string | null = null;
  phase: Phase = "lobby";
  config: TapisConfig = { ...DEFAULT_CONFIG };
  handNo = 0;
  button = 0;
  sbSlot: number | null = null;
  bbSlot: number | null = null;
  street: Street = "preflop";
  deck: Card[] = [];
  board: Card[] = [];
  wildCard: Card | null = null;
  bounty: string | null = null;
  toAct: number | null = null;
  deadline: number | null = null;
  currentBet = 0;
  /** Montant de la dernière relance complète : la suivante doit être au moins aussi grosse. */
  minRaise = 0;
  /** Argent mort (les échanges) : il revient au pot principal. */
  dead = 0;
  /** Plus personne ne peut parler : les cartes sont montrées et le tableau se déroule. */
  runout = false;
  result: HandResult | null = null;
  nextAt: number | null = null;
  /** La partie se termine à la fin de cette donne. */
  over = false;
  log: LogLine[] = [];
  lastEvent: TapisEvent | null = null;
  /** Pour les tests : le paquet de la prochaine donne, distribué dans l'ordre. */
  nextDeck: Card[] | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private flowTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    code: string,
    private readonly host: RoomHost,
    private readonly rng: () => number = Math.random,
    private readonly useTimers = true,
  ) {
    this.code = code;
  }

  // ------------------------------------------------------------ contrat de salon

  get joinable(): boolean {
    return this.phase === "lobby" && this.players.length < RULES.maxPlayers;
  }

  get playerCount(): number {
    return this.players.length;
  }

  addPlayer(rawName: string): Player {
    if (this.phase !== "lobby") throw new GameError("La partie a déjà commencé dans ce salon.");
    if (this.players.length >= RULES.maxPlayers) throw new GameError("La table est complète.");
    const name = String(rawName ?? "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, NAME_MAX);
    if (!name) throw new GameError("Choisis un pseudo.");
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError("Ce pseudo est déjà pris dans ce salon.");
    }
    const used = new Set(this.players.map((p) => p.slot));
    const usedAccents = new Set(this.players.map((p) => p.accent));
    const player: Player = {
      id: randomBytes(10).toString("base64url").slice(0, 10),
      token: randomBytes(24).toString("base64url").slice(0, 24),
      name,
      accent: PLAYER_ACCENTS.find((a) => !usedAccents.has(a)) ?? PLAYER_ACCENTS[0],
      slot: [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s))!,
      connected: true,
      ready: false,
      stack: RULES.stack,
      place: null,
      inHand: false,
      cards: [],
      folded: false,
      allIn: false,
      bet: 0,
      committed: 0,
      acted: false,
      actedFull: false,
      exchanged: false,
      discarded: null,
      shown: false,
      startStack: RULES.stack,
    };
    this.players.push(player);
    this.hostId ??= player.id;
    this.host.changed();
    return player;
  }

  resume(playerId: string, token: string): Player {
    const p = this.players.find((x) => x.id === playerId && x.token === token);
    if (!p) throw new GameError("Impossible de reprendre ta place à cette table.");
    p.connected = true;
    this.host.changed();
    this.scheduleTurn();
    return p;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    p.connected = connected;
    if (!connected && this.hostId === playerId) {
      const next = this.players.find((x) => x.connected && x.id !== playerId);
      if (next) this.hostId = next.id;
    }
    this.host.changed();
    this.scheduleTurn();
    this.checkReady();
  }

  leave(playerId: string): void {
    if (this.phase === "lobby" || this.phase === "final") {
      this.players = this.players.filter((x) => x.id !== playerId);
      if (this.hostId === playerId) this.hostId = this.players[0]?.id ?? null;
      this.host.changed();
    } else {
      this.setConnected(playerId, false);
    }
  }

  dispose(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.flowTimer) clearTimeout(this.flowTimer);
    this.turnTimer = null;
    this.flowTimer = null;
  }

  handle(playerId: string, action: unknown): void {
    const a = action as TapisAction;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError("Joueur inconnu.");
    switch (a?.t) {
      case "configure":
        return this.configure(playerId, a.config);
      case "start":
        return this.start(playerId);
      case "fold":
        return this.fold(p.slot);
      case "check":
        return this.check(p.slot);
      case "call":
        return this.call(p.slot);
      case "bet":
        return this.betTo(p.slot, Number(a.to));
      case "allin":
        return this.allIn(p.slot);
      case "exchange":
        return this.exchange(p.slot, Number(a.index));
      case "show":
        return this.show(p.slot);
      case "ready":
        if (!this.result) return;
        p.ready = true;
        this.host.changed();
        return this.checkReady();
      case "rematch":
        return this.rematch(playerId);
      default:
        throw new GameError("Action inconnue.");
    }
  }

  // ------------------------------------------------------------ préparation

  configure(by: string, config: Partial<TapisConfig>): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte règle la table.");
    if (this.phase !== "lobby") return;
    for (const key of ["wild", "exchange", "bounty"] as const) {
      if (typeof config?.[key] === "boolean") this.config[key] = config[key];
    }
    if (SPEEDS.includes(config?.speed as Speed)) this.config.speed = config.speed as Speed;
    if (LENGTHS.includes(Number(config?.length) as Length)) this.config.length = Number(config.length) as Length;
    this.host.changed();
  }

  start(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut lancer la partie.");
    if (this.phase !== "lobby") throw new GameError("La partie est déjà lancée.");
    const connected = this.players.filter((p) => p.connected);
    if (connected.length < RULES.minPlayers) throw new GameError(`Il faut au moins ${RULES.minPlayers} joueurs connectés.`);
    this.players = connected;
    for (const p of this.players) {
      p.stack = RULES.stack;
      p.place = null;
    }
    this.handNo = 0;
    this.over = false;
    this.log = [];
    this.button = this.players[Math.floor(this.rng() * this.players.length)]!.slot;
    this.phase = "play";
    this.startHand();
  }

  rematch(by: string): void {
    if (by !== this.hostId) throw new GameError("Seul l'hôte peut relancer.");
    if (this.phase !== "final") throw new GameError("La partie n'est pas terminée.");
    this.dispose();
    this.players = this.players.filter((p) => p.connected);
    if (!this.players.some((p) => p.id === this.hostId)) this.hostId = this.players[0]?.id ?? null;
    for (const p of this.players) this.resetHand(p, false);
    this.result = null;
    this.phase = "lobby";
    this.host.changed();
  }

  // ------------------------------------------------------------ la donne

  private alive(): Player[] {
    return this.players.filter((p) => p.place === null);
  }

  private bySlot(slot: number | null): Player | undefined {
    return slot === null ? undefined : this.players.find((p) => p.slot === slot);
  }

  /** Le joueur suivant (dans l'ordre de la table) qui vérifie la condition. */
  private next(slot: number, ok: (p: Player) => boolean): Player | undefined {
    const n = this.players.length;
    const i = this.players.findIndex((p) => p.slot === slot);
    for (let k = 1; k <= n; k++) {
      const p = this.players[(i + k) % n]!;
      if (ok(p)) return p;
    }
    return undefined;
  }

  private resetHand(p: Player, inHand: boolean): void {
    Object.assign(p, { inHand, cards: [], folded: false, allIn: false, bet: 0, committed: 0, acted: false, actedFull: false, exchanged: false, discarded: null, shown: false, ready: false, startStack: p.stack });
  }

  get blinds() {
    return blindsFor(this.handNo, this.config.speed);
  }

  private draw(): Card {
    return this.deck.shift()!;
  }

  startHand(): void {
    this.dispose();
    const alive = this.alive();
    if (alive.length < 2) return this.finish();
    for (const p of this.players) this.resetHand(p, p.place === null);
    this.deck = this.nextDeck ?? shuffle(newDeck(), this.rng);
    this.nextDeck = null;
    this.board = [];
    this.dead = 0;
    this.runout = false;
    this.result = null;
    this.nextAt = null;
    this.street = "preflop";
    this.wildCard = this.config.wild ? this.draw() : null;
    const bounties = this.config.bounty ? availableBounties(this.config) : [];
    this.bounty = bounties.length ? bounties[Math.floor(this.rng() * bounties.length)]!.id : null;
    // Deux cartes chacun, en commençant à gauche du bouton.
    const seated = [...alive];
    const from = seated.findIndex((p) => p.slot === this.button);
    const dealOrder = seated.map((_, k) => seated[(from + 1 + k) % seated.length]!);
    for (let round = 0; round < 2; round++) for (const p of dealOrder) p.cards.push(this.draw());

    // Les blindes. À deux, le bouton est petite blinde et parle le premier avant le flop.
    const { sb, bb } = this.blinds;
    const sbPlayer = alive.length === 2 ? this.bySlot(this.button)! : this.next(this.button, (p) => p.inHand)!;
    const bbPlayer = this.next(sbPlayer.slot, (p) => p.inHand)!;
    this.sbSlot = sbPlayer.slot;
    this.bbSlot = bbPlayer.slot;
    this.put(sbPlayer, Math.min(sb, sbPlayer.stack));
    this.put(bbPlayer, Math.min(bb, bbPlayer.stack));
    this.currentBet = bb;
    this.minRaise = bb;
    this.lastEvent = { k: "deal", hand: this.handNo };
    const twin = wildOf(this.wildCard);
    const wild = twin ? ` · folle : ${cardLabel(twin)}` : "";
    this.say(null, `Donne ${this.handNo + 1} · blindes ${sb}/${bb}${wild}`);
    this.toAct = null;
    const first = this.bettingOver() ? undefined : this.next(bbPlayer.slot, (p) => this.needsAction(p));
    if (!first) return this.endStreet();
    this.setTurn(first);
  }

  private put(p: Player, amount: number): void {
    const a = Math.max(0, Math.min(amount, p.stack));
    p.stack -= a;
    p.bet += a;
    p.committed += a;
    if (p.stack === 0 && p.inHand) p.allIn = true;
  }

  private canAct(): Player[] {
    return this.players.filter((p) => p.inHand && !p.folded && !p.allIn);
  }

  private needsAction(p: Player): boolean {
    return p.inHand && !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet);
  }

  /**
   * Plus personne n'a à parler : tous ont égalisé, ou il ne reste qu'un joueur non tapis qui a
   * déjà mis au moins autant que les autres (inutile qu'il parle contre des joueurs à tapis).
   */
  private bettingOver(): boolean {
    const free = this.canAct();
    if (free.length === 0) return true;
    if (free.length === 1) {
      const top = Math.max(...this.players.filter((p) => p.inHand && !p.folded).map((p) => p.bet));
      if (free[0]!.bet >= top) return true;
    }
    return !this.players.some((p) => this.needsAction(p));
  }

  canRaise(p: Player): boolean {
    return !p.actedFull && p.stack > this.currentBet - p.bet;
  }

  private setTurn(p: Player): void {
    this.toAct = p.slot;
    this.deadline = Date.now() + RULES.turnSeconds * 1000;
    this.host.changed();
    this.scheduleTurn();
  }

  private say(slot: number | null, text: string): void {
    this.log.push({ slot, text });
    if (this.log.length > 40) this.log.splice(0, this.log.length - 40);
  }

  // ------------------------------------------------------------ paroles

  private mustAct(slot: number): Player {
    if (this.phase !== "play" || this.result) throw new GameError("Ce n'est pas le moment.");
    if (this.toAct !== slot) throw new GameError("Ce n'est pas à toi de parler.");
    return this.bySlot(slot)!;
  }

  fold(slot: number): void {
    const p = this.mustAct(slot);
    p.folded = true;
    p.acted = true;
    this.lastEvent = { k: "fold", slot, amount: 0 };
    this.say(slot, "se couche");
    this.advance(p);
  }

  check(slot: number): void {
    const p = this.mustAct(slot);
    if (p.bet < this.currentBet) throw new GameError(`Il faut suivre (${this.currentBet - p.bet}) ou se coucher.`);
    p.acted = true;
    p.actedFull = true;
    this.lastEvent = { k: "check", slot, amount: 0 };
    this.say(slot, "parle");
    this.advance(p);
  }

  call(slot: number): void {
    const p = this.mustAct(slot);
    const owed = this.currentBet - p.bet;
    if (owed <= 0) return this.check(slot);
    this.put(p, owed);
    p.acted = true;
    p.actedFull = true;
    const amount = p.bet;
    this.lastEvent = { k: p.allIn ? "allin" : "call", slot, amount };
    this.say(slot, p.allIn ? `suit à tapis (${amount})` : `suit ${amount}`);
    this.advance(p);
  }

  /** Miser (ou relancer) jusqu'à `to` pour ce tour d'enchères. */
  betTo(slot: number, rawTo: number): void {
    const p = this.mustAct(slot);
    if (!Number.isFinite(rawTo)) throw new GameError("Montant invalide.");
    const max = p.bet + p.stack;
    const to = Math.min(Math.floor(rawTo), max);
    if (to <= this.currentBet) throw new GameError("Pour relancer, il faut miser plus.");
    if (!this.canRaise(p)) throw new GameError("Tu ne peux plus relancer ce tour-ci : suis ou couche-toi.");
    const minTo = this.minRaiseTo();
    if (to < minTo && to < max) throw new GameError(`Au moins ${minTo}, ou tapis.`);
    const opening = this.currentBet === 0;
    const raise = to - this.currentBet;
    const full = raise >= this.minRaise;
    this.put(p, to - p.bet);
    if (full) {
      this.minRaise = raise;
      for (const o of this.players) if (o !== p) o.actedFull = false;
    }
    for (const o of this.players) if (o !== p && !o.folded && !o.allIn) o.acted = false;
    this.currentBet = to;
    p.acted = true;
    p.actedFull = true;
    this.lastEvent = { k: p.allIn ? "allin" : opening ? "bet" : "raise", slot, amount: to };
    this.say(slot, p.allIn ? `fait tapis (${to})` : opening ? `mise ${to}` : `relance à ${to}`);
    this.advance(p);
  }

  allIn(slot: number): void {
    const p = this.mustAct(slot);
    const max = p.bet + p.stack;
    if (max <= this.currentBet || !this.canRaise(p)) return this.call(slot);
    this.betTo(slot, max);
  }

  minRaiseTo(): number {
    return this.currentBet === 0 ? this.blinds.bb : this.currentBet + this.minRaise;
  }

  exchange(slot: number, index: number): void {
    const p = this.mustAct(slot);
    if (!this.config.exchange) throw new GameError("L'échange n'est pas en jeu à cette table.");
    if (this.street !== "flop") throw new GameError("L'échange ne se fait qu'au flop.");
    if (p.exchanged) throw new GameError("Un seul échange par donne.");
    if (index !== 0 && index !== 1) throw new GameError("Choisis une de tes deux cartes.");
    const cost = this.blinds.bb * RULES.exchangeBB;
    if (p.stack <= cost) throw new GameError(`L'échange coûte ${cost} : il te faut plus de jetons.`);
    p.stack -= cost;
    this.dead += cost;
    p.discarded = p.cards[index]!;
    p.cards[index] = this.draw();
    p.exchanged = true;
    this.lastEvent = { k: "exchange", slot };
    this.say(slot, `échange et rend ${cardLabel(p.discarded)} (${cost} au pot)`);
    this.host.changed();
  }

  show(slot: number): void {
    const p = this.bySlot(slot);
    if (!p || !this.result || !p.cards.length) return;
    p.shown = true;
    this.lastEvent = { k: "show", slot };
    this.say(slot, `montre ${p.cards.map(cardLabel).join(" ")}`);
    this.host.changed();
  }

  /** Après une parole : la main est-elle gagnée, le tour d'enchères fini, ou au suivant ? */
  private advance(p: Player): void {
    const live = this.players.filter((x) => x.inHand && !x.folded);
    if (live.length === 1) return this.finishHand();
    const next = this.bettingOver() ? undefined : this.next(p.slot, (x) => this.needsAction(x));
    if (!next) return this.endStreet();
    this.setTurn(next);
  }

  private endStreet(): void {
    this.toAct = null;
    this.deadline = null;
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
      p.actedFull = false;
    }
    this.currentBet = 0;
    this.minRaise = this.blinds.bb;
    const live = this.players.filter((x) => x.inHand && !x.folded);
    // Plus personne (ou un seul) ne peut parler : on montre les cartes et on déroule le tableau.
    const stuck = this.canAct().length < 2;
    if (stuck && live.length > 1) this.runout = true;
    this.street = ORDER[ORDER.indexOf(this.street) + 1]!;
    if (this.street === "showdown") return this.finishHand();
    const n = this.street === "flop" ? 3 : 1;
    for (let i = 0; i < n; i++) this.board.push(this.draw());
    this.lastEvent = { k: "street", street: this.street };
    this.say(null, `${STREET_NAMES[this.street]} : ${this.board.slice(-n).map(cardLabel).join(" ")}`);
    if (stuck) {
      this.host.changed();
      if (!this.useTimers) return this.endStreet();
      this.flowTimer = setTimeout(() => this.endStreet(), RUNOUT_MS);
      return;
    }
    const first = this.next(this.button, (x) => this.needsAction(x))!;
    this.setTurn(first);
  }

  // ------------------------------------------------------------ fin de donne

  finishHand(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.toAct = null;
    this.deadline = null;
    const { sb } = this.blinds;
    const live = this.players.filter((p) => p.inHand && !p.folded);
    const showdown = live.length > 1;
    if (showdown) this.street = "showdown";
    const wild = wildOf(this.wildCard);
    const best = new Map<number, BestHand>();
    if (showdown) for (const p of live) best.set(p.slot, bestHand([...p.cards, ...this.board], wild));

    // Les pots : un par palier d'engagement des joueurs encore en lice.
    const pots: { amount: number; eligible: Player[]; returned: boolean }[] = [];
    const levels = [...new Set(live.map((p) => p.committed))].filter((x) => x > 0).sort((a, b) => a - b);
    let prev = 0;
    for (const level of levels) {
      let amount = 0;
      const contributors = new Set<Player>();
      for (const p of this.players) {
        const part = Math.min(p.committed, level) - Math.min(p.committed, prev);
        if (part > 0) contributors.add(p);
        amount += part;
      }
      const eligible = live.filter((p) => p.committed >= level);
      pots.push({ amount, eligible, returned: eligible.length === 1 && contributors.size === 1 && pots.length > 0 });
      prev = level;
    }
    const total = this.players.reduce((s, p) => s + p.committed, 0);
    const counted = pots.reduce((s, x) => s + x.amount, 0);
    if (!pots.length) pots.push({ amount: 0, eligible: live, returned: false });
    pots[pots.length - 1]!.amount += total - counted;
    pots[0]!.amount += this.dead;

    const results: PotResult[] = [];
    for (const pot of pots) {
      let winners = pot.eligible;
      if (showdown && winners.length > 1) {
        const top = Math.max(...winners.map((p) => best.get(p.slot)!.value));
        winners = winners.filter((p) => best.get(p.slot)!.value === top);
      }
      // Partage : les jetons en trop vont aux premiers gagnants à gauche du bouton.
      const order = this.seatOrderFrom(this.button).filter((p) => winners.includes(p));
      const share = Math.floor(pot.amount / order.length);
      let rest = pot.amount - share * order.length;
      for (const w of order) {
        w.stack += share + (rest > 0 ? 1 : 0);
        rest--;
      }
      results.push({ amount: pot.amount, winners: order.map((w) => w.slot), returned: pot.returned });
    }
    const mainWinners = results[0]?.winners ?? [];
    this.lastEvent = { k: "win", slots: mainWinners };
    for (const r of results) {
      if (r.returned) continue;
      // Le fil affiche déjà le nom de qui parle : on ne le répète que pour un partage.
      const how = showdown && r.winners.length ? ` avec ${handName(best.get(r.winners[0]!)!).toLowerCase()}` : "";
      if (r.winners.length === 1) this.say(r.winners[0]!, `remporte ${r.amount}${how}`);
      else this.say(null, `${r.winners.map((s) => this.bySlot(s)!.name).join(" et ")} partagent ${r.amount}${how}`);
    }

    // La prime : chacun des autres verse une grosse blinde à qui remplit le défi avec le pot principal.
    let bounty: HandResult["bounty"] = null;
    const def = bountyById(this.bounty);
    if (def) {
      const qualified = mainWinners
        .map((s) => this.bySlot(s)!)
        .filter((w) =>
          def.check({ hole: w.cards, cat: best.get(w.slot)?.cat ?? -1, showdown, allIn: w.allIn, exchanged: w.exchanged, wild }),
        );
      if (qualified.length) {
        for (const payer of this.alive()) {
          if (qualified.includes(payer)) continue;
          for (const q of qualified) {
            const pay = Math.min(sb, payer.stack);
            payer.stack -= pay;
            q.stack += pay;
          }
        }
        bounty = { id: def.id, winners: qualified.map((q) => q.slot), each: sb };
        if (qualified.length === 1) this.say(qualified[0]!.slot, `touche la prime « ${def.name} »`);
        else this.say(null, `${qualified.map((q) => q.name).join(" et ")} touchent la prime « ${def.name} »`);
      }
    }

    // Les éliminés : le plus gros tapis de départ finit devant.
    const out = this.players.filter((p) => p.place === null && p.stack === 0).sort((a, b) => a.startStack - b.startStack);
    let remaining = this.alive().length;
    for (const p of out) {
      p.place = remaining--;
      this.say(p.slot, `est éliminé (${p.place}e)`);
    }
    const alive = this.alive();
    const lastHand = this.config.length > 0 && this.handNo + 1 >= this.config.length;
    if (alive.length <= 1 || lastHand) {
      this.over = true;
      [...alive].sort((a, b) => b.stack - a.stack).forEach((p, i) => (p.place = i + 1));
    }

    const hands: HandResult["hands"] = {};
    for (const [slot, h] of best) hands[slot] = { name: handName(h), cat: h.cat, used: h.used };
    const delta: Record<number, number> = {};
    for (const p of this.players) if (p.inHand) delta[p.slot] = p.stack - p.startStack;
    this.result = { hand: this.handNo, showdown, pots: results, hands, delta, bounty, eliminated: out.map((p) => p.slot) };
    for (const p of this.players) p.ready = false;
    const pause = (showdown ? RULES.showdownSeconds : RULES.pauseSeconds) * 1000;
    this.nextAt = Date.now() + pause;
    this.host.changed();
    if (this.useTimers) this.flowTimer = setTimeout(() => this.nextHand(), pause);
  }

  private seatOrderFrom(slot: number): Player[] {
    const i = this.players.findIndex((p) => p.slot === slot);
    return this.players.map((_, k) => this.players[(i + 1 + k) % this.players.length]!);
  }

  private checkReady(): void {
    if (!this.result || this.phase !== "play") return;
    const waiting = this.players.filter((p) => p.connected && p.place === null && !p.ready);
    // Les éliminés regardent : seuls ceux encore en lice font avancer la table.
    if (waiting.length) return;
    this.nextHand();
  }

  nextHand(): void {
    if (this.phase !== "play" || !this.result) return;
    if (this.over) return this.finish();
    this.handNo += 1;
    this.button = this.next(this.button, (p) => p.place === null)!.slot;
    this.startHand();
  }

  private finish(): void {
    this.dispose();
    for (const p of this.alive()) p.place ??= 1;
    this.toAct = null;
    this.phase = "final";
    this.host.changed();
  }

  // ------------------------------------------------------------ temps de parole et absents

  private scheduleTurn(): void {
    if (!this.useTimers) return;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    const p = this.bySlot(this.toAct);
    if (this.phase !== "play" || !p || this.result) return;
    const delay = p.connected ? Math.max(0, (this.deadline ?? Date.now()) - Date.now()) : AUTOPLAY_MS;
    const hand = this.handNo;
    const street = this.street;
    this.turnTimer = setTimeout(() => {
      if (this.toAct === p.slot && this.handNo === hand && this.street === street) this.autoplay();
    }, delay);
  }

  /** Temps écoulé, ou joueur absent : il parle s'il le peut, sinon il se couche. */
  autoplay(): void {
    const p = this.bySlot(this.toAct);
    if (!p) return;
    if (p.bet >= this.currentBet) this.check(p.slot);
    else this.fold(p.slot);
  }

  // ------------------------------------------------------------ vue

  view(forId: string): TapisView {
    const showdown = !!this.result?.showdown;
    const actor = this.bySlot(this.toAct);
    return {
      code: this.code,
      you: forId,
      phase: this.phase,
      config: { ...this.config },
      players: this.players.map((p) => {
        // Une carte cachée ne quitte le serveur que vers son propriétaire.
        const open = p.id === forId || p.shown || ((showdown || this.runout) && p.inHand && !p.folded);
        return {
          id: p.id,
          name: p.name,
          accent: p.accent,
          slot: p.slot,
          connected: p.connected,
          isHost: p.id === this.hostId,
          ready: p.ready,
          stack: p.stack,
          place: p.place,
          inHand: p.inHand,
          folded: p.folded,
          allIn: p.allIn,
          bet: p.bet,
          committed: p.committed,
          exchanged: p.exchanged,
          discarded: p.discarded,
          shown: p.shown,
          cards: p.cards.map((c) => (open ? c : null)),
        };
      }),
      hand: this.handNo,
      blinds: this.blinds,
      button: this.button,
      sbSlot: this.sbSlot,
      bbSlot: this.bbSlot,
      street: this.street,
      board: this.board,
      wildCard: this.wildCard,
      bounty: this.bounty,
      toAct: this.toAct,
      deadline: this.deadline,
      currentBet: this.currentBet,
      minRaiseTo: this.minRaiseTo(),
      canRaise: actor ? this.canRaise(actor) : false,
      pot: this.players.reduce((s, p) => s + p.committed, 0) + this.dead,
      result: this.result,
      nextAt: this.nextAt,
      log: this.log.slice(-14),
      lastEvent: this.lastEvent,
      now: Date.now(),
    };
  }
}
