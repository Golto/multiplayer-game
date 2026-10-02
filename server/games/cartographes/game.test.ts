import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { CartoGame } from "./game.js";
import { RULES, layout, setupMap, zoneCells, zoneScore, type CartoView } from "../../../shared/games/cartographes.js";

function seeded(seed = 11) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(players = 3) {
  const game = new CartoGame("CAR01", { changed: () => {}, emit: () => {} }, seeded(), false);
  const ps = Array.from({ length: players }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  game.handle(ps[0]!.id, { t: "start" });
  return { game, ps };
}

describe("la carte", () => {
  it("chaque joueur voit une zone et en peint une autre, jamais la sienne", () => {
    for (const n of [3, 4, 5, 6]) {
      const slots = Array.from({ length: n }, (_, i) => i + 1);
      const { zones, cols, rows, truth } = setupMap(slots, 1234 + n);
      const { zx, zy } = layout(n);
      expect(zones).toHaveLength(zx * zy);
      expect(truth).toHaveLength(cols * rows);
      const played = zones.filter((z) => !z.charted);
      expect(played).toHaveLength(n);
      expect(new Set(played.map((z) => z.viewer)).size).toBe(n);
      expect(new Set(played.map((z) => z.painter)).size).toBe(n);
      for (const z of played) expect(z.painter).not.toBe(z.viewer);
      // Assez de variété dans chaque zone à décrire.
      for (const z of played) expect(new Set(zoneCells(z, cols).map((i) => truth[i])).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("est la même pour une même graine", () => {
    expect(setupMap([1, 2, 3], 99)).toEqual(setupMap([1, 2, 3], 99));
  });
});

describe("information cachée", () => {
  it("chacun ne reçoit que le terrain de sa zone et des repères", () => {
    const { game, ps } = setup(3);
    for (const p of ps) {
      const v = game.view(p.id) as CartoView;
      const mine = v.zones.find((z) => z.viewer === p.slot)!;
      const allowed = new Set(v.zones.filter((z) => z.charted || z === mine).flatMap((z) => zoneCells(z, v.cols)));
      v.truth.forEach((t, i) => {
        if (allowed.has(i)) expect(t).not.toBeNull();
        else expect(t).toBeNull();
      });
    }
  });

  it("les repères sont déjà peints, le reste est vierge", () => {
    const { game } = setup(3);
    const charted = game.zones.find((z) => z.charted)!;
    for (const i of zoneCells(charted, game.cols)) expect(game.painted[i]).toBe(game.truth[i]);
    const open = game.zones.find((z) => !z.charted)!;
    for (const i of zoneCells(open, game.cols)) expect(game.painted[i]).toBeNull();
  });

  it("messages et coups de pinceau restent secrets jusqu'à la fin du tour", () => {
    const { game, ps } = setup(3);
    const a = ps[0]!;
    const zone = game.zones.find((z) => z.painter === a.slot)!;
    const cell = zoneCells(zone, game.cols)[0]!;
    game.handle(a.id, { t: "end", pictos: ["eau", "coin", "no"], paints: [[cell, "foret"]], done: false });
    const other = game.view(ps[1]!.id) as CartoView;
    expect(other.painted[cell]).toBeNull();
    expect(other.log).toEqual([]);
    expect(other.mine).toBeNull();
    expect((game.view(a.id) as CartoView).mine?.pictos).toEqual(["eau", "coin", "no"]);
    for (const p of ps.slice(1)) game.handle(p.id, { t: "end", pictos: [], paints: [], done: false });
    expect(game.turn).toBe(1);
    expect(game.painted[cell]).toBe("foret");
    expect(game.log).toEqual([{ turn: 0, slot: a.slot, pictos: ["eau", "coin", "no"] }]);
  });
});

describe("tours", () => {
  it("on ne peint que dans sa zone, pas plus de quatre cases, avec des pictogrammes connus", () => {
    const { game, ps } = setup(3);
    const a = ps[0]!;
    const other = game.zones.find((z) => z.painter !== a.slot && !z.charted)!;
    const mine = zoneCells(game.zones.find((z) => z.painter === a.slot)!, game.cols);
    expect(() =>
      game.handle(a.id, { t: "end", pictos: [], paints: mine.slice(0, 5).map((i) => [i, "eau"]), done: false }),
    ).toThrow(GameError);
    game.handle(a.id, {
      t: "end",
      pictos: ["eau", "inconnu", "1", "2", "3", "4"],
      paints: [[zoneCells(other, game.cols)[0]!, "eau"], [mine[0]!, "lave"], [mine[1]!, "montagne"]],
      done: false,
    });
    expect(game.pending.get(a.slot)).toEqual({ pictos: ["eau", "1", "2", "3"], paints: [[mine[1]!, "montagne"]], done: false });
    expect(() => game.handle(a.id, { t: "end", pictos: [], paints: [], done: false })).toThrow(GameError);
  });

  it("un absent ne bloque pas le tour", () => {
    const { game, ps } = setup(3);
    game.setConnected(ps[2]!.id, false);
    game.handle(ps[0]!.id, { t: "end", pictos: [], paints: [], done: false });
    game.handle(ps[1]!.id, { t: "end", pictos: [], paints: [], done: false });
    expect(game.turn).toBe(1);
  });

  it("la partie s'arrête au bout du chrono, ou plus tôt si tout le monde le veut", () => {
    const { game, ps } = setup(3);
    for (let t = 0; t < RULES.turns; t++) for (const p of ps) game.handle(p.id, { t: "end", pictos: [], paints: [], done: false });
    expect(game.phase).toBe("final");
    expect((game.view(ps[0]!.id) as CartoView).truth.every((t) => t !== null)).toBe(true);
    game.handle(ps[0]!.id, { t: "rematch" });
    game.handle(ps[0]!.id, { t: "start" });
    for (const p of ps) game.handle(p.id, { t: "end", pictos: [], paints: [], done: true });
    expect(game.phase).toBe("final");
    expect(game.turn).toBe(1);
  });

  it("une zone bien peinte compte toutes ses cases", () => {
    const { game, ps } = setup(3);
    // Chaque peintre recopie la vérité, quatre cases par tour.
    for (let t = 0; t < 4; t++) {
      for (const p of ps) {
        const z = game.zones.find((x) => x.painter === p.slot)!;
        const cells = zoneCells(z, game.cols).slice(t * 4, t * 4 + 4);
        game.handle(p.id, { t: "end", pictos: ["fini"], paints: cells.map((i) => [i, game.truth[i]!]), done: t === 3 });
      }
    }
    expect(game.phase).toBe("final");
    for (const z of game.zones) expect(zoneScore(z, game.cols, game.truth, game.painted)).toEqual({ right: 16, total: 16 });
    expect(game.spoken.get(ps[0]!.slot)).toBe(4);
  });
});
