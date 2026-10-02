import { useState } from "preact/hooks";
import { Icon } from "../icons";
import { applyTheme, currentTheme } from "../theme";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a class={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="Rumeurs, accueil">
      <img class="logo logo-light" src="/golpex.svg" alt="" width={28} height={28} />
      <img class="logo logo-dark" src="/golpex-dark.svg" alt="" width={28} height={28} />
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
