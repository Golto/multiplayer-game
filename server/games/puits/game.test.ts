import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { PuitsGame } from "./game.js";
import { RULES, SPAWN_R, Sim, initialState, predict, runTurn, validWell, type Placement, type PuitsView, type SimState } from "../../../shared/games/puits.js";

function seeded(seed = 3) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(players = 3) {
  const game = new PuitsGame("PUI01", { changed: () => {}, emit: () => {} }, seeded(), false);
  const ps = Array.from({ length: players }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  return { game, ps };
}

const radius = (s: { x: number; y: number }) => Math.sqrt(s.x * s.x + s.y * s.y);

/** Un répulseur de `by` qui envoie `victim` dans le vide dès ce tour (et lui seul). */
function lethal(start: SimState, victim: number, by: number) {
  const ship = start.ships.find((s) => s.slot === victim)!;
  for (let dx = -300; dx <= 300; dx += 25) {
    for (let dy = -300; dy <= 300; dy += 25) {
      const p = { slot: by, x: Math.round(ship.x + dx), y: Math.round(ship.y + dy), kind: "repulseur" as const };
      if (!validWell(p.x, p.y)) continue;
      const end = runTurn(start, [p]).state.ships;
      if (!end.find((s) => s.slot === victim)!.alive && end.filter((s) => !s.alive).length === 1) return p;
    }
  }
  throw new Error("aucun répulseur mortel trouvé");
}

describe("physique", () => {
  it("sans puits, les vaisseaux restent sur leur orbite", () => {
    let s = initialState([1, 2, 3], 9, 0.4);
    for (let t = 0; t < RULES.maxTurns; t++) s = runTurn(s, []).state;
    for (const ship of s.ships) {
      expect(ship.alive).toBe(true);
      expect(Math.abs(radius(ship) - SPAWN_R)).toBeLessThan(15);
    }
  });

  it("est déterministe, même après un aller-retour en JSON", () => {
    const start = initialState([1, 2, 3, 4], 77, 1.1);
    const placements = [
      { slot: 1, x: 300, y: 200, kind: "puits" as const },
      { slot: 3, x: -400, y: 100, kind: "repulseur" as const },
    ];
    const a = runTurn(start, placements);
    const b = runTurn(JSON.parse(JSON.stringify(start)) as SimState, JSON.parse(JSON.stringify(placements)));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("un puits attire, un répulseur repousse", () => {
    const start = initialState([1, 2], 5, 0);
    const ship = start.ships[0]!;
    const well = { slot: 2, x: ship.x - 220, y: ship.y + 150 };
    // Distance au puits après une seconde de vol, avant tout effet de fronde.
    const after = (placements: Placement[]) => {
      const sim = new Sim(start, placements);
      for (let i = 0; i < 60; i++) sim.advance();
      const s = sim.state.ships[0]!;
      return Math.sqrt((s.x - well.x) ** 2 + (s.y - well.y) ** 2);
    };
    const base = after([]);
    expect(after([{ ...well, kind: "puits" }])).toBeLessThan(base - 20);
    expect(after([{ ...well, kind: "repulseur" }])).toBeGreaterThan(base + 20);
  });

  it("les puits faiblissent puis disparaissent", () => {
    let s = initialState([1, 2], 5, 0);
    s = runTurn(s, [{ slot: 1, x: 300, y: 300, kind: "puits" }]).state;
    expect(s.wells.map((w) => w.age)).toEqual([0]);
    s = runTurn(s, []).state;
    s = runTurn(s, []).state;
    expect(s.wells.map((w) => w.age)).toEqual([2]);
    s = runTurn(s, []).state;
    expect(s.wells).toHaveLength(0);
  });

  it("un choc conserve la quantité de mouvement", () => {
    const state: SimState = {
      ships: [
        { slot: 1, x: -20, y: 600, vx: 200, vy: 0, alive: true },
        { slot: 2, x: 20, y: 600, vx: -200, vy: 0, alive: true },
      ],
      wells: [],
      shards: [],
      seed: 1,
    };
    const sim = new Sim(state, []);
    let bumped = false;
    for (let i = 0; i < 10 && !bumped; i++) bumped = sim.advance().some((e) => e.k === "bump");
    expect(bumped).toBe(true);
    const [a, b] = sim.state.ships as [SimState["ships"][0], SimState["ships"][0]];
    // Vitesses échangées le long de l'axe du choc.
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(Math.abs(a.vx + b.vx)).toBeLessThan(1e-9);
  });

  it("l'élimination revient à celui dont le répulseur a poussé la victime", () => {
    const start = initialState([1, 2], 5, 0);
    const { events } = runTurn(start, [lethal(start, 1, 2)]);
    expect(events.find((e) => e.k === "death")).toMatchObject({ slot: 1, by: 2 });
  });

  it("une réaction en chaîne crédite celui qui l'a déclenchée", () => {
    // 2 fonce sur 1, poussé par le puits de 3 ; 1 part vers le soleil.
    const state: SimState = {
      ships: [
        { slot: 1, x: 0, y: 140, vx: 0, vy: 0, alive: true },
        { slot: 2, x: 0, y: 420, vx: 0, vy: -300, alive: true },
        { slot: 3, x: 900, y: 0, vx: 0, vy: 0, alive: true },
      ],
      wells: [],
      shards: [],
      seed: 1,
    };
    const sim = new Sim(state, [{ slot: 3, x: 0, y: 260, kind: "puits" }]);
    while (!sim.done) sim.advance();
    const death = sim.events.find((e) => e.k === "death" && e.slot === 1);
    expect(death).toBeDefined();
    expect(death && "by" in death ? death.by : -1).not.toBe(1);
  });

  it("l'aperçu suit la vraie simulation", () => {
    const start = initialState([1, 2, 3], 12, 2);
    const placements = [{ slot: 2, x: 200, y: -300, kind: "puits" as const }];
    const paths = predict(start, placements, 1);
    const end = runTurn(start, placements).state;
    for (const s of end.ships.filter((x) => x.alive)) {
      const p = paths.get(s.slot)!;
      expect(p.at(-2)).toBe(s.x);
      expect(p.at(-1)).toBe(s.y);
    }
  });
});

describe("déroulé", () => {
  it("les poses restent secrètes jusqu'à la résolution", () => {
    const { game, ps } = setup(3);
    game.handle(ps[0]!.id, { t: "start" });
    expect(game.phase).toBe("plan");
    game.handle(ps[0]!.id, { t: "place", x: 300, y: 300, kind: "puits" });
    const theirs = game.view(ps[1]!.id) as PuitsView;
    expect(theirs.placements).toEqual([]);
    expect(theirs.players.find((p) => p.id === ps[0]!.id)?.locked).toBe(true);
    expect((game.view(ps[0]!.id) as PuitsView).placements).toHaveLength(1);
    expect(() => game.handle(ps[0]!.id, { t: "place", x: 10, y: 10, kind: "puits" })).toThrow(GameError);
    game.handle(ps[1]!.id, { t: "pass" });
    game.handle(ps[2]!.id, { t: "place", x: -300, y: 300, kind: "repulseur" });
    expect(game.phase).toBe("resolve");
    expect((game.view(ps[1]!.id) as PuitsView).placements).toHaveLength(2);
    game.afterResolve();
    expect(game.phase).toBe("plan");
    expect(game.turn).toBe(1);
    expect(game.sim.wells).toHaveLength(2);
  });

  it("refuse un puits collé au soleil ou au bord", () => {
    const { game, ps } = setup(2);
    game.handle(ps[0]!.id, { t: "start" });
    expect(() => game.handle(ps[0]!.id, { t: "place", x: 50, y: 0, kind: "puits" })).toThrow(GameError);
    expect(() => game.handle(ps[0]!.id, { t: "place", x: 990, y: 0, kind: "puits" })).toThrow(GameError);
  });

  it("un absent ne bloque pas le tour", () => {
    const { game, ps } = setup(3);
    game.handle(ps[0]!.id, { t: "start" });
    game.setConnected(ps[2]!.id, false);
    game.handle(ps[0]!.id, { t: "pass" });
    game.handle(ps[1]!.id, { t: "pass" });
    expect(game.phase).toBe("resolve");
  });

  it("la manche s'arrête quand il ne reste qu'un vaisseau, le survivant marque", () => {
    const { game, ps } = setup(2);
    game.handle(ps[0]!.id, { t: "start" });
    const p = lethal(game.sim, ps[1]!.slot, ps[0]!.slot);
    game.handle(ps[0]!.id, { t: "place", x: p.x, y: p.y, kind: "repulseur" });
    game.handle(ps[1]!.id, { t: "pass" });
    game.afterResolve();
    expect(game.phase).toBe("intermission");
    const r = game.results[0]!;
    expect(r.scores[ps[0]!.slot]).toMatchObject({ kills: 1, survived: true });
    expect(r.scores[ps[0]!.slot]!.points).toBeGreaterThanOrEqual(RULES.points.kill + RULES.points.survive);
    expect(r.scores[ps[1]!.slot]!.survived).toBe(false);
  });

  it("enchaîne les manches jusqu'au classement final, puis la revanche", () => {
    const { game, ps } = setup(2);
    game.handle(ps[0]!.id, { t: "start" });
    for (let round = 0; round < RULES.rounds; round++) {
      while (game.phase === "plan" || game.phase === "resolve") {
        if (game.phase === "plan") for (const p of ps) game.handle(p.id, { t: "pass" });
        else game.afterResolve();
      }
      if (game.phase === "intermission") for (const p of ps) game.handle(p.id, { t: "ready" });
    }
    expect(game.phase).toBe("final");
    expect(game.results).toHaveLength(RULES.rounds);
    game.handle(ps[0]!.id, { t: "rematch" });
    expect(game.phase).toBe("lobby");
  });
});
