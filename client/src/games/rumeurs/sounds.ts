// Sons des événements d'une partie de Rumeurs, déduits en comparant l'état reçu au précédent.

import { useEffect, useRef } from "preact/hooks";
import type { GameView } from "../../../../shared/games/rumeurs";
import { play, type SoundId } from "../../sound/engine";

/** Sons liés à l'état de la partie, déduits en comparant l'état reçu au précédent. */
export function useRumeursSounds(view: GameView): void {
  const prev = useRef<GameView | null>(null);

  useEffect(() => {
    const old = prev.current;
    prev.current = view;
    if (!view) return;
    if (!old) return play("nav.forward");
    if (old.code !== view.code) return;

    if (old.phase !== view.phase) {
      switch (view.phase) {
        case "rumor":
          return play(old.phase === "lobby" ? "system.start" : "disclosure.expand");
        case "market":
          play("system.unlock");
          if (view.rumors.some((r) => r.input.kind !== "silence")) later(380, "input.suggestion");
          return;
        case "report":
          play("system.lock");
          return later(260, "modal.open");
        case "final":
          play("feedback.complete");
          return later(1900, "system.ready");
        case "lobby":
          return play("nav.back");
      }
    }

    if (view.phase === "lobby") {
      if (view.players.length > old.players.length) play("feedback.notification");
      else if (view.players.length < old.players.length) play("chip.deselect");
      return;
    }

    // Un autre joueur vient de valider sa phase.
    const othersDone = (v: GameView) => v.players.filter((p) => p.id !== v.you && p.done).length;
    if (othersDone(view) > othersDone(old)) play("checkbox.check");
  }, [view]);
}

function later(ms: number, id: SoundId): void {
  setTimeout(() => play(id), ms);
}
