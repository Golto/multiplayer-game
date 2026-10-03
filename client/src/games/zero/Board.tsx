// La table, pensée pour tenir sur un seul écran : les adversaires en bandeau, la pioche à côté de
// ta grille, les scores à droite. La taille des cartes se calcule d'après la fenêtre, la grille et
// le nombre de joueurs.

import { useEffect, useRef, useState } from "preact/hooks";
import { RULES, evaluate, format, type PublicCell, type ZeroAction, type ZeroPlayer, type ZeroView } from "../../../../shared/games/zero";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { Grid, Sized, ZCard } from "./cards";

interface Props {
  view: ZeroView;
  send: (action: ZeroAction) => void;
  onLeave: () => void;
}

const minus = (n: number) => (n < 0 ? `−${-n}` : String(n));

function useWindow() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/** Hauteur d'une grille de cartes de largeur w : rangées, espaces, ligne des colonnes. */
const gridH = (w: number, rows: number, leads: boolean) => rows * w * 1.4 + (rows - 1) * 6 + (leads ? 26 : 0);

/**
 * Tailles des cartes pour que tout tienne à l'écran : d'abord le bandeau des adversaires (une ou
 * deux lignes), puis ta grille avec ce qui reste, la pioche à sa gauche.
 */
function layoutSizes(vw: number, vh: number, rows: number, cols: number, others: number) {
  const compact = vw < 900 || vh < 560;
  if (compact) {
    const my = Math.max(44, Math.min(84, (vw - 48) / (cols + 0.4)));
    return { compact, opp: Math.max(26, Math.min(40, (vw - 48) / (cols + 0.5))), my, pile: Math.min(84, my), lines: others };
  }
  const W = vw - 260 - 64;
  const budget = vh * (others > 3 ? 0.34 : 0.28);
  let opp = 0;
  let lines = 1;
  for (const L of [1, 2]) {
    const perLine = Math.max(1, Math.ceil(others / L));
    const byW = (W - perLine * 30) / (perLine * (cols + 0.25));
    const byH = (budget / L - 44) / (rows * 1.4 + 0.1);
    const s = Math.min(byW, byH);
    if (s > opp + 2) [opp, lines] = [s, L];
  }
  opp = Math.max(18, Math.min(46, opp));
  const othersH = others ? lines * (gridH(opp, rows, false) + 46) : 0;
  const availH = vh - 58 - othersH - 70;
  const my = Math.max(40, Math.min(108, (availH - 26 - (rows - 1) * 6) / (rows * 1.4), (W - 260) / (cols + 0.3)));
  const pile = Math.max(48, Math.min(96, my * 0.9, (availH - 90) / 2.9));
  return { compact, opp, my, pile, lines };
}

