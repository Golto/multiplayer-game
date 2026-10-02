// Éléments graphiques communs à tous les jeux : guillochis, sceaux de joueurs, courbes.

import { useMemo } from "preact/hooks";

// ---------------------------------------------------------------- guillochis

export interface GuillocheOptions {
  /** Rayon du cercle fixe. */
  R: number;
  /** Rayon du cercle roulant. */
  r: number;
  /** Distance du traceur au centre du cercle roulant. */
  d: number;
  cx: number;
  cy: number;
  scale?: number;
  steps?: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Hypotrochoïde fermée, base des motifs de billets de banque. */
export function hypotrochoid({ R, r, d, cx, cy, scale = 1, steps = 1400 }: GuillocheOptions): string {
  const turns = r / gcd(R, r);
  const k = (R - r) / r;
  const total = Math.PI * 2 * turns;
  let path = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total;
    const x = cx + scale * ((R - r) * Math.cos(t) + d * Math.cos(k * t));
    const y = cy + scale * ((R - r) * Math.sin(t) - d * Math.sin(k * t));
    path += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${path}Z`;
}

/** Bandeau ondulé : sinusoïdes déphasées, comme sur les bords de billets. */
export function waveBand(width: number, y: number, amp: number, lines: number, period: number): string {
  let path = "";
  for (let l = 0; l < lines; l++) {
    const phase = (l / lines) * Math.PI * 2;
    for (let x = 0; x <= width; x += 2) {
      const yy = y + amp * Math.sin((x / period) * Math.PI * 2 + phase);
      path += `${x === 0 ? "M" : "L"}${x} ${yy.toFixed(2)}`;
    }
  }
  return path;
}

export function accentVar(accent: string): Record<string, string> {
  return { "--c": `var(--accent-${accent})`, "--c-light": `var(--accent-${accent}-light)`, "--c-deep": `var(--accent-${accent}-deep)` } as Record<string, string>;
}

// ---------------------------------------------------------------- petits éléments

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

/** Sceau de joueur : pastille de cire à ses couleurs. */
export function PlayerSeal({ name, accent, size = 32 }: { name: string; accent: string; size?: number }) {
  return (
    <span class="seal" style={{ ...accentVar(accent), width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.38}px` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Sparkline({ values, width = 120, height = 32, stretch = false }: { values: number[]; width?: number; height?: number; stretch?: boolean }) {
  if (values.length < 2) values = [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => [
    2 + (i / (values.length - 1)) * (width - 4),
    height - 3 - ((v - min) / span) * (height - 6),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(1)} ${y!.toFixed(1)}`).join("");
  const area = `${line}L${pts[pts.length - 1]![0]!.toFixed(1)} ${height}L${pts[0]![0]!.toFixed(1)} ${height}Z`;
  const last = pts[pts.length - 1]!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      class="sparkline"
      aria-hidden="true"
    >
      <path d={area} class="spark-area" />
      <path d={line} class="spark-line" vector-effect="non-scaling-stroke" />
      {!stretch && <circle cx={last[0]} cy={last[1]} r="2.6" class="spark-dot" />}
    </svg>
  );
}

/** Grand motif de fond, très discret, pour les pages. */
export function Watermark() {
  const a = useMemo(() => hypotrochoid({ R: 96, r: 34, d: 58, cx: 200, cy: 200, scale: 1.4, steps: 2400 }), []);
  const b = useMemo(() => hypotrochoid({ R: 80, r: 30, d: 30, cx: 200, cy: 200, scale: 1.4, steps: 2000 }), []);
  return (
    <svg class="watermark" viewBox="0 0 400 400" aria-hidden="true">
      <path d={a} />
      <path d={b} />
    </svg>
  );
}
