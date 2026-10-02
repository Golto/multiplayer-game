// Une carte en SVG : cases de terrain (ou de parchemin vierge), contours des zones et leurs lettres,
// coups de pinceau en attente, repères juste / faux.

import { RULES, type Terrain, type Zone } from "../../../../shared/games/cartographes";
import { TERRAIN_GLYPHS } from "./pictos";

const C = 40;
/** Marge autour de la carte, pour les lettres des zones. */
const M = 6;

interface Props {
  cols: number;
  rows: number;
  /** Terrain montré dans chaque case ; null : vierge. */
  cells: (Terrain | null)[];
  zones?: Zone[];
  /** Zone peinte par le joueur, mise en avant. */
  paintZone?: string;
  /** Zone vue par le joueur. */
  viewZone?: string;
  pending?: Map<number, Terrain>;
  marks?: Map<number, "ok" | "ko">;
  /** Cases cliquables. */
  active?: Set<number>;
  onCell?: (index: number) => void;
  /** Décalage des indices quand on dessine une seule zone (le carnet). */
  index?: (local: number) => number;
  class?: string;
  label: string;
}

export function MapGrid({ cols, rows, cells, zones = [], paintZone, viewZone, pending, marks, active, onCell, index = (i) => i, class: cls, label }: Props) {
  const w = cols * C;
  const h = rows * C;
  return (
    <svg class={`carto-map ${cls ?? ""}`} viewBox={`${-M} ${-M} ${w + M * 2} ${h + M * 2}`} role="img" aria-label={label}>
      <rect x={-M / 2} y={-M / 2} width={w + M} height={h + M} rx="10" class="map-paper" />
      {Array.from({ length: cols * rows }, (_, local) => {
        const i = index(local);
        const x = (local % cols) * C;
        const y = Math.floor(local / cols) * C;
        const t = cells[local] ?? null;
        const p = pending?.get(i);
        const mark = marks?.get(i);
        const clickable = active?.has(i);
        return (
          <g
            class={`cell ${clickable ? "is-active" : ""} ${p ? "is-pending" : ""}`}
            transform={`translate(${x} ${y})`}
            onClick={clickable && onCell ? () => onCell(i) : undefined}
            data-cell={i}
          >
            {t ? (
              <>
                <rect width={C} height={C} class={`tile t-${t}`} />
                <g class="tile-ink" transform="translate(9 9) scale(0.92)">
                  {TERRAIN_GLYPHS[t]}
                </g>
              </>
            ) : (
              <>
                <rect width={C} height={C} class="tile t-vierge" />
                <circle cx={C / 2} cy={C / 2} r="1.6" class="vierge-dot" />
              </>
            )}
            {p && (
              <>
                <rect x="3" y="3" width={C - 6} height={C - 6} rx="5" class={`tile t-${p} pending-fill`} />
                <g class="tile-ink" transform="translate(11 11) scale(0.75)">
                  {TERRAIN_GLYPHS[p]}
                </g>
                <rect x="2" y="2" width={C - 4} height={C - 4} rx="6" class="pending-ring" />
              </>
            )}
            {mark && (
              <g class={`mark mark-${mark}`} transform={`translate(${C - 11} 11)`}>
                <circle r="7" />
                {mark === "ok" ? <path d="M-3 0.2l2 2 4-4.2" /> : <path d="M-2.6 -2.6l5.2 5.2M2.6 -2.6l-5.2 5.2" />}
              </g>
            )}
            {clickable && <rect width={C} height={C} class="hit" />}
          </g>
        );
      })}
      {/* Fines lignes de grille par-dessus, puis les zones. */}
      <g class="grid-lines">
        {Array.from({ length: cols - 1 }, (_, k) => (
          <line x1={(k + 1) * C} y1="0" x2={(k + 1) * C} y2={h} />
        ))}
        {Array.from({ length: rows - 1 }, (_, k) => (
          <line x1="0" y1={(k + 1) * C} x2={w} y2={(k + 1) * C} />
        ))}
      </g>
      {zones.map((z) => {
        const zx = z.x * C;
        const zy = z.y * C;
        const s = RULES.zone * C;
        const role = z.id === paintZone ? "is-paint" : z.id === viewZone ? "is-view" : z.charted ? "is-charted" : "";
        return (
          <g class={`zone ${role}`}>
            <rect x={zx + 1} y={zy + 1} width={s - 2} height={s - 2} rx="4" class="zone-edge" />
            <g transform={`translate(${zx + 8} ${zy + 8})`} class="zone-badge">
              <circle r="7.5" />
              <text y="3.6" text-anchor="middle">
                {z.id}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
