import { RULES } from "../../../../shared/games/tapis";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { Chips, PlayingCard } from "./cards";

/** Couverture : un as et un roi en éventail, une folle étoilée, une pile de jetons. */
export function Cover() {
  return (
    <div class="tapis-cover" aria-hidden="true">
      <div class="tc-fan">
        <PlayingCard card={{ r: 14, s: 0 }} w={70} />
        <PlayingCard card={{ r: 13, s: 1 }} w={70} />
        <PlayingCard card={{ r: 7, s: 2 }} w={70} wild />
      </div>
      <div class="tc-chips">
        <Chips n={5} accent="strawberry" />
        <Chips n={3} accent="royalblue" />
      </div>
    </div>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home tapis-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Tapis
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
            Cartes · bluff · {RULES.minPlayers} à {RULES.maxPlayers} joueurs · hold'em sans limite
          </p>
          <h1 class="hero-title">
            Tapis<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Un Texas hold'em entre amis, avec trois entorses : des cartes folles qui changent à chaque donne, un échange de carte qui se paie, et
            une prime à décrocher. Des jetons pour rire, pas d'argent.
          </p>
          <div class="tapis-hero-art">
            <Cover />
          </div>
        </section>

        <EntryPanel game="tapis" title="S'asseoir à la table" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Comment on joue
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Le hold'em</h3>
            <p>
              Deux cartes à toi, cinq au milieu, quatre tours d'enchères. Couche-toi, parle, suis, relance ou fais tapis : la meilleure main de cinq
              cartes l'emporte. Le dernier à avoir des jetons gagne.
            </p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">La folle</h3>
            <p>
              À chaque donne, une carte est retournée au milieu : les trois autres de sa hauteur sont folles et remplacent n'importe quelle carte.
              Avec elles, cinq rois battent la quinte flush.
            </p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">L'échange</h3>
            <p>Une fois par donne, à partir du flop et quand c'est à toi de parler, paie une grosse blinde pour remplacer une de tes deux cartes.</p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">La prime</h3>
            <p>
              Chaque donne affiche un défi : gagner avec 7-2, sans abattage, avec deux figures… Qui remporte le pot en le relevant touche une
              grosse blinde de chacun des autres.
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
