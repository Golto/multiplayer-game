// Point d'entrée de Cartographes pour la plateforme.

import { RULES, type CartoAction, type CartoView } from "../../../../shared/games/cartographes";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { Board } from "./Board";
import { Final } from "./Final";
import { Cover, Home } from "./Home";
import "./cartographes.css";

function CartoRoom({ state, sendAction, onLeave }: RoomProps) {
  const view = state as CartoView;
  const send = sendAction as (action: CartoAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Cartographes"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Partir en expédition"
        readyLabel="Plume taillée"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={
          <>
            <h2 class="h5">Le code des cartographes</h2>
            <dl class="rules-list">
              <div>
                <dt class="mono">1</dt>
                <dd>zone que tu es seul à voir, et une autre que tu peins d'après les messages d'un coéquipier</dd>
              </div>
              <div>
                <dt class="mono">{RULES.message}</dt>
                <dd>pictogrammes par message, au plus : pas un mot, pas un chiffre écrit</dd>
              </div>
              <div>
                <dt class="mono">{RULES.paints}</dt>
                <dd>cases peintes par tour ; tout apparaît ensemble à la fin du tour</dd>
              </div>
              <div>
                <dt class="mono">{RULES.turns}</dt>
                <dd>tours pour dresser la carte, puis on la compare au vrai territoire</dd>
              </div>
            </dl>
            <p class="muted small">Se parler à voix haute ? Ce serait tricher. Le malentendu fait partie du voyage.</p>
          </>
        }
      />
    );
  }
  if (view.phase === "final") return <Final view={view} send={send} onLeave={onLeave} />;
  return <Board view={view} send={send} onLeave={onLeave} />;
}

export const cartographes: GameClient = { Home, Cover, Room: CartoRoom };
