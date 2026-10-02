// La table : le plateau au centre, les pièces autour. Glisser-déposer à la souris ou au doigt,
// zoom à la molette ou aux boutons, déplacement de la vue en tirant le fond de la table.
// Les déplacements (les siens comme ceux des autres) modifient directement le DOM : seuls les
// changements de structure (prise, pose, ordre) passent par un nouveau rendu.

import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import {
  ARTS,
  BOARD_X,
  BOARD_Y,
  PUZZLE_H,
  PUZZLE_W,
  RULES,
  TABLE_H,
  TABLE_W,
  grid,
  home,
  isEdge,
  piecePath,
  type PieceState,
  type PuzzleAction,
  type PuzzleEvent,
  type PuzzleView,
} from "../../../../shared/games/puzzle";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { ART_COMPONENTS } from "./arts";

interface Props {
  view: PuzzleView;
  send: (a: PuzzleAction) => void;
  subscribe: (listener: (event: unknown) => void) => () => void;
  onLeave: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: Box = { x: 0, y: 0, w: TABLE_W, h: TABLE_H };

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Table({ view, send, subscribe, onLeave }: Props) {
  const { count } = view.config;
  const g = grid(count);
  const uid = `art-${view.seed}`;
  const Art = ART_COMPONENTS[view.config.art];
  const me = view.players.find((p) => p.id === view.you);
  const mySlot = me?.slot ?? 0;
  const bySlot = useMemo(() => new Map(view.players.map((p) => [p.slot, p])), [view.players]);

  // État local des pièces, recalé à chaque état complet du serveur.
  const pieces = useRef(new Map<number, PieceState>());
  const order = useRef<number[]>([]);
  const nodes = useRef(new Map<number, SVGGElement>());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const held = useRef<{ id: number; dx: number; dy: number; lastSent: number } | null>(null);

  useEffect(() => {
    const map = new Map(view.pieces.map((p) => [p.id, { ...p }]));
    // Ne pas écraser la pièce qu'on est en train de déplacer.
    const h = held.current;
    if (h && pieces.current.has(h.id)) map.set(h.id, pieces.current.get(h.id)!);
    pieces.current = map;
    if (order.current.length !== view.pieces.length) order.current = view.pieces.map((p) => p.id);
    rerender(0);
  }, [view]);

  const paths = useMemo(() => Array.from({ length: g.cols * g.rows }, (_, id) => piecePath(id, count, view.seed)), [count, view.seed]);

  const place = (id: number) => {
    const p = pieces.current.get(id);
    const node = nodes.current.get(id);
    if (!p || !node) return;
    const c = id % g.cols;
    const r = Math.floor(id / g.cols);
    node.setAttribute("transform", `translate(${p.x - c * g.cw} ${p.y - r * g.ch})`);
  };

  const toFront = (id: number) => {
    order.current = [...order.current.filter((x) => x !== id), id];
  };

  // Événements des autres joueurs (et confirmations du serveur).
  useEffect(
    () =>
      subscribe((event) => {
        const e = event as PuzzleEvent;
        const p = pieces.current.get(e.id);
        if (!p) return;
        if (e.k === "grab") {
          p.heldBy = e.slot;
          if (e.slot !== mySlot) {
            toFront(e.id);
            rerender(0);
          }
        } else if (e.k === "move") {
          if (held.current?.id === e.id) return;
          p.x = e.x;
          p.y = e.y;
          place(e.id);
        } else if (e.k === "drop") {
          const wasMine = held.current?.id === e.id;
          if (wasMine && e.slot === mySlot) return;
          if (wasMine) held.current = null;
          const newlyPlaced = e.placed && !p.placed;
          Object.assign(p, { x: e.x, y: e.y, placed: e.placed, heldBy: 0 });
          if (newlyPlaced && e.slot !== mySlot) play("chip.select", { gain: 0.6 });
          rerender(0);
          place(e.id);
        }
      }),
    [subscribe, mySlot],
  );

  // ------------------------------------------------------------ vue (zoom et déplacement)

  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<Box>(FULL);
  const pan = useRef<{ x: number; y: number; box: Box } | null>(null);

  const toTable = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const zoom = (factor: number, cx = box.x + box.w / 2, cy = box.y + box.h / 2) => {
    const w = Math.min(TABLE_W * 1.2, Math.max(TABLE_W / 6, box.w * factor));
    const h = (w * TABLE_H) / TABLE_W;
    setBox({ x: cx - ((cx - box.x) * w) / box.w, y: cy - ((cy - box.y) * h) / box.h, w, h });
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = toTable(e);
    zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
  };

  // ------------------------------------------------------------ glisser-déposer

  const onPiecePointerDown = (e: PointerEvent, id: number) => {
    const p = pieces.current.get(id);
    if (!p || p.placed || (p.heldBy && p.heldBy !== mySlot) || view.phase !== "playing") return;
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const pt = toTable(e);
    held.current = { id, dx: pt.x - p.x, dy: pt.y - p.y, lastSent: 0 };
    p.heldBy = mySlot;
    toFront(id);
    send({ t: "grab", id });
    play("card.hover");
    rerender(0);
  };

  const onPointerDown = (e: PointerEvent) => {
    // Sur le fond de la table : déplacer la vue.
    svgRef.current?.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, box };
  };

