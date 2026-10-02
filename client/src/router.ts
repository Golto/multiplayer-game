// Routage minimal : l'URL est l'état, `navigate` la change sans recharger la page.

import { useEffect, useState } from "preact/hooks";

const listeners = new Set<() => void>();

export function navigate(to: string, { replace = false } = {}): void {
  if (to === location.pathname) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

/** Code de salon présent dans une URL d'invitation `/r/CODE`. */
export function roomCodeFromPath(path: string): string | null {
  const match = path.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/);
  return match ? match[1]!.toUpperCase() : null;
}
