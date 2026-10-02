// Schéma d'une surface : le carré et ses recollements, en notation de topologue.
// Flèches simples (orange) pour les bords gauche et droit, doubles (corail) pour le haut et le bas ;
// deux flèches dans le même sens se recollent droit, en sens contraires elles se recollent en miroir.

import { SURFACES, type Gluing, type SurfaceId } from "../../../../shared/games/topologie";

function Chevron({ x, y, dir, double }: { x: number; y: number; dir: "up" | "down" | "left" | "right"; double?: boolean }) {
  const rot = { down: 0, left: 90, up: 180, right: 270 }[dir];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M-5 -3L0 2L5 -3" />
      {double && <path d="M-5 -8L0 -3L5 -8" />}
    </g>
  );
}

function Edge({ x1, y1, x2, y2, gluing, kind }: { x1: number; y1: number; x2: number; y2: number; gluing: Gluing; kind: "sides" | "ends" }) {
  if (gluing === "mur") return <line x1={x1} y1={y1} x2={x2} y2={y2} class="diagram-wall" />;
  return <line x1={x1} y1={y1} x2={x2} y2={y2} class={`diagram-edge diagram-${kind}`} />;
}

export function SurfaceDiagram({ surface, size = 120 }: { surface: SurfaceId; size?: number }) {
  const s = SURFACES[surface];
  const a = 18;
  const b = 102;
  const m = 60;
  return (
    <svg class="surface-diagram" viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Schéma : ${s.name}`}>
      <rect x={a} y={a} width={b - a} height={b - a} class="diagram-fill" />
      <Edge x1={a} y1={a} x2={a} y2={b} gluing={s.sides} kind="sides" />
      <Edge x1={b} y1={a} x2={b} y2={b} gluing={s.sides} kind="sides" />
      <Edge x1={a} y1={a} x2={b} y2={a} gluing={s.ends} kind="ends" />
      <Edge x1={a} y1={b} x2={b} y2={b} gluing={s.ends} kind="ends" />
      {s.sides !== "mur" && (
        <g class="diagram-arrow diagram-sides">
          <Chevron x={a} y={m} dir="down" />
          <Chevron x={b} y={m} dir={s.sides === "retourne" ? "up" : "down"} />
        </g>
      )}
      {s.ends !== "mur" && (
        <g class="diagram-arrow diagram-ends">
          <Chevron x={m} y={a} dir="right" double />
          <Chevron x={m} y={b} dir={s.ends === "retourne" ? "left" : "right"} double />
        </g>
      )}
    </svg>
  );
}
