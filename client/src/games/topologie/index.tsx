// Point d'entrée de Topologie pour la plateforme.

import { RULES, type TopoAction, type TopoView } from "../../../../shared/games/topologie";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { Arena } from "./Arena";
import { Final } from "./Final";
import { Cover, Home } from "./Home";
import "./topologie.css";

function TopoRoom({ state, sendAction, subscribe, onLeave }: RoomProps) {
  const view = state as TopoView;
  const send = sendAction as (action: TopoAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Topologie"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Entrer dans l'arène"
        readyLabel="Prêt à conquérir"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={
          <>
            <h2 class="h5">Les règles de l'arène</h2>
            <dl class="rules-list">
              <div>
                <dt class="mono">{RULES.rounds}</dt>
                <dd>manches, chacune sur une surface différente tirée au sort</dd>
              </div>
              <div>
                <dt class="mono">{RULES.roundSeconds / 60}′</dt>
                <dd>par manche : à la fin, le territoire possédé compte</dd>
              </div>
              <div>
                <dt class="mono">↺</dt>
                <dd>rentrer chez soi transforme sa traîne, et ce qu'elle enferme, en territoire</dd>
              </div>
              <div>
                <dt class="mono">✕</dt>
                <dd>couper une traîne fait tomber son propriétaire, même si c'est toi</dd>
              </div>
            </dl>
            <p class="muted small">Sur un tore, faire le tour du monde n'enferme rien. À méditer.</p>
          </>
        }
      />
    );
  }
  if (view.phase === "final") return <Final view={view} send={send} onLeave={onLeave} />;
  return <Arena view={view} send={send} subscribe={subscribe} onLeave={onLeave} />;
}

export const topologie: GameClient = { Home, Cover, Room: TopoRoom };
