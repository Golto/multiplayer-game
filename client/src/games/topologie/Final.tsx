// Fin de partie : classement cumulé sur les trois surfaces, détail par manche, distinctions.

import { useEffect } from "preact/hooks";
import { SURFACES, type TopoAction, type TopoView } from "../../../../shared/games/topologie";
import { PlayerSeal, Watermark, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { SurfaceDiagram } from "./Diagram";

interface Award {
  title: string;
  slot: number;
  detail: string;
  glyph: string;
}

export function Final({ view, send, onLeave }: { view: TopoView; send: (a: TopoAction) => void; onLeave: () => void }) {
  useEffect(() => {
    play("feedback.complete");
    const id = setTimeout(() => play("system.ready"), 1500);
    return () => clearTimeout(id);
  }, []);

  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const share = (slot: number, r: (typeof view.results)[number]) => ((r.cells[slot] ?? 0) / r.total) * 100;
  const standings = view.players
    .map((p) => ({
      p,
      total: view.results.reduce((s, r) => s + share(p.slot, r), 0),
      kills: view.results.reduce((s, r) => s + (r.kills[p.slot] ?? 0), 0),
      deaths: view.results.reduce((s, r) => s + (r.deaths[p.slot] ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total);
  const best = standings[0]?.total || 1;
  const me = view.players.find((p) => p.id === view.you);

  const awards: Award[] = [];
  // La plus grande part de plateau tenue en une seule manche.
  let empire: { slot: number; share: number; surface: string } | null = null;
  for (const r of view.results) {
    for (const p of view.players) {
      const s = share(p.slot, r);
      if (!empire || s > empire.share) empire = { slot: p.slot, share: s, surface: SURFACES[r.surface].name };
    }
  }
  if (empire) {
    awards.push({ title: "Grand empire", slot: empire.slot, detail: `${empire.share.toFixed(1)} % du plateau en une manche (${empire.surface})`, glyph: "E" });
  }
  const cutter = [...standings].sort((a, b) => b.kills - a.kills)[0];
  if (cutter && cutter.kills > 0) awards.push({ title: "Coupeur de fils", slot: cutter.p.slot, detail: `${cutter.kills} traîne${cutter.kills > 1 ? "s" : ""} coupée${cutter.kills > 1 ? "s" : ""}`, glyph: "C" });
  const careful = [...standings].sort((a, b) => a.deaths - b.deaths)[0];
  if (careful && standings.length > 1) awards.push({ title: "Funambule", slot: careful.p.slot, detail: `${careful.deaths} chute${careful.deaths > 1 ? "s" : ""} en ${view.results.length} manches`, glyph: "F" });
  const reckless = [...standings].sort((a, b) => b.deaths - a.deaths)[0];
  if (reckless && reckless.deaths >= 3 && reckless.p.slot !== careful?.p.slot) {
    awards.push({ title: "Kamikaze", slot: reckless.p.slot, detail: `${reckless.deaths} chutes`, glyph: "K" });
  }

  return (
    <div class="page final topo-final">
      <Watermark />
      <header class="topbar">
        <Brand name="Topologie" />
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
          <p class="eyebrow">Fin de partie</p>
          <h1 class="hero-title final-title">
            {standings[0]?.p.name}
            <span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            règne sur <strong class="mono">{(standings[0]?.total ?? 0).toFixed(1)} %</strong> de territoire cumulé sur les {view.results.length}{" "}
            surfaces.
          </p>
        </section>

        <div class="final-grid">
          <section class="panel standings" aria-labelledby="standings-title">
            <h2 id="standings-title" class="h4">
              Classement
            </h2>
            <ol class="standings-list">
              {standings.map((s, i) => (
                <li class={`standing ${s.p.id === view.you ? "is-you" : ""}`} style={{ ...accentVar(s.p.accent), "--i": i } as never}>
                  <span class="rank mono">{i + 1}</span>
                  <PlayerSeal name={s.p.name} accent={s.p.accent} size={36} />
                  <div class="standing-body">
                    <div class="standing-top">
                      <span class="standing-name">{s.p.name}</span>
                      <span class="standing-total mono">{s.total.toFixed(1)} %</span>
                    </div>
                    <div class="standing-bar topo-bar" aria-hidden="true">
                      <span class="bar-cash" style={{ width: `${(s.total / best) * 100}%` }} />
                    </div>
                    <span class="muted small mono">
                      {s.kills} coupe{s.kills > 1 ? "s" : ""} · {s.deaths} chute{s.deaths > 1 ? "s" : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section class="panel awards" aria-labelledby="awards-title">
            <h2 id="awards-title" class="h4">
              Les distinctions
            </h2>
            <ul class="award-list">
              {awards.map((a, i) => (
                <li class="award" style={{ "--i": i } as never}>
                  <span class="medal" aria-hidden="true">
                    {a.glyph}
                  </span>
                  <div>
                    <span class="award-title">{a.title}</span>
                    <span class="award-player">{bySlot.get(a.slot)?.name}</span>
                    <span class="muted small">{a.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section class="panel" aria-labelledby="rounds-title">
          <h2 id="rounds-title" class="h4">
            Manche par manche
          </h2>
          <div class="rounds-table" role="table">
            <div class="rounds-row rounds-head" role="row">
              <span role="columnheader">Joueur</span>
              {view.results.map((r) => (
                <span role="columnheader" class="rounds-surface">
                  <SurfaceDiagram surface={r.surface} size={40} />
                  {SURFACES[r.surface].name}
                </span>
              ))}
            </div>
            {standings.map((s) => (
              <div class="rounds-row" role="row">
                <span role="cell" class="trades-player">
                  <PlayerSeal name={s.p.name} accent={s.p.accent} size={22} /> {s.p.name}
                </span>
                {view.results.map((r) => (
                  <span role="cell" class="mono">
                    {share(s.p.slot, r).toFixed(1)} %
                  </span>
                ))}
              </div>
            ))}
          </div>
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
