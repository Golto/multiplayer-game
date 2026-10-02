// L'arène : planification (on vise, on voit la trajectoire prévue, on valide), puis résolution
// (chaque client rejoue la simulation du tour), scores et écran entre deux manches.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  RULES,
  Sim,
  predict,
  runTurn,
  totalPoints,
  type Placement,
  type PuitsAction,
  type PuitsPlayer,
  type PuitsView,
  type RoundScore,
  type SimEvent,
  type WellKind,
} from "../../../../shared/games/puits";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { ArenaRenderer, placeable, type Scene } from "./render";

interface Props {
  view: PuitsView;
  send: (action: PuitsAction) => void;
  onLeave: () => void;
}

/** Longueur des traînées pendant la résolution, en pas. */
const TRAIL = 70;

interface Playback {
  key: string;
  sim: Sim;
  startedAt: number;
  /** Tous les événements du tour, connus d'avance : utile pour différer les points. */
  events: SimEvent[];
  trails: Map<number, number[]>;
}

export function Arena({ view, send, onLeave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<ArenaRenderer | null>(null);
  const playback = useRef<Playback | null>(null);
  const previewDirty = useRef(true);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const [tentative, setTentative] = useState<{ x: number; y: number } | null>(null);
  const [kind, setKind] = useState<WellKind>("puits");
  const [playedStep, setPlayedStep] = useState(0);
  const clockOffset = useMemo(() => view.serverNow - Date.now(), [view]);
  const [now, setNow] = useState(Date.now() + clockOffset);

  const me = view.players.find((p) => p.id === view.you);
  const mySlot = me?.slot ?? 0;
  const accents = useMemo(() => new Map(view.players.map((p) => [p.slot, p.accent])), [view.players]);
  const bySlot = useMemo(() => new Map(view.players.map((p) => [p.slot, p])), [view.players]);
  const locked = view.phase === "plan" ? view.placements.find((p) => p.slot === mySlot) : undefined;
  const turnKey = `${view.round}-${view.turn}`;

  // En arrivant de la salle d'attente, la page peut être défilée : sur téléphone, l'arène serait cachée.
  useEffect(() => window.scrollTo(0, 0), []);

  // Nouveau tour de planification : on oublie la visée précédente.
  useEffect(() => {
    if (view.phase === "plan") {
      setTentative(null);
      play("system.ready", { gain: 0.6 });
    }
  }, [turnKey, view.phase === "plan"]);

  // La scène suit la vue du serveur ; la résolution démarre une relecture locale du tour.
  useEffect(() => {
    if (view.phase === "resolve") {
      if (playback.current?.key !== turnKey) {
        const sim = new Sim(view.sim, view.placements);
        const trails = new Map(sim.state.ships.filter((s) => s.alive).map((s) => [s.slot, [s.x, s.y]]));
        playback.current = { key: turnKey, sim, startedAt: performance.now(), events: runTurn(view.sim, view.placements).events, trails };
        setPlayedStep(0);
        for (const p of view.placements) renderer.current?.effect("drop", p.x, p.y, p.slot);
        play("system.start");
      }
    } else {
      playback.current = null;
    }
    previewDirty.current = true;
  }, [view, turnKey]);

  // Pose affichée : celle validée, sinon celle qu'on vise.
  const pending: Scene["pending"] = locked ? { ...locked, locked: true } : tentative ? { slot: mySlot, ...tentative, kind, locked: false } : null;
  useEffect(() => {
    previewDirty.current = true;
  }, [tentative?.x, tentative?.y, kind, locked?.x, locked?.y]);

  // Canvas : création, taille, boucle d'animation.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const r = new ArenaRenderer(canvas);
    renderer.current = r;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) r.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(wrap);
    let frame = requestAnimationFrame(function loop(t) {
      tick(t);
      r.draw(t);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.current = null;
    };
  }, []);

  // Ce que la boucle d'animation lit à chaque image.
  const live = useRef({ view, pending, mySlot, accents });
  live.current = { view, pending, mySlot, accents };

  function tick(t: number) {
    const r = renderer.current;
    if (!r) return;
    const { view: v, pending: pend, mySlot: slot, accents: acc } = live.current;
    const pb = playback.current;
    if (v.phase === "resolve" && pb) {
      // On rattrape le temps écoulé, pas de 1/60 s par pas de 1/60 s.
      const target = Math.min(RULES.steps, Math.floor(((t - pb.startedAt) / 1000) * 60));
      let fired = false;
      while (pb.sim.step < target && !pb.sim.done) {
        const events = pb.sim.advance();
        for (const s of pb.sim.state.ships) {
          if (!s.alive) continue;
          const trail = pb.trails.get(s.slot);
          if (!trail) continue;
          trail.push(s.x, s.y);
          if (trail.length > TRAIL * 2) trail.splice(0, 2);
        }
        for (const e of events) {
          fired = true;
          onEvent(e, slot);
        }
      }
      if (fired || pb.sim.done) setPlayedStep(pb.sim.done ? RULES.steps : pb.sim.step);
      r.scene = { sim: pb.sim.state, mySlot: slot, accents: acc, paths: null, pending: null, hover: null, trails: pb.trails, aged: true };
      return;
    }
    const scene: Scene = { sim: v.sim, mySlot: slot, accents: acc, paths: r.scene?.paths ?? null, pending: null, hover: null, trails: null, aged: false };
    if (v.phase === "plan") {
      scene.pending = pend;
      const h = hover.current;
      if (!pend && h && placeable(h.x, h.y)) scene.hover = { slot, x: h.x, y: h.y, kind: kindRef.current };
      if (previewDirty.current) {
        previewDirty.current = false;
        const extra: Placement[] = pend ? [pend] : scene.hover ? [scene.hover] : [];
        scene.paths = predict(v.sim, extra, 3);
      }
    } else {
      scene.paths = null;
    }
    r.scene = scene;
  }

  function onEvent(e: SimEvent, slot: number) {
    const r = renderer.current;
    if (e.k === "shard") {
      r?.effect("shard", e.x, e.y, e.slot);
      play(e.slot === slot ? "feedback.success" : "chip.select", { gain: e.slot === slot ? 0.8 : 0.4 });
    } else if (e.k === "bump") {
      r?.effect("bump", e.x, e.y, e.a);
      play("card.hover", { gain: 0.9, pitch: -3 });
    } else if (e.k === "death") {
      r?.effect("death", e.x, e.y, e.slot);
      if (e.slot === slot) play("feedback.error");
      else if (e.by === slot) play("system.lock");
      else play("chip.deselect", { gain: 0.6 });
    }
  }

  const kindRef = useRef(kind);
  kindRef.current = kind;

  // Pointeur : survol (aperçu), clic ou glissé pour viser.
  const aim = (e: PointerEvent, commit: boolean) => {
    const r = renderer.current;
    if (!r || view.phase !== "plan" || locked) return;
    const w = r.toWorld(e.clientX, e.clientY);
    const pt = { x: Math.round(w.x), y: Math.round(w.y) };
    hover.current = pt;
    previewDirty.current = true;
    if (commit) {
      if (placeable(pt.x, pt.y)) setTentative(pt);
      else if (e.type === "pointerdown") play("button.blocked");
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    if (view.phase !== "plan" || locked) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    aim(e, true);
    play("stepper.increment", { gain: 0.5 });
  };
  const onPointerMove = (e: PointerEvent) => aim(e, dragging.current);
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onPointerLeave = () => {
    hover.current = null;
    previewDirty.current = true;
  };

  const validate = () => {
    if (!tentative || locked) return;
    send({ t: "place", x: tentative.x, y: tentative.y, kind });
    play("press.commit");
  };
  const pass = () => {
    if (locked || me?.locked) return;
    send({ t: "pass" });
    play("toggle.off");
  };

  // Clavier : R ou Espace change de type, Entrée valide, Échap efface la visée.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || view.phase !== "plan") return;
      if (e.key === "r" || e.key === "R" || e.key === " ") {
        e.preventDefault();
        setKind((k) => (k === "puits" ? "repulseur" : "puits"));
        play("toggle.on", { gain: 0.6 });
      } else if (e.key === "Enter") {
        validate();
      } else if (e.key === "Escape") {
        setTentative(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Horloge.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 250);
    return () => clearInterval(id);
  }, [clockOffset]);
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : 0;
  const myLocked = !!me?.locked;
  useEffect(() => {
    if (view.phase === "plan" && !myLocked && left > 0 && left <= 5) play("slider.tick", { pitch: (5 - left) * 2 });
  }, [left]);
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current === view.phase) return;
    prevPhase.current = view.phase;
    if (view.phase === "intermission") play("feedback.complete");
  }, [view.phase]);

  // Points montrés : pendant la résolution, ceux des événements pas encore joués sont retenus.
  const scores = useMemo(() => {
    const out = new Map<number, RoundScore>();
    for (const p of view.players) out.set(p.slot, { ...(view.scores[p.slot] ?? { shards: 0, kills: 0, survived: false, points: 0 }) });
    const pb = playback.current;
    if (view.phase === "resolve" && pb) {
      for (const e of pb.events) {
        if (e.step < playedStep) continue;
        if (e.k === "shard") {
          const s = out.get(e.slot);
          if (s) (s.shards -= 1), (s.points -= RULES.points.shard);
        } else if (e.k === "death" && e.by) {
          const s = out.get(e.by);
          if (s) (s.kills -= 1), (s.points -= RULES.points.kill);
        }
      }
    }
    return out;
  }, [view, playedStep]);
  const doneBefore = (slot: number) => view.results.reduce((s, r) => s + (r.scores[slot]?.points ?? 0), 0);
  const total = (slot: number) =>
    view.phase === "plan" || view.phase === "resolve" ? doneBefore(slot) + (scores.get(slot)?.points ?? 0) : totalPoints(view, slot);

  // Vaisseaux encore en vol, tels qu'on les voit (la relecture peut être en retard sur le serveur).
  const shownShips = playback.current && view.phase === "resolve" ? playback.current.sim.state.ships : view.sim.ships;
  const alive = new Map(shownShips.map((s) => [s.slot, s.alive]));
  const myShipAlive = alive.get(mySlot) ?? false;
  const ranking = [...view.players].sort((a, b) => total(b.slot) - total(a.slot));
  const lockedCount = view.players.filter((p) => p.locked).length;
  const active = view.players.filter((p) => p.connected).length;

  return (
    <div class={`page puits-arena phase-${view.phase}`}>
      <header class="game-header puits-header">
        <Brand name="Puits" compact />
        <div class="round-info">
          <span class="round-label">
            Manche <span class="mono">{view.round + 1}</span>
            <span class="muted">/{view.rounds}</span>
          </span>
          <span class="round-label">
            Tour <span class="mono">{Math.min(view.turn + 1, view.maxTurns)}</span>
            <span class="muted">/{view.maxTurns}</span>
          </span>
          <span class={`phase-pill ${view.phase}`}>{view.phase === "resolve" ? "La physique se joue" : view.phase === "plan" ? "Planification" : "Fin de manche"}</span>
        </div>
        <div class={`puits-clock mono ${view.phase === "plan" && left <= 5 ? "is-urgent" : ""}`} role="timer" aria-label={`${left} secondes`}>
          {view.phase === "plan" ? `0:${String(left).padStart(2, "0")}` : "—"}
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
            onClick={() => {
              if (confirm("Quitter la partie ? Tu pourras revenir avec le même lien tant qu'elle dure.")) onLeave();
            }}
            aria-label="Quitter la partie"
            title="Quitter"
          >
            <Icon name="xmark" size={20} />
          </button>
        </div>
      </header>

      <main class="puits-grid">
        <section class="puits-stage" aria-label="L'arène">
          <div class="puits-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              class={`puits-canvas ${view.phase === "plan" && !locked ? "is-aiming" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
            />
          </div>
        </section>

        <aside class="puits-side">
          {view.phase === "plan" && (
            <section class="panel puits-controls" aria-labelledby="controls-title">
              <p class="eyebrow">Tour {view.turn + 1}</p>
              <h2 id="controls-title" class="h5">
                {locked || myLocked ? "Pose validée" : "Pose ton puits"}
              </h2>
              {locked || myLocked ? (
                <p class="waiting">
                  <span class="pulse-dot" aria-hidden="true" />
                  {lockedCount}/{active} ont posé. La physique se lance quand tout le monde est prêt.
                </p>
              ) : (
                <>
                  <div class="kind-switch" role="radiogroup" aria-label="Type de puits">
                    <button type="button" role="radio" aria-checked={kind === "puits"} class={`kind ${kind === "puits" ? "is-on" : ""}`} data-sound="chip.select" onClick={() => setKind("puits")}>
                      <KindGlyph kind="puits" />
                      <span>
                        <strong>Puits</strong>
                        <span class="muted small">attire</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={kind === "repulseur"}
                      class={`kind ${kind === "repulseur" ? "is-on" : ""}`}
                      data-sound="chip.select"
                      onClick={() => setKind("repulseur")}
                    >
                      <KindGlyph kind="repulseur" />
                      <span>
                        <strong>Répulseur</strong>
                        <span class="muted small">repousse</span>
                      </span>
                    </button>
                  </div>
                  <p class="small muted">
                    {tentative
                      ? "Les pointillés montrent la trajectoire prévue avec ta pose, sans celles des autres, qui restent secrètes."
                      : "Survole l'arène pour voir l'effet sur les trajectoires, puis clique pour poser."}
                  </p>
                  {!myShipAlive && <p class="small puits-ghost-note">Ton vaisseau est perdu, mais tes puits comptent toujours. À toi de jouer les trouble-fête.</p>}
                  <div class="controls-actions">
                    <button class="btn btn-primary" type="button" disabled={!tentative} onClick={validate} data-sound="none">
                      Valider la pose <Icon name="arrowRight" size={18} />
                    </button>
                    <button class="btn btn-ghost" type="button" onClick={pass} data-sound="none">
                      Passer
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <section class="panel puits-score" aria-labelledby="score-title">
            <h2 id="score-title" class="h5">
              Équipages
            </h2>
            <ol class="puits-score-list">
              {ranking.map((p) => (
                <ScoreRow
                  p={p}
                  you={p.id === view.you}
                  alive={alive.get(p.slot) ?? false}
                  showLock={view.phase === "plan"}
                  round={scores.get(p.slot)}
                  total={total(p.slot)}
                />
              ))}
            </ol>
          </section>

          <section class="panel puits-legend small">
            <p>
              <KindGlyph kind="puits" /> attire, <KindGlyph kind="repulseur" /> repousse. Un puits agit trois tours en faiblissant. Les vaisseaux
              rebondissent entre eux : pousse l'un, il en percute un autre.
            </p>
            <p class="muted">
              Éclat <span class="mono">+{RULES.points.shard}</span> · élimination provoquée <span class="mono">+{RULES.points.kill}</span> · survie à la
              fin de la manche <span class="mono">+{RULES.points.survive}</span>
            </p>
            <p class="muted">
              <kbd>R</kbd> change de type · <kbd>Entrée</kbd> valide · <kbd>Échap</kbd> efface
            </p>
          </section>
        </aside>
      </main>

      {view.phase === "intermission" && <Intermission view={view} send={send} left={left} bySlot={bySlot} />}
    </div>
  );
}

function ScoreRow({ p, you, alive, showLock, round, total }: { p: PuitsPlayer; you: boolean; alive: boolean; showLock: boolean; round?: RoundScore; total: number }) {
  return (
    <li class={`puits-score-row ${you ? "is-you" : ""} ${p.connected ? "" : "is-away"} ${alive ? "" : "is-lost"}`} style={accentVar(p.accent)}>
      <PlayerSeal name={p.name} accent={p.accent} size={28} />
      <div class="score-body">
        <div class="score-top">
          <span class="score-name">{p.name}</span>
          <span class="mono puits-points">{total}</span>
        </div>
        <span class="muted small">
          {!alive && <span class="lost-tag">perdu</span>}
          {round?.shards ?? 0} éclat{(round?.shards ?? 0) > 1 ? "s" : ""} · {round?.kills ?? 0} élim.
        </span>
      </div>
      {showLock && (
        <span class={`lock-dot ${p.locked ? "is-locked" : ""}`} title={p.locked ? "A posé" : "Réfléchit…"} aria-label={p.locked ? "A posé" : "Réfléchit"}>
          {p.locked ? <Icon name="check" size={14} /> : "…"}
        </span>
      )}
    </li>
  );
}

export function KindGlyph({ kind }: { kind: WellKind }) {
  return (
    <svg class={`kind-glyph ${kind}`} viewBox="0 0 24 24" aria-hidden="true">
      {kind === "puits" ? (
        <>
          <circle cx="12" cy="12" r="10" class="ring" />
          <circle cx="12" cy="12" r="6" class="ring" />
          <circle cx="12" cy="12" r="3.2" class="core" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="4.5" class="ring" />
          <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3" class="ring" />
        </>
      )}
    </svg>
  );
}

function Intermission({ view, send, left, bySlot }: { view: PuitsView; send: (a: PuitsAction) => void; left: number; bySlot: Map<number, PuitsPlayer> }) {
  const result = view.results[view.results.length - 1];
  const me = view.players.find((p) => p.id === view.you);
  if (!result) return null;
  const rows = Object.entries(result.scores)
    .map(([slot, s]) => ({ slot: Number(slot), s }))
    .sort((a, b) => b.s.points - a.s.points);
  const ready = view.players.filter((p) => p.ready).length;
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="inter-title">
      <div class="overlay-card puits-results">
        <p class="eyebrow">
          Fin de la manche {result.round + 1} · {result.turns} tour{result.turns > 1 ? "s" : ""}
        </p>
        <h2 id="inter-title" class="h3">
          {rows.filter((r) => r.s.survived).length === 1
            ? `${bySlot.get(rows.find((r) => r.s.survived)!.slot)?.name} reste seul en orbite`
            : rows.some((r) => r.s.survived)
              ? "Plusieurs survivants"
              : "Personne n'a survécu"}
        </h2>
        <ol class="puits-results-list">
          {rows.map((r, i) => {
            const p = bySlot.get(r.slot);
            if (!p) return null;
            return (
              <li style={{ ...accentVar(p.accent), "--i": i } as never} class={p.id === view.you ? "is-you" : ""}>
                <span class="rank mono">{i + 1}</span>
                <PlayerSeal name={p.name} accent={p.accent} size={32} />
                <span class="results-name">{p.name}</span>
                <span class="muted small mono">
                  {r.s.shards} éclat{r.s.shards > 1 ? "s" : ""} · {r.s.kills} élim. · {r.s.survived ? "survit" : "perdu"}
                </span>
                <span class="results-points mono">+{r.s.points}</span>
              </li>
            );
          })}
        </ol>
        <footer class="report-foot">
          <span class="muted small">
            {ready}/{view.players.filter((p) => p.connected).length} prêts · manche suivante dans {left} s
          </span>
          <button class="btn btn-primary btn-lg" type="button" disabled={me?.ready} onClick={() => send({ t: "ready" })}>
            {me?.ready ? "En attente des autres…" : "Manche suivante"}
            {!me?.ready && <Icon name="arrowRight" size={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
