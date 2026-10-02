// Les illustrations des puzzles : SVG minimalistes en 1200 × 900, générées par le code.
// Assez de détails (étoiles, fenêtres, vagues, motifs) pour que chaque pièce reste reconnaissable.

import type { JSX } from "preact";
import { rng, type ArtId } from "../../../../shared/games/puzzle";

type Art = (p: { uid: string }) => JSX.Element;

function stars(seed: number, n: number, x0: number, y0: number, x1: number, y1: number, color = "#fff7e6") {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const s = r();
    return <circle cx={x0 + r() * (x1 - x0)} cy={y0 + r() * (y1 - y0)} r={s < 0.85 ? 1.6 : 3.2} fill={color} opacity={0.5 + r() * 0.5} />;
  });
}

const Sommets: Art = ({ uid }) => {
  const r = rng(11);
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1d2340" />
          <stop offset="0.55" stop-color="#7a3f5a" />
          <stop offset="0.85" stop-color="#ff8a4c" />
          <stop offset="1" stop-color="#ffc36b" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill={`url(#${uid}-sky)`} />
      {stars(3, 120, 0, 0, 1200, 380)}
      <circle cx="820" cy="560" r="150" fill="#ffd58a" opacity="0.35" />
      <circle cx="820" cy="560" r="105" fill="#ffe2a6" />
      {[0, 1, 2, 3].map((i) => (
        <rect x="660" y={520 + i * 22} width="320" height="7" fill="#ff8a4c" opacity="0.55" />
      ))}
      <path d="M0 640 L180 470 L300 560 L470 380 L640 600 L760 520 L900 640 L1050 480 L1200 590 L1200 900 L0 900 Z" fill="#5a3350" />
      <path d="M470 380 L520 430 L490 440 L455 425 L430 418 Z" fill="#f4e6dc" />
      <path d="M1050 480 L1090 520 L1060 525 L1030 512 Z" fill="#f4e6dc" />
      <path d="M0 740 L140 620 L260 700 L390 590 L560 730 L700 640 L860 760 L1000 650 L1200 760 L1200 900 L0 900 Z" fill="#3a2440" />
      <path d="M0 830 L200 760 L400 820 L620 750 L840 840 L1040 780 L1200 830 L1200 900 L0 900 Z" fill="#20152a" />
      {Array.from({ length: 7 }, () => {
        const x = 150 + r() * 600;
        const y = 120 + r() * 220;
        const s = 10 + r() * 14;
        return <path d={`M${x - s} ${y} Q${x - s / 2} ${y - s / 2} ${x} ${y} Q${x + s / 2} ${y - s / 2} ${x + s} ${y}`} stroke="#1d2340" stroke-width="4" fill="none" stroke-linecap="round" />;
      })}
    </g>
  );
};

const Archipel: Art = ({ uid }) => {
  const r = rng(21);
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9fd3d6" />
          <stop offset="1" stop-color="#f7e7c6" />
        </linearGradient>
        <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f8c9a" />
          <stop offset="1" stop-color="#14425a" />
        </linearGradient>
      </defs>
      <rect width="1200" height="520" fill={`url(#${uid}-sky)`} />
      <circle cx="260" cy="190" r="90" fill="#ff7a45" />
      {[0, 1, 2].map((i) => (
        <ellipse cx={620 + i * 180} cy={120 + (i % 2) * 70} rx={90 - i * 10} ry="26" fill="#ffffff" opacity="0.85" />
      ))}
      <rect y="520" width="1200" height="380" fill={`url(#${uid}-sea)`} />
      {Array.from({ length: 26 }, (_, i) => {
        const y = 545 + i * 14;
        const x = r() * 1000;
        const w = 60 + r() * 160;
        return <path d={`M${x} ${y} q${w / 4} -8 ${w / 2} 0 t${w / 2} 0`} stroke="#bfe6e8" stroke-width="3" fill="none" opacity={0.25 + r() * 0.5} />;
      })}
      <path d="M90 560 Q230 470 380 560 Z" fill="#e8c27a" />
      <path d="M180 520 q-10 -80 10 -140" stroke="#5b3a22" stroke-width="8" fill="none" />
      <path d="M190 380 q-60 0 -90 30 M190 380 q50 -10 90 20 M190 380 q-20 -40 -60 -50 M190 380 q30 -40 70 -40" stroke="#2f6b3a" stroke-width="12" fill="none" stroke-linecap="round" />
      <path d="M760 560 Q900 430 1080 560 Z" fill="#c9a362" />
      <path d="M840 500 Q900 450 960 500 Z" fill="#3f7a46" />
      <g transform="translate(560 600)">
        <path d="M0 40 L160 40 L130 75 L25 75 Z" fill="#f2efe6" />
        <path d="M80 -120 L80 38 L10 38 Z" fill="#ffffff" />
        <path d="M86 -100 L86 38 L150 38 Z" fill="#ff7a45" />
        <rect x="78" y="-125" width="5" height="165" fill="#333" />
      </g>
    </g>
  );
};

