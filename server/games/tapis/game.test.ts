import { describe, expect, it, vi } from "vitest";
import { GameError } from "../../platform.js";
import { TapisGame } from "./game.js";
import { CAT, RULES, bestHand, evaluateCards, handName, newDeck, rng, type Card, type TapisConfig } from "../../../shared/games/tapis.js";

/** « As », « Th », « 7d », « 2c » → carte. */
function c(label: string): Card {
  const r = "23456789TJQKA".indexOf(label[0]!) + 2;
  const s = "shdc".indexOf(label[1]!);
  if (r < 2 || s < 0) throw new Error(label);
  return { r, s };
}
const cs = (labels: string) => labels.split(" ").map(c);

/** Un paquet qui commence par ces cartes, puis le reste dans l'ordre. */
function deck(labels: string): Card[] {
  const head = cs(labels);
  const key = (x: Card) => `${x.r}${x.s}`;
  const used = new Set(head.map(key));
  return [...head, ...newDeck().filter((x) => !used.has(key(x)))];
}

const quiet: Partial<TapisConfig> = { wild: false, exchange: false, bounty: false };

/** Une table de n joueurs (A, B, C…) ; le bouton est A (le hasard vaut toujours 0). */
function table(n: number, config: Partial<TapisConfig> = quiet, cards?: string) {
  const game = new TapisGame("T", { changed: () => {}, emit: () => {} }, () => 0, false);
  const ps = "ABCDEFGH".slice(0, n).split("").map((name) => game.addPlayer(name));
  game.handle(ps[0]!.id, { t: "configure", config });
  if (cards) game.nextDeck = deck(cards);
  game.handle(ps[0]!.id, { t: "start" });
  const at = (i: number) => game.players[i]!;
  const act = (i: number, action: object) => game.handle(ps[i]!.id, action);
  return { game, ps, at, act };
}

