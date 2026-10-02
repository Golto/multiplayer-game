// Couvertures des jeux en préparation : un guillochis dans les tons de la marque, et un dessin au
// trait propre au jeu quand il en a un (à ajouter dans DRAWINGS).

import { useMemo } from "preact/hooks";
import type { JSX } from "preact";
import { hypotrochoid } from "../ui/art";

const DRAWINGS: Record<string, () => JSX.Element> = {};

const SEEDS: Record<string, { R: number; r: number; d: number }> = {};

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
