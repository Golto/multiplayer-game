// Cartes de Zéro : un polynôme bien typographié, la couleur de sa valeur Skyjo (en x = 1 : bleu
// pour les négatives, puis vert, jaune, rouge), ses trois valeurs possibles, un dos guilloché.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { RULES, columnCells, evaluate, format, leadingTerm, type Poly, type PublicCell } from "../../../../shared/games/zero";
import { hypotrochoid } from "../../ui/art";
import { play } from "../../sound/engine";

/** Le polynôme écrit comme en maths : x en italique, exposants en hauteur, vrais signes moins. */
export function PolyText({ p, class: cls, ref }: { p: Poly; class?: string; ref?: preact.Ref<HTMLSpanElement> }) {
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
  return <span ref={ref} class={`poly ${cls ?? ""}`}>{parts.length ? parts : <span class="term">0</span>}</span>;
}

const minus = (n: number) => (n < 0 ? `−${-n}` : String(n));

/** Couleur d'une valeur, comme au Skyjo : bleu pour les négatives, puis turquoise, vert, jaune, rouge. */
export function toneOf(v: number): Tone {
  if (v < 0) return "neg";
  if (v === 0) return "zero";
  return v <= 4 ? "low" : v <= 8 ? "mid" : "high";
}
type Tone = "neg" | "zero" | "low" | "mid" | "high";

/** Couleur d'une carte d'après sa valeur Skyjo (en x = 1) : celle du chiffre en coin. */
export function tone(p: Poly): Tone {
  return toneOf(evaluate(p, 1));
}

/** Teinte de fond et couleur de bord de chaque ton (accents Golpex). */
const TONES: Record<Tone, [tint: string, edge: string]> = {
  neg: ["royalblue-light", "royalblue"],
  zero: ["turquoise-light", "turquoise"],
  low: ["green-light", "green"],
  mid: ["yellow-light", "peach"],
  high: ["strawberry-light", "strawberry"],
};

/**
 * Le dégradé d'une carte : de la couleur de sa plus grande valeur (coin haut droit) à celle de sa
 * plus petite (coin bas gauche), parmi P(−1), P(0) et P(1). Une carte unie vaut la même chose
 * quel que soit x ; une carte bleue en bas et rouge en haut est un pari sur le tirage.
 */
export function toneRange(p: Poly): Record<string, string> {
  const values = RULES.xValues.map((x) => evaluate(p, x));
  const [hiTint, hiEdge] = TONES[toneOf(Math.max(...values))];
  const [loTint, loEdge] = TONES[toneOf(Math.min(...values))];
  return {
    "--tint-hi": `var(--accent-${hiTint})`,
    "--tint-lo": `var(--accent-${loTint})`,
    "--edge-hi": `var(--accent-${hiEdge})`,
    "--edge-lo": `var(--accent-${loEdge})`,
  };
}

/* ---------------------------------------------------------------- loupe */

// Survoler une petite carte (chez un adversaire, au décompte) l'affiche en grand à côté.
// Au doigt : on appuie et on garde le doigt dessus. Une seule loupe pour toute la table.
type Peek = { card: Poly; rect: DOMRect; owner: object } | null;
let setPeek: ((p: Peek) => void) | null = null;
let current: object | null = null;

function showPeek(p: Peek) {
  current = p?.owner ?? null;
  setPeek?.(p);
}

/** La carte agrandie ; à placer une fois sur la table. */
export function CardPeek() {
  const [peek, set] = useState<Peek>(null);
  useEffect(() => {
    setPeek = set;
    return () => {
      setPeek = null;
    };
  }, []);
  if (!peek) return null;
  const W = Math.min(170, Math.max(130, innerHeight * 0.2));
  const H = W * 1.4;
  const r = peek.rect;
  let left = r.right + 12;
  if (left + W > innerWidth - 8) left = r.left - 12 - W;
  left = Math.max(8, left);
  const top = Math.min(Math.max(8, r.top + r.height / 2 - H / 2), innerHeight - H - 8);
  return (
    <div class="zpeek" style={{ left: `${left}px`, top: `${top}px`, "--w": `${Math.round(W)}px` } as never} aria-hidden="true">
      <ZCard cell={{ card: peek.card, up: true, removed: false }} />
    </div>
  );
}

