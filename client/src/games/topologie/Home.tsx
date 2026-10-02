import { RULES, SURFACES, SURFACE_IDS } from "../../../../shared/games/topologie";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { SurfaceDiagram } from "./Diagram";

/** Couverture de la boîte dans la salle de jeux : un plateau recollé où deux territoires s'affrontent. */
export function Cover() {
  return (
    <svg class="topo-cover" viewBox="0 0 360 220" aria-hidden="true">
      <rect x="90" y="20" width="180" height="180" class="cover-board" />
      <path d="M100 120h40v-40h30v60h-70z" class="cover-land cover-a" />
      <path d="M200 40h50v50h-30v-20h-20z" class="cover-land cover-b" />
      <path d="M170 110h30v-40h20" class="cover-trail cover-b-trail" />
      <path d="M140 150v30h60v-30" class="cover-trail cover-a-trail" />
      <circle cx="200" cy="150" r="7" class="cover-head cover-a-head" />
      <circle cx="220" cy="70" r="7" class="cover-head cover-b-head" />
      <line x1="90" y1="20" x2="90" y2="200" class="cover-edge cover-sides" />
      <line x1="270" y1="20" x2="270" y2="200" class="cover-edge cover-sides" />
      <line x1="90" y1="20" x2="270" y2="20" class="cover-edge cover-ends" />
      <line x1="90" y1="200" x2="270" y2="200" class="cover-edge cover-ends" />
      <g class="cover-chevron cover-sides">
        <path d="M83 106l7 7l7 -7" />
        <path d="M263 114l7 -7l7 7" />
      </g>
      <g class="cover-chevron cover-ends">
        <path d="M176 13l7 7l-7 7M170 13l7 7l-7 7" />
        <path d="M184 193l-7 7l7 7M190 193l-7 7l7 7" />
      </g>
    </svg>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home topo-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Topologie
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
            Conquête en temps réel · {RULES.minPlayers} à {RULES.maxPlayers} joueurs · {RULES.rounds} manches de {RULES.roundSeconds / 60} min
          </p>
          <h1 class="hero-title">
            Topologie<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Trace des boucles pour agrandir ton territoire, sur un plateau dont les bords se recollent. Ici, sortir à droite peut te faire rentrer
            à gauche… la tête en bas.
          </p>
          <ul class="surface-gallery" aria-label="Les surfaces">
            {SURFACE_IDS.map((id, i) => (
              <li style={{ "--i": i } as never}>
                <SurfaceDiagram surface={id} size={96} />
                <span class="surface-name">{SURFACES[id].name}</span>
                <span class="muted small">{SURFACES[id].orientable ? "orientable" : "non orientable"}</span>
              </li>
            ))}
          </ul>
        </section>

        <EntryPanel game="topologie" title="Entrer dans l'arène" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Comment on joue
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Sors de chez toi</h3>
            <p>Flèches, ZQSD ou glissés du doigt. Hors de ton territoire, tu laisses une traîne derrière toi.</p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">Rentre pour conquérir</h3>
            <p>Ta traîne devient territoire, et tout ce qu'elle enferme aussi. Mais une boucle qui fait le tour d'un tore n'enferme rien !</p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">Coupe les autres</h3>
            <p>Traverser la traîne d'un joueur le fait tomber. Traverser la tienne aussi. On repart deux secondes plus tard, chez soi.</p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">Change de surface</h3>
            <p>
              {RULES.rounds} manches, {RULES.rounds} surfaces tirées au sort. Les flèches sur les bords disent comment ils se recollent : dans le même
              sens, droit ; en sens contraires, en miroir.
            </p>
          </li>
        </ol>
      </section>

      <footer class="footer muted small">
        <Link href="/">← Tous les jeux de la salle</Link>
      </footer>
    </div>
  );
}
