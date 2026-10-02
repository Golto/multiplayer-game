// Textures procédurales, toutes dessinées dans des canvas : aucune image externe.

import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** Générateur pseudo-aléatoire déterministe : la station est identique à chaque visite. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Salissure : taches douces et rayures. */
function grime(g: CanvasRenderingContext2D, w: number, h: number, seed: number, strength = 0.18): void {
  const r = rng(seed);
  for (let i = 0; i < 220; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 6 + r() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = r() * strength;
    grad.addColorStop(0, `rgba(20,16,10,${a})`);
    grad.addColorStop(1, "rgba(20,16,10,0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 60; i++) {
    g.beginPath();
    const x = r() * w;
    const y = r() * h;
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 6);
    g.stroke();
  }
  // Coulures verticales.
  for (let i = 0; i < 24; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 30 + r() * 120;
    const grad = g.createLinearGradient(x, y, x, y + len);
    grad.addColorStop(0, `rgba(30,22,12,${0.12 * r()})`);
    grad.addColorStop(1, "rgba(30,22,12,0)");
    g.fillStyle = grad;
    g.fillRect(x, y, 2 + r() * 4, len);
  }
}

function finish(c: HTMLCanvasElement, color = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface Surface {
  map: THREE.Texture;
  bump: THREE.Texture;
}

/** Panneaux de coque rivetés : la peau des couloirs et des salles. */
export function panels(opts: { base: string; seam: string; cols: number; rows: number; seed: number; accent?: string }): Surface {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  g.fillStyle = opts.base;
  g.fillRect(0, 0, S, S);
  bg.fillStyle = "#808080";
  bg.fillRect(0, 0, S, S);
  const r = rng(opts.seed);
  const pw = S / opts.cols;
  const ph = S / opts.rows;
  for (let j = 0; j < opts.rows; j++) {
    for (let i = 0; i < opts.cols; i++) {
      const x = i * pw;
      const y = j * ph;
      // Légère variation de teinte d'une plaque à l'autre.
      g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${r() * 0.06})`;
      g.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      if (opts.accent && r() < 0.12) {
        g.fillStyle = opts.accent;
        g.fillRect(x + pw * 0.1, y + ph * 0.75, pw * 0.8, ph * 0.08);
      }
      // Grilles d'aération sur certaines plaques.
      if (r() < 0.15) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        bg.fillStyle = "#404040";
        for (let k = 0; k < 6; k++) {
          g.fillRect(x + pw * 0.2, y + ph * (0.25 + k * 0.08), pw * 0.6, ph * 0.035);
          bg.fillRect(x + pw * 0.2, y + ph * (0.25 + k * 0.08), pw * 0.6, ph * 0.035);
        }
      }
      // Rivets aux coins.
      for (const [rx, ry] of [
        [8, 8],
        [pw - 8, 8],
        [8, ph - 8],
        [pw - 8, ph - 8],
      ] as const) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.beginPath();
        g.arc(x + rx, y + ry, 2.6, 0, Math.PI * 2);
        g.fill();
        bg.fillStyle = "#c8c8c8";
        bg.beginPath();
        bg.arc(x + rx, y + ry, 2.6, 0, Math.PI * 2);
        bg.fill();
      }
    }
  }
  // Joints entre les plaques.
  g.strokeStyle = opts.seam;
  bg.strokeStyle = "#202020";
  g.lineWidth = bg.lineWidth = 3;
  for (let i = 0; i <= opts.cols; i++) {
    g.beginPath();
    g.moveTo(i * pw, 0);
    g.lineTo(i * pw, S);
    g.stroke();
    bg.beginPath();
    bg.moveTo(i * pw, 0);
    bg.lineTo(i * pw, S);
    bg.stroke();
  }
  for (let j = 0; j <= opts.rows; j++) {
    g.beginPath();
    g.moveTo(0, j * ph);
    g.lineTo(S, j * ph);
    g.stroke();
    bg.beginPath();
    bg.moveTo(0, j * ph);
    bg.lineTo(S, j * ph);
    bg.stroke();
  }
  grime(g, S, S, opts.seed + 7);
  return { map: finish(c), bump: finish(bc, false) };
}

/** Caillebotis métallique du sol des couloirs techniques. */
export function grate(seed: number): Surface {
  const S = 256;
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  g.fillStyle = "#2a2b2a";
  g.fillRect(0, 0, S, S);
  bg.fillStyle = "#909090";
  bg.fillRect(0, 0, S, S);
  const cell = 16;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      g.fillStyle = "#0c0d0d";
      g.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      bg.fillStyle = "#101010";
      bg.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    }
  }
  g.fillStyle = "#4a4b47";
  g.fillRect(0, 0, S, 6);
  g.fillRect(0, S / 2, S, 6);
  grime(g, S, S, seed, 0.25);
  return { map: finish(c), bump: finish(bc, false) };
}

/** Carrelage beige des zones d'habitation et du médical. */
export function tiles(opts: { base: string; joint: string; n: number; seed: number }): Surface {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  const r = rng(opts.seed);
  const t = S / opts.n;
  g.fillStyle = opts.joint;
  g.fillRect(0, 0, S, S);
  bg.fillStyle = "#303030";
  bg.fillRect(0, 0, S, S);
  for (let j = 0; j < opts.n; j++) {
    for (let i = 0; i < opts.n; i++) {
      g.fillStyle = opts.base;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      bg.fillStyle = "#a0a0a0";
      bg.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
  }
  grime(g, S, S, opts.seed + 3, 0.12);
  return { map: finish(c), bump: finish(bc, false) };
}

/** Moquette ou revêtement mou. */
export function carpet(color: string, seed: number): Surface {
  const S = 256;
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  bg.fillStyle = "#808080";
  bg.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = r() * S;
    const y = r() * S;
    const v = r();
    g.fillStyle = `rgba(${v > 0.5 ? "255,255,255" : "0,0,0"},0.06)`;
    g.fillRect(x, y, 1.5, 1.5);
    bg.fillStyle = v > 0.5 ? "#a0a0a0" : "#606060";
    bg.fillRect(x, y, 1.5, 1.5);
  }
  // Motif géométrique années 70.
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 6;
  for (let k = -S; k < S * 2; k += 64) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.stroke();
  }
  grime(g, S, S, seed + 1, 0.1);
  return { map: finish(c), bump: finish(bc, false) };
}

/** Rayures jaunes et noires des seuils et des sas. */
export function hazard(): THREE.Texture {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#d8a21c";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#151515";
  for (let k = -S; k < S * 2; k += 32) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 16, 0);
    g.lineTo(k + 16 + S, S);
    g.lineTo(k + S, S);
    g.closePath();
    g.fill();
  }
  grime(g, S, S, 99, 0.3);
  return finish(c);
}

/** Plafond : caissons sombres et grilles. */
export function ceiling(seed: number): Surface {
  return panels({ base: "#3a3c3a", seam: "#151615", cols: 2, rows: 2, seed });
}

export interface SignOptions {
  fg?: string;
  bg?: string;
  border?: string;
  font?: string;
  sub?: string;
  arrow?: "left" | "right" | "up" | "down";
  width?: number;
  height?: number;
}

/** Enseigne : texte de signalétique sur plaque. */
export function sign(text: string, o: SignOptions = {}): THREE.CanvasTexture {
  const W = o.width ?? 1024;
  const H = o.height ?? 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = o.bg ?? "#1b1d1b";
  g.fillRect(0, 0, W, H);
  if (o.border) {
    g.strokeStyle = o.border;
    g.lineWidth = 10;
    g.strokeRect(12, 12, W - 24, H - 24);
  }
  g.fillStyle = o.fg ?? "#e9e2cf";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = Math.round(H * (o.sub ? 0.36 : 0.46));
  g.font = `600 ${size}px ${o.font ?? '"Share Tech Mono", "JetBrains Mono", monospace'}`;
  const ax = o.arrow ? H * 0.42 : 0;
  g.fillText(text, W / 2 + (o.arrow === "left" ? ax / 2 : o.arrow === "right" ? -ax / 2 : 0), o.sub ? H * 0.4 : H / 2, W - 60 - ax);
  if (o.sub) {
    g.globalAlpha = 0.75;
    g.font = `400 ${Math.round(H * 0.18)}px "Share Tech Mono", monospace`;
    g.fillText(o.sub, W / 2, H * 0.75, W - 60);
    g.globalAlpha = 1;
  }
  if (o.arrow) {
    const x = o.arrow === "left" ? H * 0.35 : W - H * 0.35;
    const y = H / 2;
    const s = H * 0.18;
    g.save();
    g.translate(x, y);
    g.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[o.arrow]);
    g.beginPath();
    g.moveTo(-s, -s);
    g.lineTo(s, 0);
    g.lineTo(-s, s);
    g.closePath();
    g.fill();
    g.restore();
  }
  grime(g, W, H, text.length * 13, 0.12);
  return finish(c, true, false);
}

/** Écran cathodique animé : lignes de texte phosphore, curseur, balayage. */
export class CrtScreen {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private lines: string[];
  private t = 0;
  private r: () => number;

  constructor(
    private readonly title: string,
    lines: string[],
    private readonly color = "#7dff9a",
    seed = 1,
  ) {
    const [c, g] = canvas(256, 192);
    this.g = g;
    this.lines = lines;
    this.r = rng(seed);
    this.texture = finish(c, true, false);
    this.texture.anisotropy = 1;
    this.draw();
  }

  update(dt: number): void {
    this.t += dt;
    if (Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) this.draw();
  }

  private draw(): void {
    const g = this.g;
    const W = 256;
    const H = 192;
    g.fillStyle = "#04120a";
    g.fillRect(0, 0, W, H);
    g.fillStyle = this.color;
    g.shadowColor = this.color;
    g.shadowBlur = 6;
    g.font = '13px "Share Tech Mono", monospace';
    g.fillText(this.title, 10, 18);
    g.fillRect(10, 24, W - 20, 1.5);
    const shown = Math.min(this.lines.length, Math.floor(this.t * 1.5) % (this.lines.length + 4));
    for (let i = 0; i < shown; i++) g.fillText(this.lines[i]!, 10, 42 + i * 16);
    if (Math.floor(this.t * 2) % 2 === 0) g.fillRect(10 + ((this.lines[shown - 1]?.length ?? 0) * 7.2) % (W - 30), 30 + Math.max(shown, 1) * 16, 8, 12);
    // Petites barres de données qui bougent.
    for (let i = 0; i < 8; i++) {
      const v = 0.3 + 0.7 * Math.abs(Math.sin(this.t * (0.7 + i * 0.3) + i));
      g.fillRect(W - 70 + i * 7, H - 14 - v * 30, 4, v * 30);
    }
    g.shadowBlur = 0;
    // Lignes de balayage.
    g.fillStyle = "rgba(0,0,0,0.28)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    g.fillStyle = `rgba(150,255,170,${0.03 + this.r() * 0.03})`;
    g.fillRect(0, (this.t * 60) % H, W, 14);
    this.texture.needsUpdate = true;
  }
}
