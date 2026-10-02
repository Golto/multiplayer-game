// L'arène : le plateau en direct, les commandes, le score et les écrans entre deux manches.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  RULES,
  SURFACES,
  decodeGrid,
  type Dir,
  type Head,
  type TickMessage,
  type TopoAction,
  type TopoPlayer,
  type TopoView,
} from "../../../../shared/games/topologie";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { BoardRenderer, type BoardState } from "./board";
import { SurfaceDiagram } from "./Diagram";

interface Props {
  view: TopoView;
  send: (action: TopoAction) => void;
  subscribe: (listener: (event: unknown) => void) => () => void;
  onLeave: () => void;
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  z: 0,
  w: 0,
  d: 1,
  s: 2,
  q: 3,
  a: 3,
};

function countCells(owner: Uint8Array): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of owner) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

export function Arena({ view, send, subscribe, onLeave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<BoardRenderer | null>(null);
  const live = useRef<BoardState | null>(null);
  const liveTick = useRef(-1);
  const [counts, setCounts] = useState(() => countCells(decodeGrid(view.owner)));
  const [myHead, setMyHead] = useState<Head | undefined>(undefined);
  const clockOffset = useMemo(() => view.serverNow - Date.now(), [view]);
  const [now, setNow] = useState(Date.now() + clockOffset);

  const me = view.players.find((p) => p.id === view.you);
  const mySlot = me?.slot ?? 0;
  const surface = view.surface ?? "tore";
  const info = SURFACES[surface];
  const accents = useMemo(() => new Map(view.players.map((p) => [p.slot, p.accent])), [view.players]);
  const bySlot = useMemo(() => new Map(view.players.map((p) => [p.slot, p])), [view.players]);

  // L'état complet du serveur remplace le plateau local s'il est au moins aussi récent.
  useEffect(() => {
    const roundChanged = live.current && (live.current.size !== view.size || live.current.surface !== surface);
    if (!live.current || roundChanged || view.tick >= liveTick.current) {
      const owner = decodeGrid(view.owner);
      live.current = {
        surface,
        size: view.size,
        owner,
        trail: decodeGrid(view.trail),
        heads: view.heads,
        previous: new Map(view.heads.map((h) => [h.slot, h])),
        tickAt: performance.now(),
        mySlot,
        accents,
      };
      liveTick.current = view.tick;
      setCounts(countCells(owner));
      setMyHead(view.heads.find((h) => h.slot === mySlot));
      if (renderer.current) {
        renderer.current.state = live.current;
        const box = wrapRef.current?.getBoundingClientRect();
        if (box) renderer.current.resize(box.width, box.height);
      }
    } else {
      live.current.accents = accents;
      renderer.current?.invalidate();
    }
  }, [view, surface, mySlot, accents]);

  // Ticks du serveur : on applique seulement les cases qui ont changé.
  useEffect(
    () =>
      subscribe((event) => {
        const msg = event as TickMessage;
        const s = live.current;
        if (!s || typeof msg?.tick !== "number" || msg.tick <= liveTick.current) return;
        for (let k = 0; k < msg.cells.length; k += 3) {
          s.owner[msg.cells[k]!] = msg.cells[k + 1]!;
          s.trail[msg.cells[k]!] = msg.cells[k + 2]!;
        }
        s.previous = new Map(s.heads.map((h) => [h.slot, h]));
        s.heads = msg.heads;
        s.tickAt = performance.now();
        liveTick.current = msg.tick;
        renderer.current?.invalidate();
        if (msg.cells.length) setCounts(countCells(s.owner));
        setMyHead(msg.heads.find((h) => h.slot === s.mySlot));

        for (const e of msg.events) {
          const before = s.previous.get(e.slot);
          const head = s.heads.find((h) => h.slot === e.slot);
          const mine = e.slot === s.mySlot;
          if (e.k === "capture") {
            if (head) renderer.current?.effect("capture", e.slot, head.x, head.y);
            if (mine) play("drag.drop", { gain: Math.min(1.4, 0.7 + e.cells / 120) });
            else play("chip.select", { gain: 0.5 });
          } else if (e.k === "death") {
            if (before) renderer.current?.effect("death", e.slot, before.x, before.y);
            if (mine) play("feedback.error");
            else if (e.by === s.mySlot) play("system.lock");
            else play("chip.deselect", { gain: 0.6 });
          } else if (e.k === "twist") {
            if (head) renderer.current?.effect("twist", e.slot, head.x, head.y);
            if (mine) play("toggle.off");
          } else if (e.k === "respawn" && mine) {
            play("system.ready");
          }
        }
      }),
    [subscribe],
  );

  // Canvas : création, taille, boucle d'animation.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const r = new BoardRenderer(canvas);
    r.state = live.current;
    renderer.current = r;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) r.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(wrap);
    let frame = requestAnimationFrame(function loop(t) {
      r.draw(t);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.current = null;
    };
  }, []);

  // Clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (dir === undefined) return;
      e.preventDefault();
      if (!e.repeat) send({ t: "turn", dir });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);

  // Glissés du doigt sur le plateau.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent) => {
    const start = swipe.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    send({ t: "turn", dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0 });
    swipe.current = { x: e.clientX, y: e.clientY };
  };

  // Horloge et sons de phase.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 250);
    return () => clearInterval(id);
  }, [clockOffset]);
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : 0;
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current === view.phase) return;
    prevPhase.current = view.phase;
    if (view.phase === "countdown") play("modal.open");
    if (view.phase === "playing") play("system.start");
    if (view.phase === "intermission") play("feedback.complete");
  }, [view.phase]);
  useEffect(() => {
    if (view.phase === "countdown" && left > 0 && left <= 3) play("slider.tick", { pitch: (3 - left) * 4 });
    if (view.phase === "playing" && left > 0 && left <= 5) play("slider.tick", { pitch: (5 - left) * 2 });
  }, [left]);

  const total = view.size * view.size || 1;
  const ranking = [...view.players].sort((a, b) => (counts.get(b.slot) ?? 0) - (counts.get(a.slot) ?? 0));
  const dead = view.phase === "playing" && myHead && !myHead.alive;

  return (
    <div class={`page topo-arena phase-${view.phase}`}>
      <header class="game-header">
        <Brand name="Topologie" compact />
        <div class="round-info">
          <span class="round-label">
            Manche <span class="mono">{view.round + 1}</span>
            <span class="muted">/{view.rounds}</span>
          </span>
          <span class="surface-pill" title={info.hint}>
            {info.name}
          </span>
        </div>
        <div class={`topo-clock mono ${view.phase === "playing" && left <= 10 ? "is-urgent" : ""}`} role="timer" aria-label={`${left} secondes`}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
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

      <main class="topo-grid">
        <section class="topo-stage" aria-label={`Plateau : ${info.name}`}>
          <div class="topo-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              class="topo-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (swipe.current = null)}
              onPointerCancel={() => (swipe.current = null)}
            />
            {view.phase === "countdown" && <Countdown view={view} left={left} />}
            {dead && (
              <div class="topo-toast" role="status">
                Coupé·e ! Retour chez toi dans un instant…
              </div>
            )}
          </div>
          <DPad send={send} />
        </section>

        <aside class="topo-side">
          <section class="panel surface-card" aria-labelledby="surface-title">
            <SurfaceDiagram surface={surface} size={92} />
            <div>
              <p class="eyebrow">Surface de la manche</p>
              <h2 id="surface-title" class="h5">
                {info.name}
              </h2>
              <p class="muted small mono">
                χ = {info.euler} · {info.orientable ? "orientable" : "non orientable"}
              </p>
              <p class="small surface-hint">{info.hint}</p>
            </div>
          </section>

          <section class="panel scoreboard" aria-labelledby="score-title">
            <h2 id="score-title" class="h5">
              Territoires
            </h2>
            <ol class="score-list">
              {ranking.map((p) => {
                const share = ((counts.get(p.slot) ?? 0) / total) * 100;
                return (
                  <li class={`score-row ${p.id === view.you ? "is-you" : ""} ${p.connected ? "" : "is-away"}`} style={accentVar(p.accent)}>
                    <PlayerSeal name={p.name} accent={p.accent} size={26} />
                    <div class="score-body">
                      <div class="score-top">
                        <span class="score-name">{p.name}</span>
                        <span class="mono">{share.toFixed(1)} %</span>
                      </div>
                      <div class="score-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, share)}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section class="panel controls-help small">
            <p>
              <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> ou <kbd>Z</kbd> <kbd>Q</kbd> <kbd>S</kbd> <kbd>D</kbd> pour tourner. Sur
              téléphone, glisse le doigt sur le plateau.
            </p>
          </section>
        </aside>
      </main>

      {view.phase === "intermission" && <Intermission view={view} send={send} left={left} bySlot={bySlot} />}
    </div>
  );
}

function DPad({ send }: { send: (action: TopoAction) => void }) {
  const button = (dir: Dir, label: string, icon: "arrowLeft" | "arrowRight", rotate = 0) => (
    <button
      type="button"
      class={`btn btn-outline dpad-${dir}`}
      data-sound="none"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        send({ t: "turn", dir });
      }}
    >
      <span style={{ transform: `rotate(${rotate}deg)`, display: "inline-flex" }}>
        <Icon name={icon} size={22} />
      </span>
    </button>
  );
  return (
    <div class="dpad" aria-label="Commandes">
      {button(0, "Haut", "arrowRight", -90)}
      {button(3, "Gauche", "arrowLeft")}
      {button(1, "Droite", "arrowRight")}
      {button(2, "Bas", "arrowRight", 90)}
    </div>
  );
}

