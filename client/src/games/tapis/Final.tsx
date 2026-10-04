// Fin de partie : le classement, du vainqueur au premier éliminé, avec les jetons restants.

import { useEffect } from "preact/hooks";
import { RULES, type TapisAction, type TapisView } from "../../../../shared/games/tapis";
import { PlayerSeal, Watermark, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { fmt } from "./cards";

export function Final({ view, send, onLeave }: { view: TapisView; send: (a: TapisAction) => void; onLeave: () => void }) {
  useEffect(() => {
    play("feedback.complete");
    const id = setTimeout(() => play("system.ready"), 1500);
    return () => clearTimeout(id);
  }, []);
  const standings = [...view.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const top = Math.max(1, ...standings.map((p) => p.stack));
  const winner = standings[0];
  const me = view.players.find((p) => p.id === view.you);
  const lastStanding = standings.filter((p) => p.stack > 0).length === 1;
  return (
    <div class="page final tapis-final">
      <Watermark />
      <header class="topbar">
        <Brand name="Tapis" />
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
          <button class="btn btn-ghost" type="button" data-sound="nav.back" onClick={onLeave}>
            <Icon name="arrowLeft" size={16} /> Quitter
          </button>
        </div>
      </header>
      <main class="final-main">
        <section class="final-hero">
          <p class="eyebrow">Fin de partie · {view.hand + 1} donnes</p>
          <h1 class="hero-title final-title">
            {winner?.name}
            <span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            {lastStanding ? "rafle tous les jetons de la table" : "termine avec le plus gros tapis"} :{" "}
            <strong class="mono">{fmt(winner?.stack ?? 0)}</strong> jetons.
          </p>
        </section>
        <section class="panel standings" aria-labelledby="standings-title">
          <h2 id="standings-title" class="h4">
            Classement
          </h2>
          <ol class="standings-list">
            {standings.map((p, i) => (
              <li class={`standing ${p.id === view.you ? "is-you" : ""}`} style={{ ...accentVar(p.accent), "--i": i } as never}>
                <span class="rank mono">{p.place ?? i + 1}</span>
                <PlayerSeal name={p.name} accent={p.accent} size={36} />
                <div class="standing-body">
                  <div class="standing-top">
                    <span class="standing-name">{p.name}</span>
                    <span class="standing-total mono">{fmt(p.stack)}</span>
                  </div>
                  <div class="standing-bar tapis-bar" aria-hidden="true">
                    <span class="bar-cash" style={{ width: `${p.stack > 0 ? Math.max(1, (p.stack / top) * 100) : 0}%` }} />
                  </div>
                  <span class="muted small">
                    {p.stack > 0
                      ? `${p.stack >= RULES.stack ? "+" : "−"}${fmt(Math.abs(p.stack - RULES.stack))} par rapport au départ`
                      : "éliminé"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <div class="final-actions">
          {me?.isHost ? (
            <button class="btn btn-primary btn-lg" type="button" data-sound="refresh.release" onClick={() => send({ t: "rematch" })}>
              Nouvelle partie, même table
              <Icon name="arrowRight" size={20} />
            </button>
          ) : (
            <p class="waiting">
              <span class="pulse-dot" aria-hidden="true" />
              L'hôte peut relancer une partie.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