export function Board({ view, send, onLeave }: Props) {
  const me = view.players.find((p) => p.id === view.you);
  const mySlot = me?.slot ?? 0;
  const { rows, cols } = view.config;
  const myCells = view.grids[mySlot] ?? [];
  const myTurn = view.phase === "play" && view.turn === mySlot;
  const turnPlayer = view.players.find((p) => p.slot === view.turn);
  const revealed = myCells.filter((c) => c.up && !c.removed).length;
  const others = view.players.filter((p) => p.slot !== mySlot);
  const { w: vw, h: vh } = useWindow();
  const size = layoutSizes(vw, vh, rows, cols, others.length);

  useEffect(() => window.scrollTo(0, 0), []);

  // Sons : ce qui vient de se passer, chez soi ou chez les autres.
  const lastKey = useRef("");
  useEffect(() => {
    const e = view.lastEvent;
    const key = JSON.stringify(e) + view.turn + view.step;
    if (!e || key === lastKey.current) return;
    lastKey.current = key;
    const mine = e.slot === mySlot;
    if (e.k === "draw") play("card.hover", { gain: mine ? 1 : 0.5 });
    else if (e.k === "swap") play("card.flip", { gain: mine ? 1 : 0.6 });
    else if (e.k === "flip") play("card.flip", { gain: mine ? 0.9 : 0.5 });
    else if (e.k === "discard") play("drag.drop", { gain: 0.6 });
    else if (e.k === "column") play("feedback.success", { gain: mine ? 1 : 0.6 });
    else if (e.k === "closed") play("feedback.notification");
  }, [view.lastEvent, view.turn, view.step]);
  useEffect(() => {
    if (myTurn && view.step === "draw") play("system.ready", { gain: 0.5 });
  }, [myTurn, view.round]);

  // Ce qu'on peut cliquer dans sa grille.
  const hint = (_: number, cell: PublicCell): "pick" | "flip" | null => {
    if (cell.removed) return null;
    if (view.phase === "setup") return !cell.up && revealed < RULES.revealAtStart ? "flip" : null;
    if (!myTurn) return null;
    if (view.step === "place") return "pick";
    if (view.step === "flip") return cell.up ? null : "flip";
    return null;
  };
  const onCell = (i: number) => {
    if (view.phase === "setup") {
      send({ t: "reveal", index: i });
      play("card.flip");
    } else if (view.step === "place") send({ t: "swap", index: i });
    else if (view.step === "flip") send({ t: "reveal", index: i });
  };
  const fresh = (slot: number) => {
    const e = view.lastEvent;
    return e && e.slot === slot && (e.k === "swap" || e.k === "flip") ? e.index : null;
  };

  const prompt = (() => {
    if (view.phase === "setup") {
      return revealed < RULES.revealAtStart
        ? `Retourne ${RULES.revealAtStart - revealed} carte${RULES.revealAtStart - revealed > 1 ? "s" : ""} de ta grille.`
        : "En attente des autres joueurs…";
    }
    if (!myTurn) return `${turnPlayer?.name ?? "…"} joue${view.closer !== null ? " son dernier tour" : ""}.`;
    if (view.step === "draw") return "À toi : pioche au paquet ou à la défausse.";
    if (view.step === "place") return view.handFrom === "deck" ? "Échange-la avec une de tes cartes, ou défausse-la." : "Échange-la avec une de tes cartes.";
    return "Retourne une de tes cartes cachées.";
  })();
  const closer = view.players.find((p) => p.slot === view.closer);

  // Ce que vaut ta grille (cartes visibles) selon le tirage de x.
  const visible = myCells.filter((c) => c.up && c.card).map((c) => c.card!);
  const hidden = myCells.filter((c) => !c.up && !c.removed).length;
  const valueAt = (x: number) => visible.reduce((s, p) => s + evaluate(p, x), 0);

  return (
    <div class={`page zero-board phase-${view.phase} ${size.compact ? "is-compact" : "is-fit"}`}>
      <header class="game-header zero-header">
        <Brand name="Zéro" compact />
        <div class="round-info">
          <span class="round-label">
            Manche <span class="mono">{view.round + 1}</span>
          </span>
          <span class="level-pill">
            {rows} × {cols} · degré ≤ {view.config.degree} · jusqu'à {view.config.target}
          </span>
        </div>
        <div class="header-actions">
          <span class="pill mono" title="Code du salon">
            {view.code}
          </span>
          <SoundToggle />
          <ThemeToggle />
          <button
            class="btn btn-ghost btn-icon"
            type="button"
            data-sound="nav.back"
            onClick={() => confirm("Quitter la partie ? Tu pourras revenir avec le même lien tant qu'elle dure.") && onLeave()}
            aria-label="Quitter la partie"
            title="Quitter"
          >
            <Icon name="xmark" size={20} />
          </button>
        </div>
      </header>

      <main class="zero-main">
        {others.length > 0 && (
          <section class="zero-others" aria-label="Les autres joueurs">
            {others.map((p) => (
              <article class={`zero-opponent ${view.turn === p.slot && view.phase === "play" ? "is-turn" : ""} ${p.connected ? "" : "is-away"}`} style={accentVar(p.accent)}>
                <header>
                  <PlayerSeal name={p.name} accent={p.accent} size={20} />
                  <span class="opp-name">{p.name}</span>
                  {view.closer === p.slot && <span class="closer-tag">a tout révélé</span>}
                  <span class="mono opp-total">{p.total}</span>
                </header>
                <Grid cells={view.grids[p.slot] ?? []} rows={rows} cols={cols} width={size.opp} fresh={fresh(p.slot)} />
              </article>
            ))}
          </section>
        )}

        <section class="zero-table">
          <div class="zero-piles" aria-label="Pioche et défausse">
            <div class={`zero-prompt ${myTurn || (view.phase === "setup" && revealed < RULES.revealAtStart) ? "is-mine" : ""}`} role="status">
              {view.closer !== null && view.phase === "play" && (
                <span class="last-turn">{closer?.slot === mySlot ? "Les autres jouent leur dernier tour" : `${closer?.name} a tout révélé : dernier tour !`}</span>
              )}
              <span>{prompt}</span>
            </div>
            <div class="piles-row">
              <button type="button" class="pile" disabled={!myTurn || view.step !== "draw"} data-sound="none" onClick={() => send({ t: "draw", from: "deck" })} aria-label={`Paquet, ${view.deckCount} cartes`}>
                <Sized width={size.pile}>
                  <ZCard cell={{ card: null, up: false, removed: false }} hint={myTurn && view.step === "draw" ? "pick" : null} />
                </Sized>
                <span class="pile-label">Paquet · {view.deckCount}</span>
              </button>
              <button
                type="button"
                class="pile"
                disabled={!myTurn || view.step !== "draw" || !view.discardTop}
                data-sound="none"
                onClick={() => send({ t: "draw", from: "discard" })}
                aria-label={view.discardTop ? `Défausse : ${format(view.discardTop)}` : "Défausse vide"}
              >
                <Sized width={size.pile}>
                  {view.discardTop ? (
                    <ZCard cell={{ card: view.discardTop, up: true, removed: false }} hint={myTurn && view.step === "draw" ? "pick" : null} />
                  ) : (
                    <div class="zcard is-empty" />
                  )}
                </Sized>
                <span class="pile-label">Défausse</span>
              </button>
            </div>
            <div class={`zhand ${view.hand ? "has-card" : ""}`} aria-live="polite">
              {view.hand ? (
                <>
                  <Sized width={size.pile}>
                    <ZCard cell={{ card: view.hand, up: true, removed: false }} fresh />
                  </Sized>
                  <div class="zhand-side">
                    <span class="pile-label">{view.turn === mySlot ? "En main" : `Pioché par ${turnPlayer?.name}`}</span>
                    <span class="pile-label">{view.handFrom === "deck" ? "du paquet" : "de la défausse"}</span>
                    {myTurn && view.handFrom === "deck" && (
                      <button class="btn btn-outline btn-sm" type="button" data-sound="none" onClick={() => send({ t: "discard" })}>
                        Défausser
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <span class="zhand-empty muted small">La carte piochée apparaît ici.</span>
              )}
            </div>
          </div>

          <section class={`zero-mine ${myTurn ? "is-turn" : ""}`} aria-label="Ta grille" style={me ? accentVar(me.accent) : undefined}>
            <header>
              <PlayerSeal name={me?.name ?? "?"} accent={me?.accent ?? "amethyst"} size={24} />
              <span class="opp-name">Ta grille</span>
              <span class="mono opp-total">{me?.total ?? 0} pts</span>
            </header>
            <Grid cells={myCells} rows={rows} cols={cols} width={size.my} onCell={onCell} hint={hint} fresh={fresh(mySlot)} showLeads />
          </section>
        </section>

        <aside class="zero-side small">
          <section class="panel side-block">
            <h2 class="h6">Ta grille vaut</h2>
            <ul class="x-values">
              {RULES.xValues.map((x) => (
                <li>
                  <span class="mono x-label">x = {minus(x)}</span>
                  <span class="mono x-value">
                    {minus(valueAt(x))}
                    {hidden ? <span class="muted"> + {hidden} cachée{hidden > 1 ? "s" : ""}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p class="muted">Le dé tire x à la fin de la manche ; chaque carte vaut alors P(x).</p>
          </section>
          <section class="panel side-block">
            <h2 class="h6">Scores</h2>
            <ol class="zero-totals">
              {[...view.players]
                .sort((a, b) => a.total - b.total)
                .map((p) => (
                  <li style={accentVar(p.accent)} class={p.slot === mySlot ? "is-you" : ""}>
                    <PlayerSeal name={p.name} accent={p.accent} size={20} />
                    <span class="score-name">{p.name}</span>
                    <span class="mono">{p.total}</span>
                  </li>
                ))}
            </ol>
          </section>
          <p class="muted side-rule">
            Une colonne s'efface quand ses cartes ont le même <strong>terme dominant</strong>. Le chiffre en coin est la valeur en x = 1 ; en bas,
            les valeurs pour x = −1, 0 et 1.
          </p>
        </aside>
      </main>

      {view.phase === "reveal" && <RoundEnd view={view} send={send} width={Math.min(40, size.opp)} />}
    </div>
  );
}

function RoundEnd({ view, send, width }: { view: ZeroView; send: (a: ZeroAction) => void; width: number }) {
  const result = view.results[view.results.length - 1];
  const me = view.players.find((p) => p.id === view.you);
  useEffect(() => play("feedback.complete"), []);
  if (!result) return null;
  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const rows = Object.entries(result.scores)
    .map(([slot, s]) => ({ p: bySlot.get(Number(slot)) as ZeroPlayer, s }))
    .filter((r) => r.p)
    .sort((a, b) => a.s.score - b.s.score);
  const over = view.players.some((p) => p.total >= view.config.target);
  const ready = view.players.filter((p) => p.ready).length;
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="round-title">
      <div class="overlay-card zero-round">
        <div class="round-head">
          <div>
            <p class="eyebrow">Fin de la manche {result.round + 1}</p>
            <h2 id="round-title" class="h3">
              {over ? "La partie est jouée" : "Le décompte"}
            </h2>
          </div>
          <div class="x-die" aria-label={`Le dé a tiré x = ${result.x}`}>
            <span class="muted small">le dé tire</span>
            <span class="mono x-big">x = {minus(result.x)}</span>
          </div>
        </div>
        <ol class="zero-round-list">
          {rows.map(({ p, s }, i) => (
            <li style={{ ...accentVar(p.accent), "--i": i } as never} class={p.id === view.you ? "is-you" : ""}>
              <div class="round-who">
                <PlayerSeal name={p.name} accent={p.accent} size={28} />
                <span class="results-name">{p.name}</span>
                <span class="round-detail muted small mono">
                  Σ P({minus(result.x)}) = {minus(s.cards)}
                  {s.doubled ? " · ×2 : a clos sans être le plus bas" : ""}
                </span>
                <span class="round-score mono">{s.score > 0 ? `+${s.score}` : minus(s.score)}</span>
                <span class="round-total mono">{p.total}</span>
              </div>
              <Grid cells={view.grids[p.slot] ?? []} rows={view.config.rows} cols={view.config.cols} width={width} />
            </li>
          ))}
        </ol>
        <footer class="report-foot">
          <span class="muted small">
            {ready}/{view.players.filter((p) => p.connected).length} prêts
          </span>
          <button class="btn btn-primary btn-lg" type="button" disabled={me?.ready} onClick={() => send({ t: "ready" })}>
            {me?.ready ? "En attente des autres…" : over ? "Voir le classement" : "Manche suivante"}
            {!me?.ready && <Icon name="arrowRight" size={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}