function Countdown({ view, left }: { view: TopoView; left: number }) {
  const info = SURFACES[view.surface ?? "tore"];
  return (
    <div class="topo-overlay countdown" role="status">
      <div class="countdown-card">
        <p class="eyebrow">Manche {view.round + 1}</p>
        <h2 class="h4">{info.name}</h2>
        <p class="small">{info.hint}</p>
        <p class="countdown-number mono" key={left}>
          {left > 0 ? left : "Go"}
        </p>
        <p class="muted small">Repère ta tête (cerclée d'orange) et choisis ta direction de départ.</p>
      </div>
    </div>
  );
}

function Intermission({ view, send, left, bySlot }: { view: TopoView; send: (a: TopoAction) => void; left: number; bySlot: Map<number, TopoPlayer> }) {
  const result = view.results[view.results.length - 1];
  const me = view.players.find((p) => p.id === view.you);
  const next = view.surfaces[view.round + 1];
  if (!result) return null;
  const rows = Object.entries(result.cells)
    .map(([slot, cells]) => ({ slot: Number(slot), cells }))
    .sort((a, b) => b.cells - a.cells);
  const ready = view.players.filter((p) => p.ready).length;
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="inter-title">
      <div class="overlay-card topo-results">
        <p class="eyebrow">Fin de la manche {result.round + 1}</p>
        <h2 id="inter-title" class="h3">
          {SURFACES[result.surface].name}
        </h2>
        <ol class="results-list">
          {rows.map((r, i) => {
            const p = bySlot.get(r.slot);
            if (!p) return null;
            const share = (r.cells / result.total) * 100;
            return (
              <li style={{ ...accentVar(p.accent), "--i": i } as never} class={p.id === view.you ? "is-you" : ""}>
                <span class="rank mono">{i + 1}</span>
                <PlayerSeal name={p.name} accent={p.accent} size={32} />
                <span class="results-name">{p.name}</span>
                <span class="muted small mono">
                  {result.kills[r.slot] ?? 0} coupe{(result.kills[r.slot] ?? 0) > 1 ? "s" : ""} · {result.deaths[r.slot] ?? 0} chute
                  {(result.deaths[r.slot] ?? 0) > 1 ? "s" : ""}
                </span>
                <span class="results-share mono">{share.toFixed(1)} %</span>
              </li>
            );
          })}
        </ol>
        {next && (
          <div class="next-surface">
            <SurfaceDiagram surface={next} size={64} />
            <div>
              <p class="eyebrow">Manche suivante</p>
              <p class="h6">{SURFACES[next].name}</p>
              <p class="muted small">{SURFACES[next].hint}</p>
            </div>
          </div>
        )}
        <footer class="report-foot">
          <span class="muted small">
            {ready}/{view.players.filter((p) => p.connected).length} prêts · départ dans {left} s
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
