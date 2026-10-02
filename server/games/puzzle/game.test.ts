import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { PuzzleGame } from "./game.js";
import { BOARD_X, BOARD_Y, PUZZLE_H, PUZZLE_W, TABLE_H, TABLE_W, cuts, grid, home, piecePath, type PuzzleEvent } from "../../../shared/games/puzzle.js";

function seeded(seed = 5) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(players = 2) {
  const events: PuzzleEvent[] = [];
  const game = new PuzzleGame("PUZ01", { changed: () => {}, emit: (e) => events.push(e as PuzzleEvent) }, seeded());
  const ps = Array.from({ length: players }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  return { game, ps, events };
}

describe("préparation", () => {
  it("seul l'hôte choisit le dessin et le nombre de pièces", () => {
    const { game, ps } = setup(2);
    expect(() => game.handle(ps[1]!.id, { t: "configure", config: { count: 12 } })).toThrow(GameError);
    game.handle(ps[0]!.id, { t: "configure", config: { art: "orbite", count: 108 } });
    expect(game.config).toEqual({ art: "orbite", count: 108 });
    game.handle(ps[0]!.id, { t: "configure", config: { count: 7 as never, art: "inconnu" as never } });
    expect(game.config).toEqual({ art: "orbite", count: 108 });
  });

  it("disperse toutes les pièces sur la table, hors du plateau", () => {
    const { game, ps } = setup(1);
    game.handle(ps[0]!.id, { t: "configure", config: { count: 192 } });
    game.handle(ps[0]!.id, { t: "start" });
    expect(game.pieces).toHaveLength(192);
    const { cw, ch } = grid(192);
    for (const p of game.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + cw).toBeLessThanOrEqual(TABLE_W);
      expect(p.y + ch).toBeLessThanOrEqual(TABLE_H);
      const inside = p.x > BOARD_X && p.x + cw < BOARD_X + PUZZLE_W && p.y > BOARD_Y && p.y + ch < BOARD_Y + PUZZLE_H;
      expect(inside).toBe(false);
    }
  });
});

describe("manipulation", () => {
  it("répartit les pièces sans les empiler", () => {
    for (const count of [12, 48, 192] as const) {
      const { game, ps } = setup(1);
      game.handle(ps[0]!.id, { t: "configure", config: { count } });
      game.handle(ps[0]!.id, { t: "start" });
      const { cw, ch } = grid(count);
      let overlaps = 0;
      for (let i = 0; i < game.pieces.length; i++) {
        for (let j = i + 1; j < game.pieces.length; j++) {
          const a = game.pieces[i]!;
          const b = game.pieces[j]!;
          if (Math.abs(a.x - b.x) < cw * 0.6 && Math.abs(a.y - b.y) < ch * 0.6) overlaps++;
        }
      }
      expect(overlaps).toBe(0);
    }
  });

  it("une pièce tenue est verrouillée pour les autres", () => {
    const { game, ps } = setup(2);
    const [a, b] = ps as [typeof ps[0], typeof ps[0]];
    game.handle(a.id, { t: "start" });
    game.handle(a.id, { t: "grab", id: 3 });
    game.handle(b.id, { t: "grab", id: 3 });
    expect(game.pieces[3]!.heldBy).toBe(a.slot);
    game.handle(b.id, { t: "move", id: 3, x: 10, y: 10 });
    expect(game.pieces[3]!.x).not.toBe(10);
    game.handle(a.id, { t: "move", id: 3, x: 50, y: 60 });
    expect(game.pieces[3]).toMatchObject({ x: 50, y: 60 });
  });

  it("lâchée près de sa case, la pièce s'aimante et reste en place", () => {
    const { game, ps, events } = setup(1);
    const a = ps[0]!;
    game.handle(a.id, { t: "configure", config: { count: 12 } });
    game.handle(a.id, { t: "start" });
    const target = home(5, 12);
    game.handle(a.id, { t: "grab", id: 5 });
    game.handle(a.id, { t: "drop", id: 5, x: target.x + 20, y: target.y - 15 });
    expect(game.pieces[5]).toMatchObject({ x: target.x, y: target.y, placed: true, heldBy: 0 });
    expect(events.at(-1)).toMatchObject({ k: "drop", id: 5, placed: true });
    // Une pièce posée ne se reprend plus.
    game.handle(a.id, { t: "grab", id: 5 });
    expect(game.pieces[5]!.heldBy).toBe(0);
    // Trop loin : pas d'aimantation.
    game.handle(a.id, { t: "grab", id: 6 });
    game.handle(a.id, { t: "drop", id: 6, x: home(6, 12).x + 150, y: home(6, 12).y });
    expect(game.pieces[6]!.placed).toBe(false);
  });

  it("le puzzle se termine quand la dernière pièce est posée", () => {
    const { game, ps } = setup(2);
    const [a, b] = ps as [typeof ps[0], typeof ps[0]];
    game.handle(a.id, { t: "configure", config: { count: 12 } });
    game.handle(a.id, { t: "start" });
    for (let id = 0; id < 12; id++) {
      const who = id % 2 ? b : a;
      const t = home(id, 12);
      game.handle(who.id, { t: "grab", id });
      game.handle(who.id, { t: "drop", id, x: t.x, y: t.y });
    }
    expect(game.phase).toBe("done");
    expect(game.players.map((p) => p.placed)).toEqual([6, 6]);
    game.handle(a.id, { t: "again" });
    expect(game.phase).toBe("lobby");
  });

  it("une déconnexion relâche la pièce tenue", () => {
    const { game, ps } = setup(2);
    const [a] = ps;
    game.handle(a!.id, { t: "start" });
    game.handle(a!.id, { t: "grab", id: 1 });
    game.setConnected(a!.id, false);
    expect(game.pieces[1]!.heldBy).toBe(0);
  });
});

describe("découpe", () => {
  it("chaque tenon a sa mortaise chez la voisine", () => {
    const { cols, rows, cw, ch } = grid(48);
    const points = (id: number) => {
      const n = (piecePath(id, 48, 42).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
      return pts;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        const a = points(id);
        if (c < cols - 1) {
          // Bord vertical commun : exactement une des deux pièces déborde chez l'autre.
          const edge = (c + 1) * cw;
          const aOut = Math.max(...a.map((p) => p[0])) > edge + 1;
          const bOut = Math.min(...points(id + 1).map((p) => p[0])) < edge - 1;
          expect(aOut !== bOut).toBe(true);
        }
        if (r < rows - 1) {
          const edge = (r + 1) * ch;
          const aOut = Math.max(...a.map((p) => p[1])) > edge + 1;
          const bOut = Math.min(...points(id + cols).map((p) => p[1])) < edge - 1;
          expect(aOut !== bOut).toBe(true);
        }
      }
    }
    expect(cuts(42, cols, rows).h).toHaveLength(rows);
  });

  it("les pièces de coin ont deux bords droits", () => {
    const path = piecePath(0, 12, 1);
    expect(path.startsWith("M0.0 0.0 L300.0 0.0")).toBe(true);
  });
});
