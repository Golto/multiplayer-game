// Cartes à jouer de Tapis, dessinées comme les autres cartes de la salle (Rumeurs, Zéro) : cadre
// double à la couleur de l'enseigne, bandes ondulées, rosace guillochée. Les cartes de 2 à 10 ont
// leurs vrais points, l'as une rosace, les figures un médaillon. Chaque enseigne a son accent :
// pique bleu roi, cœur fraise, carreau orange, trèfle vert. La folle porte une étoile et un liseré
// jaune. Le dos reprend celui de Rumeurs, avec un T au médaillon.

import { useMemo } from "preact/hooks";
import { SUITS, cardName, rankLabel, type Card } from "../../../../shared/games/tapis";
import { accentVar, hypotrochoid, waveBand } from "../../ui/art";

export const SUIT_ACCENTS = ["royalblue", "strawberry", "orange", "green"] as const;
const FIGURE_NAMES: Record<number, string> = { 11: "VALET", 12: "DAME", 13: "ROI", 14: "AS" };

/** Points d'une carte de 2 à 10, dans un cadre de 32 à 68 en largeur et de 36 à 104 en hauteur. */
const PIPS: Record<number, [number, number][]> = (() => {
  const L = 32, M = 50, R = 68, T = 36, B = 104, C = 70;
  const corners: [number, number][] = [[L, T], [R, T], [L, B], [R, B]];
  const four: [number, number][] = [[L, T], [R, T], [L, 59], [R, 59], [L, 81], [R, 81], [L, B], [R, B]];
  return {
    2: [[M, T], [M, B]],
    3: [[M, T], [M, C], [M, B]],
    4: corners,
    5: [...corners, [M, C]],
    6: [...corners, [L, C], [R, C]],
    7: [...corners, [L, C], [R, C], [M, 53]],
    8: [...corners, [L, C], [R, C], [M, 53], [M, 87]],
    9: [...four, [M, C]],
    10: [...four, [M, 47.5], [M, 92.5]],
  };
})();

interface Props {
  card: Card | null;
  /** Largeur en pixels. */
  w: number;
  /** C'est la carte folle de la donne. */
  wild?: boolean;
  /** Mise en avant : carte de la main gagnante, ou carte à choisir. */
  glow?: "win" | "pick" | null;
  dim?: boolean;
  fresh?: boolean;
  onClick?: () => void;
  label?: string;
}

export function PlayingCard({ card, w, wild, glow, dim, fresh, onClick, label }: Props) {
  const cls = ["pcard", card ? "is-face" : "is-back", wild && card ? "is-wild" : "", glow ? `is-${glow}` : "", dim ? "is-dim" : "", fresh ? "is-fresh" : ""].join(" ");
  const aria = label ?? (card ? `${cardName(card)}${wild ? ", la folle" : ""}` : "Carte cachée");
  const body = card ? <Face card={card} wild={!!wild} small={w < 50} /> : <Back small={w < 50} />;
  const style = { "--w": `${Math.round(w)}px`, ...(card ? accentVar(SUIT_ACCENTS[card.s]!) : {}) } as never;
  if (onClick) {
    return (
      <button type="button" class={cls} style={style} onClick={onClick} aria-label={aria} data-sound="none">
        {body}
      </button>
    );
  }
  return (
    <div class={cls} style={style} role="img" aria-label={aria}>
      {body}
    </div>
  );
}

function Face({ card, wild, small }: { card: Card; wild: boolean; small: boolean }) {
  const rank = rankLabel(card.r);
  const suit = SUITS[card.s]!;
  const band = useMemo(() => waveBand(100, 0, 1.4, 3, 14), []);
  if (small) {
    // Petite carte : la hauteur et l'enseigne doivent se lire d'un coup d'œil.
    return (
      <svg class="pc-svg" viewBox="0 0 100 140" aria-hidden="true">
        <rect x="3" y="3" width="94" height="134" rx="9" class="pc-outer" />
        <rect x="9" y="9" width="82" height="122" rx="6" class="pc-inner" />
        <text x="50" y="66" text-anchor="middle" class="pc-big-rank">
          {rank}
        </text>
        <text x="50" y="116" text-anchor="middle" class="pc-big-suit">
          {suit}
        </text>
        {wild && <WildStar />}
      </svg>
    );
  }
  return (
    <svg class="pc-svg" viewBox="0 0 100 140" aria-hidden="true">
      <rect x="3" y="3" width="94" height="134" rx="7" class="pc-outer" />
      <rect x="7" y="7" width="86" height="126" rx="4.5" class="pc-inner" />
      <path d={band} transform="translate(0 20)" class="pc-band" />
      <path d={band} transform="translate(0 120)" class="pc-band" />
      <Corner rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <Corner rank={rank} suit={suit} />
      </g>
      {card.r <= 10 ? <Pips n={card.r} suit={suit} /> : card.r === 14 ? <Ace suit={suit} /> : <Figure rank={rank} suit={suit} name={FIGURE_NAMES[card.r]!} />}
      {wild && (
        <>
          <WildStar />
          <text x="50" y="128.5" text-anchor="middle" class="pc-wild-label">
            FOLLE
          </text>
        </>
      )}
    </svg>
  );
}

