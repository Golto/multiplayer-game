// Point d'entrée du Puzzle pour la plateforme.

import { ARTS, PIECE_COUNTS, RULES, grid, type PuzzleAction, type PuzzleView } from "../../../../shared/games/puzzle";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { ArtThumb } from "./arts";
import { Cover, Home } from "./Home";
import { Table } from "./Table";
import "./puzzle.css";

function Config({ view, send }: { view: PuzzleView; send: (a: PuzzleAction) => void }) {
  const host = view.players.find((p) => p.id === view.you)?.isHost;
  const { art, count } = view.config;
  const g = grid(count);
  return (
    <div class="puzzle-config">
      <h2 class="h5">Le puzzle</h2>
      <div class="config-preview">
        <ArtThumb art={art} uid="config-preview" class="art-thumb" />
        <svg class="config-grid" viewBox="0 0 1200 900" aria-hidden="true">
          {Array.from({ length: g.cols - 1 }, (_, i) => (
            <line x1={(i + 1) * g.cw} y1="0" x2={(i + 1) * g.cw} y2="900" />
          ))}
          {Array.from({ length: g.rows - 1 }, (_, i) => (
            <line x1="0" y1={(i + 1) * g.ch} x2="1200" y2={(i + 1) * g.ch} />
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
        <legend class="field-label">Nombre de pièces</legend>
        {PIECE_COUNTS.map((n) => (
          <button
            type="button"
            class={`chip mono ${n === count ? "is-active" : ""}`}
            aria-pressed={n === count}
            data-sound="chip.select"
            onClick={() => send({ t: "configure", config: { count: n } })}
          >
            {n}
          </button>
        ))}
      </fieldset>
      <p class="muted small">
        {host ? "Tu choisis, tout le monde assemble." : "L'hôte choisit le dessin et le nombre de pièces."} On peut rejoindre un puzzle en
        cours.
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
