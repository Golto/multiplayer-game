// Ce qu'un jeu fournit au client de la plateforme.

import type { ComponentType } from "preact";
import type { PlatformSend } from "../net";

export interface HomeProps {
  send: PlatformSend;
  /** Code prérempli quand on arrive par un lien d'invitation. */
  initialCode: string | null;
  connecting: boolean;
}

export interface RoomProps {
  /** État envoyé par le serveur pour ce joueur, propre au jeu. */
  state: unknown;
  sendAction: (action: unknown) => void;
  /** S'abonne aux événements rapides du salon ; renvoie la fonction de désabonnement. */
  subscribe: (listener: (event: unknown) => void) => () => void;
  onLeave: () => void;
}

export interface GameClient {
  /** Page de présentation du jeu : créer ou rejoindre un salon. */
  Home: ComponentType<HomeProps>;
  /** Illustration de la boîte du jeu, dans la salle de jeux. */
  Cover: ComponentType;
  /** Tout ce qui se passe une fois dans un salon. */
  Room: ComponentType<RoomProps>;
}
