import { describe, expect, it } from "vitest";
import { GameError } from "../../platform.js";
import { PuzzleGame } from "./game.js";
import {
  FORMATS,
  PIECE_COUNTS,
  cuts,
  home,
  isCorner,
  layout,
  neighbours,
  piecePath,
  type PuzzleConfig,
  type PuzzleEvent,
} from "../../../shared/games/puzzle.js";

function seeded(seed = 5) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function setup(players = 2, config: Partial<PuzzleConfig> = {}) {
  const events: PuzzleEvent[] = [];
  const game = new PuzzleGame("PUZ01", { changed: () => {}, emit: (e) => events.push(e as PuzzleEvent) }, seeded());
  const ps = Array.from({ length: players }, (_, i) => game.addPlayer(`Joueur ${i + 1}`));
  game.handle(ps[0]!.id, { t: "configure", config });
  game.handle(ps[0]!.id, { t: "start" });
  return { game, ps, events, L: game.layout };
}

/** Prend une pièce et la lâche en (x, y). */
function put(game: PuzzleGame, who: string, id: number, x: number, y: number) {
  game.handle(who, { t: "grab", id });
  game.handle(who, { t: "drop", id, x, y });
}

describe("préparation", () => {
  it("seul l'hôte choisit le dessin, le format et le nombre de pièces", () => {
    const game = new PuzzleGame("P", { changed: () => {}, emit: () => {} }, seeded());
    const a = game.addPlayer("A");
    const b = game.addPlayer("B");
    expect(() => game.handle(b.id, { t: "configure", config: { count: 12 } })).toThrow(GameError);
    game.handle(a.id, { t: "configure", config: { art: "orbite", count: 432, format: "panorama" } });
    expect(game.config).toEqual({ art: "orbite", count: 432, format: "panorama" });
    game.handle(a.id, { t: "configure", config: { count: 7 as never, art: "inconnu" as never, format: "rond" as never } });
    expect(game.config).toEqual({ art: "orbite", count: 432, format: "panorama" });
  });

  it("chaque format donne des cases à peu près carrées et le nombre de pièces voulu", () => {
    for (const f of FORMATS) {
      for (const count of PIECE_COUNTS) {
        const L = layout({ format: f.id, count });
        expect(L.cw / L.ch).toBeGreaterThan(0.6);
        expect(L.cw / L.ch).toBeLessThan(1.6);
        expect(Math.abs(L.cols * L.rows - count) / count).toBeLessThan(0.12);
      }
    }
  });

  it("disperse toutes les pièces sur la table, hors du plateau et sans les empiler", () => {
    for (const [format, count] of [
      ["paysage", 12],
      ["panorama", 192],
      ["portrait", 300],
      ["carre", 432],
    ] as const) {
      const { game, L } = setup(1, { format, count });
      expect(game.pieces).toHaveLength(L.cols * L.rows);
      let overlaps = 0;
      for (const p of game.pieces) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + L.cw).toBeLessThanOrEqual(L.tableW);
        expect(p.y + L.ch).toBeLessThanOrEqual(L.tableH);
        const inside = p.x > L.boardX && p.x + L.cw < L.boardX + L.w && p.y > L.boardY && p.y + L.ch < L.boardY + L.h;
        expect(inside).toBe(false);
      }
      for (let i = 0; i < game.pieces.length; i++) {
        for (let j = i + 1; j < game.pieces.length; j++) {
          const a = game.pieces[i]!;
          const b = game.pieces[j]!;
          if (Math.abs(a.x - b.x) < L.cw * 0.5 && Math.abs(a.y - b.y) < L.ch * 0.5) overlaps++;
        }
      }
      expect(overlaps, `${format} ${count}`).toBe(0);
    }
  });
});

describe("pose sur le plateau", () => {
  it("un coin se pose seul, une pièce isolée ne se valide pas même bien placée", () => {
    const { game, ps, L } = setup(1, { count: 12 });
    const a = ps[0]!.id;
    const middle = L.cols + 1;
    const t = home(middle, L);
    put(game, a, middle, t.x, t.y);
    expect(game.pieces[middle]!.placed).toBe(false);
    const corner = 0;
    const c = home(corner, L);
    put(game, a, corner, c.x + 15, c.y - 10);
    expect(game.pieces[corner]).toMatchObject({ x: c.x, y: c.y, placed: true, heldBy: 0 });
    // Une pièce posée ne se reprend plus.
    game.handle(a, { t: "grab", id: corner });
    expect(game.pieces[corner]!.heldBy).toBe(0);
  });

  it("une pièce se valide quand elle touche une pièce déjà posée", () => {
    const { game, ps, L } = setup(1, { count: 12 });
    const a = ps[0]!.id;
    put(game, a, 0, home(0, L).x, home(0, L).y);
    // La voisine de droite du coin, puis celle d'en dessous de celle-ci (diagonale du coin).
    put(game, a, 1, home(1, L).x - 12, home(1, L).y + 8);
    expect(game.pieces[1]!.placed).toBe(true);
    const diag = L.cols + 1;
    put(game, a, diag, home(diag, L).x, home(diag, L).y);
    expect(game.pieces[diag]!.placed).toBe(true);
    // Trop loin : pas d'aimantation.
    put(game, a, 2, home(2, L).x + 150, home(2, L).y);
    expect(game.pieces[2]!.placed).toBe(false);
  });
});

