// Illustrations et cartes de Rumeurs : tout est dessiné en SVG, sans image externe.

import { useMemo } from "preact/hooks";
import type { JSX } from "preact";
import { COMMODITIES, formatSigned, type CommodityId } from "../../../../shared/games/rumeurs";
import { accentVar, hypotrochoid, initials, waveBand, type GuillocheOptions } from "../../ui/art";

export { PlayerSeal, Sparkline, Watermark, accentVar, initials } from "../../ui/art";

const ROSETTES: Record<CommodityId, Omit<GuillocheOptions, "cx" | "cy">> = {
  safran: { R: 60, r: 22, d: 30 },
  cuivre: { R: 60, r: 18, d: 26 },
  cacao: { R: 56, r: 21, d: 34 },
  indigo: { R: 64, r: 26, d: 22 },
};

// ---------------------------------------------------------------- illustrations

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2.4,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

function Safran() {
  return (
    <g {...STROKE}>
      <path d="M32 44C26 36 26 24 32 15C38 24 38 36 32 44Z" />
      <path d="M32 44C22 42 16 32 18 21C24 25 29 33 32 44Z" />
      <path d="M32 44C42 42 48 32 46 21C40 25 35 33 32 44Z" />
      <path d="M32 33C30 24 27 16 22 9M32 33C32 24 32 15 33 7M32 33C34 24 38 16 43 10" />
      <circle cx="22" cy="9" r="1.6" fill="currentColor" />
      <circle cx="33" cy="7" r="1.6" fill="currentColor" />
      <circle cx="43" cy="10" r="1.6" fill="currentColor" />
      <path d="M32 44V59M32 53C26 51 22 47 20 41M32 55C38 53 42 49 44 43" />
    </g>
  );
}

function Cuivre() {
  return (
    <g {...STROKE}>
      <path d="M8 54L12 43H30L34 54Z" />
      <path d="M32 54L36 43H54L58 54Z" />
      <path d="M20 40L24 29H42L46 40Z" />
      <path d="M15 47H27M39 47H51M27 33H39" opacity="0.55" />
      <path d="M44 24C44 19 48 16 52 16C56 16 58 19 58 22C58 25 56 27 53 27C50 27 49 25 49 23C49 21 50.5 20 52 20" />
      <path d="M44 24C44 14 36 9 28 10" />
    </g>
  );
}

function Cacao() {
  return (
    <g {...STROKE}>
      <path d="M32 8C46 15 50 37 41 53C37 60 27 60 23 53C14 37 18 15 32 8Z" />
      <path d="M32 9C30 23 30 41 32 58" />
      <path d="M26 13C21 26 21 42 26 55M38 13C43 26 43 42 38 55" opacity="0.6" />
      <path d="M32 8V3M32 4C35 2 38 2 40 3" />
    </g>
  );
}

function Indigo() {
  return (
    <g {...STROKE}>
      <path d="M32 6C25 18 17 27 17 38C17 47 24 54 32 54C40 54 47 47 47 38C47 27 39 18 32 6Z" />
      <path d="M22 40C25.5 37 28.5 43 32 40C35.5 37 38.5 43 42 40" />
      <path d="M24 46C27 43.5 29.5 48.5 32 46C34.5 43.5 37 48.5 40 46" opacity="0.6" />
      <path d="M24 30C25 26 27 23 29 20" opacity="0.6" />
      <path d="M10 60H54" />
    </g>
  );
}

const ILLUSTRATIONS: Record<CommodityId, () => JSX.Element> = {
  safran: Safran,
  cuivre: Cuivre,
  cacao: Cacao,
  indigo: Indigo,
};

export function CommodityGlyph({ id, size = 32 }: { id: CommodityId; size?: number }) {
  const Art = ILLUSTRATIONS[id];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" class="glyph">
      <Art />
    </svg>
  );
}

export function commodityInfo(id: CommodityId) {
  return COMMODITIES.find((c) => c.id === id)!;
}
// ---------------------------------------------------------------- cartes

export type CardSize = "sm" | "md" | "lg" | "xl";

interface CardProps {
  commodity: CommodityId;
  /** Valeur visible, ou null si la carte est de dos. */
  value: number | null;
  ownerName?: string;
  ownerAccent?: string;
  sealed?: boolean;
  size?: CardSize;
  serial?: number;
  highlight?: boolean;
  /** Retourne la carte avec un délai (ms) pour les révélations en cascade. */
  flipDelay?: number;
  class?: string;
  title?: string;
}