  const onPointerMove = (e: PointerEvent) => {
    const h = held.current;
    if (h) {
      const p = pieces.current.get(h.id)!;
      const pt = toTable(e);
      p.x = pt.x - h.dx;
      p.y = pt.y - h.dy;
      place(h.id);
      const now = performance.now();
      if (now - h.lastSent > 40) {
        h.lastSent = now;
        send({ t: "move", id: h.id, x: p.x, y: p.y });
      }
      return;
    }
    const pn = pan.current;
    if (pn && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      // Échelle uniforme (preserveAspectRatio « meet ») : unités de table par pixel.
      const scale = Math.max(pn.box.w / rect.width, pn.box.h / rect.height);
      setBox({ ...pn.box, x: pn.box.x - (e.clientX - pn.x) * scale, y: pn.box.y - (e.clientY - pn.y) * scale });
    }
  };

  const onPointerUp = () => {
    pan.current = null;
    const h = held.current;
    if (!h) return;
    held.current = null;
    const p = pieces.current.get(h.id)!;
    // Aimantation immédiate à l'écran ; le serveur confirme.
    const target = home(h.id, count);
    const near = Math.hypot(p.x - target.x, p.y - target.y) <= Math.min(g.cw, g.ch) * RULES.snap;
    send({ t: "drop", id: h.id, x: p.x, y: p.y });
    p.heldBy = 0;
    if (near) {
      p.x = target.x;
      p.y = target.y;
      p.placed = true;
      play("checkbox.check");
    } else {
      play("drag.drop", { gain: 0.6 });
    }
    place(h.id);
    rerender(0);
  };

  // ------------------------------------------------------------ outils

  const [ghost, setGhost] = useState(false);
  const [edgesOnly, setEdgesOnly] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const offset = useMemo(() => view.serverNow - Date.now(), [view]);
  const total = g.cols * g.rows;
  const placed = [...pieces.current.values()].filter((p) => p.placed).length;
  const time = view.startedAt ? (view.finishedAt ?? now + offset) - view.startedAt : 0;

  // Rangement : pièces posées dessous, puis les autres dans l'ordre de prise.
  const ids = order.current.filter((id) => pieces.current.has(id));
  const layered = [...ids.filter((id) => pieces.current.get(id)!.placed), ...ids.filter((id) => !pieces.current.get(id)!.placed)];

