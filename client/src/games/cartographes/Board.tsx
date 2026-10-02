// L'écran de jeu : ton carnet (la zone que tu vois), la carte commune (où tu peins la zone qu'on te
// décrit), le clavier de pictogrammes et le journal des messages.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  PICTOS,
  PICTO_GROUPS,
  RULES,
  TERRAINS,
  zoneCells,
  type CartoAction,
  type CartoPlayer,
  type CartoView,
  type Terrain,
} from "../../../../shared/games/cartographes";
import { PlayerSeal, accentVar } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { MapGrid } from "./MapGrid";
import { PictoGlyph } from "./pictos";

interface Props {
  view: CartoView;
  send: (action: CartoAction) => void;
  onLeave: () => void;
}

export function Board({ view, send, onLeave }: Props) {
  const me = view.players.find((p) => p.id === view.you);
  const mySlot = me?.slot ?? 0;
  const bySlot = useMemo(() => new Map(view.players.map((p) => [p.slot, p])), [view.players]);
  const viewZone = view.zones.find((z) => z.viewer === mySlot);
  const paintZone = view.zones.find((z) => z.painter === mySlot);
  const locked = !!view.mine;

  const [brush, setBrush] = useState<Terrain>("plaine");
  const [pending, setPending] = useState(() => new Map<number, Terrain>());
  const [message, setMessage] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  // Nouveau tour : on repart d'une feuille blanche, et on signale les nouveaux messages.
  const lastTurn = useRef(view.turn);
  useEffect(() => {
    if (lastTurn.current === view.turn) return;
    lastTurn.current = view.turn;
    setPending(new Map());
    setMessage([]);
    setDone(false);
    play("card.flip");
    const fresh = view.log.filter((m) => m.turn === view.turn - 1);
    if (fresh.some((m) => paintZone && m.slot === paintZone.viewer)) setTimeout(() => play("feedback.notification"), 350);
  }, [view.turn]);

  useEffect(() => window.scrollTo(0, 0), []);

  const shownPending = locked ? new Map(view.mine!.paints) : pending;
  const paintable = useMemo(() => new Set(paintZone && !locked ? zoneCells(paintZone, view.cols) : []), [paintZone, locked, view.cols]);

  const onCell = (i: number) => {
    if (locked) return;
    const next = new Map(pending);
    if (next.get(i) === brush) {
      next.delete(i);
      play("input.delete", { gain: 0.6 });
    } else if (next.has(i) || next.size < RULES.paints) {
      next.set(i, brush);
      play("stepper.increment", { gain: 0.6 });
    } else {
      play("button.blocked");
      return;
    }
    setPending(next);
  };

  const addPicto = (id: string) => {
    if (locked) return;
    if (message.length >= RULES.message) {
      play("button.blocked");
      return;
    }
    setMessage([...message, id]);
    play("input.key", { gain: 0.8 });
  };
  const removePicto = (k: number) => {
    if (locked) return;
    setMessage(message.filter((_, j) => j !== k));
    play("input.delete", { gain: 0.7 });
  };
  const submit = () => {
    if (locked) return;
    send({ t: "end", pictos: message, paints: [...pending], done });
    play("press.commit");
  };

  // Clavier : 1 à 5 choisissent le pinceau.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const t = TERRAINS[Number(e.key) - 1];
      if (t) {
        setBrush(t.id);
        play("chip.select", { gain: 0.5 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Horloge.
  const clockOffset = useMemo(() => view.serverNow - Date.now(), [view]);
  const [now, setNow] = useState(Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 250);
    return () => clearInterval(id);
  }, [clockOffset]);
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : 0;
  useEffect(() => {
    if (!locked && left > 0 && left <= 5) play("slider.tick", { pitch: (5 - left) * 2 });
  }, [left]);

  // Carnet : ta zone, avec ce que la carte commune en dit.
  const viewCells = viewZone ? zoneCells(viewZone, view.cols) : [];
  const marks = new Map<number, "ok" | "ko">();
  for (const i of viewCells) {
    const painted = view.painted[i];
    if (painted) marks.set(i, painted === view.truth[i] ? "ok" : "ko");
  }
  const right = [...marks.values()].filter((m) => m === "ok").length;
  const painter = viewZone ? bySlot.get(viewZone.painter) : undefined;
  const describer = paintZone ? bySlot.get(paintZone.viewer) : undefined;
  const lockedCount = view.players.filter((p) => p.locked).length;
  const active = view.players.filter((p) => p.connected).length;

  return (
    <div class="page carto-board">
      <header class="game-header carto-header">
        <Brand name="Cartographes" compact />
        <div class="round-info">
          <span class="round-label">
            Tour <span class="mono">{view.turn + 1}</span>
            <span class="muted">/{view.turns}</span>
          </span>
          <ol class="turn-track" aria-hidden="true">
            {Array.from({ length: view.turns }, (_, k) => (
              <li class={k < view.turn ? "is-past" : k === view.turn ? "is-now" : ""} />
            ))}
          </ol>
        </div>
        <div class={`carto-clock mono ${left <= 10 && !locked ? "is-urgent" : ""}`} role="timer" aria-label={`${left} secondes`}>
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

      <main class="carto-grid">
        <aside class="carto-left">
          <section class="panel carnet" aria-labelledby="carnet-title">
            <p class="eyebrow">Ton carnet</p>
            <h2 id="carnet-title" class="h5">
              Zone {viewZone?.id} <Icon name="eye" size={18} />
            </h2>
            {viewZone && (
              <MapGrid
                cols={RULES.zone}
                rows={RULES.zone}
                cells={viewCells.map((i) => view.truth[i] ?? null)}
                index={(local) => viewCells[local]!}
                marks={marks}
                class="carnet-map"
                label={`Ta zone, ${viewZone.id}`}
              />
            )}
            <p class="small">
              Toi seul vois cette zone. Décris-la à{" "}
              <strong style={painter ? accentVar(painter.accent) : undefined} class="who">
                {painter?.name ?? "personne"}
              </strong>
              , qui la peint sur la carte commune.
            </p>
            <p class="muted small mono">
              {right}/{viewCells.length} cases justes · {marks.size - right} fausse{marks.size - right > 1 ? "s" : ""}
            </p>
          </section>

          <section class="panel journal" aria-labelledby="journal-title">
            <h2 id="journal-title" class="h5">
              Journal de bord
            </h2>
            <Journal view={view} bySlot={bySlot} forMe={paintZone?.viewer ?? 0} />
          </section>
        </aside>

        <section class="carto-center" aria-label="La carte commune">
          <div class="map-head">
            <div>
              <p class="eyebrow">Carte commune</p>
              <p class="small">
                Tu peins la zone <strong>{paintZone?.id}</strong>, d'après les messages de{" "}
                <strong style={describer ? accentVar(describer.accent) : undefined} class="who">
                  {describer?.name ?? "personne"}
                </strong>
                .
              </p>
            </div>
            <span class="paint-count mono" title="Cases peintes ce tour">
              {shownPending.size}/{RULES.paints}
            </span>
          </div>
          <MapGrid
            cols={view.cols}
            rows={view.rows}
            cells={view.painted}
            zones={view.zones}
            paintZone={paintZone?.id}
            viewZone={viewZone?.id}
            pending={shownPending}
            active={paintable}
            onCell={onCell}
            class="common-map"
            label="La carte commune"
          />
          <div class="brushes" role="radiogroup" aria-label="Pinceau">
            {TERRAINS.map((t, k) => (
              <button
                type="button"
                role="radio"
                aria-checked={brush === t.id}
                class={`brush ${brush === t.id ? "is-on" : ""}`}
                disabled={locked}
                data-sound="chip.select"
                onClick={() => setBrush(t.id)}
                title={`${t.name} (${k + 1})`}
              >
                <span class={`swatch t-${t.id}`}>
                  <PictoGlyph id={t.id} size={22} />
                </span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </section>

        <aside class="carto-right">
          <section class="panel composer-panel" aria-labelledby="composer-title">
            <p class="eyebrow">Ton message</p>
            <h2 id="composer-title" class="h5">
              {locked ? "Tour terminé" : `${RULES.message} pictogrammes au plus`}
            </h2>
            <div class="tray" aria-label="Message en cours">
              {Array.from({ length: RULES.message }, (_, k) => {
                const id = (locked ? view.mine!.pictos : message)[k];
                return id ? (
                  <button type="button" class="tray-slot is-filled" data-sound="none" disabled={locked} onClick={() => removePicto(k)} title="Retirer">
                    <PictoGlyph id={id} size={30} />
                  </button>
                ) : (
                  <span class="tray-slot" />
                );
              })}
            </div>
            {locked ? (
              <p class="waiting">
                <span class="pulse-dot" aria-hidden="true" />
                {lockedCount}/{active} ont fini. Messages et peinture apparaissent à la fin du tour.
              </p>
            ) : (
              <>
                <div class="keyboard">
                  {PICTO_GROUPS.map((g) => (
                    <div class="key-group">
                      <span class="key-group-name">{g.name}</span>
                      <div class="keys">
                        {PICTOS.filter((p) => p.group === g.id).map((p) => (
                          <button type="button" class={`key key-${g.id}`} data-sound="none" onClick={() => addPicto(p.id)} title={p.label}>
                            <PictoGlyph id={p.id} size={22} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <label class="done-toggle small">
                  <input type="checkbox" checked={done} onChange={(e) => setDone((e.target as HTMLInputElement).checked)} />
                  Je pense que la carte est terminée
                </label>
                <button class="btn btn-primary btn-block" type="button" data-sound="none" onClick={submit}>
                  Terminer le tour
                  <span class="submit-sum mono">
                    {message.length} picto{message.length > 1 ? "s" : ""} · {pending.size} case{pending.size > 1 ? "s" : ""}
                  </span>
                </button>
              </>
            )}
          </section>

          <section class="panel crew small" aria-label="Équipage">
            <ul class="crew-list">
              {view.players.map((p) => (
                <li class={`${p.connected ? "" : "is-away"} ${p.id === view.you ? "is-you" : ""}`} style={accentVar(p.accent)}>
                  <PlayerSeal name={p.name} accent={p.accent} size={24} />
                  <span class="crew-name">{p.name}</span>
                  <span class="crew-zones mono">
                    <Icon name="eye" size={14} /> {view.zones.find((z) => z.viewer === p.slot)?.id} · ✎ {view.zones.find((z) => z.painter === p.slot)?.id}
                  </span>
                  <span class={`lock-dot ${p.locked ? "is-locked" : ""}`} title={p.locked ? "A fini son tour" : "Réfléchit…"}>
                    {p.locked ? <Icon name="check" size={13} /> : "…"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Journal({ view, bySlot, forMe }: { view: CartoView; bySlot: Map<number, CartoPlayer>; forMe: number }) {
  if (!view.log.length) return <p class="muted small">Aucun message pour l'instant. Les premiers arriveront à la fin du tour.</p>;
  const turns = [...new Set(view.log.map((m) => m.turn))].sort((a, b) => b - a);
  return (
    <ol class="journal-turns">
      {turns.map((t) => (
        <li>
          <span class="journal-turn mono">Tour {t + 1}</span>
          <ul class="journal-list">
            {view.log
              .filter((m) => m.turn === t)
              .map((m, k) => {
                const p = bySlot.get(m.slot);
                const zone = view.zones.find((z) => z.viewer === m.slot);
                return (
                  <li class={`journal-msg ${m.slot === forMe ? "is-for-you" : ""} ${t === view.turn - 1 ? "is-fresh" : ""}`} style={{ ...(p ? accentVar(p.accent) : {}), "--i": k } as never}>
                    <PlayerSeal name={p?.name ?? "?"} accent={p?.accent ?? "amethyst"} size={26} />
                    <div class="journal-body">
                      <span class="journal-who small">
                        <strong>{p?.name}</strong> <span class="muted">· zone {zone?.id}</span>
                        {m.slot === forMe && <span class="for-you-tag">pour toi</span>}
                      </span>
                      <span class="journal-pictos">
                        {m.pictos.map((id) => (
                          <PictoGlyph id={id} size={28} />
                        ))}
                      </span>
                    </div>
                  </li>
                );
              })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
