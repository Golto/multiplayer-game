import { LEVELS, RULES } from "../../../../shared/games/echos";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";

/** Couverture : une salle vue de dessus, deux plaques tenues par des échos, la troisième atteinte en direct. */
export function Cover() {
  return (
    <svg class="echos-cover" viewBox="0 0 360 220" aria-hidden="true">
      <rect x="40" y="20" width="280" height="180" rx="10" class="cover-floor" />
      <path d="M40 20h280v180H40z M150 20v70 M150 130v70 M230 20v50 M230 110v90" class="cover-walls" />
      <rect x="226" y="70" width="8" height="40" class="cover-door" />
      <path d="M80 160C90 120 110 100 100 60" class="cover-trace t1" />
      <path d="M80 160C120 170 160 120 196 110" class="cover-trace t2" />
      <path d="M80 160C150 180 220 150 270 150" class="cover-trace t3" />
      <g class="cover-plate">
        <circle cx="100" cy="60" r="13" />
        <path d="M100 52l2.4 5 5.4.6-4 3.7 1.1 5.4-4.9-2.7-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" class="star" />
      </g>
      <g class="cover-door-plate">
        <rect x="183" y="97" width="26" height="26" rx="6" />
      </g>
      <g class="cover-plate">
        <circle cx="270" cy="150" r="13" />
        <path d="M270 142l2.4 5 5.4.6-4 3.7 1.1 5.4-4.9-2.7-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" class="star" />
      </g>
      <g class="cover-plate is-empty">
        <circle cx="285" cy="55" r="13" />
      </g>
      <circle cx="100" cy="60" r="10" class="cover-ghost g1" />
      <circle cx="196" cy="110" r="10" class="cover-ghost g2" />
      <circle cx="262" cy="148" r="10" class="cover-live" />
      <text x="100" y="64" class="cover-n">1</text>
      <text x="196" y="114" class="cover-n">2</text>
    </svg>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home echos-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Échos
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
            Coopération ou versus · temps réel · {RULES.minPlayers} à {RULES.maxPlayers} joueurs
          </p>
          <h1 class="hero-title">
            Échos<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Chaque manche dure 30 secondes. À la suivante, tout ce que vous avez joué revient en fantômes, à côté de vous. À deux, il faut quatre
            corps sur quatre plaques en même temps : vous, et vos anciens vous.
          </p>
          <div class="echos-hero-art">
            <Cover />
          </div>
        </section>

        <EntryPanel game="echos" title="Entrer dans la boucle" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Comment on joue
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Trente secondes</h3>
            <p>Flèches, ZQSD ou WASD ; sur téléphone, pose le doigt et glisse. Chacun court vers une plaque, ou tient une porte.</p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">Rembobinage</h3>
            <p>À la manche suivante, ton écho refait exactement tes gestes. Les pointillés montrent son chemin : à toi de jouer autour.</p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">Tous ensemble</h3>
            <p>
              Coopération : {LEVELS.length} salles, deux plaques dorées par joueur à couvrir au même instant. Au-delà de {RULES.maxRounds} manches,
              paradoxe : les échos s'effacent.
            </p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">Ou les uns contre les autres</h3>
            <p>Versus : seul sur une plaque, tu marques. Tes échos gardent tes plaques et bousculent ceux des autres.</p>
          </li>
        </ol>
      </section>

      <footer class="footer muted small">
        <Link href="/">← Tous les jeux de la salle</Link>
      </footer>
    </div>
  );
}
