import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { ZeroGame } from "./game.js";
import {
  GRIDS,
  RULES,
  add,
  buildDeck,
  cardKinds,
  columnClears,
  equals,
  evaluate,
  gridValue,
  leadingTerm,
  format,
  isZero,
  neg,
  rng,
  weight,
  type Poly,
  type ZeroView,
} from "../../../shared/games/zero.js";

function seeded(seed = 3) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(players = 2, config: Record<string, number> = {}) {
  const game = new ZeroGame("ZER01", { changed: () => {}, emit: () => {} }, seeded(), false);
  const ps = Array.from({ length: players }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  if (Object.keys(config).length) game.handle(ps[0]!.id, { t: "configure", config });
  game.handle(ps[0]!.id, { t: "start" });
  return { game, ps };
}

/** Révèle deux cartes pour tout le monde : la partie commence. */
function begin(game: ZeroGame, ps: { id: string }[]) {
  for (const p of ps) {
    game.handle(p.id, { t: "reveal", index: 0 });
    game.handle(p.id, { t: "reveal", index: 1 });
  }
}

describe("polynômes", () => {
  it("s'additionnent, se comparent et pèsent la somme de leurs coefficients", () => {
    const p: Poly = [3, -1, 2];
    expect(format(p)).toBe("2x² − x + 3");
    expect(format([0, -1])).toBe("−x");
    expect(format([0, 0, 0])).toBe("0");
    expect(format([-2, 0, 0, 1])).toBe("x³ − 2");
    expect(weight(p)).toBe(6);
    expect(isZero(add(p, neg(p)))).toBe(true);
    expect(equals([1, 2], [1, 2, 0])).toBe(true);
  });

  it("s'évaluent en x, et une colonne s'efface quand ses cartes ont le même terme dominant", () => {
    const p: Poly = [3, -1, 2];
    expect([-1, 0, 1].map((x) => evaluate(p, x))).toEqual([6, 3, 4]);
    expect(leadingTerm(p)).toEqual([2, 2]);
    expect(leadingTerm([0, 0, 0])).toBeNull();
    expect(columnClears([[1, 0, 3], [0, -1, 3], [0, 0, 3]])).toBe(true);
    expect(columnClears([[1, 0, 3], [0, -1, 2], [0, 0, 3]])).toBe(false);
    expect(columnClears([[5, 1], [5, 1, 0], [0, 1]])).toBe(true);
    expect(columnClears([[0], [0], [0]])).toBe(true);
    expect(columnClears([[0], [0], [1]])).toBe(false);
    expect(gridValue([[1, 1], [-2], [0, 0, 1]], -1)).toBe(0 + -2 + 1);
  });
});

describe("degré 0", () => {
  it("c'est exactement le Skyjo : les 150 cartes, des valeurs sans x, des colonnes de cartes identiques", () => {
    const kinds = cardKinds(0, rng(1));
    const count = new Map<number, number>();
    for (const k of kinds) count.set(k.card[0]!, (count.get(k.card[0]!) ?? 0) + k.copies);
    expect(Object.fromEntries(count)).toEqual({ "-2": 5, "-1": 10, "0": 15, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 10])) });
    for (const k of kinds) expect(new Set([-1, 0, 1].map((x) => evaluate(k.card, x))).size).toBe(1);
    expect(columnClears([[7], [7], [7]])).toBe(true);
    expect(columnClears([[7], [7], [6]])).toBe(false);
  });

  it("à x = 1, chaque carte vaut sa valeur Skyjo, de −2 à 12", () => {
    for (const degree of [1, 2, 3] as const) {
      const values = cardKinds(degree, rng(degree)).map((k) => evaluate(k.card, 1));
      expect(Math.min(...values)).toBe(-2);
      expect(Math.max(...values)).toBe(12);
    }
  });
});

