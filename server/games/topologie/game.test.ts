import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { TopoGame } from "./game.js";
import { RULES, decodeGrid, ghostCell, step, type Dir, type SurfaceId } from "../../../shared/games/topologie.js";

const host = { changed: () => {}, emit: () => {} };

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

/** Partie à deux en cours sur une surface donnée, plateau vide sauf ce que le test place. */
function playing(surface: SurfaceId) {
  const game = new TopoGame("TOPO1", host, seeded(), false);
  const a = game.addPlayer("Alice");
  const b = game.addPlayer("Bruno");
  game.start(a.id);
  game.surfaces = [surface, surface, surface];
  game.beginRound();
  game.beginPlay();
  game.owner.fill(0);
  game.trail.fill(0);
  game.counts.clear();
  return { game, a, b };
}

function place(game: TopoGame, slot: number, x: number, y: number, dir: Dir) {
  const h = game.heads.get(slot)!;
  Object.assign(h, { x, y, dir, alive: true, queue: [], trailLength: 0 });
}

/** Met un joueur sur le banc pour qu'il ne gêne pas le scénario. */
function bench(game: TopoGame, slot: number) {
  Object.assign(game.heads.get(slot)!, { alive: false, respawnAt: Number.POSITIVE_INFINITY });
}

function own(game: TopoGame, slot: number, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) game.owner[y * game.size + x] = slot;
  game.counts.set(slot, game.owner.filter((v) => v === slot).length);
}

function drive(game: TopoGame, slot: number, dirs: Dir[]) {
  for (const d of dirs) {
    game.turn(slot, d);
    game.advanceTick();
  }
}

describe("recollements", () => {
  it("tore : on ressort en face, sans miroir", () => {
    expect(step("tore", 10, 10, 9, 3, 1)).toEqual({ x: 0, y: 3, wrapped: true, twisted: false });
    expect(step("tore", 10, 10, 4, 0, 0)).toEqual({ x: 4, y: 9, wrapped: true, twisted: false });
  });

  it("bouteille de Klein : le haut ramène en bas, inversé de gauche à droite", () => {
    expect(step("klein", 10, 10, 2, 0, 0)).toEqual({ x: 7, y: 9, wrapped: true, twisted: true });
    expect(step("klein", 10, 10, 9, 3, 1)).toEqual({ x: 0, y: 3, wrapped: true, twisted: false });
  });

  it("plan projectif : tous les bords en miroir", () => {
    expect(step("projectif", 10, 10, 9, 2, 1)).toEqual({ x: 0, y: 7, wrapped: true, twisted: true });
    expect(step("projectif", 10, 10, 3, 9, 2)).toEqual({ x: 6, y: 0, wrapped: true, twisted: true });
  });

  it("ruban de Möbius : murs en haut et en bas", () => {
    expect(step("mobius", 10, 10, 5, 0, 0)).toBeNull();
    expect(step("mobius", 10, 10, 0, 1, 3)).toEqual({ x: 9, y: 8, wrapped: true, twisted: true });
  });

  it("aller-retour à travers un bord ramène au point de départ", () => {
    for (const s of ["tore", "klein", "projectif", "mobius"] as SurfaceId[]) {
      for (const [x, y, d, back] of [
        [9, 2, 1, 3],
        [0, 7, 3, 1],
        [4, 0, 0, 2],
        [6, 9, 2, 0],
      ] as [number, number, Dir, Dir][]) {
        const there = step(s, 10, 10, x, y, d);
        if (!there) continue;
        expect(step(s, 10, 10, there.x, there.y, back)).toMatchObject({ x, y });
      }
    }
  });

  it("les marges fantômes suivent les mêmes recollements", () => {
    expect(ghostCell("klein", 10, 10, 3, -1)).toEqual({ x: 6, y: 9 });
    expect(ghostCell("projectif", 10, 10, 10, 2)).toEqual({ x: 0, y: 7 });
    expect(ghostCell("mobius", 10, 10, 3, -1)).toBeNull();
    expect(ghostCell("tore", 10, 10, -1, -1)).toBeNull();
  });
});

