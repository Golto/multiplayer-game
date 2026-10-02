// Branche la palette sonore sur l'interface et sur les événements de la partie.

import { useEffect, useRef } from "preact/hooks";
import type { GameView } from "../../../shared/protocol";
import type { Status } from "../net";
import { play, unlockAudio, type SoundId } from "./engine";

/**
 * Sons d'interface, par délégation : chaque bouton joue son `data-sound`, sinon un son par défaut
 * selon son style. `data-sound="none"` le rend muet. La frappe au clavier joue `input.key`, et le
 * survol d'une carte un bruit de carton.
 */
export function installUiSounds(): void {
  const unlock = () => unlockAudio();
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });

  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest?.("button");
    if (!button || button.disabled) return;
    const explicit = button.getAttribute("data-sound");
    if (explicit === "none") return;
    if (explicit) return play(explicit as SoundId);
    if (button.classList.contains("btn-primary")) return play("button.primary");
    play("button.tap");
  });

  // Un petit bruit de carton quand la souris passe sur une carte.
  document.addEventListener("pointerover", (event) => {
    if ((event as PointerEvent).pointerType !== "mouse") return;
    const card = (event.target as Element | null)?.closest?.(".card");
    if (!card) return;
    const from = (event as PointerEvent).relatedTarget as Node | null;
    if (from && card.contains(from)) return;
    play("card.hover");
  });

  document.addEventListener("input", (event) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const kind = (event as InputEvent).inputType ?? "";
    play(kind.startsWith("delete") ? "input.delete" : "input.key");
  });
}

/** Sons liés à l'état de la partie, déduits en comparant l'état reçu au précédent. */
export function useGameSounds(view: GameView | null, status: Status): void {
  const prev = useRef<GameView | null>(null);
  const prevStatus = useRef<Status>(status);

  useEffect(() => {
    const before = prevStatus.current;
    prevStatus.current = status;
    if (!prev.current) return;
    if (before === "open" && status === "closed") play("system.offline");
    if (before !== "open" && status === "open") play("system.ready");
  }, [status]);

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
