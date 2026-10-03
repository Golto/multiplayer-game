// Fin de partie : classement (le plus bas gagne) et détail manche par manche.

import { useEffect } from "preact/hooks";
import type { ZeroAction, ZeroView } from "../../../../shared/games/zero";
import { PlayerSeal, Watermark, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";

export function Final({ view, send, onLeave }: { view: ZeroView; send: (a: ZeroAction) => void; onLeave: () => void }) {
  useEffect(() => {
    play("feedback.complete");
    const id = setTimeout(() => play("system.ready"), 1500);
    return () => clearTimeout(id);
  }, []);
  const standings = [...view.players].sort((a, b) => a.total - b.total);
  const worst = Math.max(1, ...standings.map((p) => p.total));
  const me = view.players.find((p) => p.id === view.you);
  return (
    <div class="page final zero-final">
      <Watermark />
      <header class="topbar">
        <Brand name="Zéro" />
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
          <p class="eyebrow">Fin de partie · {view.results.length} manches</p>
          <h1 class="hero-title final-title">
            {standings[0]?.name}
            <span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            l'emporte avec <strong class="mono">{standings[0]?.total} points</strong>, le total le plus léger.
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
                    <span class="standing-total mono">{p.total} pts</span>
                  </div>
                  <div class="standing-bar zero-bar" aria-hidden="true">
                    <span class="bar-cash" style={{ width: `${Math.max(2, (p.total / worst) * 100)}%` }} />
                  </div>
                  <span class="muted small mono">
                    {view.results.map((r) => `${r.scores[p.slot]?.score ?? 0} (x=${r.x})`).join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <div class="final-actions">
          {me?.isHost ? (
            <button class="btn btn-primary btn-lg" type="button" data-sound="refresh.release" onClick={() => send({ t: "rematch" })}>
              Revanche, mêmes joueurs
              <Icon name="arrowRight" size={20} />
            </button>
          ) : (
            <p class="waiting">
              <span class="pulse-dot" aria-hidden="true" />
              L'hôte peut relancer une revanche.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