describe("conquête", () => {
  it("une boucle refermée capture l'intérieur", () => {
    const { game, a, b } = playing("tore");
    bench(game, b.slot);
    own(game, a.slot, 10, 10, 12, 12);
    place(game, a.slot, 12, 11, 1);
    // Sortir à droite, monter, revenir à gauche au-dessus du territoire, redescendre chez soi.
    drive(game, a.slot, [1, 1, 1, 0, 0, 0, 3, 3, 3, 3, 3, 2, 2]);
    expect(game.heads.get(a.slot)!.trailLength).toBe(0);
    // La case (14, 9), au milieu de la boucle, est désormais à Alice.
    expect(game.owner[9 * game.size + 14]).toBe(a.slot);
    expect(game.trail.every((v) => v === 0)).toBe(true);
  });

  it("sur un tore, une boucle qui fait le tour du plateau n'enferme rien", () => {
    const { game, a, b } = playing("tore");
    bench(game, b.slot);
    own(game, a.slot, 0, 20, 2, 22);
    place(game, a.slot, 2, 21, 1);
    drive(game, a.slot, Array(game.size - 2).fill(1) as Dir[]);
    expect(game.heads.get(a.slot)!.trailLength).toBe(0);
    // Seule la bande parcourue est gagnée : le reste du tore reste libre.
    const mine = game.owner.filter((v) => v === a.slot).length;
    expect(mine).toBe(9 + (game.size - 3));
  });

  it("couper la traîne d'un autre le fait tomber ; couper la sienne aussi", () => {
    const { game, a, b } = playing("tore");
    own(game, a.slot, 5, 5, 7, 7);
    own(game, b.slot, 30, 30, 32, 32);
    place(game, a.slot, 7, 6, 1);
    bench(game, b.slot);
    drive(game, a.slot, [1, 1, 1]); // traîne d'Alice en (8..10, 6)
    place(game, b.slot, 10, 3, 2);
    const tick = game.advanceTick(); // Bruno descend en (10, 4)… puis
    expect(tick.events.length).toBe(0);
    game.advanceTick();
    const cut = game.advanceTick(); // …et traverse (10, 6)
    expect(cut.events).toContainEqual({ k: "death", slot: a.slot, by: b.slot, reason: "coupe" });
    expect(game.kills.get(b.slot)).toBe(1);
    expect(game.trail.some((v) => v === a.slot)).toBe(false);

    const { game: g2, a: a2, b: b2 } = playing("tore");
    bench(g2, b2.slot);
    own(g2, a2.slot, 5, 5, 7, 7);
    place(g2, a2.slot, 7, 6, 1);
    drive(g2, a2.slot, [1, 1, 1, 0, 3]); // (8..10, 6), (10, 5), (9, 5)
    g2.turn(a2.slot, 2);
    const self = g2.advanceTick(); // redescend sur sa propre traîne en (9, 6)
    expect(self.events).toContainEqual({ k: "death", slot: a2.slot, by: null, reason: "soi" });
  });

  it("le mur du ruban de Möbius fait tomber, puis on revient chez soi", () => {
    const { game, a, b } = playing("mobius");
    bench(game, b.slot);
    own(game, a.slot, 10, 0, 12, 2);
    place(game, a.slot, 11, 0, 0);
    const t = game.advanceTick();
    expect(t.events).toContainEqual({ k: "death", slot: a.slot, by: null, reason: "mur" });
    for (let i = 0; i < RULES.respawnTicks; i++) game.advanceTick();
    const h = game.heads.get(a.slot)!;
    expect(h.alive).toBe(true);
    expect(game.owner[h.y * game.size + h.x]).toBe(a.slot);
  });

  it("traverser un bord retourné est signalé", () => {
    const { game, a, b } = playing("klein");
    bench(game, b.slot);
    own(game, a.slot, 20, 20, 22, 22);
    place(game, a.slot, 5, 0, 0);
    const t = game.advanceTick();
    expect(t.events).toContainEqual({ k: "twist", slot: a.slot });
    expect(game.heads.get(a.slot)).toMatchObject({ x: game.size - 1 - 5, y: game.size - 1 });
  });
});

describe("manches", () => {
  it("enchaîne trois surfaces différentes puis termine", () => {
    const game = new TopoGame("TOPO2", host, seeded(3), false);
    const a = game.addPlayer("Alice");
    const b = game.addPlayer("Bruno");
    expect(() => game.handle(b.id, { t: "start" })).toThrow(GameError);
    game.handle(a.id, { t: "start" });
    expect(new Set(game.surfaces).size).toBe(RULES.rounds);
    for (let r = 0; r < RULES.rounds; r++) {
      expect(game.phase).toBe("countdown");
      game.beginPlay();
      game.advanceTick();
      game.endRound();
      if (r < RULES.rounds - 1) {
        expect(game.phase).toBe("intermission");
        game.handle(a.id, { t: "ready" });
        game.handle(b.id, { t: "ready" });
      }
    }
    expect(game.phase).toBe("final");
    expect(game.results).toHaveLength(RULES.rounds);
    const view = game.view(a.id);
    expect(decodeGrid(view.owner)).toHaveLength(game.size * game.size);
    expect(() => game.handle(a.id, { t: "nope" })).toThrow(GameError);
  });
});
