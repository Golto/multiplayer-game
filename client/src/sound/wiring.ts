// Branche la palette sonore sur l'interface commune à tous les jeux.

import { useEffect, useRef } from "preact/hooks";
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
    const button = (event.target as Element | null)?.closest?.("button, a[data-sound]") as HTMLButtonElement | null;
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

/** Perte et retour de la connexion au serveur, pendant qu'on est dans un salon. */
export function useConnectionSounds(status: Status, inRoom: boolean): void {
  const prev = useRef<Status>(status);
  useEffect(() => {
    const before = prev.current;
    prev.current = status;
    if (!inRoom) return;
    if (before === "open" && status === "closed") play("system.offline");
    if (before !== "open" && status === "open") play("system.ready");
  }, [status]);
}
