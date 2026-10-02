// Pseudo mémorisé dans le navigateur, partagé par tous les jeux.

const NAME_KEY = "rumeurs.name";

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // Sans stockage, on redemandera le pseudo.
  }
}
