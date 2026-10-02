import { ARTS, PIECE_COUNTS, layout, piecePath } from "../../../../shared/games/puzzle";
import { Watermark } from "../../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { EntryPanel } from "../../ui/EntryPanel";
import type { HomeProps } from "../types";
import { ART_COMPONENTS, ArtThumb } from "./arts";

const COVER_LAYOUT = layout({ count: 24, format: "paysage" });

/** Couverture de la boîte : le dessin découpé, trois pièces sorties du lot. */
export function Cover() {
  const Art = ART_COMPONENTS.sommets;
  const lifted = [9, 14, 20];
  return (
    <svg class="puzzle-cover" viewBox="-80 -60 1360 1020" aria-hidden="true">
      <defs>
        <g id="cover-art">
          <Art uid="cover" />
        </g>
        {Array.from({ length: 24 }, (_, id) => (
          <clipPath id={`cover-c${id}`}>
            <path d={piecePath(id, COVER_LAYOUT, 7)} />
          </clipPath>
        ))}
      </defs>
      <rect x="-10" y="-10" width="1220" height="920" rx="12" class="cover-board" />
      {Array.from({ length: 24 }, (_, id) =>
        lifted.includes(id) ? null : (
          <g>
            <use href="#cover-art" clip-path={`url(#cover-c${id})`} />
            <path d={piecePath(id, COVER_LAYOUT, 7)} class="cover-edge" />
          </g>
        ),
      )}
      {lifted.map((id, i) => (
        <g class="cover-lifted" style={{ "--i": i } as never} transform={`translate(${[-60, 80, 30][i]} ${[60, -40, 90][i]}) rotate(${[-8, 6, -4][i]} 600 450)`}>
          <use href="#cover-art" clip-path={`url(#cover-c${id})`} />
          <path d={piecePath(id, COVER_LAYOUT, 7)} class="cover-edge cover-edge-lifted" />
        </g>
      ))}
    </svg>
  );
}

export function Home({ send, initialCode, connecting }: HomeProps) {
  return (
    <div class="page home puzzle-home">
      <Watermark />
      <header class="topbar">
        <nav class="crumbs" aria-label="Fil d'Ariane">
          <Brand href="/" />
          <span class="crumb-sep" aria-hidden="true">
            /
          </span>
          <span class="crumb-current" aria-current="page">
            Puzzle
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
            Coopératif · seul ou jusqu'à 8 · de {PIECE_COUNTS[0]} à {PIECE_COUNTS[PIECE_COUNTS.length - 1]} pièces
          </p>
          <h1 class="hero-title">
            Puzzle<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Un dessin, des pièces éparpillées sur la table, et autant de mains que vous voulez. Chacun voit les pièces que les autres
            déplacent, en direct. Comme pour un vrai puzzle, on commence par les coins, et on peut assembler des morceaux à côté du plateau.
          </p>
          <ul class="art-gallery" aria-label="Les dessins">
            {ARTS.map((a, i) => (
              <li style={{ "--i": i } as never}>
                <ArtThumb art={a.id} uid={`home-${a.id}`} class="art-thumb" />
                <span class="small">{a.name}</span>
              </li>
            ))}
          </ul>
        </section>
        <EntryPanel game="puzzle" title="Ouvrir la boîte" send={send} initialCode={initialCode} connecting={connecting} />
      </main>

      <footer class="footer muted small">
        <Link href="/">← Tous les jeux de la salle</Link>
      </footer>
    </div>
  );
}
