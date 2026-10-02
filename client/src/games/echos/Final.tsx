// Fin de partie : en coopération, les salles et leurs étoiles ; en versus, le classement.

import { useEffect } from "preact/hooks";
import { LEVELS, stars, type EchoAction, type EchoView } from "../../../../shared/games/echos";
import { PlayerSeal, Watermark, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";

export function Final({ view, send, onLeave }: { view: EchoView; send: (a: EchoAction) => void; onLeave: () => void }) {
  useEffect(() => {
    play("feedback.complete");
    const id = setTimeout(() => play("system.ready"), 1500);
    return () => clearTimeout(id);
  }, []);
  const me = view.players.find((p) => p.id === view.you);

  return (
    <div class="page final echos-final">
      <Watermark />
      <header class="topbar">
        <Brand name="Échos" />
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
          <button class="btn btn-ghost" type="button" data-sound="nav.back" onClick={onLeave}>
            <Icon name="arrowLeft" size={16} /> Quitter
          </button>
        </div>
      </header>
      <main class="final-main">{view.mode === "coop" ? <CoopEnd view={view} /> : <VersusEnd view={view} />}</main>
      <div class="final-actions">
        {me?.isHost ? (
          <button class="btn btn-primary btn-lg" type="button" data-sound="refresh.release" onClick={() => send({ t: "rematch" })}>
            Rejouer, mêmes joueurs
            <Icon name="arrowRight" size={20} />
          </button>
        ) : (
          <p class="waiting">
            <span class="pulse-dot" aria-hidden="true" />
            L'hôte peut relancer une partie.
          </p>
        )}
      </div>
    </div>
  );
}

function CoopEnd({ view }: { view: EchoView }) {
  const total = view.results.reduce((s, r) => s + stars(r), 0);
  const max = LEVELS.length * 3;
  const rounds = view.results.reduce((s, r) => s + r.rounds, 0);
  const title = total >= max ? "Maîtres du temps" : total >= max * 0.7 ? "Horlogers" : total >= max * 0.4 ? "Voyageurs" : "Touristes temporels";
  return (
    <>
      <section class="final-hero">
        <p class="eyebrow">Toutes les salles franchies</p>
        <h1 class="hero-title final-title">
          {title}
          <span class="hero-dot">.</span>
        </h1>
        <p class="hero-lead">
          <strong class="mono">
            {total}/{max}
          </strong>{" "}
          étoiles, en {rounds} manches au total.
        </p>
      </section>
      <section class="panel" aria-labelledby="levels-title">
        <h2 id="levels-title" class="h4">
          Salle par salle
        </h2>
        <ol class="level-results">
          {view.results.map((r, i) => {
            const def = LEVELS.find((l) => l.id === r.level);
            const n = stars(r);
            return (
              <li style={{ "--i": i } as never}>
                <span class="rank mono">{i + 1}</span>
                <span class="level-name">{def?.name}</span>
                <span class="stars small-stars" aria-label={`${n} étoiles`}>
                  {[0, 1, 2].map((k) => (
                    <span class={k < n ? "is-on" : ""}>★</span>
                  ))}
                </span>
                <span class="muted small mono">
                  {r.rounds} manche{r.rounds > 1 ? "s" : ""}
                  {r.paradoxes ? ` · ${r.paradoxes} paradoxe${r.paradoxes > 1 ? "s" : ""}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p class="muted small">★★★ en deux manches, ★★ en trois, ★ au-delà ou après un paradoxe.</p>
      </section>
    </>
  );
}

function VersusEnd({ view }: { view: EchoView }) {
  const total = (slot: number) => view.roundPoints.reduce((s, r) => s + (r[slot] ?? 0), 0);
  const standings = [...view.players].sort((a, b) => total(b.slot) - total(a.slot));
  const best = total(standings[0]?.slot ?? 0) || 1;
  return (
    <>
      <section class="final-hero">
        <p class="eyebrow">Fin du versus</p>
        <h1 class="hero-title final-title">
          {standings[0]?.name}
          <span class="hero-dot">.</span>
        </h1>
        <p class="hero-lead">
          a tenu les plaques <strong class="mono">{(total(standings[0]?.slot ?? 0) / 20).toFixed(1)} s</strong>, échos compris.
        </p>
      </section>
      <section class="panel standings" aria-labelledby="standings-title">
        <h2 id="standings-title" class="h4">
          Classement
        </h2>
        <ol class="standings-list">
          {standings.map((p, i) => (
            <li class={`standing ${p.id === view.you ? "is-you" : ""}`} style={{ ...accentVar(p.accent), "--i": i } as never}>
              <span class="rank mono">{i + 1}</span>
              <PlayerSeal name={p.name} accent={p.accent} size={36} />
              <div class="standing-body">
                <div class="standing-top">
                  <span class="standing-name">{p.name}</span>
                  <span class="standing-total mono">{(total(p.slot) / 20).toFixed(1)} s</span>
                </div>
                <div class="standing-bar echos-bar" aria-hidden="true">
                  <span class="bar-cash" style={{ width: `${(total(p.slot) / best) * 100}%` }} />
                </div>
                <span class="muted small mono">{view.roundPoints.map((r) => `${((r[p.slot] ?? 0) / 20).toFixed(1)} s`).join(" · ")}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