export function Card(props: CardProps) {
  const { commodity, value, size = "md", sealed, highlight } = props;
  const info = commodityInfo(commodity);
  const faceUp = value !== null;
  return (
    <div
      class={`card card-${size} ${faceUp ? "is-up" : ""} ${highlight ? "is-mine" : ""} ${props.class ?? ""}`}
      style={{ ...accentVar(info.accent), transitionDelay: `${props.flipDelay ?? 0}ms` }}
      title={props.title}
      role="img"
      aria-label={
        faceUp
          ? `Carte ${info.name} ${formatSigned(value)}${props.ownerName ? `, vue par ${props.ownerName}` : ""}`
          : sealed
            ? `Carte ${info.name} scellée`
            : `Carte ${info.name} cachée${props.ownerName ? `, vue par ${props.ownerName}` : ""}`
      }
    >
      <div class="card-inner" style={{ transitionDelay: `${props.flipDelay ?? 0}ms` }}>
        <div class="card-face card-back">
          <CardBack commodity={commodity} sealed={!!sealed} size={size} />
          {props.ownerName && size !== "xl" && (
            <div class="card-owner" style={accentVar(props.ownerAccent ?? "amethyst")}>
              {size === "sm" ? initials(props.ownerName) : props.ownerName}
            </div>
          )}
        </div>
        <div class="card-face card-front">
          {faceUp && <CardFront {...props} value={value} />}
        </div>
      </div>
    </div>
  );
}

function CardFront({ commodity, value, ownerName, ownerAccent, size = "md", serial }: CardProps & { value: number }) {
  const info = commodityInfo(commodity);
  const rosette = useMemo(
    () => hypotrochoid({ ...ROSETTES[commodity], cx: 50, cy: size === "sm" ? 80 : 66, scale: 0.62, steps: size === "sm" ? 500 : 1400 }),
    [commodity, size],
  );
  const band = useMemo(() => waveBand(100, 0, 1.6, 3, 14), []);
  const sign = value > 0 ? "pos" : value < 0 ? "neg" : "nil";
  if (size === "sm") {
    // Petite carte : la valeur doit se lire d'un coup d'œil.
    return (
      <svg class="card-svg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
        <rect x="3" y="3" width="94" height="134" rx="8" class="frame-outer" />
        <rect x="9" y="9" width="82" height="122" rx="5" class="frame-inner" />
        <path d={rosette} class="rosette" />
        <g transform="translate(34 14) scale(0.5)" class="illu">
          {ILLUSTRATIONS[commodity]()}
        </g>
        <text x="50" y="98" text-anchor="middle" class={`value value-big value-${sign}`}>
          {formatSigned(value)}
        </text>
      </svg>
    );
  }
  return (
    <svg class="card-svg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
      <rect x="3" y="3" width="94" height="134" rx="6" class="frame-outer" />
      <rect x="6.5" y="6.5" width="87" height="127" rx="4" class="frame-inner" />
      <path d={band} transform="translate(0 22)" class="band" />
      <path d={band} transform="translate(0 118)" class="band" />
      <path d={rosette} class="rosette" />
      <g transform="translate(26 42) scale(0.75)" class="illu">
        {ILLUSTRATIONS[commodity]()}
      </g>
      <text x="11" y="19" class={`value value-${sign}`}>
        {formatSigned(value)}
      </text>
      <text x="89" y="16" text-anchor="end" class="name">
        {info.name.toUpperCase()}
      </text>
      <text x="50" y="112" text-anchor="middle" class="motto">
        {info.motto}
      </text>
      <text x="89" y="129" text-anchor="end" class={`value-small value-${sign}`} transform="rotate(180 89 126)">
        {formatSigned(value)}
      </text>
      <text x="11" y="129" class="serial">
        {ownerName ?? "Scellée"} · N°{String(serial ?? 0).padStart(3, "0")}
      </text>
      {ownerAccent && <circle cx="89" cy="22.5" r="2.4" style={accentVar(ownerAccent)} class="owner-dot" />}
    </svg>
  );
}

function CardBack({ commodity, sealed, size }: { commodity: CommodityId; sealed: boolean; size: CardSize }) {
  const steps = size === "sm" ? 400 : 1000;
  const outer = useMemo(() => hypotrochoid({ R: 60, r: 22, d: 34, cx: 50, cy: 70, scale: 0.7, steps }), [steps]);
  const inner = useMemo(() => hypotrochoid({ R: 45, r: 15, d: 20, cx: 50, cy: 70, scale: 0.6, steps }), [steps]);
  const info = commodityInfo(commodity);
  return (
    <svg class="card-svg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
      <rect x="3" y="3" width="94" height="134" rx="6" class="back-fill" />
      <rect x="6.5" y="6.5" width="87" height="127" rx="4" class="back-frame" />
      <path d={outer} class="back-rosette" />
      <path d={inner} class="back-rosette back-rosette-2" />
      {sealed ? (
        <g class="wax">
          <path d="M50 52C58 51 66 56 68 63C71 71 66 81 58 85C51 89 41 88 36 81C30 74 31 63 37 57C40 54 45 52 50 52Z" />
          <text x="50" y="76" text-anchor="middle">?</text>
        </g>
      ) : (
        <g class="medallion">
          <circle cx="50" cy="70" r="15" />
          <text x="50" y="76.5" text-anchor="middle">R</text>
        </g>
      )}
      {size !== "sm" && (
        <text x="50" y="125" text-anchor="middle" class="back-label">
          {sealed ? "SCELLÉE" : info.name.toUpperCase()}
        </text>
      )}
      <rect x="10" y="10" width="7" height="7" rx="1.5" class="back-tag" style={accentVar(info.accent)} />
    </svg>
  );
}
