import { useState } from "preact/hooks";
import { CODE_LENGTH, COMMODITIES, RULES } from "../../../shared/protocol";
import { Card, Watermark } from "../art";
import { Icon } from "../icons";
import type { Send } from "../main";
import { Brand, SoundToggle, ThemeToggle } from "./common";

const NAME_KEY = "rumeurs.name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

const HERO_VALUES = [6, -4, 2, -8];

export function Home({ send, initialCode, connecting }: { send: Send; initialCode: string | null; connecting: boolean }) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(initialCode ?? "");
  const [nameError, setNameError] = useState(false);

  const remember = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // Sans stockage, on redemandera le pseudo.
    }
  };

  const withName = (action: () => void) => {
    if (!name.trim()) {
      setNameError(true);
      document.getElementById("name")?.focus();
      return;
    }
    remember();
    action();
  };

  const create = () => withName(() => send({ t: "create", name }));
  const join = (e?: Event) => {
    e?.preventDefault();
    withName(() => send({ t: "join", code, name }));
  };

  return (
    <div class="page home">
      <Watermark />
      <header class="topbar">
        <Brand />
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </header>

      <main class="home-grid">
        <section class="hero">
          <p class="eyebrow">Jeu de bluff boursier · 3 à 8 joueurs · 15 min</p>
          <h1 class="hero-title">
            Rumeurs<span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            Le comptoir où tout se sait et où rien n'est sûr. Chacun tient une carte de chaque marchandise. Ensemble, vous savez tout.
            Seul, vous ne savez presque rien.
          </p>

          <div class="hero-fan" aria-hidden="true">
            {COMMODITIES.map((c, i) => (
              <div class="fan-slot" style={{ "--i": i } as never}>
                <Card commodity={c.id} value={HERO_VALUES[i]!} size="lg" serial={17 + i * 23} ownerName="Toi" />
              </div>
            ))}
          </div>
        </section>

        <section class="panel entry" aria-labelledby="entry-title">
          <h2 id="entry-title" class="h4">
            Entrer au comptoir
          </h2>

          <label class="field">
            <span class="field-label">Ton pseudo</span>
            <input
              id="name"
              class={`input ${nameError ? "is-invalid" : ""}`}
              value={name}
              maxLength={RULES.nameMax}
              autocomplete="nickname"
              placeholder="Ex. Léa la Fouine"
              onInput={(e) => {
                setName(e.currentTarget.value);
                setNameError(false);
              }}
              aria-invalid={nameError}
              aria-describedby={nameError ? "name-error" : undefined}
            />
            {nameError && (
              <span id="name-error" class="field-error">
                Il faut un pseudo pour s'asseoir.
              </span>
            )}
          </label>

          <button class="btn btn-primary btn-lg btn-block" type="button" onClick={create} disabled={connecting}>
            Ouvrir un salon privé
            <Icon name="arrowRight" size={20} />
          </button>

          <div class="divider">
            <span>ou rejoindre des amis</span>
          </div>

          <form class="join-row" onSubmit={join}>
            <label class="field grow">
              <span class="field-label">Code du salon</span>
              <input
                class="input input-code"
                value={code}
                maxLength={CODE_LENGTH}
                placeholder="K7MPQ"
                autocapitalize="characters"
                spellcheck={false}
                onInput={(e) => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
            </label>
            <button class="btn btn-outline btn-lg" type="submit" disabled={connecting || code.length !== CODE_LENGTH}>
              Rejoindre
            </button>
          </form>
          {connecting && <p class="muted small">Connexion au comptoir…</p>}
        </section>
      </main>

      <section class="how" aria-labelledby="how-title">
        <h2 id="how-title" class="h3">
          Une partie en quatre séances
        </h2>
        <ol class="how-steps">
          <li>
            <span class="how-num">01</span>
            <h3 class="h6">Tu reçois tes cartes</h3>
            <p>
              Une carte par marchandise, que toi seul vois. La vraie valeur d'une marchandise, c'est {RULES.basePrice} écus plus la
              somme de toutes ses cartes, dont une carte scellée que personne ne voit.
            </p>
          </li>
          <li>
            <span class="how-num">02</span>
            <h3 class="h6">Tu lances une rumeur</h3>
            <p>Vraie ou fausse, elle reste signée de ton nom. Les rumeurs vérifiables seront tamponnées « Confirmé » ou « Démenti ».</p>
          </li>
          <li>
            <span class="how-num">03</span>
            <h3 class="h6">Tu passes tes ordres</h3>
            <p>Achats et ventes sont simultanés. Plus il y a d'acheteurs, plus le prix grimpe, pour tout le monde.</p>
          </li>
          <li>
            <span class="how-num">04</span>
            <h3 class="h6">Une carte est retournée</h3>
            <p>À chaque clôture, la carte d'un joueur est révélée. Les menteurs tremblent. À la fin, on compte les écus.</p>
          </li>
        </ol>
      </section>

      <footer class="footer muted small">Un jeu golpex · fait pour les soirées entre amis</footer>
    </div>
  );
}
