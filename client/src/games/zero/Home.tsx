import { RULES } from "../../../../shared/games/zero";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { PolyText, ZCard } from "./cards";

/** Couverture : une colonne qui s'annule, et quelques cartes en éventail. */
export function Cover() {
  return (
    <div class="zero-cover" aria-hidden="true">
      <div class="cover-column">
        <ZCard cell={{ card: [0, 2, 1], up: true, removed: false }} size="md" />
        <ZCard cell={{ card: [0, 0, -1], up: true, removed: false }} size="md" />
        <ZCard cell={{ card: [0, -1, 0], up: true, removed: false }} size="md" />
      </div>
      <span class="cover-equals">
        Σ = <PolyText p={[0, 1, 0]} />
      </span>
      <div class="cover-fan">
        <ZCard cell={{ card: null, up: false, removed: false }} size="md" />
        <ZCard cell={{ card: [3, 0, 2], up: true, removed: false }} size="md" />
      </div>
    </div>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home zero-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Zéro
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
            Cartes · tour par tour · {RULES.minPlayers} à {RULES.maxPlayers} joueurs · inspiré du Skyjo
          </p>
          <h1 class="hero-title">
            Zéro<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Le Skyjo des polynômes : les cartes ne valent plus −2 à 12, ce sont des polynômes à coefficients entiers. Une colonne compte le poids de
            sa <em>somme</em> : range tes cartes pour que leurs coefficients se compensent.
          </p>
          <div class="zero-hero-art">
            <Cover />
          </div>
        </section>

        <EntryPanel game="zero" title="Prendre place à la table" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Comment on joue
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Le poids</h3>
            <p>
              Le poids d'un polynôme est la somme des valeurs absolues de ses coefficients : <PolyText p={[3, -1, 2]} /> pèse 6. Le plus léger gagne.
            </p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">Pioche, échange</h3>
            <p>
              Comme au Skyjo : pioche au paquet ou à la défausse, échange avec une carte de ta grille, ou défausse et retourne une carte cachée.
            </p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">Compense</h3>
            <p>
              Une colonne compte le poids de la somme de ses cartes : <PolyText p={[2, 0, 1]} /> sous <PolyText p={[0, 0, -1]} /> ne coûte que 2. Des
              cartes identiques s'effacent ; une colonne qui s'annule s'efface aussi, avec un bonus de −{Math.abs(RULES.cancelBonus)} par carte.
            </p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">Le dernier tour</h3>
            <p>
              Quand quelqu'un a tout révélé, chacun rejoue une fois. S'il n'a pas strictement le plus petit score, le sien double. On s'arrête à 100
              points (ou 50, ou 150).
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
