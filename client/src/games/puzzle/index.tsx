// Point d'entrée du Puzzle pour la plateforme.

import { ARTS, FORMATS, PIECE_COUNTS, RULES, layout, type PuzzleAction, type PuzzleView } from "../../../../shared/games/puzzle";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { ArtThumb } from "./arts";
import { Cover, Home } from "./Home";
import { Table } from "./Table";
import "./puzzle.css";

function Config({ view, send }: { view: PuzzleView; send: (a: PuzzleAction) => void }) {
  const host = view.players.find((p) => p.id === view.you)?.isHost;
  const { art, count, format } = view.config;
  const L = layout(view.config);
  return (
    <div class="puzzle-config">
      <h2 class="h5">Le puzzle</h2>
      <div class="config-preview" style={{ aspectRatio: `${L.w} / ${L.h}`, width: `min(100%, ${Math.round((260 * L.w) / L.h)}px)` }}>
        <ArtThumb art={art} uid="config-preview" class="art-thumb" w={L.w} h={L.h} />
        <svg class="config-grid" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
          {Array.from({ length: L.cols - 1 }, (_, i) => (
            <line x1={(i + 1) * L.cw} y1="0" x2={(i + 1) * L.cw} y2={L.h} />
          ))}
          {Array.from({ length: L.rows - 1 }, (_, i) => (
            <line x1="0" y1={(i + 1) * L.ch} x2={L.w} y2={(i + 1) * L.ch} />
          ))}
        </svg>
      </div>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Dessin</legend>
        <div class="art-picker">
          {ARTS.map((a) => (
            <button
              type="button"
              class={`art-choice ${a.id === art ? "is-active" : ""}`}
              aria-pressed={a.id === art}
              title={a.name}
              data-sound="chip.select"
              onClick={() => send({ t: "configure", config: { art: a.id } })}
            >
              <ArtThumb art={a.id} uid={`pick-${a.id}`} class="art-thumb" />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Format</legend>
        {FORMATS.map((f) => (
          <button
            type="button"
            class={`chip format-chip ${f.id === format ? "is-active" : ""}`}
            aria-pressed={f.id === format}
            data-sound="chip.select"
            onClick={() => send({ t: "configure", config: { format: f.id } })}
          >
            <span class="format-shape" style={{ aspectRatio: `${f.w} / ${f.h}` }} aria-hidden="true" />
            {f.name}
          </button>
        ))}
      </fieldset>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Nombre de pièces</legend>
        {PIECE_COUNTS.map((n) => {
          const g = layout({ count: n, format });
          return (
            <button
              type="button"
              class={`chip mono ${n === count ? "is-active" : ""} ${n > 200 ? "is-xl" : ""}`}
              aria-pressed={n === count}
              data-sound="chip.select"
              title={`${g.cols} × ${g.rows}`}
              onClick={() => send({ t: "configure", config: { count: n } })}
            >
              {g.cols * g.rows}
            </button>
          );
        })}
      </fieldset>
      <p class="muted small">
        {host ? "Tu choisis, tout le monde assemble." : "L'hôte choisit le dessin, le format et le nombre de pièces."} Une pièce ne se
        valide sur le plateau que si elle touche le reste du puzzle (ou si c'est un coin) ; hors du plateau, deux voisines s'emboîtent.
      </p>
    </div>
  );
}

function PuzzleRoom({ state, sendAction, subscribe, onLeave }: RoomProps) {
  const view = state as PuzzleView;
  const send = sendAction as (a: PuzzleAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Puzzle"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Renverser la boîte"
        readyLabel="Prêt à chercher les coins"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={<Config view={view} send={send} />}
      />
    );
  }
  return <Table view={view} send={send} subscribe={subscribe} onLeave={onLeave} />;
}

export const puzzle: GameClient = { Home, Cover, Room: PuzzleRoom };
