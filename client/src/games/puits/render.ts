// Rendu de l'arène en canvas : une nappe d'espace-temps que les puits creusent, le soleil, les
// éclats, les vaisseaux et leurs traînées, l'aperçu des trajectoires pendant la planification.

import { ARENA_R, SHARD_R, SHIP_R, SPAWN_R, SUN_R, WELL_DECAY, WELL_MAX_R, WELL_MIN_R, type Placement, type SimState, type Well } from "../../../../shared/games/puits";

/** Marge autour du disque, en unités du monde. */
const PAD = 40;

interface Palette {
  space: string;
  page: string;
  grid: string;
  rim: string;
  muted: string;
  fg: string;
  sun: string;
  sunDeep: string;
  shard: string;
  danger: string;
  slots: Map<number, string>;
}

interface Effect {
  kind: "death" | "shard" | "bump" | "drop";
  x: number;
  y: number;
  color: string;
  at: number;
}

export interface Scene {
  sim: SimState;
  mySlot: number;
  accents: Map<number, string>;
  /** Trajectoires prévues, en unités du monde (x0, y0, x1, y1…). */
  paths: Map<number, number[]> | null;
  /** Pose en cours de choix (fantôme) ou déjà validée. */
  pending: (Placement & { locked: boolean }) | null;
  /** Survol pendant la planification : la pose qui suivrait un clic. */
  hover: Placement | null;
  /** Traînées des vaisseaux pendant la résolution. */
  trails: Map<number, number[]> | null;
  /**
   * Pendant la résolution, les puits de `sim` ont déjà vieilli d'un tour. Pendant la
   * planification, on montre la force qu'ils auront au prochain tour.
   */
  aged: boolean;
}

