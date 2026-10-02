import { RULES } from "../../../../shared/games/puits";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { KindGlyph } from "./Arena";

/** Couverture : un soleil, deux orbites, un puits qui fait dévier une trajectoire vers un autre vaisseau. */
export function Cover() {
  return (
    <svg class="puits-cover" viewBox="0 0 360 220" aria-hidden="true">
      <defs>
        <radialGradient id="puits-cover-sun" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0" class="sun-a" />
          <stop offset="1" class="sun-b" />
        </radialGradient>
      </defs>
      <circle cx="180" cy="110" r="96" class="cover-space" />
      <g class="cover-grid">
        <path d="M100 64C140 70 160 92 180 96C200 92 220 70 260 64" />
        <path d="M90 110C130 112 160 112 180 110C200 112 230 112 270 110" />
        <path d="M100 156C140 150 160 128 180 124C200 128 220 150 260 156" />
        <path d="M134 28C138 70 162 90 168 110C162 130 138 150 134 192" />
        <path d="M226 28C222 70 198 90 192 110C198 130 222 150 226 192" />
      </g>
      <circle cx="180" cy="110" r="66" class="cover-orbit" />
      <circle cx="180" cy="110" r="16" fill="url(#puits-cover-sun)" class="cover-sun" />
      <g class="cover-well">
        <circle cx="236" cy="66" r="22" class="cover-well-ring r3" />
        <circle cx="236" cy="66" r="13" class="cover-well-ring r2" />
        <circle cx="236" cy="66" r="6" class="cover-well-core" />
      </g>
      <path d="M131 64C160 44 214 40 226 58C236 74 214 100 246 136" class="cover-path" />
      <path d="M246 136l18 22" class="cover-path cover-path-b" />
      <g class="cover-ship cover-ship-a" transform="translate(131 64) rotate(-30)">
        <path d="M10 0L-7 6.5L-3 0L-7 -6.5Z" />
      </g>
      <g class="cover-ship cover-ship-b" transform="translate(252 142) rotate(50)">
        <path d="M10 0L-7 6.5L-3 0L-7 -6.5Z" />
      </g>
      <path d="M104 160l5 -8l5 8l-5 8z" class="cover-shard" />
    </svg>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home puits-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Puits
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
            Versus · tours simultanés · {RULES.minPlayers} à {RULES.maxPlayers} joueurs · {RULES.rounds} manches
          </p>
          <h1 class="hero-title">
            Puits<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Tu ne pilotes pas ton vaisseau : tu poses des puits de gravité. Tout le monde planifie en même temps, puis la physique se joue, et les
            puits de chacun dévient tous les vaisseaux.
          </p>
          <div class="puits-hero-art">
            <Cover />
          </div>
        </section>

        <EntryPanel game="puits" title="Prendre place en orbite" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Comment on joue
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Vise</h3>
            <p>
              Chaque tour, pose un puits <KindGlyph kind="puits" /> qui attire ou un répulseur <KindGlyph kind="repulseur" /> qui repousse. Les
              pointillés montrent où partent les vaisseaux.
            </p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">En même temps</h3>
            <p>Les poses des autres restent secrètes jusqu'à ce que tout le monde ait validé. Ta prévision ne tient compte que de la tienne.</p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">La physique tranche</h3>
            <p>
              Trois secondes de vol. Un puits agit trois tours en faiblissant, les vaisseaux rebondissent entre eux : une poussée bien placée part
              en réaction en chaîne.
            </p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">Marque</h3>
            <p>
              Éclat ramassé +{RULES.points.shard}, vaisseau envoyé dans le soleil ou le vide +{RULES.points.kill}, encore en vol à la fin de la
              manche +{RULES.points.survive}. Perdu ? Tes puits comptent toujours.
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
