import { describe, expect, it } from "vitest";
import { Game, GameError, cardClaimHolds, finalValue } from "./game.js";
import { RULES, emptyOrders } from "../../../shared/games/rumeurs.js";

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(n = 3) {
  const game = new Game("TEST1", () => {}, seeded(), false);
  const players = Array.from({ length: n }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  return { game, players };
}

describe("salon", () => {
  it("refuse de lancer à moins de 3 joueurs", () => {
    const { game, players } = setup(2);
    expect(() => game.start(players[0]!.id)).toThrow(GameError);
  });

  it("refuse les pseudos en double et laisse seul l'hôte lancer", () => {
    const { game, players } = setup(3);
    expect(() => game.addPlayer("joueur 1")).toThrow(GameError);
    expect(() => game.start(players[1]!.id)).toThrow(GameError);
    game.start(players[0]!.id);
    expect(game.phase).toBe("rumor");
  });

  it("distribue une carte par joueur et une carte scellée par marchandise", () => {
    const { game, players } = setup(4);
    game.start(players[0]!.id);
    for (const c of game.commodities) expect(c.cards).toHaveLength(5);
    const view = game.view(players[1]!.id);
    for (const c of view.commodities) {
      for (const card of c.cards) {
        expect(card.value === null).toBe(card.owner !== players[1]!.id);
      }
    }
  });
});

describe("déroulé", () => {
  it("joue une partie complète et classe les joueurs", () => {
    const { game, players } = setup(3);
    const [a, b, c] = players.map((p) => p.id) as [string, string, string];
    game.start(a);
    for (let round = 0; round < RULES.rounds; round++) {
      expect(game.phase).toBe("rumor");
      game.submitRumor(a, { kind: "card", commodity: "cuivre", claim: "pos" });
      game.submitRumor(b, { kind: "value", commodity: "safran", claim: "gte", value: 25 });
      game.submitRumor(c, { kind: "free", text: "  Le cacao   est pourri  " });
      expect(game.phase).toBe("market");
      game.submitOrders(a, { ...emptyOrders(), cuivre: 3 });
      game.submitOrders(b, { ...emptyOrders(), safran: -2 });
      game.submitOrders(c, emptyOrders());
      expect(game.phase).toBe("report");
      players.forEach((p) => game.markReady(p.id));
    }
    expect(game.phase).toBe("final");
    const final = game.final!;
    expect(final.standings).toHaveLength(3);
    expect(final.standings[0]!.total).toBeGreaterThanOrEqual(final.standings[2]!.total);
    expect(game.rumors.filter((r) => r.input.kind !== "free").every((r) => r.verdict !== null)).toBe(true);
    expect(game.rumors.find((r) => r.input.kind === "free")!.input).toEqual({
      kind: "free",
      text: "Le cacao est pourri",
    });
    expect(game.commodities.every((c) => c.cards.every((card) => card.revealed))).toBe(true);
  });

  it("applique l'impact de la demande et révèle une carte par séance", () => {
    const { game, players } = setup(3);
    const [a, b, c] = players.map((p) => p.id) as [string, string, string];
    game.start(a);
    game.advance(); // tout le monde se tait
    expect(game.rumors.every((r) => r.input.kind === "silence")).toBe(true);
    game.submitOrders(a, { ...emptyOrders(), cacao: 2 });
    game.submitOrders(b, { ...emptyOrders(), cacao: 1 });
    game.submitOrders(c, { ...emptyOrders(), cacao: -1 });
    const report = game.reports[0]!;
    expect(report.prices.cacao).toEqual({ before: 20, after: 24 });
    expect(game.players[0]!.cash).toBe(RULES.startCash - 48);
    expect(game.players[2]!.cash).toBe(RULES.startCash + 24);
    expect(report.reveal?.commodity).toBe("safran");
    const safran = game.commodities[0]!;
    expect(safran.price).toBe(Math.max(1, 20 + report.reveal!.value));
  });

  it("ne vend pas ce qu'on n'a pas et rabote les achats trop chers", () => {
    const { game, players } = setup(3);
    const [a, b, c] = players.map((p) => p.id) as [string, string, string];
    game.start(a);
    game.advance();
    game.submitOrders(a, { safran: 3, cuivre: 3, cacao: 3, indigo: 3 });
    game.submitOrders(b, { ...emptyOrders(), indigo: -9 });
    game.submitOrders(c, emptyOrders());
    const pa = game.players[0]!;
    const pb = game.players[1]!;
    expect(pb.lots.indigo).toBe(0);
    expect(pa.cash).toBeGreaterThanOrEqual(0);
    expect(pa.cash).toBeLessThan(26);
  });

  it("avance quand un joueur déconnecté ne répond pas", () => {
    const { game, players } = setup(3);
    const [a, b, c] = players.map((p) => p.id) as [string, string, string];
    game.start(a);
    game.setConnected(c, false);
    game.submitRumor(a, { kind: "silence" });
    game.submitRumor(b, { kind: "silence" });
    expect(game.phase).toBe("market");
  });
});

describe("vérification des rumeurs", () => {
  it("juge les affirmations sur une carte", () => {
    expect(cardClaimHolds("pos", undefined, 2)).toBe(true);
    expect(cardClaimHolds("neg", undefined, 0)).toBe(false);
    expect(cardClaimHolds("zero", undefined, 0)).toBe(true);
    expect(cardClaimHolds("eq", -4, -4)).toBe(true);
  });

  it("borne la valeur finale à zéro", () => {
    expect(finalValue({ cards: [{ value: -8 }, { value: -8 }, { value: -8 }] })).toBe(0);
    expect(finalValue({ cards: [{ value: 4 }, { value: -1 }] })).toBe(23);
  });
});

describe("plateforme", () => {
  it("aiguille les actions de joueur et refuse les inconnues", () => {
    const { game, players } = setup(3);
    const [a, b] = players.map((p) => p.id) as [string, string];
    expect(game.joinable).toBe(true);
    game.handle(a, { t: "start" });
    expect(game.phase).toBe("rumor");
    expect(game.joinable).toBe(false);
    game.handle(b, { t: "rumor", rumor: { kind: "silence" } });
    expect(game.view(b).yourRumor).toEqual({ kind: "silence" });
    expect(() => game.handle(a, { t: "inconnue" })).toThrow(GameError);
    expect(() => game.handle(a, null)).toThrow(GameError);
  });

  it("enregistre Rumeurs dans le registre des jeux", async () => {
    const { gameDefinition } = await import("../registry.js");
    expect(gameDefinition("rumeurs")?.id).toBe("rumeurs");
    expect(gameDefinition("toString")).toBeUndefined();
    expect(gameDefinition(42)).toBeUndefined();
    const room = gameDefinition("rumeurs")!.create("ABCDE", { changed: () => {}, emit: () => {} });
    expect(room.code).toBe("ABCDE");
    expect(room.playerCount).toBe(0);
  });
});
