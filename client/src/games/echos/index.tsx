// Point d'entrée d'Échos pour la plateforme.

import { LEVELS, RULES, type EchoAction, type EchoView, type Mode } from "../../../../shared/games/echos";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { Final } from "./Final";
import { Cover, Home } from "./Home";
import { Stage } from "./Stage";
import "./echos.css";

const MODES: { id: Mode; name: string; line: string }[] = [
  { id: "coop", name: "Coopération", line: `${LEVELS.length} salles : couvrez toutes les plaques dorées en même temps, avec l'aide de vos échos.` },
  { id: "versus", name: "Versus", line: `${RULES.versusRounds} manches dans l'arène : tenez les plaques seuls, vos échos bousculent ceux des autres.` },
];

function ModePicker({ view, send }: { view: EchoView; send: (a: EchoAction) => void }) {
  const host = view.players.find((p) => p.id === view.you)?.isHost;
  return (
    <fieldset class="mode-picker" disabled={!host}>
      <legend class="field-label">Mode</legend>
      {MODES.map((m) => (
        <button
          type="button"
          class={`mode-choice ${view.mode === m.id ? "is-active" : ""}`}
          aria-pressed={view.mode === m.id}
          data-sound="chip.select"
          onClick={() => send({ t: "configure", mode: m.id })}
        >
          <strong>{m.name}</strong>
          <span class="small muted">{m.line}</span>
        </button>
      ))}
      {!host && <p class="muted small">L'hôte choisit le mode.</p>}
    </fieldset>
  );
}

function EchoRoom({ state, sendAction, subscribe, onLeave }: RoomProps) {
  const view = state as EchoView;
  const send = sendAction as (action: EchoAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Échos"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Lancer la première manche"
        readyLabel="Prêt à se dédoubler"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={
          <>
            <ModePicker view={view} send={send} />
            <h2 class="h5">Les règles du temps</h2>
            <dl class="rules-list">
              <div>
                <dt class="mono">30″</dt>
                <dd>par manche ; à la suivante, tout le monde repart du début</dd>
              </div>
              <div>
                <dt class="mono">⟲</dt>
                <dd>ce que tu as joué revient en écho, à côté de toi, geste pour geste</dd>
              </div>
              <div>
                <dt class="mono">{RULES.maxRounds}</dt>
                <dd>manches par salle au plus ; au-delà, c'est le paradoxe et les échos s'effacent</dd>
              </div>
            </dl>
            <p class="muted small">Le plus dur n'est pas d'être au bon endroit. C'est d'y être au bon moment, et de t'en souvenir la fois suivante.</p>
          </>
        }
      />
    );
  }
  if (view.phase === "final") return <Final view={view} send={send} onLeave={onLeave} />;
  return <Stage view={view} send={send} subscribe={subscribe} onLeave={onLeave} />;
}

export const echos: GameClient = { Home, Cover, Room: EchoRoom };