describe("blocs", () => {
  it("deux voisines s'emboîtent hors du plateau, et le bloc se déplace d'un geste", () => {
    const { game, ps, L, events } = setup(2, { count: 12 });
    const a = ps[0]!.id;
    const [p, q] = [5, 6];
    // La pièce 5 est posée à un endroit libre de la table, la 6 juste à sa droite (un peu de travers).
    put(game, a, p, 40, 40);
    put(game, a, q, 40 + L.cw + 10, 40 - 7);
    expect(game.pieces[q]!.group).toBe(game.pieces[p]!.group);
    expect(game.pieces[q]!.x - game.pieces[p]!.x).toBeCloseTo(L.cw, 0);
    expect(game.pieces[q]!.y).toBeCloseTo(game.pieces[p]!.y, 0);
    expect(events.at(-1)).toMatchObject({ k: "drop", merged: true });
    // Prendre l'une emporte l'autre, et verrouille tout le bloc pour les autres joueurs.
    game.handle(a, { t: "grab", id: q });
    game.handle(ps[1]!.id, { t: "grab", id: p });
    expect(game.pieces[p]!.heldBy).toBe(ps[0]!.slot);
    game.handle(a, { t: "move", id: q, x: 500, y: 60 });
    expect(game.pieces[q]!.x).toBe(500);
    expect(game.pieces[p]!.x).toBeCloseTo(500 - L.cw, 0);
    game.handle(a, { t: "drop", id: q, x: 500, y: 60 });
  });

  it("un bloc qui contient un coin se pose en entier", () => {
    const { game, ps, L } = setup(1, { count: 12 });
    const a = ps[0]!.id;
    put(game, a, 0, 30, 30);
    put(game, a, 1, 30 + L.cw, 30);
    expect(game.pieces[1]!.group).toBe(0);
    const t = home(1, L);
    put(game, a, 1, t.x + 10, t.y + 10);
    expect(game.pieces[0]).toMatchObject({ placed: true, x: home(0, L).x, y: home(0, L).y });
    expect(game.pieces[1]).toMatchObject({ placed: true, x: t.x, y: t.y });
    expect(game.players[0]!.placed).toBe(2);
  });

  it("un bloc sans coin ne se pose pas tant qu'il ne touche rien de posé", () => {
    const { game, ps, L } = setup(1, { count: 48 });
    const a = ps[0]!.id;
    const [p, q] = [L.cols + 2, L.cols + 3];
    put(game, a, p, 30, 30);
    put(game, a, q, 30 + L.cw, 30);
    put(game, a, p, home(p, L).x, home(p, L).y);
    expect(game.pieces[p]!.placed).toBe(false);
    expect(game.pieces[q]!.placed).toBe(false);
  });
});

describe("partie", () => {
  it("le puzzle se termine quand la dernière pièce est posée, en partant des coins", () => {
    const { game, ps, L } = setup(2, { count: 12, format: "panorama" });
    const [a, b] = ps;
    const n = L.cols * L.rows;
    // Une pièce se pose dès qu'elle touche le reste : on avance de proche en proche depuis le coin 0.
    const order: number[] = [0];
    for (let k = 0; k < order.length; k++) for (const nb of neighbours(order[k]!, L)) if (!order.includes(nb)) order.push(nb);
    order.forEach((id, k) => {
      const t = home(id, L);
      put(game, (k % 2 ? b : a)!.id, id, t.x, t.y);
      expect(game.pieces[id]!.placed, `pièce ${id}`).toBe(true);
    });
    expect(order).toHaveLength(n);
    expect(game.phase).toBe("done");
    expect(game.players.reduce((s, p) => s + p.placed, 0)).toBe(n);
    game.handle(a!.id, { t: "again" });
    expect(game.phase).toBe("lobby");
  });

  it("une déconnexion relâche le bloc tenu", () => {
    const { game, ps } = setup(2);
    const [a] = ps;
    game.handle(a!.id, { t: "grab", id: 1 });
    game.setConnected(a!.id, false);
    expect(game.pieces[1]!.heldBy).toBe(0);
  });
});

describe("découpe", () => {
  it("chaque tenon a sa mortaise chez la voisine", () => {
    const L = layout({ count: 48, format: "paysage" });
    const { cols, rows, cw, ch } = L;
    const points = (id: number) => {
      const n = (piecePath(id, L, 42).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
      return pts;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        const a = points(id);
        if (c < cols - 1) {
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

  it("les coins ont deux bords droits et sont bien reconnus", () => {
    const L = layout({ count: 12, format: "paysage" });
    expect(piecePath(0, L, 1).startsWith("M0.0 0.0 L300.0 0.0")).toBe(true);
    expect([0, L.cols - 1, L.cols * (L.rows - 1), L.cols * L.rows - 1].every((id) => isCorner(id, L))).toBe(true);
    expect(isCorner(1, L)).toBe(false);
  });
});
