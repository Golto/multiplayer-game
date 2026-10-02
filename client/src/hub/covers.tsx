// Couvertures des jeux en préparation : guillochis et dessin au trait, dans les tons de la marque.

import { useMemo } from "preact/hooks";
import type { JSX } from "preact";
import { hypotrochoid } from "../ui/art";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2.2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

function Cartographes() {
  return (
    <g {...STROKE}>
      <path d="M14 22L40 14L66 22L92 14V58L66 66L40 58L14 66Z" />
      <path d="M40 14V58M66 22V66" opacity="0.5" />
      <path d="M22 52C30 46 34 34 46 34C56 34 58 46 70 42C78 39 80 30 86 26" stroke-dasharray="3 5" />
      <path d="M82 22L90 30M90 22L82 30" />
    </g>
  );
}

function Puits() {
  return (
    <g {...STROKE}>
      <circle cx="40" cy="40" r="5" fill="currentColor" />
      <circle cx="40" cy="40" r="13" opacity="0.6" />
      <circle cx="40" cy="40" r="22" opacity="0.35" />
      <circle cx="74" cy="48" r="4" fill="currentColor" />
      <circle cx="74" cy="48" r="11" opacity="0.5" />
      <path d="M8 70C26 66 30 22 52 22C70 22 64 60 98 60" stroke-dasharray="2 5" />
      <path d="M94 56L98 60L93 63" />
    </g>
  );
}

const DRAWINGS: Record<string, () => JSX.Element> = { Cartographes, Puits };

const SEEDS: Record<string, { R: number; r: number; d: number }> = {
  Cartographes: { R: 60, r: 24, d: 40 },
  Puits: { R: 64, r: 20, d: 30 },
};

export function UpcomingCover({ name }: { name: string }) {
  const seed = SEEDS[name] ?? { R: 60, r: 22, d: 30 };
  const rosette = useMemo(() => hypotrochoid({ ...seed, cx: 53, cy: 40, scale: 0.55, steps: 900 }), [name]);
  const Drawing = DRAWINGS[name];
  return (
    <svg class="upcoming-cover" viewBox="0 0 106 80" aria-hidden="true">
      <path d={rosette} class="upcoming-rosette" />
      {Drawing && <Drawing />}
    </svg>
  );
}
