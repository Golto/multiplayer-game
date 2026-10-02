// Rendu de la salle en canvas, vue de dessus : sol, murs, portes, plaques, corps vivants et échos
// (translucides, avec la trace pointillée du parcours qu'ils rejouent).

import { RULES, type Arena, type BodyInfo } from "../../../../shared/games/echos";

export interface Scene {
  arena: Arena;
  bodies: BodyInfo[];
  /** Positions affichées, en cases (x, y entrelacés). */
  positions: number[];
  traces: number[][];
  pressed: Set<number>;
  open: Set<string>;
  mySlot: number;
  accents: Map<number, string>;
  names: Map<number, string>;
  /** Versus : à qui est chaque plaque neutre en ce moment. */
  owners: Map<number, number>;
  showTraces: boolean;
}

interface Palette {
  floor: string;
  dot: string;
  wall: string;
  wallEdge: string;
  fg: string;
  bg: string;
  gold: string;
  goldDeep: string;
  doors: Record<string, string>;
  slots: Map<number, string>;
}

const DOOR_ACCENTS: Record<string, string> = { A: "royalblue", B: "magenta", C: "turquoise" };

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
const rgbCache = new Map<string, [number, number, number]>();
function rgba(color: string, alpha: number): string {
  let rgb = rgbCache.get(color);
  if (!rgb) {
    probe.fillStyle = "#000";
    probe.fillStyle = color;
    probe.clearRect(0, 0, 1, 1);
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    rgb = [d[0]!, d[1]!, d[2]!];
    rgbCache.set(color, rgb);
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export class RoomRenderer {
  private ctx: CanvasRenderingContext2D;
  private palette: Palette | null = null;
  private paletteAt = 0;
  private cell = 24;
  private bursts: { x: number; y: number; at: number; color: string }[] = [];
  scene: Scene | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(width: number, height: number): void {
    const arena = this.scene?.arena;
    const w = arena?.w ?? 28;
    const h = arena?.h ?? 18;
    const cell = Math.max(10, Math.floor(Math.min(width / w, height / h)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cell = cell * dpr;
    this.canvas.style.width = `${cell * w}px`;
    this.canvas.style.height = `${cell * h}px`;
    this.canvas.width = Math.round(cell * w * dpr);
    this.canvas.height = Math.round(cell * h * dpr);
    this.palette = null;
  }

  burst(x: number, y: number, slot: number): void {
    this.bursts.push({ x, y, at: performance.now(), color: this.readPalette().slots.get(slot) ?? this.readPalette().gold });
  }

  private readPalette(): Palette {
    const now = performance.now();
    if (this.palette && now - this.paletteAt < 1000) return this.palette;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const slots = new Map<number, string>();
    for (const [slot, accent] of this.scene?.accents ?? []) slots.set(slot, v(`--accent-${accent}`));
    const doors: Record<string, string> = {};
    for (const [k, accent] of Object.entries(DOOR_ACCENTS)) doors[k] = v(`--accent-${accent}`);
    this.palette = {
      floor: v("--background-overlay"),
      dot: v("--border"),
      wall: v("--foreground"),
      wallEdge: v("--foreground-muted"),
      fg: v("--foreground"),
      bg: v("--background-raised"),
      gold: v("--primary"),
      goldDeep: v("--secondary"),
      doors,
      slots,
    };
    this.paletteAt = now;
    return this.palette;
  }

  draw(t: number): void {
    const s = this.scene;
    if (!s || !this.canvas.width) return;
    const ctx = this.ctx;
    const p = this.readPalette();
    const c = this.cell;
    const { arena } = s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(c, 0, 0, c, 0, 0);
    const px = 1 / c;

    // Sol et petits points de repère.
    ctx.fillStyle = p.floor;
    ctx.fillRect(0, 0, arena.w, arena.h);
    ctx.fillStyle = p.dot;
    for (let y = 1; y < arena.h; y++) for (let x = 1; x < arena.w; x++) ctx.fillRect(x - px, y - px, 2 * px, 2 * px);

    // Murs, d'un bloc, avec un liseré.
    ctx.fillStyle = rgba(p.wall, 0.86);
    for (let y = 0; y < arena.h; y++) {
      const row = arena.rows[y]!;
      for (let x = 0; x < arena.w; x++) if (row[x] === "#") ctx.fillRect(x, y, 1.002, 1.002);
    }

    // Traces des échos : le chemin qu'ils rejouent.
    if (s.showTraces) {
      ctx.lineWidth = 2.5 * px;
      ctx.setLineDash([3 * px, 6 * px]);
      ctx.lineCap = "round";
      s.traces.forEach((tr, k) => {
        if (tr.length < 4) return;
        const info = s.bodies[k]!;
        ctx.strokeStyle = rgba(p.slots.get(info.owner) ?? p.fg, info.owner === s.mySlot ? 0.6 : 0.35);
        ctx.beginPath();
        ctx.moveTo(tr[0]! / 100, tr[1]! / 100);
        for (let i = 2; i < tr.length; i += 2) ctx.lineTo(tr[i]! / 100, tr[i + 1]! / 100);
        ctx.stroke();
        // Le point d'arrivée : là où l'écho finira, si rien ne le gêne.
        ctx.fillStyle = rgba(p.slots.get(info.owner) ?? p.fg, 0.5);
        ctx.beginPath();
        ctx.arc(tr[tr.length - 2]! / 100, tr[tr.length - 1]! / 100, 0.12, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.setLineDash([]);
    }

    // Portes.
    for (const [letter, tiles] of arena.doors) {
      const color = p.doors[letter] ?? p.fg;
      const open = s.open.has(letter);
      for (const [x, y] of tiles) {
        if (open) {
          ctx.strokeStyle = rgba(color, 0.55);
          ctx.lineWidth = 2 * px;
          ctx.setLineDash([4 * px, 4 * px]);
          ctx.strokeRect(x + 0.1, y + 0.1, 0.8, 0.8);
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
          // Hachures : une porte fermée se lit comme une barrière.
          ctx.strokeStyle = rgba(p.bg, 0.6);
          ctx.lineWidth = 3 * px;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 0.04, y + 0.04, 0.92, 0.92);
          ctx.clip();
          ctx.beginPath();
          for (let k = -1; k <= 2; k++) {
            ctx.moveTo(x + k * 0.35, y + 1);
            ctx.lineTo(x + k * 0.35 + 0.5, y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Plaques.
    for (const plate of arena.plates) {
      const on = s.pressed.has(plate.index);
      const cx = plate.x + 0.5;
      const cy = plate.y + 0.5;
      if (plate.kind === "gold") {
        if (on) {
          ctx.fillStyle = rgba(p.gold, 0.25 + Math.sin(t / 200) * 0.08);
          ctx.beginPath();
          ctx.arc(cx, cy, 0.62, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = on ? p.gold : rgba(p.gold, 0.16);
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = 2.5 * px;
        ctx.beginPath();
        ctx.arc(cx, cy, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        this.star(cx, cy, 0.22, on ? p.bg : p.gold);
      } else if (plate.kind === "door") {
        const color = p.doors[plate.letter ?? "A"] ?? p.fg;
        ctx.fillStyle = on ? color : rgba(color, 0.2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5 * px;
        this.roundRect(plate.x + 0.12, plate.y + 0.12, 0.76, 0.76, 0.16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = on ? p.bg : color;
        ctx.font = `700 ${0.42}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(plate.letter ?? "", cx, cy + 0.02);
      } else {
        const owner = s.owners.get(plate.index);
        const color = owner ? (p.slots.get(owner) ?? p.fg) : p.fg;
        ctx.fillStyle = owner ? rgba(color, 0.55) : rgba(p.fg, 0.08);
        ctx.strokeStyle = owner ? color : rgba(p.fg, 0.5);
        ctx.lineWidth = 2.5 * px;
        ctx.beginPath();
        ctx.arc(cx, cy, 0.44, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Corps : les échos d'abord, les vivants par-dessus, toi en dernier.
    const order = s.bodies.map((b, k) => k).sort((a, b) => rank(s, a) - rank(s, b));
    for (const k of order) {
      const info = s.bodies[k]!;
      const x = s.positions[k * 2]!;
      const y = s.positions[k * 2 + 1]!;
      if (x === undefined || y === undefined) continue;
      const color = p.slots.get(info.owner) ?? p.fg;
      const r = RULES.radius;
      if (info.echo > 0) {
        ctx.fillStyle = rgba(color, 0.32);
        ctx.strokeStyle = rgba(color, 0.85);
        ctx.lineWidth = 2 * px;
        ctx.setLineDash([3 * px, 3 * px]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = rgba(p.fg, 0.75);
        ctx.font = `700 ${0.34}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(info.echo), x, y + 0.02);
      } else {
        const mine = info.owner === s.mySlot;
        if (mine) {
          ctx.strokeStyle = rgba(p.gold, 0.55 + Math.sin(t / 220) * 0.25);
          ctx.lineWidth = 3 * px;
          ctx.beginPath();
          ctx.arc(x, y, r + 0.16, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.strokeStyle = p.bg;
        ctx.lineWidth = 3 * px;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Prénom au-dessus, ou en dessous un joueur sur deux : au départ, les corps sont côte à côte.
        const name = s.names.get(info.owner) ?? "";
        const below = s.bodies.filter((b, j) => b.echo === 0 && j < k).length % 2 === 1;
        ctx.font = `600 ${0.36}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = below ? "top" : "bottom";
        const ly = below ? y + r + 0.08 : y - r - 0.08;
        ctx.lineWidth = 4 * px;
        ctx.strokeStyle = rgba(p.floor, 0.9);
        ctx.strokeText(name, x, ly);
        ctx.fillStyle = p.fg;
        ctx.fillText(name, x, ly);
      }
    }

    // Éclats quand une plaque s'allume.
    this.bursts = this.bursts.filter((b) => t - b.at < 700);
    for (const b of this.bursts) {
      const age = (t - b.at) / 700;
      ctx.strokeStyle = rgba(b.color, 1 - age);
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 0.4 + age * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private star(cx: number, cy: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/** Ordre de dessin : échos anciens, échos récents, vivants, toi. */
function rank(s: Scene, k: number): number {
  const b = s.bodies[k]!;
  if (b.echo > 0) return 10 - b.echo;
  return b.owner === s.mySlot ? 30 : 20;
}