describe("mains", () => {
  it("classe les catégories dans l'ordre du poker", () => {
    const hands = [
      "As Kd 9h 7c 3s",
      "As Ad 9h 7c 3s",
      "As Ad 9h 9c 3s",
      "As Ad Ah 7c 3s",
      "5s 4d 3h 2c As",
      "As Js 9s 7s 3s",
      "As Ad Ah 7c 7s",
      "As Ad Ah Ac 3s",
      "9s 8s 7s 6s 5s",
    ].map((h) => evaluateCards(cs(h)));
    expect(hands.map((h) => h.cat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 1; i < hands.length; i++) expect(hands[i]!.value).toBeGreaterThan(hands[i - 1]!.value);
  });

  it("départage : quinte à l'as plus forte que la roue, kickers, double paire", () => {
    expect(evaluateCards(cs("As Kd Qh Jc Ts")).value).toBeGreaterThan(evaluateCards(cs("5s 4d 3h 2c As")).value);
    expect(evaluateCards(cs("Ks Kd 9h 7c 4s")).value).toBeGreaterThan(evaluateCards(cs("Kh Kc 9d 7s 3s")).value);
    expect(evaluateCards(cs("Ks Kd 4h 4c 2s")).value).toBeGreaterThan(evaluateCards(cs("Qs Qd Jh Jc As")).value);
    expect(evaluateCards(cs("As Ad Kh Kc 9s")).value).toBe(evaluateCards(cs("Ah Ac Ks Kd 9d")).value);
  });

  it("trouve la meilleure main de cinq parmi sept", () => {
    const h = bestHand(cs("7h 2d 7s 7c Kh 2s 9d"));
    expect(h.cat).toBe(CAT.full);
    expect(handName(h)).toBe("Full aux 7 par les 2");
    expect(h.used).toHaveLength(5);
  });

  it("nomme les mains en français", () => {
    const name = (x: string, wild: number | null = null) => handName(bestHand(cs(x), wild));
    expect(name("As Ad 9h 7c 3s")).toBe("Paire d'as");
    expect(name("Qs Qd 9h 7c 3s")).toBe("Paire de dames");
    expect(name("5s 4d 3h 2c As")).toBe("Quinte au 5");
    expect(name("Qs Js 9s 7s 3s")).toBe("Couleur à la dame");
    expect(name("Ks Kd Kh 3c 3s")).toBe("Full aux rois par les 3");
    expect(name("As Ks Qs Js Ts")).toBe("Quinte flush royale");
    expect(name("Ks Kd 4h 4c 2s")).toBe("Double paire rois et 4");
    expect(name("Ks Jd 8h 4c 2s")).toBe("Hauteur roi");
    expect(name("7s 7d 7h 7c 2s", 2)).toBe("Cinq 7");
  });

  it("une folle remplace n'importe quelle carte, même une carte déjà là", () => {
    // Folles : les 2.
    expect(bestHand(cs("Ks Kd 2h 9c 4s"), 2).cat).toBe(CAT.trips);
    expect(bestHand(cs("7s 7d 7h 7c 2s"), 2).cat).toBe(CAT.five);
    expect(bestHand(cs("9s 8s 6s 5s 2d"), 2).cat).toBe(CAT.straightFlush);
    expect(bestHand(cs("As Ks 9s 4s 2h"), 2).ranks).toEqual([14, 14, 13, 9, 4]);
    // Cinq d'une sorte bat la quinte flush.
    expect(bestHand(cs("7s 7d 7h 2c 2s"), 2).value).toBeGreaterThan(evaluateCards(cs("As Ks Qs Js Ts")).value);
    // Sans folle déclarée, un 2 est un 2.
    expect(bestHand(cs("Ks Kd 2h 9c 4s")).cat).toBe(CAT.pair);
  });

  it("reste rapide avec trois folles parmi sept cartes", () => {
    const t = performance.now();
    const h = bestHand(cs("2s 2d 2h 9c 4s Jd Kh"), 2);
    expect(h.cat).toBe(CAT.quads);
    expect(performance.now() - t).toBeLessThan(400);
  });
});

describe("enchères", () => {
  it("pose les blindes ; à trois, le bouton parle le premier", () => {
    const { game, at } = table(3);
    expect(game.button).toBe(at(0).slot);
    expect([at(1).bet, at(2).bet]).toEqual([10, 20]);
    expect(game.toAct).toBe(at(0).slot);
    expect(game.view(at(0).id).pot).toBe(30);
  });

  it("à deux : le bouton est petite blinde, parle le premier avant le flop et le second après", () => {
    const { game, at, act } = table(2);
    expect(game.sbSlot).toBe(at(0).slot);
    expect(game.toAct).toBe(at(0).slot);
    act(0, { t: "call" });
    act(1, { t: "check" });
    expect(game.street).toBe("flop");
    expect(game.toAct).toBe(at(1).slot);
  });

  it("la grosse blinde garde la parole quand tout le monde a suivi", () => {
    const { game, at, act } = table(3);
    act(0, { t: "call" });
    act(1, { t: "call" });
    expect(game.street).toBe("preflop");
    expect(game.toAct).toBe(at(2).slot);
    expect(() => act(2, { t: "call" })).not.toThrow();
    expect(game.street).toBe("flop");
  });

  it("impose la relance minimale, sauf à tapis", () => {
    const { game, act, at } = table(3);
    act(0, { t: "bet", to: 60 });
    expect(() => act(1, { t: "bet", to: 90 })).toThrow(GameError);
    act(1, { t: "bet", to: 100 });
    expect(game.minRaiseTo()).toBe(140);
    expect(() => act(0, { t: "check" })).toThrow(GameError);
    expect(() => act(1, { t: "fold" })).toThrow(GameError);
    expect(at(2).bet).toBe(20);
  });

  it("une relance incomplète à tapis ne rouvre pas les enchères à qui a déjà parlé", () => {
    const { game, act, at } = table(3);
    at(1).stack = 130; // B a déjà posé 10 : il peut aller jusqu'à 140.
    act(0, { t: "bet", to: 100 });
    act(1, { t: "allin" });
    expect(game.currentBet).toBe(140);
    expect(game.view(at(2).id).canRaise).toBe(true);
    act(2, { t: "call" });
    expect(game.toAct).toBe(at(0).slot);
    expect(game.view(at(0).id).canRaise).toBe(false);
    expect(() => act(0, { t: "bet", to: 300 })).toThrow(GameError);
    act(0, { t: "call" });
    expect(game.street).toBe("flop");
  });

  it("refuse de parler hors de son tour", () => {
    const { act } = table(3);
    expect(() => act(1, { t: "call" })).toThrow(GameError);
  });
});

describe("pots", () => {
  it("gagne sans abattage quand tous les autres se couchent", () => {
    const { game, act, at } = table(3);
    act(0, { t: "fold" });
    act(1, { t: "fold" });
    expect(game.result?.showdown).toBe(false);
    expect(at(2).stack).toBe(2010);
    expect(game.result?.delta[at(2).slot]).toBe(10);
  });

  it("partage pot principal et pot annexe à l'abattage", () => {
    // Distribution à gauche du bouton : B, C, A, puis B, C, A.
    const { game, act, at } = table(3, quiet, "Ks 2c As Kh 7d Ah 3s 8d 9c Jh 4s");
    at(0).stack = 100;
    act(0, { t: "allin" });
    act(1, { t: "call" });
    act(2, { t: "bet", to: 500 });
    act(1, { t: "call" });
    for (const street of ["flop", "turn", "river"]) {
      expect(game.street).toBe(street);
      act(1, { t: "check" });
      act(2, { t: "check" });
    }
    const r = game.result!;
    expect(r.showdown).toBe(true);
    expect(r.pots.map((p) => p.amount)).toEqual([300, 800]);
    expect(r.pots.map((p) => p.winners)).toEqual([[at(0).slot], [at(1).slot]]);
    expect([at(0).stack, at(1).stack, at(2).stack]).toEqual([300, 2300, 1500]);
    expect(r.hands[at(0).slot]?.name).toBe("Paire d'as");
  });

  it("partage à égalité, et rend la mise que personne n'a suivie", () => {
    // Le tableau fait une quinte au roi pour tout le monde.
    const { game, act, at } = table(2, quiet, "2c 3d 4c 5d 9h Ts Jd Qc Kh");
    act(0, { t: "call" });
    act(1, { t: "check" });
    act(1, { t: "check" });
    act(0, { t: "check" });
    act(1, { t: "check" });
    act(0, { t: "check" });
    act(1, { t: "check" });
    act(0, { t: "check" });
    expect(game.result!.pots[0]!.winners).toHaveLength(2);
    expect([at(0).stack, at(1).stack]).toEqual([2000, 2000]);

    // B n'a que 100 en tout : la part de la mise de A au-delà lui est rendue.
    const t2 = table(2);
    t2.at(1).stack = 80;
    t2.act(0, { t: "bet", to: 1000 });
    t2.act(1, { t: "call" });
    const r = t2.game.result!;
    expect(r.pots.map((p) => [p.amount, p.returned])).toEqual([
      [200, false],
      [900, true],
    ]);
    expect(t2.at(0).stack + t2.at(1).stack).toBe(RULES.stack + 100);
  });

  it("élimine le joueur sans jetons et termine la partie", () => {
    const { game, act, at } = table(2, quiet, "2c As 7d Ad 3s 8d 9c Jh 4s");
    act(0, { t: "allin" });
    act(1, { t: "call" });
    // A a la paire d'as, B 7-2 : B perd tout.
    expect(game.result!.eliminated).toEqual([at(1).slot]);
    expect(at(1).place).toBe(2);
    expect(at(0).place).toBe(1);
    game.nextHand();
    expect(game.phase).toBe("final");
  });
});

describe("entorses", () => {
  it("la folle : la carte retournée désigne les folles de la donne", () => {
    // Première carte : la folle (un 7). B : 7s Kd, A : Qh Qc. Tableau : K K 3 9 4.
    const { game, act, at } = table(2, { wild: true, exchange: false, bounty: false }, "7h 7s Qh Kd Qc Ks Kh 3c 9d 4s");
    expect(game.wildCard).toEqual(c("7h"));
    act(0, { t: "call" });
    act(1, { t: "check" });
    for (let i = 0; i < 3; i++) {
      act(1, { t: "check" });
      act(0, { t: "check" });
    }
    expect(game.result!.hands[at(1).slot]?.name).toBe("Carré de rois");
    expect(game.result!.pots[0]!.winners).toEqual([at(1).slot]);
  });

  it("l'échange : une fois par donne, à partir du flop, pour une grosse blinde", () => {
    const { game, act, at } = table(2, { wild: false, exchange: true, bounty: false }, "2c 3d 4c 5d 9h Ts Jd Qc Kh 8s");
    expect(() => act(0, { t: "exchange", index: 0 })).toThrow(GameError);
    act(0, { t: "call" });
    act(1, { t: "check" });
    // Flop distribué (9h Ts Jd) ; la carte suivante du paquet est Qc.
    expect(game.toAct).toBe(at(1).slot);
    const before = at(1).cards[1]!;
    act(1, { t: "exchange", index: 1 });
    expect(at(1).cards[1]).toEqual(c("Qc"));
    expect(at(1).cards[1]).not.toEqual(before);
    expect(at(1).stack).toBe(2000 - 20 - 20);
    expect(game.view(at(0).id).pot).toBe(60);
    expect(() => act(1, { t: "exchange", index: 0 })).toThrow(GameError);
    expect(game.toAct).toBe(at(1).slot);
  });

  it("la prime : qui la remplit touche une grosse blinde de chacun des autres", () => {
    // Le hasard vaut 0 : la prime tirée est la première, le 7-2. A reçoit 7c 2d.
    const { game, act, at } = table(3, { wild: false, exchange: false, bounty: true }, "Ks Qs 7c Kh Qh 2d");
    expect(game.bounty).toBe("sept-deux");
    act(0, { t: "bet", to: 40 });
    act(1, { t: "fold" });
    act(2, { t: "fold" });
    expect(game.result!.bounty).toEqual({ id: "sept-deux", winners: [at(0).slot], each: 20 });
    expect([at(0).stack, at(1).stack, at(2).stack]).toEqual([2070, 1970, 1960]);
  });
});

describe("table", () => {
  it("ne montre les cartes des autres qu'à l'abattage", () => {
    const { game, act, at } = table(2, quiet, "2c As 7d Ad 3s 8d 9c Jh 4s");
    const seen = () => game.view(at(1).id).players.find((p) => p.slot === at(0).slot)!.cards;
    expect(seen()).toEqual([null, null]);
    expect(game.view(at(0).id).players[0]!.cards.every(Boolean)).toBe(true);
    act(0, { t: "call" });
    act(1, { t: "check" });
    for (let i = 0; i < 3; i++) {
      act(1, { t: "check" });
      act(0, { t: "check" });
    }
    expect(seen().every(Boolean)).toBe(true);
  });

  it("le temps de parole écoulé, on parle (ou se couche) pour lui ; un absent parle vite", () => {
    vi.useFakeTimers();
    try {
      const game = new TapisGame("T", { changed: () => {}, emit: () => {} }, () => 0, true);
      const ps = ["A", "B", "C"].map((n) => game.addPlayer(n));
      game.handle(ps[0]!.id, { t: "configure", config: quiet });
      game.handle(ps[0]!.id, { t: "start" });
      const at = (i: number) => game.players[i]!;
      // A doit 20 : au bout de 40 s, il se couche.
      expect(game.toAct).toBe(at(0).slot);
      vi.advanceTimersByTime(RULES.turnSeconds * 1000 - 100);
      expect(at(0).folded).toBe(false);
      vi.advanceTimersByTime(200);
      expect(at(0).folded).toBe(true);
      // B s'en va : il parle pour lui en un éclair (ici, il se couche faute de pouvoir parler).
      expect(game.toAct).toBe(at(1).slot);
      game.setConnected(ps[1]!.id, false);
      vi.advanceTimersByTime(1600);
      expect(at(1).folded).toBe(true);
      // C gagne ; la donne suivante part toute seule après la pause.
      expect(game.result?.pots[0]?.winners).toEqual([at(2).slot]);
      vi.advanceTimersByTime(RULES.pauseSeconds * 1000 + 50);
      expect(game.handNo).toBe(1);
      expect(game.result).toBeNull();
      game.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("seul l'hôte règle la table", () => {
    const game = new TapisGame("T", { changed: () => {}, emit: () => {} }, () => 0, false);
    const a = game.addPlayer("A");
    const b = game.addPlayer("B");
    expect(() => game.handle(b.id, { t: "configure", config: { wild: false } })).toThrow(GameError);
    game.handle(a.id, { t: "configure", config: { wild: false, speed: "rapide", length: 15 } });
    expect(game.config).toMatchObject({ wild: false, speed: "rapide", length: 15 });
    game.handle(a.id, { t: "configure", config: { speed: "turbo" as never, length: 7 as never } });
    expect(game.config).toMatchObject({ speed: "rapide", length: 15 });
  });

  it("des parties au hasard gardent tous les jetons et finissent", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = rng(seed);
      const n = 2 + (seed % 5);
      const game = new TapisGame("T", { changed: () => {}, emit: () => {} }, r, false);
      const ps = Array.from({ length: n }, (_, i) => game.addPlayer(`J${i}`));
      game.handle(ps[0]!.id, { t: "configure", config: { wild: true, exchange: true, bounty: true, speed: "rapide", length: 30 } });
      game.handle(ps[0]!.id, { t: "start" });
      let guard = 0;
      while (game.phase === "play" && guard++ < 5000) {
        if (game.result) {
          expect(game.players.reduce((s, p) => s + p.stack, 0)).toBe(n * RULES.stack);
          game.nextHand();
          continue;
        }
        const p = game.players.find((x) => x.slot === game.toAct)!;
        const v = game.view(p.id);
        const roll = r();
        try {
          if (roll < 0.08 && game.street !== "preflop" && !p.exchanged && p.stack > v.blinds.bb) game.handle(p.id, { t: "exchange", index: Math.floor(r() * 2) });
          else if (roll < 0.2) game.handle(p.id, { t: "fold" });
          else if (roll < 0.6) game.handle(p.id, { t: "call" });
          else if (roll < 0.9 && v.canRaise) game.handle(p.id, { t: "bet", to: v.minRaiseTo + Math.floor(r() * 3) * v.blinds.bb });
          else if (roll < 0.95) game.handle(p.id, { t: "allin" });
          else game.autoplay();
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
          game.autoplay();
        }
      }
      expect(game.phase).toBe("final");
      const places = game.players.map((p) => p.place).sort();
      expect(places).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(game.players.reduce((s, p) => s + p.stack, 0)).toBe(n * RULES.stack);
    }
  });
});
