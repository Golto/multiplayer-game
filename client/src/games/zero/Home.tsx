import { RULES } from "../../../../shared/games/zero";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { PolyText, Sized, ZCard } from "./cards";

/** Couverture : une colonne au même terme dominant, qui va s'effacer, et deux cartes en éventail. */
export function Cover() {
  return (
    <div class="zero-cover" aria-hidden="true">
      <div class="cover-column">
        <Sized width={64}><ZCard cell={{ card: [1, 0, 3], up: true, removed: false }} /></Sized>
        <Sized width={64}><ZCard cell={{ card: [0, -1, 3], up: true, removed: false }} /></Sized>
        <Sized width={64}><ZCard cell={{ card: [0, 0, 3], up: true, removed: false }} /></Sized>
      </div>
      <span class="cover-equals">
        <PolyText p={[0, 0, 3]} /> ×3
      </span>
      <div class="cover-fan">
        <Sized width={84}><ZCard cell={{ card: null, up: false, removed: false }} /></Sized>
        <Sized width={84}><ZCard cell={{ card: [3, 0, 2], up: true, removed: false }} /></Sized>
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
            Le Skyjo des polynômes : les cartes sont des polynômes à coefficients entiers. À la fin de la manche, un dé tire x parmi −1, 0 et 1, et
            chaque carte vaut P(x). Au degré 0, c'est exactement le Skyjo.
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
            <h3 class="h6">Comme au Skyjo</h3>
            <p>
              Pioche au paquet ou à la défausse, échange avec une carte de ta grille, ou défausse et retourne une carte cachée. Le plus petit total
              gagne.
            </p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">Le dé de x</h3>
            <p>
              À la fin de la manche, x vaut −1, 0 ou 1, et chaque carte vaut P(x) : <PolyText p={[3, -1, 2]} /> vaut 6, 3 ou 4. En x = 1, chaque
              carte vaut sa valeur Skyjo, de −2 à 12.
            </p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">Même terme dominant</h3>
            <p>
              Une colonne s'efface quand ses cartes ont le même terme dominant : <PolyText p={[1, 0, 3]} />, <PolyText p={[0, -1, 3]} /> et{" "}
              <PolyText p={[0, 0, 3]} />. Au degré 0, ce sont trois cartes identiques.
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
