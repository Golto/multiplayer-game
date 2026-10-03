// Cartes de Zéro : un polynôme bien typographié, la couleur de sa valeur Skyjo (en x = 1 : bleu
// pour les négatives, puis vert, jaune, rouge), ses trois valeurs possibles, un dos guilloché.

import { useMemo } from "preact/hooks";
import { RULES, columnCells, evaluate, format, leadingTerm, type Poly, type PublicCell } from "../../../../shared/games/zero";
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

const minus = (n: number) => (n < 0 ? `−${-n}` : String(n));

/** Couleur d'une carte, d'après sa valeur Skyjo (en x = 1). */
export function tone(p: Poly): string {
  const v = evaluate(p, 1);
  if (v < 0) return "neg";
  if (v === 0) return "zero";
  return v <= 4 ? "low" : v <= 8 ? "mid" : "high";
}

interface CardProps {
  cell: PublicCell;
  onClick?: () => void;
  /** Mise en avant : case jouable, carte qui vient d'arriver… */
  hint?: "pick" | "flip" | null;
  fresh?: boolean;
  label?: string;
  /** Petite carte : sans les trois valeurs. */
  small?: boolean;
}

export function ZCard({ cell, onClick, hint, fresh, label, small }: CardProps) {
  if (cell.removed) return <div class="zcard is-removed" aria-label="Colonne effacée" />;
  const face = cell.up && cell.card;
  const content = face ? <CardFace p={cell.card!} small={small} /> : <CardBack small={small} />;
  const cls = `zcard ${face ? `tone-${tone(cell.card!)}` : "is-back"} ${hint ? `is-${hint}` : ""} ${fresh ? "is-fresh" : ""}`;
  const aria = label ?? (face ? format(cell.card!) : "Carte cachée");
  if (!onClick) return <div class={cls} aria-label={aria} title={face ? aria : undefined}>{content}</div>;
  return (
    <button type="button" class={cls} onClick={onClick} data-sound="none" aria-label={aria} title={face ? aria : undefined}>
      {content}
    </button>
  );
}

function CardFace({ p, small }: { p: Poly; small?: boolean }) {
  const text = format(p);
  // Plus l'écriture est longue, plus la police se resserre.
  const fit = text.length <= 3 ? "fit-xl" : text.length <= 7 ? "fit-lg" : text.length <= 12 ? "fit-md" : "fit-sm";
  const values = RULES.xValues.map((x) => evaluate(p, x));
  const constant = values.every((v) => v === values[0]);
  return (
    <span class="zcard-face">
      <span class="zcard-corner mono">{minus(evaluate(p, 1))}</span>
      <PolyText p={p} class={`zcard-poly ${fit}`} />
      {!small && !constant && (
        <span class="zcard-values mono" title="Valeur si x = −1, 0, 1">
          {values.map((v) => minus(v)).join(" · ")}
        </span>
      )}
    </span>
  );
}

function CardBack({ small }: { small?: boolean }) {
  const rosette = useMemo(() => hypotrochoid({ R: 50, r: 18, d: 30, cx: 50, cy: 70, scale: 0.62, steps: 700 }), []);
  return (
    <span class="zcard-back">
      <svg viewBox="0 0 100 140" aria-hidden="true">
        <path d={rosette} class="back-rosette" />
        {!small && (
          <text x="50" y="80" class="back-zero">
            0
          </text>
        )}
      </svg>
    </span>
  );
}

/** Le terme dominant commun aux cartes visibles d'une colonne, et combien l'ont déjà. */
export function columnHint(cells: PublicCell[], rows: number, cols: number, c: number) {
  const col = columnCells(cols, rows, c).map((i) => cells[i]!);
  if (col.every((x) => x.removed)) return { removed: true as const };
  const shown = col.filter((x) => x.up && x.card).map((x) => x.card!);
  const key = (p: Poly) => leadingTerm(p)?.join(",") ?? "0";
  const same = shown.length > 0 && shown.every((p) => key(p) === key(shown[0]!));
  const lead = same ? shown[0]! : null;
  return { removed: false as const, lead, count: same ? shown.length : 0, rows };
}

/** Le terme dominant seul, comme polynôme (pour l'afficher). */
function leadOnly(p: Poly): Poly {
  const t = leadingTerm(p);
  if (!t) return [0];
  const out: Poly = new Array(t[0] + 1).fill(0);
  out[t[0]] = t[1];
  return out;
}

interface GridProps {
  cells: PublicCell[];
  rows: number;
  cols: number;
  /** Largeur d'une carte, en pixels. */
  width: number;
  onCell?: (index: number) => void;
  hint?: (index: number, cell: PublicCell) => "pick" | "flip" | null;
  fresh?: number | null;
  /** Sous chaque colonne : le terme dominant commun, s'il y en a un. */
  showLeads?: boolean;
}

export function Grid({ cells, rows, cols, width, onCell, hint, fresh, showLeads = false }: GridProps) {
  const small = width < 58;
  return (
    <div class={`zgrid ${small ? "is-small" : ""}`} style={{ "--cols": cols, "--w": `${Math.round(width)}px` } as never}>
      {cells.map((cell, i) => (
        <ZCard
          cell={cell}
          small={small}
          hint={hint ? hint(i, cell) : null}
          fresh={fresh === i}
          onClick={onCell && hint?.(i, cell) ? () => onCell(i) : undefined}
        />
      ))}
      {showLeads &&
        Array.from({ length: cols }, (_, c) => {
          const info = columnHint(cells, rows, cols, c);
          if (info.removed) return <span class="zcol-lead is-removed">effacée</span>;
          if (!info.lead || info.count < 2) return <span class="zcol-lead" />;
          return (
            <span class="zcol-lead is-match" title="Toutes les cartes visibles de la colonne ont ce terme dominant">
              <PolyText p={leadOnly(info.lead)} /> <span class="mono">{info.count}/{info.rows}</span>
            </span>
          );
        })}
    </div>
  );
}

/** Une carte isolée (pioche, défausse, main), à une largeur donnée. */
export function Sized({ width, children }: { width: number; children: preact.ComponentChildren }) {
  return (
    <div class="zsized" style={{ "--w": `${Math.round(width)}px` } as never}>
      {children}
    </div>
  );
}