describe("paquet", () => {
  it("ressemble au Skyjo : des cartes positives de poids 1 à 12, des zéros et quelques négatives", () => {
    for (const degree of [0, 1, 2, 3] as const) {
      const kinds = cardKinds(degree, rng(7 + degree));
      expect(isZero(kinds[0]!.card)).toBe(true);
      const positive = kinds.filter((k) => k.card.every((c) => c >= 0) && !isZero(k.card));
      expect(positive.map((k) => weight(k.card)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(new Set(positive.map((k) => k.card.join(","))).size).toBe(12);
      const negative = kinds.filter((k) => k.card.some((c) => c < 0));
      expect(negative.every((k) => k.card.filter((c) => c).length === 1)).toBe(true);
      // Tous les degrés jusqu'au maximum servent.
      const degrees = new Set(positive.map((k) => k.card.reduce((d, c, i) => (c ? i : d), -1)));
      for (let d = 0; d <= degree; d++) expect(degrees.has(d), `degré ${d} sur ${degree}`).toBe(true);
      for (const k of kinds) expect(k.card.length).toBe(degree + 1);
    }
    // Au degré 0 : exactement les 150 cartes du Skyjo, mais −2 et −1 compris.
    expect(cardKinds(0, rng(1)).reduce((s, k) => s + k.copies, 0)).toBe(150);
  });

  it("suffit pour toutes les grilles, même à huit", () => {
    for (const g of GRIDS) {
      const deck = buildDeck({ rows: g.rows, cols: g.cols, degree: 2, target: 100 }, 8, rng(1));
      expect(deck.length).toBeGreaterThanOrEqual(8 * g.rows * g.cols + 40);
    }
  });
});

describe("manche", () => {
  it("seul l'hôte règle la grille, le degré et l'objectif", () => {
    const game = new ZeroGame("Z", { changed: () => {}, emit: () => {} }, seeded(), false);
    const a = game.addPlayer("A");
    const b = game.addPlayer("B");
    expect(() => game.handle(b.id, { t: "configure", config: { degree: 3 } })).toThrow(GameError);
    game.handle(a.id, { t: "configure", config: { rows: 4, cols: 5, degree: 3, target: 50 } });
    expect(game.config).toEqual({ rows: 4, cols: 5, degree: 3, target: 50 });
    game.handle(a.id, { t: "configure", config: { rows: 7, degree: 9 as never } });
    expect(game.config).toEqual({ rows: 4, cols: 5, degree: 3, target: 50 });
  });

  it("chacun révèle deux cartes, puis la plus grosse main visible commence", () => {
    const { game, ps } = setup(3);
    expect(game.phase).toBe("setup");
    game.handle(ps[0]!.id, { t: "reveal", index: 0 });
    game.handle(ps[0]!.id, { t: "reveal", index: 1 });
    game.handle(ps[0]!.id, { t: "reveal", index: 2 });
    expect(game.grids.get(ps[0]!.slot)!.filter((c) => c.up)).toHaveLength(2);
    begin(game, ps.slice(1));
    expect(game.phase).toBe("play");
    const shown = (slot: number) => game.grids.get(slot)!.filter((c) => c.up).reduce((s, c) => s + weight(c.card!), 0);
    expect(shown(game.turn)).toBe(Math.max(...ps.map((p) => shown(p.slot))));
  });

  it("les cartes cachées ne sont jamais envoyées, même à leur propriétaire", () => {
    const { game, ps } = setup(2);
    const v = game.view(ps[0]!.id) as ZeroView;
    expect(v.grids[ps[0]!.slot]!.every((c) => c.card === null)).toBe(true);
    begin(game, ps);
    const w = game.view(ps[1]!.id) as ZeroView;
    expect(w.grids[ps[0]!.slot]!.filter((c) => c.card !== null)).toHaveLength(2);
  });

  it("un tour : piocher puis échanger, ou défausser puis retourner", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const first = ps.find((p) => p.slot === game.turn)!;
    const other = ps.find((p) => p.slot !== game.turn)!;
    expect(() => game.handle(other.id, { t: "draw", from: "deck" })).toThrow(GameError);
    // Pris à la défausse : impossible de le défausser à nouveau.
    game.handle(first.id, { t: "draw", from: "discard" });
    expect(() => game.handle(first.id, { t: "discard" })).toThrow(GameError);
    const taken = game.hand!;
    game.handle(first.id, { t: "swap", index: 5 });
    expect(game.grids.get(first.slot)![5]).toMatchObject({ card: taken, up: true });
    expect(game.turn).toBe(other.slot);
    game.handle(other.id, { t: "draw", from: "deck" });
    game.handle(other.id, { t: "discard" });
    expect(game.step).toBe("flip");
    expect(() => game.handle(other.id, { t: "reveal", index: 0 })).toThrow(GameError);
    game.handle(other.id, { t: "reveal", index: 7 });
    expect(game.grids.get(other.slot)![7]!.up).toBe(true);
    expect(game.turn).toBe(first.slot);
  });

  it("une colonne dont les cartes ont le même terme dominant s'efface", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const me = ps.find((p) => p.slot === game.turn)!;
    const grid = game.grids.get(me.slot)!;
    const { cols } = game.config;
    // Colonne 0 : 3x² + 1 et 3x² − x déjà visibles ; 3x² arrive par la défausse.
    grid[0] = { card: [1, 0, 3], up: true };
    grid[cols] = { card: [0, -1, 3], up: true };
    grid[2 * cols] = { card: [5, 0, 0], up: false };
    game.discard.push([0, 0, 3]);
    game.handle(me.id, { t: "draw", from: "discard" });
    game.handle(me.id, { t: "swap", index: 2 * cols });
    expect([0, cols, 2 * cols].every((i) => grid[i]!.card === null)).toBe(true);
    expect(game.lastEvent).toMatchObject({ k: "column", col: 0 });
  });

  it("le dé tire x, et chaque carte vaut P(x)", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const cols = game.config.cols;
    for (const p of ps) {
      // x sur toute la première ligne, 1 partout ailleurs (constantes différentes par colonne pour éviter les effacements).
      game.grids.get(p.slot)!.forEach((c, i) => (c.card = i < cols ? [0, 1, 0] : [1 + (i % cols), 0, 0]));
    }
    game.endRound(-1);
    const r = game.results[0]!;
    expect(r.x).toBe(-1);
    const expected = cols * -1 + [...Array(2 * cols)].reduce((s, _, k) => s + 1 + (k % cols), 0);
    expect(r.scores[ps[0]!.slot]!.cards).toBe(expected);
  });

  it("quand quelqu'un a tout révélé, les autres jouent une dernière fois, puis on compte", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const closer = ps.find((p) => p.slot === game.turn)!;
    const other = ps.find((p) => p.slot !== game.turn)!;
    // Toutes ses cartes sauf une sont déjà visibles.
    const grid = game.grids.get(closer.slot)!;
    grid.forEach((c, i) => (c.up = i !== 11));
    game.handle(closer.id, { t: "draw", from: "deck" });
    game.handle(closer.id, { t: "discard" });
    game.handle(closer.id, { t: "reveal", index: 11 });
    expect(game.closer).toBe(closer.slot);
    expect(game.phase).toBe("play");
    expect(game.turn).toBe(other.slot);
    game.handle(other.id, { t: "draw", from: "deck" });
    game.handle(other.id, { t: "swap", index: 3 });
    expect(game.phase).toBe("reveal");
    const r = game.results[0]!;
    expect(Object.keys(r.scores)).toHaveLength(2);
    expect(r.closer).toBe(closer.slot);
    // Toutes les cartes sont visibles à la fin de la manche.
    expect([...game.grids.values()].every((g) => g.every((c) => c.up))).toBe(true);
  });

  it("celui qui clôt sans être strictement le plus bas double son score", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const closer = ps.find((p) => p.slot === game.turn)!;
    const other = ps.find((p) => p.slot !== game.turn)!;
    const cols = game.config.cols;
    // Le clôtureur a une main lourde, l'autre une main nulle.
    const heavy = game.grids.get(closer.slot)!;
    heavy.forEach((c, i) => {
      // Lignes 1, 2, 3 : chaque colonne vaut 6, et aucune ne s'efface.
      c.card = [1 + Math.floor(i / cols), 0, 0];
      c.up = i !== 11;
    });
    game.grids.get(other.slot)!.forEach((c, i) => (c.card = [[1, 0, 0], [-1, 0, 0], [2, 0, 0]][Math.floor(i / cols)]!.slice()));
    game.handle(closer.id, { t: "draw", from: "deck" });
    game.handle(closer.id, { t: "discard" });
    game.handle(closer.id, { t: "reveal", index: 11 });
    game.handle(other.id, { t: "draw", from: "deck" });
    game.handle(other.id, { t: "discard" });
    game.handle(other.id, { t: "reveal", index: game.grids.get(other.slot)!.findIndex((c) => !c.up) });
    const s = game.results[0]!.scores;
    expect(s[closer.slot]!.doubled).toBe(true);
    expect(s[closer.slot]!.score).toBe(s[closer.slot]!.cards * 2);
    expect(s[other.slot]!.doubled).toBe(false);
  });

  it("la partie s'arrête quand quelqu'un atteint l'objectif", () => {
    const { game, ps } = setup(2, { target: 50 });
    begin(game, ps);
    game.players[0]!.total = 49;
    game.endRound();
    game.players[0]!.total = Math.max(game.players[0]!.total, 50);
    for (const p of ps) game.handle(p.id, { t: "ready" });
    expect(game.phase).toBe("final");
    game.handle(ps[0]!.id, { t: "rematch" });
    expect(game.phase).toBe("lobby");
  });

  it("la pioche vide se reconstitue avec la défausse, sauf la carte du dessus", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const me = ps.find((p) => p.slot === game.turn)!;
    game.discard.push(...game.deck.splice(0));
    const top = game.discard[game.discard.length - 1];
    game.handle(me.id, { t: "draw", from: "deck" });
    expect(game.discard).toEqual([top]);
    expect(game.deck.length).toBeGreaterThan(0);
  });

  it("un absent joue tout seul", () => {
    const { game, ps } = setup(2);
    begin(game, ps);
    const me = ps.find((p) => p.slot === game.turn)!;
    game.setConnected(me.id, false);
    game.autoplay();
    game.autoplay();
    game.autoplay();
    expect(game.turn).not.toBe(me.slot);
  });
});
