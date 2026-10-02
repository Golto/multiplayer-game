// Thème clair/sombre piloté par la classe `.dark` sur <html> et le cookie `app-theme`, comme golpex.

export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function initTheme(): void {
  const saved = document.cookie.match(/(?:^|; )app-theme=(light|dark)/)?.[1] as Theme | undefined;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(saved ?? (prefersDark ? "dark" : "light"));
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.cookie = `app-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}
