// La table : les grilles des adversaires, la pioche et la défausse, ta grille, et le décompte de fin
// de manche.

import { useEffect, useRef } from "preact/hooks";
import { RULES, format, type PublicCell, type ZeroAction, type ZeroPlayer, type ZeroView } from "../../../../shared/games/zero";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { Grid, ZCard } from "./cards";

interface Props {
  view: ZeroView;
  send: (action: ZeroAction) => void;
  onLeave: () => void;
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
    else if (e.k === "column") play(e.fate === "annulation" ? "feedback.success" : "checkbox.check");
    else if (e.k === "closed") play("feedback.notification");
  }, [view.lastEvent, view.turn, view.step]);
  useEffect(() => {
    if (myTurn && view.step === "draw") play("system.ready", { gain: 0.5 });
  }, [myTurn, view.round]);

  // Ce qu'on peut cliquer dans sa grille.
  const hint = (i: number, cell: PublicCell): "pick" | "flip" | null => {
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
    if (view.step === "draw") return "Pioche une carte : paquet ou défausse.";
    if (view.step === "place") {
      return view.handFrom === "deck" ? "Échange-la avec une carte de ta grille, ou défausse-la." : "Échange-la avec une carte de ta grille.";
    }
    return "Retourne une de tes cartes cachées.";
  })();

  const closer = view.players.find((p) => p.slot === view.closer);

  return (
    <div class={`page zero-board phase-${view.phase}`}>
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
        <section class="zero-others" aria-label="Les autres joueurs">
          {others.map((p) => (
            <article class={`zero-opponent ${view.turn === p.slot && view.phase === "play" ? "is-turn" : ""} ${p.connected ? "" : "is-away"}`} style={accentVar(p.accent)}>
              <header>
                <PlayerSeal name={p.name} accent={p.accent} size={24} />
                <span class="opp-name">{p.name}</span>
                {view.closer === p.slot && <span class="closer-tag">a tout révélé</span>}
                <span class="mono opp-total">{p.total} pts</span>
              </header>
              <Grid cells={view.grids[p.slot] ?? []} rows={rows} cols={cols} size="sm" fresh={fresh(p.slot)} />
            </article>
          ))}
        </section>

        <section class="zero-center" aria-label="Pioche et défausse">
          <div class={`zero-prompt ${myTurn || (view.phase === "setup" && revealed < RULES.revealAtStart) ? "is-mine" : ""}`} role="status">
            {view.closer !== null && view.phase === "play" && (
              <span class="last-turn">
                {closer?.slot === mySlot ? "Tu as tout révélé : les autres jouent leur dernier tour." : `${closer?.name} a tout révélé : dernier tour !`}
              </span>
            )}
            <span>{prompt}</span>
          </div>
          <div class="zero-piles">
            <button
              type="button"
              class="pile"
              disabled={!myTurn || view.step !== "draw"}
              data-sound="none"
              onClick={() => send({ t: "draw", from: "deck" })}
              aria-label={`Paquet, ${view.deckCount} cartes`}
            >
              <ZCard cell={{ card: null, up: false, removed: false }} size="lg" hint={myTurn && view.step === "draw" ? "pick" : null} />
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
              {view.discardTop ? (
                <ZCard cell={{ card: view.discardTop, up: true, removed: false }} size="lg" hint={myTurn && view.step === "draw" ? "pick" : null} />
              ) : (
                <div class="zcard zcard-lg is-empty" />
              )}
              <span class="pile-label">Défausse</span>
            </button>
            <div class={`zhand ${view.hand ? "has-card" : ""}`} aria-live="polite">
              {view.hand ? (
                <>
                  <ZCard cell={{ card: view.hand, up: true, removed: false }} size="lg" fresh />
                  <span class="pile-label">
                    {view.turn === mySlot ? "En main" : `Pioché par ${turnPlayer?.name}`} · {view.handFrom === "deck" ? "du paquet" : "de la défausse"}
                  </span>
                  {myTurn && view.handFrom === "deck" && (
                    <button class="btn btn-outline btn-sm" type="button" data-sound="none" onClick={() => send({ t: "discard" })}>
                      Défausser et retourner
                    </button>
                  )}
                </>
              ) : (
                <span class="zhand-empty muted small">La carte piochée apparaît ici.</span>
              )}
            </div>
          </div>
        </section>

        <section class={`zero-mine ${myTurn ? "is-turn" : ""}`} aria-label="Ta grille" style={me ? accentVar(me.accent) : undefined}>
          <header>
            <PlayerSeal name={me?.name ?? "?"} accent={me?.accent ?? "amethyst"} size={28} />
            <span class="opp-name">Ta grille</span>
            {(view.bonus[mySlot] ?? 0) < 0 && <span class="bonus-tag mono">annulations {view.bonus[mySlot]}</span>}
            <span class="mono opp-total">{me?.total ?? 0} pts</span>
          </header>
          <Grid cells={myCells} rows={rows} cols={cols} size="md" onCell={onCell} hint={hint} fresh={fresh(mySlot)} />
          <p class="muted small zero-rule">
            Sous chaque colonne : la somme des cartes visibles et son poids. Une colonne s'efface si ses cartes sont identiques, ou si elles
            s'annulent (bonus de −{Math.abs(RULES.cancelBonus)} par carte).
          </p>
        </section>

        <aside class="zero-side panel small">
          <h2 class="h6">Scores</h2>
          <ol class="zero-totals">
            {[...view.players]
              .sort((a, b) => a.total - b.total)
              .map((p) => (
                <li style={accentVar(p.accent)} class={p.slot === mySlot ? "is-you" : ""}>
                  <PlayerSeal name={p.name} accent={p.accent} size={22} />
                  <span class="score-name">{p.name}</span>
                  <span class="mono">{p.total}</span>
                </li>
              ))}
          </ol>
          <p class="muted">
            Poids d'un polynôme : la somme des valeurs absolues de ses coefficients. Une colonne compte le poids de sa <em>somme</em>.
          </p>
        </aside>
      </main>

      {view.phase === "reveal" && <RoundEnd view={view} send={send} />}
    </div>
  );
}

function RoundEnd({ view, send }: { view: ZeroView; send: (a: ZeroAction) => void }) {
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
        <p class="eyebrow">Fin de la manche {result.round + 1}</p>
        <h2 id="round-title" class="h3">
          {over ? "La partie est jouée" : "Le décompte"}
        </h2>
        <ol class="zero-round-list">
          {rows.map(({ p, s }, i) => (
            <li style={{ ...accentVar(p.accent), "--i": i } as never} class={p.id === view.you ? "is-you" : ""}>
              <div class="round-who">
                <PlayerSeal name={p.name} accent={p.accent} size={30} />
                <span class="results-name">{p.name}</span>
                <span class="round-detail muted small mono">
                  colonnes {s.columns}
                  {s.bonus ? ` · annulations ${s.bonus}` : ""}
                  {s.doubled ? " · ×2 (a clos sans être le plus bas)" : ""}
                </span>
                <span class="round-score mono">{s.score > 0 ? `+${s.score}` : s.score}</span>
                <span class="round-total mono">{p.total}</span>
              </div>
              <Grid cells={view.grids[p.slot] ?? []} rows={view.config.rows} cols={view.config.cols} size="sm" />
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