/** Les gestes qui ouvrent et ferment la loupe sur une carte. */
function usePeek(card: Poly | null) {
  const owner = useRef({}).current;
  // Si la carte disparaît sous la souris (colonne effacée, nouvelle manche), la loupe se ferme.
  useEffect(
    () => () => {
      if (current === owner) showPeek(null);
    },
    [],
  );
  if (!card) return {};
  const open = (e: PointerEvent) => {
    showPeek({ card, rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), owner });
    play("card.hover", { gain: 0.6 });
  };
  const close = () => current === owner && showPeek(null);
  return {
    onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && open(e),
    onPointerLeave: close,
    onPointerDown: (e: PointerEvent) => e.pointerType !== "mouse" && open(e),
    onPointerUp: (e: PointerEvent) => e.pointerType !== "mouse" && close(),
    onPointerCancel: close,
  };
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
  /** Survolée, elle s'affiche en grand à côté. */
  peek?: boolean;
}

export function ZCard({ cell, onClick, hint, fresh, label, small, peek }: CardProps) {
  const face = cell.up && cell.card;
  const gestures = usePeek(peek && face && !cell.removed ? cell.card : null);
  if (cell.removed) return <div class="zcard is-removed" aria-label="Colonne effacée" />;
  const content = face ? <CardFace p={cell.card!} small={small} /> : <CardBack small={small} />;
  const cls = `zcard ${face ? `tone-${tone(cell.card!)}` : "is-back"} ${hint ? `is-${hint}` : ""} ${fresh ? "is-fresh" : ""}`;
  const aria = label ?? (face ? format(cell.card!) : "Carte cachée");
  // Avec la loupe, l'infobulle du navigateur ferait doublon.
  const title = face && !peek ? aria : undefined;
  const style = face ? toneRange(cell.card!) : undefined;
  if (!onClick)
    return (
      <div class={cls} style={style} aria-label={aria} title={title} {...gestures}>
        {content}
      </div>
    );
  return (
    <button type="button" class={cls} style={style} onClick={onClick} data-sound="none" aria-label={aria} title={title} {...gestures}>
      {content}
    </button>
  );
}

/**
 * Le polynôme tient sur une ligne : s'il déborde de la carte (polices plus larges, cartes étroites),
 * on mesure, puis on réduit la police d'autant, et on recommence quand la carte change de taille.
 */
function useShrinkToFit(text: string, room: number) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const card = el?.parentElement;
    if (!el || !card) return;
    const fit = () => {
      let shrink = 1;
      el.style.setProperty("--shrink", "1");
      for (let i = 0; i < 4; i++) {
        const s = Math.min(card.clientWidth / el.scrollWidth, (card.clientHeight * room) / el.scrollHeight);
        if (!(s < 1)) break;
        shrink = Math.max(0.35, shrink * s * 0.97);
        el.style.setProperty("--shrink", shrink.toFixed(3));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(card);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [text, room]);
  return ref;
}

function CardFace({ p, small }: { p: Poly; small?: boolean }) {
  const text = format(p);
  // Plus l'écriture est longue, plus la police se resserre.
  const fit = text.length <= 3 ? "fit-xl" : text.length <= 7 ? "fit-lg" : text.length <= 12 ? "fit-md" : "fit-sm";
  const values = RULES.xValues.map((x) => evaluate(p, x));
  const constant = values.every((v) => v === values[0]);
  const ref = useShrinkToFit(text, small ? 0.9 : 0.58);
  return (
    <span class="zcard-face">
      <span class="zcard-corner mono">{minus(evaluate(p, 1))}</span>
      <PolyText p={p} class={`zcard-poly ${fit}`} ref={ref} />
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
  /** La loupe au survol ; par défaut pour les petites cartes. */
  peek?: boolean;
}

export function Grid({ cells, rows, cols, width, onCell, hint, fresh, showLeads = false, peek = width < 96 }: GridProps) {
  const small = width < 58;
  return (
    <div class={`zgrid ${small ? "is-small" : ""}`} style={{ "--cols": cols, "--w": `${Math.round(width)}px` } as never}>
      {cells.map((cell, i) => (
        <ZCard
          cell={cell}
          small={small}
          peek={peek}
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

