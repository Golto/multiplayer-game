import { useState } from "preact/hooks";
import { Icon } from "../icons";
import { applyTheme, currentTheme } from "../theme";
import { isMuted, play, setMuted } from "../sound/engine";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a class={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="Rumeurs, accueil">
      <img class="logo" src="/golpex.svg" alt="" width={28} height={28} />
      <span class="brand-name">Rumeurs</span>
    </a>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme());
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      class="btn btn-ghost btn-icon"
      type="button"
      data-sound={next === "dark" ? "toggle.off" : "toggle.on"}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={next === "dark" ? "Passer en thème sombre" : "Passer en thème clair"}
      title={next === "dark" ? "Thème sombre" : "Thème clair"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
    </button>
  );
}

export function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted());
  return (
    <button
      class={`btn btn-ghost btn-icon sound-toggle ${muted ? "is-muted" : ""}`}
      type="button"
      data-sound="none"
      onClick={() => {
        setMuted(!muted);
        setMutedState(!muted);
        if (muted) play("toggle.on");
      }}
      aria-pressed={!muted}
      aria-label={muted ? "Activer les sons" : "Couper les sons"}
      title={muted ? "Sons coupés" : "Sons activés"}
    >
      <Icon name="bell" size={20} />
    </button>
  );
}
