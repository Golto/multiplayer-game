// Fin de partie : classement cumulé sur les manches, distinctions, détail manche par manche.

import { useEffect } from "preact/hooks";
import { totalPoints, type PuitsAction, type PuitsView } from "../../../../shared/games/puits";
import { PlayerSeal, Watermark, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";

interface Award {
  title: string;
  slot: number;
  detail: string;
  glyph: string;
}

export function Final({ view, send, onLeave }: { view: PuitsView; send: (a: PuitsAction) => void; onLeave: () => void }) {
  useEffect(() => {
    play("feedback.complete");
    const id = setTimeout(() => play("system.ready"), 1500);
    return () => clearTimeout(id);
  }, []);

  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const sum = (slot: number, key: "shards" | "kills") => view.results.reduce((s, r) => s + (r.scores[slot]?.[key] ?? 0), 0);
  const standings = view.players
    .map((p) => ({
      p,
      total: totalPoints(view, p.slot),
      shards: sum(p.slot, "shards"),
      kills: sum(p.slot, "kills"),
      survived: view.results.filter((r) => r.scores[p.slot]?.survived).length,
    }))
    .sort((a, b) => b.total - a.total || b.kills - a.kills);
  const best = standings[0]?.total || 1;
  const me = view.players.find((p) => p.id === view.you);

  const awards: Award[] = [];
  const top = <K extends "kills" | "shards" | "survived">(key: K) => [...standings].sort((a, b) => b[key] - a[key])[0];
  const hunter = top("kills");
  if (hunter && hunter.kills > 0) {
    awards.push({ title: "Horizon des événements", slot: hunter.p.slot, detail: `${hunter.kills} vaisseau${hunter.kills > 1 ? "x" : ""} envoyé${hunter.kills > 1 ? "s" : ""} au tapis`, glyph: "H" });
  }
  const gleaner = top("shards");
  if (gleaner && gleaner.shards > 0) {
    awards.push({ title: "Glaneur d'éclats", slot: gleaner.p.slot, detail: `${gleaner.shards} éclat${gleaner.shards > 1 ? "s" : ""} ramassé${gleaner.shards > 1 ? "s" : ""}`, glyph: "G" });
  }
  const survivor = top("survived");
  if (survivor && survivor.survived > 0) {
    awards.push({ title: "Orbite stable", slot: survivor.p.slot, detail: `en vol à la fin de ${survivor.survived} manche${survivor.survived > 1 ? "s" : ""} sur ${view.results.length}`, glyph: "O" });
  }

  return (
    <div class="page final puits-final">
      <Watermark />
      <header class="topbar">
        <Brand name="Puits" />
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
            l'emporte avec <strong class="mono">{standings[0]?.total ?? 0} points</strong> en {view.results.length} manches.
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
                      <span class="standing-total mono">{s.total} pts</span>
                    </div>
                    <div class="standing-bar puits-bar" aria-hidden="true">
                      <span class="bar-cash" style={{ width: `${(s.total / best) * 100}%` }} />
                    </div>
                    <span class="muted small mono">
                      {s.kills} élim. · {s.shards} éclat{s.shards > 1 ? "s" : ""} · {s.survived} survie{s.survived > 1 ? "s" : ""}
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
              {awards.length === 0 && <li class="muted small">Une partie bien calme : personne ne s'est distingué.</li>}
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
                <span role="columnheader">
                  Manche {r.round + 1} <span class="muted">· {r.turns} tours</span>
                </span>
              ))}
            </div>
            {standings.map((s) => (
              <div class="rounds-row" role="row">
                <span role="cell" class="trades-player">
                  <PlayerSeal name={s.p.name} accent={s.p.accent} size={22} /> {s.p.name}
                </span>
                {view.results.map((r) => {
                  const sc = r.scores[s.p.slot];
                  return (
                    <span role="cell" class="mono">
                      {sc ? `${sc.points} pts${sc.survived ? " ✦" : ""}` : "—"}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p class="muted small">✦ : en vol à la fin de la manche.</p>
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
