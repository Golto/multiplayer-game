import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { navigate } from "../router";
import { Icon } from "./icons";
import { applyTheme, currentTheme } from "../theme";
import { isMuted, play, setMuted } from "../sound/engine";

/** Lien interne : navigue sans recharger la page. */
export function Link(props: JSX.IntrinsicElements["a"] & { href: string }) {
  return (
    <a
      {...props}
      onClick={(e) => {
        props.onClick?.(e as never);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(props.href);
      }}
    />
  );
}

/**
 * Logo et nom en haut à gauche. Sans `href` (pendant une partie), ce n'est pas un lien : on ne
 * quitte pas un salon par mégarde.
 */
export function Brand({ name = "Salle de jeux", href, compact = false }: { name?: string; href?: string; compact?: boolean }) {
  const content = (
    <>
      <img class="logo" src="/golpex.svg" alt="" width={28} height={28} />
      <span class="brand-name">{name}</span>
    </>
  );
  const cls = `brand ${compact ? "brand-compact" : ""}`;
  return href ? (
    <Link class={cls} href={href} aria-label={`${name}, retour`}>
      {content}
    </Link>
  ) : (
    <span class={cls}>{content}</span>
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
