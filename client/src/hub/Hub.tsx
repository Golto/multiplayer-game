// La salle de jeux : tous les jeux, et un raccourci pour rejoindre un salon par son code.

import { useState } from "preact/hooks";
import { CATALOG, type PlayableGame } from "../../../shared/catalog";
import { CODE_LENGTH, NAME_MAX } from "../../../shared/platform";
import type { PlatformSend } from "../net";
import { GAME_CLIENTS } from "../games/registry";
import { Watermark } from "../ui/art";
import { Brand, Link, SoundToggle, ThemeToggle } from "../ui/chrome";
import { Icon } from "../ui/icons";
import { rememberName, savedName } from "../ui/name";
import { UpcomingCover } from "./covers";

export function Hub({ send, connecting }: { send: PlatformSend; connecting: boolean }) {
  const playable = CATALOG.filter((g): g is PlayableGame => g.status === "jouable");
  const upcoming = CATALOG.filter((g) => g.status === "bientot");

  return (
    <div class="page hub">
      <Watermark />
      <header class="topbar">
        <Brand />
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </header>

      <main class="hub-main">
        <section class="hub-hero">
          <div class="hub-hero-text">
            <p class="eyebrow">Salons privés · entre amis · dans le navigateur</p>
            <h1 class="hero-title">
              La salle de jeux<span class="hero-dot">.</span>
            </h1>
            <p class="hero-lead">
              Des jeux de société à jouer à plusieurs, chacun devant son écran. On choisit un jeu, on ouvre un salon, on partage son code.
              Pas de compte, rien à installer.
            </p>
          </div>
          <JoinByCode send={send} connecting={connecting} />
        </section>

        <section class="hub-shelf" aria-labelledby="shelf-title">
          <div class="shelf-head">
            <h2 id="shelf-title" class="h3">
              Les jeux
            </h2>
            <span class="muted small">
              {playable.length} jouable{playable.length > 1 ? "s" : ""} · {upcoming.length} en préparation
            </span>
          </div>

          <ul class={`shelf shelf-playable ${playable.length === 1 ? "is-solo" : ""}`}>
            {playable.map((g, i) => (
              <GameBox game={g} index={i} />
            ))}
          </ul>
          {upcoming.length > 0 && (
            <h3 class="shelf-subtitle h6 muted">En préparation</h3>
          )}
          <ul class="shelf shelf-upcoming">
            {upcoming.map((g, i) => (
              <li class="game-box is-upcoming" style={{ "--i": playable.length + i } as never}>
                <div class="box-cover">
                  <UpcomingCover name={g.name} />
                  <span class="box-ribbon">Bientôt</span>
                </div>
                <div class="box-body">
                  <h3 class="h5">{g.name}</h3>
                  <p class="box-tagline">{g.tagline}</p>
                  <ul class="box-tags">
                    <li class="mono">{g.players} joueurs</li>
                    {g.tags.map((t) => (
                      <li>{t}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section class="hub-elsewhere" aria-labelledby="elsewhere-title">
          <h2 id="elsewhere-title" class="h3">
            Hors jeu
          </h2>
          <a class="station-box" href="/station" data-sound="nav.forward">
            <svg class="station-cover" viewBox="0 0 320 180" aria-hidden="true">
              <rect width="320" height="180" class="station-bg" />
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const k = 1 - i * 0.16;
                const w = 150 * k;
                const h = 80 * k;
                const c = 22 * k;
                return (
                  <path
                    d={`M${160 - w} ${90 + h} L${160 - w} ${90 - h + c} L${160 - w + c} ${90 - h} L${160 + w - c} ${90 - h} L${160 + w} ${90 - h + c} L${160 + w} ${90 + h}`}
                    class="station-rib"
                    style={{ opacity: 1 - i * 0.13 }}
                  />
                );
              })}
              <rect x="150" y="12" width="20" height="5" class="station-lamp" />
              <rect x="154" y="44" width="12" height="3" class="station-lamp" />
              <rect x="156" y="62" width="8" height="2" class="station-lamp" />
              <circle cx="160" cy="90" r="9" class="station-planet" />
            </svg>
            <div class="station-text">
              <p class="eyebrow">Exploration · solo · vue subjective</p>
              <h3 class="h4">Sébastopol</h3>
              <p class="small muted">
                Une station orbitale rétro-futuriste à parcourir librement : spatioport, navette, atrium sur trois niveaux, centre médical,
                logements, salon panorama. Pas d'ennemi, pas de chrono. Au clavier et à la souris.
              </p>
              <span class="box-cta">
                Entrer <Icon name="arrowRight" size={16} />
              </span>
            </div>
          </a>
        </section>

        <section class="hub-how" aria-labelledby="hub-how-title">
          <h2 id="hub-how-title" class="sr-only">
            Comment ça marche
          </h2>
          <ol class="hub-steps">
            <li>
              <span class="how-num">01</span>
              <h3 class="h6">Choisis un jeu</h3>
              <p>Chaque jeu a sa page, ses règles et son ambiance.</p>
            </li>
            <li>
              <span class="how-num">02</span>
              <h3 class="h6">Ouvre un salon privé</h3>
              <p>Tu reçois un code de cinq caractères et un lien à envoyer à tes amis.</p>
            </li>
            <li>
              <span class="how-num">03</span>
              <h3 class="h6">Jouez</h3>
              <p>Une coupure ou une page rechargée ? Tu retrouves ta place automatiquement.</p>
            </li>
          </ol>
        </section>
      </main>

      <footer class="footer muted small">Une salle de jeux golpex · faite pour les soirées entre amis</footer>
    </div>
  );
}

function GameBox({ game, index }: { game: PlayableGame; index: number }) {
  const { Cover } = GAME_CLIENTS[game.id];
  const href = `/${game.id}`;
  return (
    <li class="game-box is-playable" style={{ "--i": index } as never}>
      <Link href={href} class="box-link" aria-label={`${game.name} : ${game.tagline}`} data-sound="nav.forward">
        <div class="box-cover">
          <Cover />
        </div>
        <div class="box-body">
          <div class="box-title-row">
            <h3 class="h4">{game.name}</h3>
            <span class="box-cta">
              Jouer <Icon name="arrowRight" size={16} />
            </span>
          </div>
          <p class="box-tagline">{game.tagline}</p>
          <p class="box-pitch small muted">{game.pitch}</p>
          <ul class="box-tags">
            <li class="mono">{game.players} joueurs</li>
            <li class="mono">{game.duration}</li>
            {game.tags.map((t) => (
              <li>{t}</li>
            ))}
          </ul>
        </div>
      </Link>
    </li>
  );
}

function JoinByCode({ send, connecting }: { send: PlatformSend; connecting: boolean }) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState("");
  const [nameError, setNameError] = useState(false);

  const join = (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      document.getElementById("hub-name")?.focus();
      return;
    }
    rememberName(name);
    send({ t: "join", code, name });
  };

  return (
    <form class="panel entry hub-join" onSubmit={join} aria-labelledby="join-title">
      <h2 id="join-title" class="h4">
        Un ami t'a donné un code ?
      </h2>
      <p class="muted small">Le code suffit : il mène directement au bon jeu.</p>
      <label class="field">
        <span class="field-label">Ton pseudo</span>
        <input
          id="hub-name"
          class={`input ${nameError ? "is-invalid" : ""}`}
          value={name}
          maxLength={NAME_MAX}
          autocomplete="nickname"
          placeholder="Ex. Léa la Fouine"
          onInput={(e) => {
            setName(e.currentTarget.value);
            setNameError(false);
          }}
          aria-invalid={nameError}
          aria-describedby={nameError ? "hub-name-error" : undefined}
        />
        {nameError && (
          <span id="hub-name-error" class="field-error">
            Il faut un pseudo pour s'asseoir.
          </span>
        )}
      </label>
      <label class="field">
        <span class="field-label">Code du salon</span>
        <input
          class="input input-code"
          value={code}
          maxLength={CODE_LENGTH}
          placeholder="K7MPQ"
          autocapitalize="characters"
          spellcheck={false}
          onInput={(e) => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
      </label>
      <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={connecting || code.length !== CODE_LENGTH}>
        Rejoindre le salon
        <Icon name="arrowRight" size={20} />
      </button>
      {connecting && <p class="muted small">Connexion à la salle…</p>}
    </form>
  );
}