function Corner({ rank, suit }: { rank: string; suit: string }) {
  return (
    <g>
      <text x="15" y="27" text-anchor="middle" class={`pc-rank ${rank.length > 1 ? "is-wide" : ""}`}>
        {rank}
      </text>
      <text x="15" y="40" text-anchor="middle" class="pc-suit-small">
        {suit}
      </text>
    </g>
  );
}

function Pips({ n, suit }: { n: number; suit: string }) {
  return (
    <g class="pc-pips">
      {PIPS[n]!.map(([x, y]) => (
        <text x={x} y={y + 6} text-anchor="middle" transform={y > 70 ? `rotate(180 ${x} ${y})` : undefined}>
          {suit}
        </text>
      ))}
    </g>
  );
}

function Ace({ suit }: { suit: string }) {
  const rosette = useMemo(() => hypotrochoid({ R: 50, r: 17, d: 30, cx: 50, cy: 70, scale: 0.55, steps: 900 }), []);
  return (
    <g>
      <path d={rosette} class="pc-rosette" />
      <circle cx="50" cy="70" r="15" class="pc-medal" />
      <text x="50" y="80" text-anchor="middle" class="pc-ace">
        {suit}
      </text>
    </g>
  );
}

function Figure({ rank, suit, name }: { rank: string; suit: string; name: string }) {
  const rosette = useMemo(() => hypotrochoid({ R: 44, r: 15, d: 24, cx: 50, cy: 66, scale: 0.5, steps: 800 }), []);
  return (
    <g>
      <path d={rosette} class="pc-rosette" />
      <circle cx="50" cy="66" r="19" class="pc-medal" />
      <text x="50" y="75" text-anchor="middle" class="pc-figure">
        {rank}
      </text>
      <text x="50" y="99" text-anchor="middle" class="pc-figure-suit">
        {suit}
      </text>
      <text x="50" y="111" text-anchor="middle" class="pc-figure-name">
        {name}
      </text>
    </g>
  );
}

function WildStar() {
  return (
    <g class="pc-star">
      <circle cx="82" cy="18" r="9" />
      <text x="82" y="22.2" text-anchor="middle">
        ★
      </text>
    </g>
  );
}

function Back({ small }: { small: boolean }) {
  const steps = small ? 400 : 1000;
  const outer = useMemo(() => hypotrochoid({ R: 60, r: 22, d: 34, cx: 50, cy: 70, scale: 0.7, steps }), [steps]);
  const inner = useMemo(() => hypotrochoid({ R: 45, r: 15, d: 20, cx: 50, cy: 70, scale: 0.6, steps }), [steps]);
  return (
    <svg class="pc-svg" viewBox="0 0 100 140" aria-hidden="true">
      <rect x="3" y="3" width="94" height="134" rx="7" class="pcb-fill" />
      <rect x="7" y="7" width="86" height="126" rx="4.5" class="pcb-frame" />
      <path d={outer} class="pcb-rosette" />
      <path d={inner} class="pcb-rosette is-second" />
      <g class="pcb-medal">
        <circle cx="50" cy="70" r="14" />
        <text x="50" y="76.5" text-anchor="middle">
          T
        </text>
      </g>
    </svg>
  );
}

/** Une pile de jetons stylisée, pour les mises et la couverture. */
export function Chips({ n = 3, accent }: { n?: number; accent?: string }) {
  return (
    <span class="chips" aria-hidden="true" style={accent ? ({ "--chip": `var(--accent-${accent})` } as never) : undefined}>
      {Array.from({ length: Math.max(1, Math.min(5, n)) }, (_, i) => (
        <i style={{ "--k": i } as never} />
      ))}
    </span>
  );
}

/** Nombre de jetons à dessiner pour une mise, d'après la grosse blinde. */
export function chipCount(amount: number, bb: number): number {
  if (amount <= 0) return 0;
  return Math.min(5, 1 + Math.floor(Math.log2(1 + amount / bb)));
}

/** 12 500 plutôt que 12500. */
export function fmt(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ | /g, " ");
}