const Bauhaus: Art = () => {
  const r = rng(31);
  return (
    <g>
      <rect width="1200" height="900" fill="#efe6d2" />
      {Array.from({ length: 12 }, (_, i) => (
        <line x1={i * 100} y1="0" x2={i * 100} y2="900" stroke="#d9cdb2" stroke-width="2" />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <line x1="0" y1={i * 100} x2="1200" y2={i * 100} stroke="#d9cdb2" stroke-width="2" />
      ))}
      <circle cx="380" cy="360" r="240" fill="#ff6a2b" />
      <rect x="560" y="120" width="420" height="300" fill="#1f3a8a" />
      <path d="M560 420 A210 210 0 0 1 980 420 Z" fill="#f2c230" />
      <rect x="140" y="640" width="520" height="90" fill="#1a1a1a" />
      <circle cx="900" cy="680" r="130" fill="none" stroke="#1a1a1a" stroke-width="26" />
      <circle cx="900" cy="680" r="48" fill="#e2483d" />
      <path d="M120 120 L320 120 L120 320 Z" fill="#2c8a6b" />
      <line x1="40" y1="860" x2="1160" y2="560" stroke="#1a1a1a" stroke-width="10" />
      {Array.from({ length: 40 }, (_, i) => (
        <circle cx={700 + (i % 8) * 34} cy={470 + Math.floor(i / 8) * 34} r={6 + r() * 4} fill="#1a1a1a" opacity="0.85" />
      ))}
      <rect x="1030" y="80" width="90" height="420" fill="#e2483d" />
      <path d="M1030 80 L1120 80 L1120 170 Z" fill="#1a1a1a" />
    </g>
  );
};

const Orbite: Art = ({ uid }) => (
  <g>
    <defs>
      <radialGradient id={`${uid}-space`} cx="0.3" cy="0.3" r="1">
        <stop offset="0" stop-color="#1b2338" />
        <stop offset="1" stop-color="#05060b" />
      </radialGradient>
      <clipPath id={`${uid}-planet`}>
        <circle cx="560" cy="470" r="280" />
      </clipPath>
      <radialGradient id={`${uid}-shade`} cx="0.35" cy="0.35" r="0.75">
        <stop offset="0.5" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.65" />
      </radialGradient>
    </defs>
    <rect width="1200" height="900" fill={`url(#${uid}-space)`} />
    {stars(41, 260, 0, 0, 1200, 900)}
    <ellipse cx="560" cy="470" rx="470" ry="96" fill="none" stroke="#c9a77c" stroke-width="22" opacity="0.5" transform="rotate(-14 560 470)" />
    <g clip-path={`url(#${uid}-planet)`}>
      {["#e6c79a", "#c98e5a", "#f0dcb4", "#a8653a", "#e3b27c", "#d7a26f", "#f3e2c0", "#b9764a", "#e8c08c"].map((c, i) => (
        <rect x="260" y={190 + i * 64} width="620" height="64" fill={c} transform="rotate(-14 560 470)" />
      ))}
      <ellipse cx="660" cy="560" rx="70" ry="34" fill="#a14a2a" transform="rotate(-14 560 470)" />
      <circle cx="560" cy="470" r="280" fill={`url(#${uid}-shade)`} />
    </g>
    <path d="M90 470 A470 96 0 0 0 1030 470" fill="none" stroke="#e8cfa6" stroke-width="22" transform="rotate(-14 560 470)" />
    <circle cx="1010" cy="170" r="54" fill="#b7bcc4" />
    <circle cx="992" cy="155" r="10" fill="#9aa0a8" />
    <circle cx="1030" cy="185" r="7" fill="#9aa0a8" />
    <g transform="translate(170 720) rotate(-20)">
      <rect x="-60" y="-8" width="120" height="16" fill="#d8d0c0" />
      <rect x="-14" y="-30" width="28" height="60" fill="#ff7a3c" />
      <rect x="-110" y="-22" width="44" height="44" fill="#3e5f8a" />
      <rect x="66" y="-22" width="44" height="44" fill="#3e5f8a" />
    </g>
  </g>
);

