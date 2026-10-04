// Cartes à jouer de Tapis : coins, grand symbole au centre, figures en lettres ; les folles portent
// une étoile. Le dos reprend la rosace guillochée de la salle.

import { useMemo } from "preact/hooks";
import { SUITS, cardName, isRed, rankLabel, type Card } from "../../../../shared/games/tapis";
import { hypotrochoid } from "../../ui/art";

interface Props {
  card: Card | null;
  /** Largeur en pixels. */
  w: number;
  /** Carte folle de la donne. */
  wild?: boolean;
  /** Mise en avant : carte de la main gagnante, ou carte à choisir. */
  glow?: "win" | "pick" | null;
  dim?: boolean;
  fresh?: boolean;
  onClick?: () => void;
  label?: string;
}

export function PlayingCard({ card, w, wild, glow, dim, fresh, onClick, label }: Props) {
  const cls = [
    "pcard",
    card ? (isRed(card) ? "is-red" : "is-black") : "is-back",
    wild && card ? "is-wild" : "",
    glow ? `is-${glow}` : "",
    dim ? "is-dim" : "",
    fresh ? "is-fresh" : "",
  ].join(" ");
  const aria = label ?? (card ? `${cardName(card)}${wild ? ", folle" : ""}` : "Carte cachée");
  const body = card ? <Face card={card} wild={!!wild} small={w < 46} /> : <Back />;
  const style = { "--w": `${Math.round(w)}px` } as never;
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
  const suit = SUITS[card.s];
  const figure = card.r >= 11 && card.r <= 13;
  return (
    <span class="pc-face">
      <span class="pc-corner">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
      {!small && (
        <span class="pc-corner is-bottom" aria-hidden="true">
          <b>{rank}</b>
          <i>{suit}</i>
        </span>
      )}
      <span class={`pc-center ${figure ? "is-figure" : ""}`} aria-hidden="true">
        {figure ? (
          <>
            <b>{rank}</b>
            <i>{suit}</i>
          </>
        ) : (
          suit
        )}
      </span>
      {wild && (
        <span class="pc-wild" title="Carte folle : elle remplace n'importe quelle carte">
          ★
        </span>
      )}
    </span>
  );
}

function Back() {
  const rosette = useMemo(() => hypotrochoid({ R: 50, r: 21, d: 34, cx: 50, cy: 70, scale: 0.6, steps: 800 }), []);
  return (
    <span class="pc-back">
      <svg viewBox="0 0 100 140" aria-hidden="true">
        <rect x="7" y="7" width="86" height="126" rx="8" class="back-frame" />
        <path d={rosette} class="back-rosette" />
      </svg>
    </span>
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
