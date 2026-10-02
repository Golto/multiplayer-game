// Fin de partie : la carte dressée face au vrai territoire, zone par zone, et quelques distinctions.

import { useEffect } from "preact/hooks";
import { rating, zoneCells, zoneScore, type CartoAction, type CartoView } from "../../../../shared/games/cartographes";
import { PlayerSeal, Watermark, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { MapGrid } from "./MapGrid";

interface Award {
  title: string;
  who: string;
  detail: string;
  glyph: string;
}

export function Final({ view, send, onLeave }: { view: CartoView; send: (a: CartoAction) => void; onLeave: () => void }) {
  useEffect(() => {
    play("feedback.complete");
    const id = setTimeout(() => play("system.ready"), 1500);
    return () => clearTimeout(id);
  }, []);

  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const played = view.zones.filter((z) => !z.charted);
  const rows = played.map((z) => ({ z, ...zoneScore(z, view.cols, view.truth, view.painted) })).sort((a, b) => b.right - a.right);
  const right = rows.reduce((s, r) => s + r.right, 0);
  const total = rows.reduce((s, r) => s + r.total, 0) || 1;
  const share = right / total;
  const verdict = rating(share);
  const me = view.players.find((p) => p.id === view.you);

  // Cases fausses (ou laissées vierges) sur la carte dressée.
  const marks = new Map<number, "ok" | "ko">();
  for (const z of played) for (const i of zoneCells(z, view.cols)) marks.set(i, view.painted[i] === view.truth[i] ? "ok" : "ko");

  const awards: Award[] = [];
  const best = rows[0];
  if (best && best.right > 0) {
    const a = bySlot.get(best.z.viewer);
    const b = bySlot.get(best.z.painter);
    awards.push({ title: "Duo de choc", who: `${a?.name} → ${b?.name}`, detail: `zone ${best.z.id} : ${best.right}/${best.total} cases justes`, glyph: "D" });
  }
  const talk = view.players.map((p) => ({ p, n: view.spoken[p.slot] ?? 0 })).sort((a, b) => b.n - a.n);
  const chatty = talk[0];
  if (chatty && chatty.n > 0) awards.push({ title: "Plume intarissable", who: chatty.p.name, detail: `${chatty.n} pictogrammes envoyés`, glyph: "P" });
  // Le plus efficace : la meilleure zone décrite avec le moins de mots.
  const terse = played
    .map((z) => ({ z, n: view.spoken[z.viewer] ?? 0, s: zoneScore(z, view.cols, view.truth, view.painted) }))
    .filter((x) => x.n > 0 && x.s.right / x.s.total >= 0.6)
    .sort((a, b) => a.n - b.n)[0];
  if (terse && terse.z.viewer !== chatty?.p.slot) {
    awards.push({ title: "Économie de moyens", who: bySlot.get(terse.z.viewer)?.name ?? "", detail: `zone ${terse.z.id} à ${Math.round((terse.s.right / terse.s.total) * 100)} % avec ${terse.n} pictogrammes`, glyph: "É" });
  }

  return (
    <div class="page final carto-final">
      <Watermark />
      <header class="topbar">
        <Brand name="Cartographes" />
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
          <p class="eyebrow">
            Fin de l'expédition · {view.turn} tour{view.turn > 1 ? "s" : ""}
          </p>
          <h1 class="hero-title final-title">
            {verdict.title}
            <span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            <strong class="mono">{Math.round(share * 100)} %</strong> de cases justes ({right}/{total}). {verdict.line}
          </p>
        </section>

        <section class="panel reveal-maps" aria-label="Les deux cartes">
          <figure>
            <figcaption class="eyebrow">La carte dressée</figcaption>
            <MapGrid cols={view.cols} rows={view.rows} cells={view.painted} zones={view.zones} marks={marks} label="La carte dressée" class="final-map" />
          </figure>
          <figure>
            <figcaption class="eyebrow">Le vrai territoire</figcaption>
            <MapGrid cols={view.cols} rows={view.rows} cells={view.truth} zones={view.zones} label="Le vrai territoire" class="final-map" />
          </figure>
        </section>

        <div class="final-grid">
          <section class="panel standings" aria-labelledby="zones-title">
            <h2 id="zones-title" class="h4">
              Zone par zone
            </h2>
            <ol class="standings-list">
              {rows.map((r, i) => {
                const a = bySlot.get(r.z.viewer);
                const b = bySlot.get(r.z.painter);
                return (
                  <li class="standing" style={{ ...(a ? accentVar(a.accent) : {}), "--i": i } as never}>
                    <span class="rank mono">{r.z.id}</span>
                    <span class="duo">
                      <PlayerSeal name={a?.name ?? "?"} accent={a?.accent ?? "amethyst"} size={30} />
                      <PlayerSeal name={b?.name ?? "?"} accent={b?.accent ?? "amethyst"} size={30} />
                    </span>
                    <div class="standing-body">
                      <div class="standing-top">
                        <span class="standing-name">
                          {a?.name} <span class="muted">→</span> {b?.name}
                        </span>
                        <span class="standing-total mono">
                          {r.right}/{r.total}
                        </span>
                      </div>
                      <div class="standing-bar carto-bar" aria-hidden="true">
                        <span class="bar-cash" style={{ width: `${(r.right / r.total) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
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
                    <span class="award-player">{a.who}</span>
                    <span class="muted small">{a.detail}</span>
                  </div>
                </li>
              ))}
              {awards.length === 0 && <li class="muted small">Une expédition silencieuse : personne ne s'est distingué.</li>}
            </ul>
          </section>
        </div>

        <div class="final-actions">
          {me?.isHost ? (
            <button class="btn btn-primary btn-lg" type="button" data-sound="refresh.release" onClick={() => send({ t: "rematch" })}>
              Nouvelle expédition
              <Icon name="arrowRight" size={20} />
            </button>
          ) : (
            <p class="waiting">
              <span class="pulse-dot" aria-hidden="true" />
              L'hôte peut lancer une nouvelle expédition.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
