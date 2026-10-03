// Cartes de Zéro : un polynôme bien typographié, une couleur selon son poids (comme les couleurs du
// Skyjo : bleu pour les négatives, vert, jaune puis rouge), un dos guilloché.

import { useMemo } from "preact/hooks";
import { columnCells, degreeOf, format, isZero, sum, weight, type Poly, type PublicCell } from "../../../../shared/games/zero";
import { hypotrochoid } from "../../ui/art";

/** Le polynôme écrit comme en maths : x en italique, exposants en hauteur, vrais signes moins. */
export function PolyText({ p, class: cls }: { p: Poly; class?: string }) {
  const parts: preact.JSX.Element[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i]!;
    if (!c) continue;
    const abs = Math.abs(c);
    const first = parts.length === 0;
    parts.push(
      <span class="term">
        {first ? (c < 0 ? "−" : "") : <span class="op">{c < 0 ? "−" : "+"}</span>}
        {i === 0 || abs !== 1 ? <span class="coef">{abs}</span> : null}
        {i > 0 && <i class="var">x</i>}
        {i > 1 && <sup>{i}</sup>}
      </span>,
    );
  }
  return <span class={`poly ${cls ?? ""}`}>{parts.length ? parts : <span class="term">0</span>}</span>;
}

/** La famille de couleur d'une carte, d'après son signe et son poids. */
export function tone(p: Poly): string {
  if (isZero(p)) return "zero";
  if (p.every((c) => c <= 0)) return "neg";
  const w = weight(p);
  return w <= 4 ? "low" : w <= 8 ? "mid" : "high";
}

export type CardSize = "sm" | "md" | "lg";

interface CardProps {
  cell: PublicCell;
  size?: CardSize;
  onClick?: () => void;
  /** Mise en avant : case jouable, carte qui vient d'arriver… */
  hint?: "pick" | "flip" | null;
  fresh?: boolean;
  label?: string;
}

export function ZCard({ cell, size = "md", onClick, hint, fresh, label }: CardProps) {
  if (cell.removed) return <div class={`zcard zcard-${size} is-removed`} aria-label="Colonne effacée" />;
  const face = cell.up && cell.card;
  const content = face ? <CardFace p={cell.card!} size={size} /> : <CardBack size={size} />;
  const cls = `zcard zcard-${size} ${face ? `tone-${tone(cell.card!)}` : "is-back"} ${hint ? `is-${hint}` : ""} ${fresh ? "is-fresh" : ""}`;
  if (!onClick) return <div class={cls} aria-label={label ?? (face ? format(cell.card!) : "Carte cachée")}>{content}</div>;
  return (
    <button type="button" class={cls} onClick={onClick} data-sound="none" aria-label={label ?? (face ? format(cell.card!) : "Carte cachée")}>
      {content}
    </button>
  );
}

function CardFace({ p, size }: { p: Poly; size: CardSize }) {
  const text = format(p);
  // Plus l'écriture est longue, plus la police se resserre.
  const fit = text.length <= 3 ? "fit-xl" : text.length <= 7 ? "fit-lg" : text.length <= 12 ? "fit-md" : "fit-sm";
  return (
    <span class="zcard-face">
      <span class="zcard-corner mono">{weight(p)}</span>
      <PolyText p={p} class={`zcard-poly ${fit}`} />
      {size !== "sm" && <span class="zcard-degree mono">{degreeOf(p) <= 0 ? "constante" : `degré ${degreeOf(p)}`}</span>}
    </span>
  );
}

function CardBack({ size }: { size: CardSize }) {
  const rosette = useMemo(() => hypotrochoid({ R: 50, r: 18, d: 30, cx: 50, cy: 70, scale: 0.62, steps: 700 }), []);
  return (
    <span class="zcard-back">
      <svg viewBox="0 0 100 140" aria-hidden="true">
        <path d={rosette} class="back-rosette" />
        {size !== "sm" && (
          <text x="50" y="80" class="back-zero">
            0
          </text>
        )}
      </svg>
    </span>
  );
}

/** Somme visible d'une colonne et son poids ; « ? » s'il reste des cartes cachées. */
export function columnInfo(cells: PublicCell[], rows: number, cols: number, c: number) {
  const col = columnCells(cols, rows, c).map((i) => cells[i]!);
  if (col.every((x) => x.removed)) return { removed: true as const };
  const shown = col.filter((x) => x.up && x.card).map((x) => x.card!);
  const hidden = col.filter((x) => !x.up && !x.removed).length;
  const s = sum(shown);
  return { removed: false as const, sum: s, weight: weight(s), hidden };
}

interface GridProps {
  cells: PublicCell[];
  rows: number;
  cols: number;
  size?: CardSize;
  onCell?: (index: number) => void;
  hint?: (index: number, cell: PublicCell) => "pick" | "flip" | null;
  fresh?: number | null;
  showSums?: boolean;
}

export function Grid({ cells, rows, cols, size = "md", onCell, hint, fresh, showSums = true }: GridProps) {
  return (
    <div class={`zgrid zgrid-${size}`} style={{ "--cols": cols } as never}>
      {cells.map((cell, i) => (
        <ZCard
          cell={cell}
          size={size}
          hint={hint ? hint(i, cell) : null}
          fresh={fresh === i}
          onClick={onCell && hint?.(i, cell) ? () => onCell(i) : undefined}
        />
      ))}
      {showSums &&
        Array.from({ length: cols }, (_, c) => {
          const info = columnInfo(cells, rows, cols, c);
          if (info.removed) return <span class="zcol-sum is-removed">effacée</span>;
          return (
            <span class={`zcol-sum ${info.hidden ? "has-hidden" : ""}`} title="Somme de la colonne (cartes visibles) et son poids">
              {size !== "sm" && <PolyText p={info.sum} class="zcol-poly" />}
              <span class="mono zcol-weight">
                {info.weight}
                {info.hidden ? "+?" : ""}
              </span>
            </span>
          );
        })}
    </div>
  );
}
