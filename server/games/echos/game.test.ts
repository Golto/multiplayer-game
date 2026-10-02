import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { EchoGame } from "./game.js";
import {
  ARENA,
  LEVELS,
  RULES,
  dirOf,
  goldCount,
  move,
  parseArena,
  prepare,
  type Arena,
  type Body,
  type EchoView,
} from "../../../shared/games/echos.js";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(players = 2, mode: "coop" | "versus" = "coop") {
  const game = new EchoGame("ECH01", { changed: () => {}, emit: () => {} }, seeded(), false);
  const ps = Array.from({ length: players }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  game.handle(ps[0]!.id, { t: "configure", mode });
  game.handle(ps[0]!.id, { t: "start" });
  game.beginPlay();
  return { game, ps };
}

/** Plus court chemin de case en case (portes considérées ouvertes). */
function path(arena: Arena, from: [number, number], to: [number, number]): [number, number][] {
  const key = (x: number, y: number) => y * arena.w + x;
  const prev = new Map<number, number>([[key(...from), -1]]);
  const queue: [number, number][] = [from];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (arena.rows[ny]?.[nx] === undefined || arena.rows[ny]![nx] === "#" || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  const out: [number, number][] = [];
  for (let k = key(...to); k !== -1 && k !== undefined; k = prev.get(k)!) out.unshift([k % arena.w, Math.floor(k / arena.w)]);
  return out;
}

/** Un « joueur » qui suit un chemin : la direction vers le centre de la prochaine case. */
function follower(route: [number, number][]) {
  let i = 0;
  return (b: Body) => {
    while (i < route.length) {
      const [tx, ty] = route[i]!;
      const dx = tx + 0.5 - b.x;
      const dy = ty + 0.5 - b.y;
      if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.12) return dirOf(dx, dy);
      i++;
    }
    return 0;
  };
}

describe("salles", () => {
  it("sont bien formées et assez grandes pour six joueurs", () => {
    for (const level of [...LEVELS, ARENA]) {
      const w = level.rows[0]!.length;
      for (const row of level.rows) expect(row.length, `${level.id} : ${row}`).toBe(w);
      const a = parseArena(level.rows);
      expect(a.spawns.length, level.id).toBeGreaterThanOrEqual(6);
      // Chaque porte a sa plaque.
      for (const letter of a.doors.keys()) expect(a.plates.some((p) => p.letter === letter), `${level.id} ${letter}`).toBe(true);
    }
    for (const level of LEVELS) {
      const slots = level.rows.join("").replace(/[^+*]/g, "").length;
      expect(slots, level.id).toBeGreaterThanOrEqual(goldCount(6));
    }
  });

  it("choisit deux plaques dorées par joueur, toutes atteignables", () => {
    for (const level of LEVELS) {
      for (const n of [2, 4, 6]) {
        const a = parseArena(prepare(level, n, 42, "coop"));
        const golds = a.plates.filter((p) => p.kind === "gold");
        expect(golds).toHaveLength(goldCount(n));
        for (const g of golds) {
          const route = path(a, a.spawns[0]!, [g.x, g.y]);
          expect(route.at(-1), `${level.id} : (${g.x}, ${g.y})`).toEqual([g.x, g.y]);
        }
      }
    }
  });

  it("garde en versus deux plaques de plus que de joueurs, et leurs seuls départs", () => {
    const a = parseArena(prepare(ARENA, 3, 9, "versus"));
    expect(a.plates.filter((p) => p.kind === "neutral")).toHaveLength(5);
    expect(a.spawns).toHaveLength(3);
  });
});

describe("déplacements", () => {
  it("les murs et les portes fermées arrêtent un corps, une porte ouverte le laisse passer", () => {
    const a = parseArena(LEVELS[1]!.rows);
    const b: Body = { x: 11.5, y: 4.5 };
    for (let i = 0; i < 40; i++) move(a, b, dirOf(1, 0), new Set());
    expect(b.x).toBeLessThan(13 - RULES.radius + 0.01);
    for (let i = 0; i < 40; i++) move(a, b, dirOf(1, 0), new Set(["A"]));
    expect(b.x).toBeGreaterThan(14);
  });
});

describe("échos", () => {
  it("une manche ratée laisse un écho par joueur, qui rejoue la même chose", () => {
    const { game, ps } = setup(2);
    const start = game.bodies.map((b) => ({ x: b.x, y: b.y }));
    // Le premier joueur file à droite pendant 40 pas, puis s'arrête.
    game.handle(ps[0]!.id, { t: "input", d: dirOf(1, 0) });
    for (let i = 0; i < 40; i++) game.step();
    game.handle(ps[0]!.id, { t: "input", d: 0 });
    const end = { x: game.bodies[0]!.x, y: game.bodies[0]!.y };
    while (game.phase === "round") game.step();
    expect(game.phase).toBe("rewind");
    expect(game.echoes).toHaveLength(2);
    game.beginRound();
    expect(game.bodies.map((b) => b.echo)).toEqual([1, 1, 0, 0]);
    expect({ x: game.bodies[0]!.x, y: game.bodies[0]!.y }).toEqual(start[0]);
    game.beginPlay();
    for (let i = 0; i < 60; i++) game.step();
    // L'écho est arrivé au même endroit que son auteur à la manche d'avant.
    expect(game.bodies[0]!.x).toBeCloseTo(end.x, 6);
    expect(game.bodies[0]!.y).toBeCloseTo(end.y, 6);
  });

  it("au bout de quatre manches, le paradoxe efface les échos", () => {
    const { game } = setup(2);
    for (let r = 0; r < RULES.maxRounds; r++) {
      while (game.phase === "round") game.step();
      game.beginRound();
      game.beginPlay();
    }
    expect(game.paradoxes).toBe(1);
    expect(game.echoes).toHaveLength(0);
    expect(game.bodies).toHaveLength(2);
  });

  /** Joue une salle : chaque manche, chaque joueur suit son chemin vers sa cible. */
  function solve(game: EchoGame, ps: { id: string; slot: number }[], targets: [number, number][][]) {
    for (const round of targets) {
      const followers = ps.map((p, i) => {
        const body = game.bodies.find((b) => b.owner === p.slot && b.echo === 0)!;
        const legs = round[i] ? [[Math.floor(body.x), Math.floor(body.y)] as [number, number], round[i]!] : [];
        return legs.length ? follower(path(game.arena, legs[0]!, legs[1]!)) : () => 0;
      });
      while (game.phase === "round") {
        ps.forEach((p, i) => {
          const body = game.bodies.find((b) => b.owner === p.slot && b.echo === 0)!;
          game.handle(p.id, { t: "input", d: followers[i]!(body) });
        });
        game.step();
      }
      if (game.phase === "cleared") return;
      game.beginRound();
      game.beginPlay();
    }
  }

  it("le vestibule se franchit en deux manches à deux", () => {
    const { game, ps } = setup(2);
    const golds = game.arena.plates.filter((p) => p.kind === "gold").map((p) => [p.x, p.y] as [number, number]);
    expect(golds).toHaveLength(4);
    solve(game, ps, [
      [golds[0]!, golds[1]!],
      [golds[2]!, golds[3]!],
    ]);
    expect(game.phase).toBe("cleared");
    expect(game.results[0]).toMatchObject({ level: "vestibule", rounds: 2, paradoxes: 0 });
  });

  it("la porte se franchit quand un écho tient la plaque", () => {
    const { game, ps } = setup(2);
    // Salle 2 directement.
    game.level = 1;
    game.beginLevel();
    game.beginPlay();
    const plate = game.arena.plates.find((p) => p.kind === "door")!;
    const golds = game.arena.plates.filter((p) => p.kind === "gold").map((p) => [p.x, p.y] as [number, number]);
    const inside = golds.filter(([x]) => x > 13);
    const outside = golds.filter(([x]) => x < 13);
    expect(inside.length + outside.length).toBe(4);
    // Manche 1 : l'un tient la porte, l'autre entre. Manche 2 et 3 : on remplit le reste.
    const rest = [...inside.slice(1), ...outside];
    solve(game, ps, [
      [[plate.x, plate.y], inside[0]!],
      [rest[0]!, rest[1]!],
      [rest[2]!, rest[2]!],
    ]);
    expect(game.phase).toBe("cleared");
    expect(game.results[0]?.rounds).toBe(3);
  });
});

describe("versus", () => {
  it("un corps seul sur une plaque marque, deux joueurs sur la même ne marquent pas", () => {
    const { game, ps } = setup(2, "versus");
    const plate = game.arena.plates.find((p) => p.kind === "neutral")!;
    const [a, b] = game.bodies;
    a!.x = plate.x + 0.5;
    a!.y = plate.y + 0.5;
    for (let i = 0; i < 10; i++) game.step();
    expect(game.roundScore.get(ps[0]!.slot)).toBe(10);
    b!.x = plate.x + 0.5;
    b!.y = plate.y + 0.5;
    game.step();
    // Les deux corps se repoussent ; s'ils restent tous deux sur la plaque, personne ne marque.
    const owners = new Set((game.pressed.get(plate.index) ?? []).map((k) => game.bodies[k]!.owner));
    const scored = game.roundScore.get(ps[0]!.slot)! + (game.roundScore.get(ps[1]!.slot) ?? 0);
    expect(scored).toBe(owners.size === 1 ? 11 : 10);
  });

  it("les corps de joueurs différents se bousculent", () => {
    const { game } = setup(2, "versus");
    const [a, b] = game.bodies;
    a!.x = 10.5;
    a!.y = 10.5;
    b!.x = 10.6;
    b!.y = 10.5;
    game.step();
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(2 * RULES.radius - 1e-9);
  });

  it("une partie de versus dure quatre manches, puis le classement", () => {
    const { game, ps } = setup(3, "versus");
    for (let r = 0; r < RULES.versusRounds; r++) {
      while (game.phase === "round") game.step();
      if (game.phase === "rewind") {
        game.beginRound();
        game.beginPlay();
      }
    }
    expect(game.phase).toBe("final");
    expect(game.roundPoints).toHaveLength(RULES.versusRounds);
    expect(game.echoes).toHaveLength(3 * RULES.versusRounds);
    const v = game.view(ps[0]!.id) as EchoView;
    expect(Object.keys(v.points)).toHaveLength(3);
  });
});

describe("salon", () => {
  it("seul l'hôte choisit le mode et peut effacer les échos", () => {
    const game = new EchoGame("ECH02", { changed: () => {}, emit: () => {} }, seeded(), false);
    const a = game.addPlayer("A");
    const b = game.addPlayer("B");
    expect(() => game.handle(b.id, { t: "configure", mode: "versus" })).toThrow(GameError);
    game.handle(a.id, { t: "start" });
    expect(() => game.handle(b.id, { t: "paradox" })).toThrow(GameError);
    game.handle(a.id, { t: "paradox" });
    expect(game.phase).toBe("rewind");
  });
});