export class ArenaRenderer {
  private ctx: CanvasRenderingContext2D;
  private palette: Palette | null = null;
  private paletteAt = 0;
  private effects: Effect[] = [];
  private px = 1;
  private size = 0;
  scene: Scene | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(width: number, height: number): void {
    const side = Math.max(240, Math.floor(Math.min(width, height)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = side;
    this.canvas.style.width = `${side}px`;
    this.canvas.style.height = `${side}px`;
    this.canvas.width = Math.round(side * dpr);
    this.canvas.height = Math.round(side * dpr);
    this.px = (side * dpr) / (2 * (ARENA_R + PAD));
    this.palette = null;
  }

  /** Coordonnées du monde sous un point de l'écran. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    const k = (2 * (ARENA_R + PAD)) / box.width;
    return { x: (clientX - box.left) * k - (ARENA_R + PAD), y: (clientY - box.top) * k - (ARENA_R + PAD) };
  }

  effect(kind: Effect["kind"], x: number, y: number, slot = 0): void {
    const p = this.readPalette();
    const color = kind === "shard" ? p.shard : (p.slots.get(slot) ?? p.fg);
    this.effects.push({ kind, x, y, color, at: performance.now() });
  }

  private readPalette(): Palette {
    const now = performance.now();
    // Le thème peut changer en cours de partie : on relit les couleurs de temps en temps.
    if (this.palette && now - this.paletteAt < 1000) return this.palette;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const slots = new Map<number, string>();
    for (const [slot, accent] of this.scene?.accents ?? []) slots.set(slot, v(`--accent-${accent}`));
    this.palette = {
      space: v("--background-overlay"),
      page: v("--background"),
      grid: v("--border"),
      rim: v("--foreground-muted"),
      muted: v("--foreground-muted"),
      fg: v("--foreground"),
      sun: v("--primary"),
      sunDeep: v("--secondary"),
      shard: v("--accent-yellow-light") || v("--primary"),
      danger: v("--danger"),
      slots,
    };
    this.paletteAt = now;
    return this.palette;
  }

  draw(t: number): void {
    const scene = this.scene;
    const ctx = this.ctx;
    const W = this.canvas.width;
    if (!scene || !W) return;
    const p = this.readPalette();
    const k = this.px;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.setTransform(k, 0, 0, k, W / 2, W / 2);

    // Le disque de l'arène.
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.fillStyle = p.space;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.clip();
    const wells = [...scene.sim.wells];
    if (scene.pending) wells.push({ ...scene.pending, age: -1 });
    else if (scene.hover) wells.push({ ...scene.hover, age: -1 });
    this.drawFabric(wells, scene.aged, p);
    // Orbite de départ, en pointillé discret.
    ctx.setLineDash([6 / k, 10 / k]);
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.arc(0, 0, SPAWN_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Bord : au-delà, le vide.
    ctx.lineWidth = 2 / k;
    ctx.strokeStyle = p.rim;
    ctx.setLineDash([2 / k, 7 / k]);
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawSun(p, t);
    for (const w of scene.sim.wells) this.drawWell(w, strength(w, scene.aged), p, t, false);
    if (scene.pending) this.drawWell({ ...scene.pending, age: 0 }, 1, p, t, !scene.pending.locked);
    else if (scene.hover) this.drawWell({ ...scene.hover, age: 0 }, 0.55, p, t, true);
    for (const s of scene.sim.shards) this.drawShard(s.x, s.y, p, t);
    if (scene.trails) this.drawTrails(scene.trails, p);
    if (scene.paths) this.drawPaths(scene.paths, scene.mySlot, p);
    for (const s of scene.sim.ships) if (s.alive) this.drawShip(s.x, s.y, s.vx, s.vy, p.slots.get(s.slot) ?? p.fg, s.slot === scene.mySlot, p, t);
    this.drawEffects(p, t);
  }

  /**
   * La nappe : une grille déplacée vers les puits (et repoussée par les répulseurs), comme une
   * toile tendue qu'on enfonce. Purement décorative, elle aide à lire le champ d'un coup d'œil.
   */
  private drawFabric(wells: Well[], aged: boolean, p: Palette): void {
    const ctx = this.ctx;
    const step = 100;
    const sample = 25;
    const pull = (x: number, y: number): [number, number] => {
      let dx = 0;
      let dy = 0;
      const sun = 1 / (1 + (x * x + y * y) / (260 * 260));
      dx -= x * sun * 0.18;
      dy -= y * sun * 0.18;
      for (const w of wells) {
        const fresh = w.age < 0 ? 1 : strength(w, aged);
        if (!fresh) continue;
        const sign = w.kind === "puits" ? 1 : -1;
        const ex = w.x - x;
        const ey = w.y - y;
        const f = (sign * fresh * 0.55) / (1 + (ex * ex + ey * ey) / (150 * 150));
        dx += ex * f;
        dy += ey * f;
      }
      return [x + dx, y + dy];
    };
    ctx.lineWidth = 1 / this.px;
    ctx.strokeStyle = p.grid;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let a = -ARENA_R; a <= ARENA_R; a += step) {
      for (let pass = 0; pass < 2; pass++) {
        let first = true;
        for (let b = -ARENA_R; b <= ARENA_R; b += sample) {
          const [x, y] = pass ? pull(b, a) : pull(a, b);
          if (first) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          first = false;
        }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawSun(p: Palette, t: number): void {
    const ctx = this.ctx;
    const glow = ctx.createRadialGradient(0, 0, SUN_R * 0.6, 0, 0, SUN_R * 3.2);
    glow.addColorStop(0, withAlpha(p.sun, 0.45));
    glow.addColorStop(1, withAlpha(p.sun, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_R * 3.2, 0, Math.PI * 2);
    ctx.fill();
    const core = ctx.createRadialGradient(-SUN_R * 0.3, -SUN_R * 0.3, 4, 0, 0, SUN_R);
    core.addColorStop(0, withAlpha(p.sun, 1));
    core.addColorStop(1, withAlpha(p.sunDeep, 1));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_R + Math.sin(t / 700) * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWell(w: Well, strength: number, p: Palette, t: number, ghost: boolean): void {
    const ctx = this.ctx;
    const color = p.slots.get(w.slot) ?? p.fg;
    const k = this.px;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.globalAlpha = ghost ? 0.7 : 0.35 + strength * 0.65;
    // Anneaux qui se resserrent (puits) ou s'écartent (répulseur).
    const period = 1600;
    for (let i = 0; i < 3; i++) {
      let phase = ((t / period + i / 3) % 1 + 1) % 1;
      if (w.kind === "puits") phase = 1 - phase;
      const r = 14 + phase * 80 * (0.5 + strength * 0.5);
      ctx.globalAlpha = (ghost ? 0.7 : 0.35 + strength * 0.65) * (1 - phase);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 / k;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = ghost ? 0.85 : 0.55 + strength * 0.45;
    if (ghost) ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 2.5 / k;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    if (w.kind === "puits") {
      ctx.fill();
      ctx.fillStyle = p.space;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
      // Quatre petites flèches vers l'extérieur.
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(c * 24, s * 24);
        ctx.lineTo(c * 34, s * 34);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawShard(x: number, y: number, p: Palette, t: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t / 1400 + x);
    // Dessinés plus grands que leur rayon de collision, pour rester lisibles sur un petit écran.
    const s = SHARD_R * 1.5 * (1 + Math.sin(t / 300 + y) * 0.08);
    ctx.fillStyle = withAlpha(p.shard, 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.shard;
    ctx.strokeStyle = p.fg;
    ctx.lineWidth = 1.5 / this.px;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawShip(x: number, y: number, vx: number, vy: number, color: string, mine: boolean, p: Palette, t: number): void {
    const ctx = this.ctx;
    const k = this.px;
    ctx.save();
    ctx.translate(x, y);
    if (mine) {
      ctx.strokeStyle = p.sun;
      ctx.lineWidth = 2.5 / k;
      ctx.globalAlpha = 0.6 + Math.sin(t / 250) * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, SHIP_R * 2 + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(Math.atan2(vy, vx));
    const r = SHIP_R * 2;
    ctx.fillStyle = color;
    ctx.strokeStyle = p.fg;
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.75, r * 0.7);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.75, -r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawTrails(trails: Map<number, number[]>, p: Palette): void {
    const ctx = this.ctx;
    ctx.lineCap = "round";
    for (const [slot, pts] of trails) {
      if (pts.length < 4) continue;
      const color = p.slots.get(slot) ?? p.fg;
      const n = pts.length / 2;
      for (let i = 1; i < n; i++) {
        ctx.globalAlpha = (i / n) * 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = ((2 + (i / n) * 4) / this.px) * 1;
        ctx.beginPath();
        ctx.moveTo(pts[(i - 1) * 2]!, pts[(i - 1) * 2 + 1]!);
        ctx.lineTo(pts[i * 2]!, pts[i * 2 + 1]!);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPaths(paths: Map<number, number[]>, mySlot: number, p: Palette): void {
    const ctx = this.ctx;
    const k = this.px;
    for (const [slot, pts] of paths) {
      if (pts.length < 4) continue;
      const mine = slot === mySlot;
      const color = p.slots.get(slot) ?? p.fg;
      ctx.strokeStyle = color;
      ctx.globalAlpha = mine ? 0.95 : 0.6;
      ctx.lineWidth = (mine ? 3 : 2) / k;
      ctx.setLineDash([(mine ? 9 : 5) / k, 7 / k]);
      ctx.beginPath();
      ctx.moveTo(pts[0]!, pts[1]!);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
      ctx.stroke();
      ctx.setLineDash([]);
      // Fin de trajectoire : un point, ou une croix si le vaisseau est perdu.
      const ex = pts[pts.length - 2]!;
      const ey = pts[pts.length - 1]!;
      const r2 = ex * ex + ey * ey;
      const lost = r2 > ARENA_R * ARENA_R * 0.99 || r2 < (SUN_R + SHIP_R) ** 2;
      ctx.lineWidth = 3 / k;
      if (lost) {
        ctx.strokeStyle = p.danger;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(ex - 14, ey - 14);
        ctx.lineTo(ex + 14, ey + 14);
        ctx.moveTo(ex + 14, ey - 14);
        ctx.lineTo(ex - 14, ey + 14);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ex, ey, mine ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawEffects(p: Palette, t: number): void {
    const ctx = this.ctx;
    const k = this.px;
    this.effects = this.effects.filter((e) => t - e.at < 1200);
    for (const e of this.effects) {
      const age = (t - e.at) / 1200;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = e.kind === "death" ? p.danger : e.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 3 / k;
      const reach = e.kind === "death" ? 140 : e.kind === "shard" ? 60 : e.kind === "drop" ? 90 : 40;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + age * reach, 0, Math.PI * 2);
      ctx.stroke();
      if (e.kind === "death" || e.kind === "shard") {
        ctx.fillStyle = e.kind === "death" ? e.color : p.shard;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + e.x;
          const d = 12 + age * reach * 1.1;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, (1 - age) * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}

/** Force d'un puits au moment montré (0 : il s'éteint au prochain tour). */
function strength(w: Well, aged: boolean): number {
  return WELL_DECAY[aged ? w.age : w.age + 1] ?? 0;
}

/** Zone où l'on peut poser un puits. */
export function placeable(x: number, y: number): boolean {
  const r = Math.sqrt(x * x + y * y);
  return r >= WELL_MIN_R && r <= WELL_MAX_R;
}

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
const rgbCache = new Map<string, [number, number, number]>();

/** Une couleur CSS quelconque, avec l'opacité voulue (le canvas la normalise pour nous). */
function withAlpha(color: string, alpha: number): string {
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
