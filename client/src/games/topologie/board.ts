// Rendu du plateau en canvas : carré fondamental, marges fantômes recollées, territoires, traînes,
// têtes interpolées entre deux ticks et petits effets (chutes, captures, passages en miroir).

import { DX, DY, RULES, SURFACES, ghostCell, type Head, type SurfaceId } from "../../../../shared/games/topologie";

/** Largeur des marges fantômes, en cases. */
export const MARGIN = 4;

export interface BoardState {
  surface: SurfaceId;
  size: number;
  owner: Uint8Array;
  trail: Uint8Array;
  heads: Head[];
  /** Têtes du tick précédent, pour l'interpolation. */
  previous: Map<number, Head>;
  /** Moment (performance.now) de réception du dernier tick. */
  tickAt: number;
  mySlot: number;
  /** Accent Golpex de chaque slot. */
  accents: Map<number, string>;
}

interface Effect {
  kind: "death" | "twist" | "capture";
  x: number;
  y: number;
  slot: number;
  at: number;
}

interface Palette {
  board: string;
  margin: string;
  dot: string;
  edge: string;
  sides: string;
  ends: string;
  danger: string;
  ring: string;
  slots: Map<number, string>;
}

function readPalette(accents: Map<number, string>): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const slots = new Map<number, string>();
  for (const [slot, accent] of accents) slots.set(slot, v(`--accent-${accent}`));
  return {
    board: v("--background-overlay"),
    margin: v("--background-raised"),
    dot: v("--border"),
    edge: v("--foreground-muted"),
    sides: v("--primary"),
    ends: v("--secondary"),
    danger: v("--danger"),
    ring: v("--background-overlay"),
    slots,
  };
}

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private layer = document.createElement("canvas");
  private layerCtx = this.layer.getContext("2d")!;
  private effects: Effect[] = [];
  private cell = 10;
  private dirty = true;
  private palette: Palette | null = null;
  private paletteAt = 0;
  state: BoardState | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /** Ajuste la taille du canvas à son conteneur (et à la densité de l'écran). */
  resize(width: number, height: number): void {
    const size = this.state?.size ?? 44;
    const span = size + MARGIN * 2;
    this.cell = Math.max(4, Math.floor(Math.min(width, height) / span));
    const px = this.cell * span;
    const dpr = window.devicePixelRatio || 1;
    for (const c of [this.canvas, this.layer]) {
      c.width = px * dpr;
      c.height = px * dpr;
    }
    this.canvas.style.width = `${px}px`;
    this.canvas.style.height = `${px}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  /** Le plateau a changé (nouveau tick ou nouvel état) : la couche des cases sera redessinée. */
  invalidate(): void {
    this.dirty = true;
  }

  effect(kind: Effect["kind"], slot: number, x: number, y: number): void {
    this.effects.push({ kind, slot, x, y, at: performance.now() });
  }

  /** Case → pixel (coin haut-gauche), marges comprises. */
  private at(x: number, y: number): [number, number] {
    return [(x + MARGIN) * this.cell, (y + MARGIN) * this.cell];
  }

  private colors(): Palette {
    const now = performance.now();
    if (!this.palette || now - this.paletteAt > 500) {
      // Relu régulièrement : le thème clair/sombre peut changer en cours de partie.
      this.palette = readPalette(this.state?.accents ?? new Map());
      this.paletteAt = now;
      this.dirty = true;
    }
    return this.palette;
  }

  private drawLayer(p: Palette): void {
    const s = this.state!;
    const g = this.layerCtx;
    const c = this.cell;
    const n = s.size;
    const span = n + MARGIN * 2;
    g.clearRect(0, 0, span * c, span * c);

    g.fillStyle = p.margin;
    g.fillRect(0, 0, span * c, span * c);
    g.fillStyle = p.board;
    g.fillRect(MARGIN * c, MARGIN * c, n * c, n * c);

    const info = SURFACES[s.surface];
    for (let gy = -MARGIN; gy < n + MARGIN; gy++) {
      for (let gx = -MARGIN; gx < n + MARGIN; gx++) {
        const inside = gx >= 0 && gx < n && gy >= 0 && gy < n;
        const src = inside ? { x: gx, y: gy } : ghostCell(s.surface, n, n, gx, gy);
        const [px, py] = this.at(gx, gy);
        if (!src) {
          // Coin (deux recollements à la fois) ou derrière un mur : hachures.
          const wall = (gy < 0 || gy >= n) && !(gx < 0 || gx >= n) ? info.ends === "mur" : (gx < 0 || gx >= n) && !(gy < 0 || gy >= n) && info.sides === "mur";
          if (wall && (gx + gy) % 3 === 0) {
            g.globalAlpha = 0.35;
            g.fillStyle = p.danger;
            g.fillRect(px, py, c, c);
          }
          continue;
        }
        const i = src.y * n + src.x;
        const o = s.owner[i]!;
        const t = s.trail[i]!;
        g.globalAlpha = inside ? 1 : 0.32;
        if (o) {
          g.fillStyle = p.slots.get(o) ?? p.edge;
          g.globalAlpha *= 0.55;
          g.fillRect(px + 0.5, py + 0.5, c - 1, c - 1);
          g.globalAlpha = inside ? 1 : 0.32;
        } else if (c >= 7) {
          g.fillStyle = p.dot;
          g.fillRect(px + c / 2 - 0.75, py + c / 2 - 0.75, 1.5, 1.5);
        }
        if (t) {
          const inset = c * 0.2;
          g.fillStyle = p.slots.get(t) ?? p.edge;
          g.fillRect(px + inset, py + inset, c - inset * 2, c - inset * 2);
        }
      }
    }
    g.globalAlpha = 1;

    // Bords du carré, avec la notation des recollements.
    const x0 = MARGIN * c;
    const x1 = (MARGIN + n) * c;
    g.lineWidth = 2;
    const edge = (ax: number, ay: number, bx: number, by: number, color: string) => {
      g.strokeStyle = color;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    };
    const sphere = info.sides === "adjacent";
    if (sphere) {
      // Haut et gauche se recollent (couleur des côtés), bas et droite aussi (couleur des bouts).
      edge(x0, x0, x0, x1, p.sides);
      edge(x0, x0, x1, x0, p.sides);
      edge(x1, x0, x1, x1, p.ends);
      edge(x0, x1, x1, x1, p.ends);
    } else {
      edge(x0, x0, x0, x1, info.sides === "mur" ? p.danger : p.sides);
      edge(x1, x0, x1, x1, info.sides === "mur" ? p.danger : p.sides);
      edge(x0, x0, x1, x0, info.ends === "mur" ? p.danger : p.ends);
      edge(x0, x1, x1, x1, info.ends === "mur" ? p.danger : p.ends);
    }

    const chevrons = (x: number, y: number, angle: number, color: string, double: boolean) => {
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      g.strokeStyle = color;
      g.lineWidth = 2.5;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const off of double ? [-4, 4] : [0]) {
        g.beginPath();
        g.moveTo(-7, off - 4);
        g.lineTo(0, off + 3);
        g.lineTo(7, off - 4);
        g.stroke();
      }
      g.restore();
    };
    const mid = (x0 + x1) / 2;
    const down = 0;
    const up = Math.PI;
    const right = -Math.PI / 2;
    const left = Math.PI / 2;
    if (sphere) {
      // Notation a a⁻¹ : les flèches partent du coin commun de chaque paire de bords.
      for (const t of [mid - n * c * 0.25, mid + n * c * 0.25]) {
        chevrons(t, x0, right, p.sides, false);
        chevrons(x0, t, down, p.sides, false);
        chevrons(t, x1, right, p.ends, true);
        chevrons(x1, t, down, p.ends, true);
      }
      return;
    }
    if (info.sides !== "mur") {
      for (const y of [mid - n * c * 0.25, mid + n * c * 0.25]) {
        chevrons(x0, y, down, p.sides, false);
        chevrons(x1, y, info.sides === "retourne" ? up : down, p.sides, false);
      }
    }
    if (info.ends !== "mur") {
      for (const x of [mid - n * c * 0.25, mid + n * c * 0.25]) {
        chevrons(x, x0, right, p.ends, true);
        chevrons(x, x1, info.ends === "retourne" ? left : right, p.ends, true);
      }
    }
  }

  draw(now: number): void {
    const s = this.state;
    if (!s) return;
    const p = this.colors();
    if (this.dirty) {
      this.drawLayer(p);
      this.dirty = false;
    }
    const g = this.ctx;
    const c = this.cell;
    const span = (s.size + MARGIN * 2) * c;
    g.clearRect(0, 0, span, span);
    g.drawImage(this.layer, 0, 0, span, span);

    // Têtes, glissées entre la position précédente et la nouvelle.
    const t = Math.min(1, (now - s.tickAt) / RULES.tickMs);
    for (const h of s.heads) {
      if (!h.alive) continue;
      const before = s.previous.get(h.slot);
      let fx = h.x;
      let fy = h.y;
      if (before?.alive && Math.abs(before.x - h.x) + Math.abs(before.y - h.y) === 1) {
        fx = before.x + (h.x - before.x) * t;
        fy = before.y + (h.y - before.y) * t;
      }
      const [px, py] = this.at(fx, fy);
      const cx = px + c / 2;
      const cy = py + c / 2;
      const color = p.slots.get(h.slot) ?? p.edge;
      const mine = h.slot === s.mySlot;
      if (mine) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        g.strokeStyle = p.sides;
        g.globalAlpha = 0.35 + 0.4 * pulse;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, c * (1.25 + 0.25 * pulse), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = color;
      g.strokeStyle = p.ring;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, c * 0.85, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // Petit bec dans la direction de marche.
      g.fillStyle = p.ring;
      g.beginPath();
      g.arc(cx + DX[h.dir] * c * 0.38, cy + DY[h.dir] * c * 0.38, c * 0.22, 0, Math.PI * 2);
      g.fill();
    }

    // Effets éphémères.
    this.effects = this.effects.filter((e) => now - e.at < 700);
    for (const e of this.effects) {
      const k = (now - e.at) / 700;
      const [px, py] = this.at(e.x, e.y);
      const cx = px + c / 2;
      const cy = py + c / 2;
      g.globalAlpha = 1 - k;
      g.lineWidth = 3;
      g.strokeStyle = e.kind === "death" ? p.danger : e.kind === "twist" ? p.ends : (p.slots.get(e.slot) ?? p.sides);
      g.beginPath();
      g.arc(cx, cy, c * (1 + k * (e.kind === "capture" ? 6 : 3)), 0, Math.PI * 2);
      g.stroke();
      if (e.kind === "twist") {
        g.fillStyle = p.ends;
        g.font = `600 ${Math.max(11, c * 1.1)}px Poppins, sans-serif`;
        g.textAlign = "center";
        g.fillText("miroir", cx, cy - c * (1.6 + k * 2));
      }
    }
    g.globalAlpha = 1;
  }
}
