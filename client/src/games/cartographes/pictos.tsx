// Les pictogrammes de Cartographes. Réponses et directions reprennent les icônes Golpex (Wolf Kit
// Rounded Line) ; terrains, nombres et formes sont dessinés au même trait, sur la même grille 24.

import type { JSX } from "preact";
import { PICTOS, type Terrain } from "../../../../shared/games/cartographes";
import { ICONS, type IconName } from "../../ui/icons-data";

const LINE = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;

function golpex(name: IconName, rotate = 0): JSX.Element {
  return (
    <g transform={rotate ? `rotate(${rotate} 12 12)` : undefined}>
      {ICONS[name].map(([d, evenOdd]) => (
        <path d={d} fill="currentColor" fill-rule={evenOdd ? "evenodd" : undefined} clip-rule={evenOdd ? "evenodd" : undefined} />
      ))}
    </g>
  );
}

const dots = (pts: [number, number][]) => (
  <g fill="currentColor">
    {pts.map(([x, y]) => (
      <circle cx={x} cy={y} r="2.4" />
    ))}
  </g>
);

/** Le dessin d'un terrain, seul : sert de pictogramme et de motif sur les cases. */
export const TERRAIN_GLYPHS: Record<Terrain, JSX.Element> = {
  eau: (
    <g {...LINE}>
      <path d="M3 9c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
      <path d="M3 15c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
    </g>
  ),
  plaine: (
    <g {...LINE}>
      <path d="M3 19h18" />
      <path d="M6 19c0-2.5.6-4.5 2-6M8 19c0-2-.6-3.6-2-4.6" />
      <path d="M15 19c0-3 .8-5.6 2.4-7.6M17.4 19c0-2.4-.8-4.2-2.6-5.4" />
      <path d="M11.5 19c0-1.4.4-2.6 1.2-3.6" />
    </g>
  ),
  foret: (
    <g {...LINE}>
      <path d="M12 3l-5 7.5h3L6 16.5h12l-4-6h3z" />
      <path d="M12 16.5V21" />
    </g>
  ),
  montagne: (
    <g {...LINE}>
      <path d="M2 19.5l7-12.5 4.4 7.4 2.3-3.4 6.3 8.5z" />
      <path d="M6.9 10.6l2.1 1.4 2-1.3" />
    </g>
  ),
  village: (
    <g {...LINE}>
      <path d="M3.5 11L12 3.8l8.5 7.2" />
      <path d="M5.8 9.2V20h12.4V9.2" />
      <path d="M10 20v-5.2h4V20" />
    </g>
  ),
};

const GLYPHS: Record<string, JSX.Element> = {
  ...TERRAIN_GLYPHS,
  // Directions : la flèche Golpex, tournée.
  e: golpex("arrowRight"),
  se: golpex("arrowRight", 45),
  s: golpex("arrowRight", 90),
  so: golpex("arrowRight", 135),
  o: golpex("arrowRight", 180),
  no: golpex("arrowRight", 225),
  n: golpex("arrowRight", 270),
  ne: golpex("arrowRight", 315),
  "1": dots([[12, 12]]),
  "2": dots([
    [7.5, 12],
    [16.5, 12],
  ]),
  "3": dots([
    [12, 6.5],
    [6.5, 16.5],
    [17.5, 16.5],
  ]),
  "4": dots([
    [7.5, 7.5],
    [16.5, 7.5],
    [7.5, 16.5],
    [16.5, 16.5],
  ]),
  case: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" opacity="0.35" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
    </g>
  ),
  ligne: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" opacity="0.35" />
      <rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" />
    </g>
  ),
  colonne: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" opacity="0.35" />
      <rect x="10" y="6" width="4" height="12" rx="1" fill="currentColor" />
    </g>
  ),
  coin: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" opacity="0.35" />
      <path d="M3.5 11V6a2.5 2.5 0 0 1 2.5-2.5h5" stroke-width="3" />
    </g>
  ),
  bord: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" opacity="0.35" stroke-dasharray="2 2.5" />
    </g>
  ),
  centre: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" opacity="0.35" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </g>
  ),
  tout: (
    <g {...LINE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="currentColor" fill-opacity="0.28" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" opacity="0.45" />
    </g>
  ),
  oui: golpex("check"),
  non: golpex("xmark"),
  quoi: golpex("info"),
  vu: golpex("eye"),
  alerte: golpex("bell"),
  toi: golpex("user"),
  fini: golpex("lock"),
};

const LABELS = new Map(PICTOS.map((p) => [p.id, p.label]));

export function PictoGlyph({ id, size = 24, class: cls }: { id: string; size?: number; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} class={`picto ${cls ?? ""}`} role="img" aria-label={LABELS.get(id) ?? id}>
      <title>{LABELS.get(id) ?? id}</title>
      {GLYPHS[id]}
    </svg>
  );
}

export function pictoLabel(id: string): string {
  return LABELS.get(id) ?? id;
}
