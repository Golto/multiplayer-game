// L'écran de jeu : la salle en direct, les commandes (clavier ou manette tactile), la prédiction de
// ton corps, l'interpolation des autres, et les écrans entre deux manches.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  RULES,
  dirOf,
  move,
  openDoors,
  parseArena,
  stars,
  type Body,
  type EchoAction,
  type EchoPlayer,
  type EchoView,
  type TickMessage,
} from "../../../../shared/games/echos";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { RoomRenderer, type Scene } from "./render";

interface Props {
  view: EchoView;
  send: (action: EchoAction) => void;
  subscribe: (listener: (event: unknown) => void) => () => void;
  onLeave: () => void;
}

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  z: [0, -1],
  w: [0, -1],
  s: [0, 1],
  q: [-1, 0],
  a: [-1, 0],
  d: [1, 0],
};

interface Live {
  prev: number[];
  curr: number[];
  at: number;
  tick: number;
  pressed: Set<number>;
  /** Ton corps, prédit localement. */
  me: Body | null;
  myIndex: number;
  dir: number;
  stillSince: number;
}

export function Stage({ view, send, subscribe, onLeave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<RoomRenderer | null>(null);
  const me = view.players.find((p) => p.id === view.you);
  const mySlot = me?.slot ?? 0;
  const arena = useMemo(() => parseArena(view.rows), [view.rows.join("\n")]);
  const accents = useMemo(() => new Map(view.players.map((p) => [p.slot, p.accent])), [view.players]);
  const names = useMemo(() => new Map(view.players.map((p) => [p.slot, p.name])), [view.players]);
  const [hud, setHud] = useState({ tick: view.tick, pressed: view.pressed.length, golds: 0 });
  const [livePoints, setLivePoints] = useState<Record<number, number>>({});
  const [showTraces, setShowTraces] = useState(true);
  const live = useRef<Live>({ prev: [], curr: [], at: 0, tick: 0, pressed: new Set(), me: null, myIndex: -1, dir: 0, stillSince: 0 });
  const phaseRef = useRef(view.phase);
  phaseRef.current = view.phase;

  useEffect(() => window.scrollTo(0, 0), []);

  // L'état complet du serveur (changement de phase, reconnexion) remet tout à plat.
  useEffect(() => {
    const pos = view.positions.map((v) => v / 100);
    const l = live.current;
    l.prev = pos;
    l.curr = pos;
    l.at = performance.now();
    l.tick = view.tick;
    l.pressed = new Set(view.pressed);
    l.myIndex = view.bodies.findIndex((b) => b.owner === mySlot && b.echo === 0);
    l.me = l.myIndex >= 0 ? { x: pos[l.myIndex * 2]!, y: pos[l.myIndex * 2 + 1]! } : null;
    const golds = arena.plates.filter((p) => p.kind === "gold" && l.pressed.has(p.index)).length;
    setHud({ tick: view.tick, pressed: view.pressed.length, golds });
    if (view.phase === "briefing") setLivePoints({});
  }, [view]);

  // Les pas du serveur : positions des autres, plaques, et correction douce de ta prédiction.
  useEffect(
    () =>
      subscribe((event) => {
        const msg = event as TickMessage;
        if (msg?.k !== "t") return;
        const l = live.current;
        if (msg.t <= l.tick && l.curr.length) return;
        l.prev = l.curr.length === msg.p.length ? l.curr : msg.p.map((v) => v / 100);
        l.curr = msg.p.map((v) => v / 100);
        l.at = performance.now();
        l.tick = msg.t;
        const before = l.pressed;
        l.pressed = new Set(msg.on);
        for (const i of l.pressed) {
          if (before.has(i)) continue;
          const plate = arena.plates[i];
          if (!plate) continue;
          renderer.current?.burst(plate.x + 0.5, plate.y + 0.5, 0);
          play(plate.kind === "gold" ? "checkbox.check" : plate.kind === "door" ? "toggle.on" : "chip.select", { gain: 0.55 });
        }
        for (const i of before) if (!l.pressed.has(i) && arena.plates[i]?.kind === "door") play("toggle.off", { gain: 0.4 });
        if (l.me && l.myIndex >= 0) {
          const sx = l.curr[l.myIndex * 2]!;
          const sy = l.curr[l.myIndex * 2 + 1]!;
          const err = Math.hypot(sx - l.me.x, sy - l.me.y);
          // À l'arrêt, on rejoint la position du serveur ; en mouvement, seulement si l'écart devient grand.
          const idle = l.dir === 0 && performance.now() - l.stillSince > 180;
          const k = err > 1.4 ? 0.5 : idle ? 0.25 : err > 0.7 ? 0.12 : 0;
          l.me.x += (sx - l.me.x) * k;
          l.me.y += (sy - l.me.y) * k;
        }
        const golds = arena.plates.filter((p) => p.kind === "gold" && l.pressed.has(p.index)).length;
        setHud({ tick: msg.t, pressed: l.pressed.size, golds });
        if (msg.s) setLivePoints(msg.s);
        const left = Math.ceil((RULES.roundTicks - msg.t) / 20);
        if (msg.t % 20 === 0 && left <= 5 && left > 0) play("slider.tick", { pitch: (5 - left) * 2 });
      }),
    [subscribe, arena],
  );

  const arenaRef = useRef(arena);
  arenaRef.current = arena;
  const sceneRef = useRef<Omit<Scene, "positions" | "pressed" | "open" | "owners"> | null>(null);
  sceneRef.current = { arena, bodies: view.bodies, traces: view.traces, mySlot, accents, names, showTraces };

  // Canvas et boucle d'animation : prédiction de ton corps au rythme du serveur, interpolation du reste.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const r = new RoomRenderer(canvas);
    renderer.current = r;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) r.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(wrap);
    let last = performance.now();
    let acc = 0;
    let frame = requestAnimationFrame(function loop(t) {
      const l = live.current;
      acc += Math.min(200, t - last);
      last = t;
      const open = openDoors(arenaRef.current, l.pressed);
      while (acc >= RULES.tickMs) {
        acc -= RULES.tickMs;
        if (phaseRef.current === "round" && l.me) move(arenaRef.current, l.me, l.dir, open);
      }
      const alpha = Math.min(1, (t - l.at) / RULES.tickMs);
      const positions = l.curr.map((v, i) => (l.prev[i] ?? v) + (v - (l.prev[i] ?? v)) * alpha);
      if (l.me && l.myIndex >= 0) {
        positions[l.myIndex * 2] = l.me.x;
        positions[l.myIndex * 2 + 1] = l.me.y;
      }
      const sc = sceneRef.current;
      if (sc) r.scene = { ...sc, positions, pressed: l.pressed, open, owners: ownersOf(sc, positions, l.pressed) };
      r.draw(t);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.current = null;
    };
  }, []);
  // La taille de la salle peut changer d'une salle à l'autre.
  useEffect(() => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (box && renderer.current) {
      renderer.current.scene = { ...sceneRef.current!, positions: [], pressed: new Set(), open: new Set(), owners: new Map() };
      renderer.current.resize(box.width, box.height);
    }
  }, [arena]);

  // Commandes : clavier.
  const setDir = (d: number) => {
    const l = live.current;
    if (d === l.dir) return;
    l.dir = d;
    if (d === 0) l.stillSince = performance.now();
    send({ t: "input", d });
  };
  useEffect(() => {
    const held = new Set<string>();
    const update = () => {
      let dx = 0;
      let dy = 0;
      for (const k of held) {
        const v = KEYS[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      setDir(dirOf(dx, dy));
    };
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = KEYS[e.key] ? e.key : e.key.toLowerCase();
      if (!KEYS[k]) return;
      e.preventDefault();
      held.add(k);
      update();
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.key] ? e.key : e.key.toLowerCase();
      held.delete(k);
      update();
    };
    const blur = () => {
      held.clear();
      update();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Commandes : manette tactile (on pose le doigt n'importe où, on glisse dans la direction voulue).
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setStick({ x: e.clientX - box.left, y: e.clientY - box.top, dx: 0, dy: 0 });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!stick || e.pointerType === "mouse") return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - box.left - stick.x;
    const dy = e.clientY - box.top - stick.y;
    const len = Math.hypot(dx, dy);
    const k = len > 44 ? 44 / len : 1;
    setStick({ ...stick, dx: dx * k, dy: dy * k });
    setDir(len > 12 ? dirOf(dx, dy) : 0);
  };
  const onPointerUp = () => {
    setStick(null);
    setDir(0);
  };

  // Sons de phase.
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current === view.phase) return;
    prevPhase.current = view.phase;
    if (view.phase === "round") play("system.start");
    if (view.phase === "rewind") play("refresh.release");
    if (view.phase === "cleared") play("feedback.complete");
    if (view.phase === "briefing") play("modal.open", { gain: 0.6 });
  }, [view.phase]);

  // Horloge des transitions.
  const clockOffset = useMemo(() => view.serverNow - Date.now(), [view]);
  const [now, setNow] = useState(Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 200);
    return () => clearInterval(id);
  }, [clockOffset]);
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : 0;

  const goldTotal = arena.plates.filter((p) => p.kind === "gold").length;
  const versus = view.mode === "versus";
  const roundTicks = RULES.roundTicks;
  const progress = view.phase === "round" ? Math.min(1, hud.tick / roundTicks) : view.phase === "briefing" ? 0 : 1;
  const secondsLeft = view.phase === "round" ? Math.max(0, Math.ceil((roundTicks - hud.tick) / 20)) : 30;
  const echoesEach = view.bodies.filter((b) => b.owner === mySlot && b.echo > 0).length;
  const totals = (slot: number) =>
    view.roundPoints.reduce((s, r) => s + (r[slot] ?? 0), 0) + (view.phase === "round" ? (livePoints[slot] ?? 0) : 0);
  const ranking = [...view.players].sort((a, b) => totals(b.slot) - totals(a.slot));

  return (
    <div class={`page echos-stage phase-${view.phase}`}>
      <header class="game-header echos-header">
        <Brand name="Échos" compact />
        <div class="round-info">
          {!versus && (
            <span class="round-label">
              Salle <span class="mono">{view.level + 1}</span>
              <span class="muted">/{view.levels}</span>
            </span>
          )}
          <span class="round-label">
            Manche <span class="mono">{view.round + 1}</span>
            <span class="muted">/{view.maxRounds}</span>
          </span>
          <span class="level-pill">{view.levelName}</span>
        </div>
        <div class={`echos-clock mono ${view.phase === "round" && secondsLeft <= 5 ? "is-urgent" : ""}`} role="timer">
          0:{String(secondsLeft).padStart(2, "0")}
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

      <main class="echos-grid">
        <section class="echos-main" aria-label={view.levelName}>
          <div class="time-bar" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div class="echos-canvas-wrap" ref={wrapRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <canvas ref={canvasRef} class="echos-canvas" />
            {stick && (
              <span class="stick" style={{ left: `${stick.x}px`, top: `${stick.y}px` }} aria-hidden="true">
                <span class="stick-knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
              </span>
            )}
            {view.phase === "briefing" && <Briefing view={view} left={left} echoesEach={echoesEach} />}
            {view.phase === "rewind" && <Rewind view={view} />}
            {view.phase === "cleared" && <Cleared view={view} />}
          </div>
        </section>

        <aside class="echos-side">
          {!versus ? (
            <section class="panel goal-card" aria-labelledby="goal-title">
              <p class="eyebrow">Objectif</p>
              <h2 id="goal-title" class="h5">
                <span class="mono goal-count">
                  {hud.golds}/{goldTotal}
                </span>{" "}
                plaques dorées en même temps
              </h2>
              <p class="small muted">{view.levelHint}</p>
              <div class="echo-meter" aria-label="Échos">
                {Array.from({ length: view.maxRounds - 1 }, (_, k) => (
                  <span class={k < view.round ? "is-on" : ""} title={`Écho ${k + 1}`}>
                    {k + 1}
                  </span>
                ))}
                <span class="muted small">
                  {view.round === 0 ? "aucun écho encore" : `${view.round} écho${view.round > 1 ? "s" : ""} chacun`}
                </span>
              </div>
              {view.paradoxes > 0 && (
                <p class="small paradox-note">
                  {view.paradoxes} paradoxe{view.paradoxes > 1 ? "s" : ""} dans cette salle
                </p>
              )}
              {me?.isHost && (
                <button class="btn btn-ghost btn-sm" type="button" data-sound="nav.back" onClick={() => confirm("Effacer tous les échos et reprendre la salle ?") && send({ t: "paradox" })}>
                  Effacer les échos
                </button>
              )}
            </section>
          ) : (
            <section class="panel goal-card" aria-labelledby="score-title">
              <p class="eyebrow">Versus</p>
              <h2 id="score-title" class="h5">
                Seul sur une plaque, tu marques
              </h2>
              <ol class="echos-score">
                {ranking.map((p) => (
                  <li style={accentVar(p.accent)} class={p.id === view.you ? "is-you" : ""}>
                    <PlayerSeal name={p.name} accent={p.accent} size={26} />
                    <span class="score-name">{p.name}</span>
                    <span class="mono score-points">{(totals(p.slot) / 20).toFixed(1)} s</span>
                  </li>
                ))}
              </ol>
              <p class="small muted">{view.levelHint}</p>
            </section>
          )}

          <section class="panel crew-card small" aria-label="Joueurs">
            <ul class="echos-crew">
              {view.players.map((p) => (
                <CrewRow p={p} you={p.id === view.you} echoes={view.bodies.filter((b) => b.owner === p.slot && b.echo > 0).length} />
              ))}
            </ul>
            <label class="trace-toggle">
              <input type="checkbox" checked={showTraces} onChange={(e) => setShowTraces((e.target as HTMLInputElement).checked)} />
              Montrer le parcours des échos
            </label>
          </section>

          <section class="panel small muted controls-card">
            <p>
              <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>, <kbd>Z</kbd> <kbd>Q</kbd> <kbd>S</kbd> <kbd>D</kbd> ou <kbd>W</kbd> <kbd>A</kbd>{" "}
              <kbd>S</kbd> <kbd>D</kbd>. Sur téléphone, pose le doigt sur la salle et glisse.
            </p>
            <p>Les échos rejouent tes gestes, pas tes positions : si une porte se ferme devant eux, ils se cognent.</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function ownersOf(scene: Omit<Scene, "positions" | "pressed" | "open" | "owners">, positions: number[], pressed: Set<number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const plate of scene.arena.plates) {
    if (plate.kind !== "neutral" || !pressed.has(plate.index)) continue;
    const owners = new Set<number>();
    scene.bodies.forEach((b, k) => {
      if (Math.floor(positions[k * 2]!) === plate.x && Math.floor(positions[k * 2 + 1]!) === plate.y) owners.add(b.owner);
    });
    if (owners.size === 1) out.set(plate.index, [...owners][0]!);
  }
  return out;
}

function CrewRow({ p, you, echoes }: { p: EchoPlayer; you: boolean; echoes: number }) {
  return (
    <li class={`${you ? "is-you" : ""} ${p.connected ? "" : "is-away"}`} style={accentVar(p.accent)}>
      <PlayerSeal name={p.name} accent={p.accent} size={24} />
      <span class="crew-name">{p.name}</span>
      <span class="crew-echoes" aria-label={`${echoes} échos`}>
        <span class="dot live" />
        {Array.from({ length: echoes }, () => (
          <span class="dot ghost" />
        ))}
      </span>
    </li>
  );
}

function Briefing({ view, left, echoesEach }: { view: EchoView; left: number; echoesEach: number }) {
  return (
    <div class="echos-overlay" role="status">
      <div class="overlay-chip">
        <p class="eyebrow">
          {view.mode === "versus" ? "Versus" : `Salle ${view.level + 1}`} · manche {view.round + 1}
        </p>
        <h2 class="h4">{view.levelName}</h2>
        <p class="small">
          {echoesEach === 0
            ? view.levelHint
            : `Tes ${echoesEach} écho${echoesEach > 1 ? "s" : ""} et ceux des autres rejouent les manches précédentes. Les pointillés montrent leur chemin.`}
        </p>
        <p class="countdown-number mono" key={left}>
          {left > 0 ? left : "Go"}
        </p>
      </div>
    </div>
  );
}

function Rewind({ view }: { view: EchoView }) {
  const paradox = view.mode === "coop" && view.round === 0 && view.paradoxes > 0;
  return (
    <div class="echos-overlay is-rewind" role="status">
      <div class="overlay-chip">
        <span class="rewind-glyph" aria-hidden="true">
          ⟲
        </span>
        <h2 class="h4">{paradox ? "Paradoxe" : "Rembobinage"}</h2>
        <p class="small">
          {paradox
            ? "Le temps se déchire : tous les échos s'effacent, on reprend la salle de zéro."
            : "Chacun laisse un écho de la manche qui vient de finir. Il rejouera exactement les mêmes gestes."}
        </p>
      </div>
    </div>
  );
}

function Cleared({ view }: { view: EchoView }) {
  const r = view.results[view.results.length - 1];
  if (!r) return null;
  const n = stars(r);
  return (
    <div class="echos-overlay is-cleared" role="status">
      <div class="overlay-chip">
        <p class="eyebrow">Salle franchie</p>
        <h2 class="h3">{view.levelName}</h2>
        <p class="stars" aria-label={`${n} étoiles sur 3`}>
          {[0, 1, 2].map((k) => (
            <span class={k < n ? "is-on" : ""} style={{ "--i": k } as never}>
              ★
            </span>
          ))}
        </p>
        <p class="small">
          En {r.rounds} manche{r.rounds > 1 ? "s" : ""}
          {r.paradoxes ? `, ${r.paradoxes} paradoxe${r.paradoxes > 1 ? "s" : ""}` : ""}, à {(r.ticks / 20).toFixed(1)} s de la dernière.
        </p>
      </div>
    </div>
  );
}
