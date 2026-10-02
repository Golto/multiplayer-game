import { PICTOS, RULES } from "../../../../shared/games/cartographes";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { PictoGlyph, TERRAIN_GLYPHS } from "./pictos";
import type { Terrain } from "../../../../shared/games/cartographes";

const COVER: Terrain[] = [
  "eau", "eau", "plaine", "foret",
  "eau", "plaine", "village", "foret",
  "plaine", "plaine", "foret", "montagne",
  "foret", "foret", "montagne", "montagne",
];

/** Couverture : une zone à moitié cartographiée et une bulle de pictogrammes. */
export function Cover() {
  return (
    <svg class="carto-cover" viewBox="0 0 360 220" aria-hidden="true">
      <g transform="translate(70 30) rotate(-4 80 80)">
        <rect x="-6" y="-6" width="172" height="172" rx="12" class="map-paper" />
        {COVER.map((t, i) => {
          const x = (i % 4) * 40;
          const y = Math.floor(i / 4) * 40;
          const blank = [3, 6, 7, 10, 11, 14, 15].includes(i);
          return (
            <g transform={`translate(${x} ${y})`} class={blank ? "cover-blank" : ""}>
              <rect width="40" height="40" class={`tile ${blank ? "t-vierge" : `t-${t}`}`} />
              {!blank && (
                <g class="tile-ink" transform="translate(9 9) scale(0.92)">
                  {TERRAIN_GLYPHS[t]}
                </g>
              )}
            </g>
          );
        })}
        <rect x="80" y="40" width="40" height="40" rx="5" class="cover-cursor" />
      </g>
      <g transform="translate(206 26)" class="cover-bubble">
        <path d="M8 0h120a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H40l-14 14v-14H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" />
        <g transform="translate(10 12)">
          <svg x="0" width="28" height="28" viewBox="0 0 24 24" class="picto">{TERRAIN_GLYPHS.village}</svg>
        </g>
        <g transform="translate(42 12)">
          <PictoGlyph id="centre" size={28} />
        </g>
        <g transform="translate(74 12)">
          <PictoGlyph id="ne" size={28} />
        </g>
        <g transform="translate(104 12)">
          <PictoGlyph id="1" size={28} />
        </g>
      </g>
      <g transform="translate(236 122)" class="cover-bubble cover-bubble-reply">
        <path d="M8 0h80a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H70l-6 12-6-12H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" />
        <g transform="translate(12 12)">
          <PictoGlyph id="quoi" size={28} />
        </g>
        <g transform="translate(52 12)">
          <PictoGlyph id="toi" size={28} />
        </g>
      </g>
    </svg>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home carto-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Cartographes
          </span>
        </nav>
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </header>

      <main class="home-grid">
        <section class="hero">
          <p class="eyebrow">
            Coopératif asymétrique · tour par tour · {RULES.minPlayers} à {RULES.maxPlayers} joueurs · {RULES.turns} tours
          </p>
          <h1 class="hero-title">
            Cartographes<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Chacun ne voit que son morceau d'une carte tirée au hasard. Pour la reconstituer ensemble avant la fin du chrono, vous n'avez que des
            pictogrammes. Les malentendus font tout le sel du jeu.
          </p>
          <div class="vocab" aria-label="Le vocabulaire">
            {PICTOS.map((p, i) => (
              <span class="vocab-key" style={{ "--i": i } as never} title={p.label}>
                <PictoGlyph id={p.id} size={22} />
              </span>
            ))}
          </div>
        </section>

        <EntryPanel game="cartographes" title="Rejoindre l'expédition" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Comment on joue
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Tu vois une zone…</h3>
            <p>Ton carnet montre une zone de 4 × 4 cases : eau, plaine, forêt, montagne, villages. Personne d'autre ne la voit.</p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">…un autre la peint</h3>
            <p>C'est le joueur suivant qui la peint sur la carte commune. Toi, tu en peins une autre, d'après les messages de quelqu'un d'autre.</p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">Pictogrammes seulement</h3>
            <p>
              Chaque tour : un message de {RULES.message} pictogrammes au plus et {RULES.paints} cases peintes. Tout apparaît en même temps à la fin
              du tour.
            </p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">Corrige</h3>
            <p>Ton carnet marque ce que la carte commune a juste ou faux dans ta zone. À toi de le faire comprendre. {RULES.turns} tours, pas un de plus.</p>
          </li>
        </ol>
      </section>

      <footer class="footer muted small">
        <Link href="/">← Tous les jeux de la salle</Link>
      </footer>
    </div>
  );
}
