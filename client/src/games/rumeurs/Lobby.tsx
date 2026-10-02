import { RULES, type GameView } from "../../../../shared/games/rumeurs";
import { RoomLobby } from "../../ui/RoomLobby";
import type { Send } from "./types";

export function Lobby({ view, send, onLeave }: { view: GameView; send: Send; onLeave: () => void }) {
  return (
    <RoomLobby
      gameName="Rumeurs"
      code={view.code}
      you={view.you}
      players={view.players}
      minPlayers={RULES.minPlayers}
      maxPlayers={RULES.maxPlayers}
      startLabel="Ouvrir la séance"
      readyLabel="Prêt à spéculer"
      onStart={() => send({ t: "start" })}
      onLeave={onLeave}
      rules={
        <>
          <h2 class="h5">Le règlement du comptoir</h2>
          <dl class="rules-list">
            <div>
              <dt class="mono">{RULES.rounds}</dt>
              <dd>séances, chacune avec une rumeur, un marché et une révélation</dd>
            </div>
            <div>
              <dt class="mono">{RULES.startCash}</dt>
              <dd>écus en caisse au départ, plus {RULES.startLots} lots de chaque marchandise</dd>
            </div>
            <div>
              <dt class="mono">±{RULES.maxOrder}</dt>
              <dd>lots maximum achetés ou vendus par marchandise et par séance</dd>
            </div>
            <div>
              <dt class="mono">{RULES.basePrice}</dt>
              <dd>écus + la somme des cartes : la vraie valeur, dévoilée à la fin</dd>
            </div>
          </dl>
          <p class="muted small">Mentir est permis. Se faire prendre, c'est autre chose.</p>
        </>
      }
    />
  );
}
