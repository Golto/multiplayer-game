// Point d'entrée de Rumeurs pour la plateforme : la page du jeu et l'écran d'un salon.

import { useMemo } from "preact/hooks";
import type { GameView } from "../../../../shared/games/rumeurs";
import type { GameClient, RoomProps } from "../types";
import { FinalScreen } from "./Final";
import { GameScreen } from "./Game";
import { Cover, Home } from "./Home";
import { Lobby } from "./Lobby";
import { useRumeursSounds } from "./sounds";
import type { Send } from "./types";

function RumeursRoom({ state, sendAction, onLeave }: RoomProps) {
  const view = state as GameView;
  const send: Send = sendAction;
  useRumeursSounds(view);
  // L'horloge du serveur sert au compte à rebours, indépendamment de celle du joueur.
  const clockOffset = useMemo(() => view.serverNow - Date.now(), [view]);
  if (view.phase === "lobby") return <Lobby view={view} send={send} onLeave={onLeave} />;
  if (view.phase === "final") return <FinalScreen view={view} send={send} onLeave={onLeave} />;
  return <GameScreen view={view} send={send} clockOffset={clockOffset} onLeave={onLeave} />;
}

export const rumeurs: GameClient = { Home, Cover, Room: RumeursRoom };