  return (
    <div class="page puzzle-page">
      <header class="game-header puzzle-header">
        <Brand name="Puzzle" compact />
        <div class="round-info">
          <span class="round-label">
            <span class="mono">{placed}</span>
            <span class="muted">/{total} pièces</span>
          </span>
          <span class="surface-pill">{ARTS.find((a) => a.id === view.config.art)?.name}</span>
        </div>
        <div class="puzzle-clock mono" aria-label="Temps écoulé">
          {elapsed(time)}
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
            aria-label="Quitter"
            title="Quitter"
            onClick={() => {
              if (view.phase === "done" || confirm("Quitter le puzzle ? Les autres peuvent continuer sans toi.")) onLeave();
            }}
          >
            <Icon name="xmark" size={20} />
          </button>
        </div>
      </header>

      <div class="puzzle-progress" aria-hidden="true">
        <span style={{ width: `${(placed / total) * 100}%` }} />
      </div>

      <main class="puzzle-main">
        <svg
          ref={svgRef}
          class={`puzzle-table ${held.current ? "is-dragging" : ""}`}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          role="application"
          aria-label="Table du puzzle : glisse les pièces sur le plateau"
        >
          <defs>
            <g id={uid}>
              <Art uid={uid} />
            </g>
            {paths.map((d, id) => (
              <clipPath id={`${uid}-c${id}`}>
                <path d={d} />
              </clipPath>
            ))}
            <filter id={`${uid}-lift`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="6" dy="10" stdDeviation="8" flood-opacity="0.35" />
            </filter>
          </defs>
          <rect x="-2000" y="-2000" width={TABLE_W + 4000} height={TABLE_H + 4000} class="table-cloth" />
          <rect x={BOARD_X - 14} y={BOARD_Y - 14} width={PUZZLE_W + 28} height={PUZZLE_H + 28} rx="10" class="board-frame" />
          <rect x={BOARD_X} y={BOARD_Y} width={PUZZLE_W} height={PUZZLE_H} class="board" />
          <g transform={`translate(${BOARD_X} ${BOARD_Y})`}>
            {Array.from({ length: g.cols - 1 }, (_, i) => (
              <line x1={(i + 1) * g.cw} y1="0" x2={(i + 1) * g.cw} y2={PUZZLE_H} class="board-grid" />
            ))}
            {Array.from({ length: g.rows - 1 }, (_, i) => (
              <line x1="0" y1={(i + 1) * g.ch} x2={PUZZLE_W} y2={(i + 1) * g.ch} class="board-grid" />
            ))}
            {ghost && <use href={`#${uid}`} opacity="0.18" />}
          </g>

          {layered.map((id) => {
            const p = pieces.current.get(id)!;
            const c = id % g.cols;
            const r = Math.floor(id / g.cols);
            const holder = p.heldBy ? bySlot.get(p.heldBy) : undefined;
            const mine = p.heldBy === mySlot && held.current?.id === id;
            const dim = edgesOnly && !p.placed && !isEdge(id, count);
            return (
              <g
                key={id}
                data-id={id}
                ref={(el) => {
                  if (el) nodes.current.set(id, el);
                  else nodes.current.delete(id);
                }}
                class={`piece ${p.placed ? "is-placed" : ""} ${mine ? "is-mine" : ""} ${holder && !mine ? "is-held" : ""} ${dim ? "is-dim" : ""}`}
                transform={`translate(${p.x - c * g.cw} ${p.y - r * g.ch})`}
                onPointerDown={(e) => onPiecePointerDown(e, id)}
                style={holder ? accentVar(holder.accent) : undefined}
                filter={mine ? `url(#${uid}-lift)` : undefined}
              >
                <use href={`#${uid}`} clip-path={`url(#${uid}-c${id})`} />
                <path d={paths[id]} class="piece-edge" />
                {holder && !mine && (
                  <text x={c * g.cw + g.cw / 2} y={r * g.ch - 10} class="piece-holder" text-anchor="middle">
                    {holder.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div class="puzzle-tools">
          <button class={`btn btn-outline ${ghost ? "is-active" : ""}`} type="button" data-sound="toggle.on" onClick={() => setGhost(!ghost)} aria-pressed={ghost}>
            <Icon name="eye" size={16} /> Modèle
          </button>
          <button class={`btn btn-outline ${edgesOnly ? "is-active" : ""}`} type="button" data-sound="toggle.on" onClick={() => setEdgesOnly(!edgesOnly)} aria-pressed={edgesOnly}>
            Bords d'abord
          </button>
          <span class="tools-sep" />
          <button class="btn btn-outline btn-icon" type="button" data-sound="stepper.increment" aria-label="Zoomer" onClick={() => zoom(1 / 1.3)}>
            +
          </button>
          <button class="btn btn-outline btn-icon" type="button" data-sound="stepper.decrement" aria-label="Dézoomer" onClick={() => zoom(1.3)}>
            −
          </button>
          <button class="btn btn-outline" type="button" data-sound="nav.tab" onClick={() => setBox(FULL)}>
            Tout voir
          </button>
        </div>

        <aside class="puzzle-players" aria-label="Joueurs">
          {view.players.map((p) => (
            <span class={`player-chip ${p.connected ? "" : "is-away"} ${p.id === view.you ? "is-you" : ""}`} style={accentVar(p.accent)}>
              <PlayerSeal name={p.name} accent={p.accent} size={24} />
              <span class="player-chip-name">{p.name}</span>
              <span class="mono small muted">{p.placed}</span>
            </span>
          ))}
        </aside>
      </main>

      {view.phase === "done" && <Done view={view} send={send} time={time} />}
    </div>
  );
}

function Done({ view, send, time }: { view: PuzzleView; send: (a: PuzzleAction) => void; time: number }) {
  const me = view.players.find((p) => p.id === view.you);
  useEffect(() => {
    play("feedback.complete");
    const t = setTimeout(() => play("system.ready"), 1200);
    return () => clearTimeout(t);
  }, []);
  const total = grid(view.config.count).cols * grid(view.config.count).rows;
  const ranking = [...view.players].sort((a, b) => b.placed - a.placed);
  return (
    <div class="puzzle-done" role="dialog" aria-modal="true" aria-labelledby="done-title">
      <div class="overlay-card puzzle-done-card">
        <p class="eyebrow">Puzzle terminé</p>
        <h2 id="done-title" class="h3">
          {ARTS.find((a) => a.id === view.config.art)?.name}
        </h2>
        <p class="muted">
          {total} pièces en <strong class="mono">{elapsed(time)}</strong>
          {view.players.length > 1 ? ", à plusieurs mains." : "."}
        </p>
        {view.players.length > 1 && (
          <ol class="done-list">
            {ranking.map((p) => (
              <li style={accentVar(p.accent)}>
                <PlayerSeal name={p.name} accent={p.accent} size={28} />
                <span class="done-name">{p.name}</span>
                <span class="done-bar" aria-hidden="true">
                  <span style={{ width: `${(p.placed / total) * 100}%` }} />
                </span>
                <span class="mono">{p.placed}</span>
              </li>
            ))}
          </ol>
        )}
        <footer class="report-foot">
          {me?.isHost ? (
            <button class="btn btn-primary btn-lg" type="button" data-sound="refresh.release" onClick={() => send({ t: "again" })}>
              Nouveau puzzle <Icon name="arrowRight" size={20} />
            </button>
          ) : (
            <p class="waiting">
              <span class="pulse-dot" aria-hidden="true" />
              L'hôte peut lancer un nouveau puzzle.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
