// Point d'entrée de Puits pour la plateforme.

import { RULES, WELL_DECAY, type PuitsAction, type PuitsView } from "../../../../shared/games/puits";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { Arena } from "./Arena";
import { Final } from "./Final";
import { Cover, Home } from "./Home";
import "./puits.css";

function PuitsRoom({ state, sendAction, onLeave }: RoomProps) {
  const view = state as PuitsView;
  const send = sendAction as (action: PuitsAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Puits"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Mettre en orbite"
        readyLabel="Prêt au décollage"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={
          <>
            <h2 class="h5">Les lois de l'orbite</h2>
            <dl class="rules-list">
              <div>
                <dt class="mono">1</dt>
                <dd>puits ou répulseur par tour, posé en secret, en même temps que les autres</dd>
              </div>
              <div>
                <dt class="mono">{WELL_DECAY.length}</dt>
                <dd>tours d'effet pour chaque puits, de plus en plus faible</dd>
              </div>
              <div>
                <dt class="mono">☼</dt>
                <dd>le soleil et le vide au-delà du bord détruisent les vaisseaux</dd>
              </div>
              <div>
                <dt class="mono">{RULES.rounds}×</dt>
                <dd>
                  manches d'au plus {RULES.maxTurns} tours : éclats +{RULES.points.shard}, éliminations +{RULES.points.kill}, survie +
                  {RULES.points.survive}
                </dd>
              </div>
            </dl>
            <p class="muted small">Deux vaisseaux qui se percutent échangent leur élan. Les billards à trois bandes sont permis.</p>
          </>
        }
      />
    );
  }
  if (view.phase === "final") return <Final view={view} send={send} onLeave={onLeave} />;
  return <Arena view={view} send={send} onLeave={onLeave} />;
}

export const puits: GameClient = { Home, Cover, Room: PuitsRoom };