const Foret: Art = ({ uid }) => {
  const row = (seed: number, y: number, h: number, color: string, n: number) => {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => {
      const x = (i / n) * 1260 - 30 + r() * 30;
      const hh = h * (0.75 + r() * 0.5);
      return (
        <g>
          <path d={`M${x} ${y - hh} L${x + hh * 0.32} ${y} L${x - hh * 0.32} ${y} Z`} fill={color} />
          <rect x={x - 5} y={y - 4} width="10" height="18" fill={color} />
        </g>
      );
    });
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f6d9a8" />
          <stop offset="1" stop-color="#d9e4cf" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill={`url(#${uid}-sky)`} />
      <circle cx="900" cy="230" r="110" fill="#ffb15e" />
      <rect y="380" width="1200" height="40" fill="#ffffff" opacity="0.35" />
      {row(1, 460, 210, "#9fb59a", 22)}
      <rect y="470" width="1200" height="30" fill="#ffffff" opacity="0.3" />
      {row(2, 600, 260, "#5e7d5e", 18)}
      <rect y="610" width="1200" height="22" fill="#ffffff" opacity="0.25" />
      {row(3, 760, 330, "#2f4a35", 14)}
      <rect y="760" width="1200" height="140" fill="#1e3024" />
      {row(4, 920, 360, "#13201a", 10)}
    </g>
  );
};

const Ville: Art = ({ uid }) => {
  const r = rng(61);
  const buildings: JSX.Element[] = [];
  let x = 0;
  while (x < 1200) {
    const w = 70 + r() * 110;
    const h = 220 + r() * 380;
    const top = 720 - h;
    const shade = ["#1b2236", "#222b44", "#161c2c"][Math.floor(r() * 3)]!;
    buildings.push(<rect x={x} y={top} width={w - 8} height={h} fill={shade} />);
    for (let wy = top + 20; wy < 700; wy += 34) {
      for (let wx = x + 12; wx < x + w - 24; wx += 26) {
        if (r() < 0.38) buildings.push(<rect x={wx} y={wy} width="12" height="16" fill={r() < 0.7 ? "#ffcf6b" : "#9fd8e0"} opacity={0.6 + r() * 0.4} />);
      }
    }
    if (r() < 0.3) buildings.push(<rect x={x + w / 2 - 3} y={top - 60} width="6" height="60" fill={shade} />, <circle cx={x + w / 2} cy={top - 64} r="5" fill="#ff5a3c" />);
    x += w;
  }
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b1022" />
          <stop offset="1" stop-color="#3a2a5a" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill={`url(#${uid}-sky)`} />
      {stars(62, 140, 0, 0, 1200, 420)}
      <circle cx="240" cy="160" r="70" fill="#f4ecd6" />
      <circle cx="270" cy="145" r="62" fill="#14193a" />
      {buildings}
      <rect y="720" width="1200" height="180" fill="#0d1326" />
      {Array.from({ length: 60 }, () => (
        <rect x={r() * 1200} y={735 + r() * 150} width={20 + r() * 60} height="3" fill={r() < 0.7 ? "#ffcf6b" : "#9fd8e0"} opacity={0.15 + r() * 0.35} />
      ))}
    </g>
  );
};

export const ART_COMPONENTS: Record<ArtId, Art> = {
  sommets: Sommets,
  archipel: Archipel,
  bauhaus: Bauhaus,
  orbite: Orbite,
  foret: Foret,
  ville: Ville,
};

/** Miniature d'une illustration (sélection, couverture). */
export function ArtThumb({ art, uid, class: cls }: { art: ArtId; uid: string; class?: string }) {
  const A = ART_COMPONENTS[art];
  return (
    <svg viewBox="0 0 1200 900" class={cls} aria-hidden="true">
      <A uid={uid} />
    </svg>
  );
}
