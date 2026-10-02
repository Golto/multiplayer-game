// Formulaire d'entrée d'un jeu : pseudo, ouvrir un salon, ou rejoindre avec un code.

import { useState } from "preact/hooks";
import { CODE_LENGTH, NAME_MAX, type GameId } from "../../../shared/platform";
import type { PlatformSend } from "../net";
import { Icon } from "./icons";
import { rememberName, savedName } from "./name";

interface Props {
  game: GameId;
  title: string;
  send: PlatformSend;
  initialCode: string | null;
  connecting: boolean;
}

export function EntryPanel({ game, title, send, initialCode, connecting }: Props) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(initialCode ?? "");
  const [nameError, setNameError] = useState(false);

  const withName = (action: () => void) => {
    if (!name.trim()) {
      setNameError(true);
      document.getElementById("name")?.focus();
      return;
    }
    rememberName(name);
    action();
  };

  const create = () => withName(() => send({ t: "create", game, name }));
  const join = (e?: Event) => {
    e?.preventDefault();
    withName(() => send({ t: "join", code, name }));
  };

  return (
    <section class="panel entry" aria-labelledby="entry-title">
      <h2 id="entry-title" class="h4">
        {title}
      </h2>

      <label class="field">
        <span class="field-label">Ton pseudo</span>
        <input
          id="name"
          class={`input ${nameError ? "is-invalid" : ""}`}
          value={name}
          maxLength={NAME_MAX}
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
      {connecting && <p class="muted small">Connexion à la salle…</p>}
    </section>
  );
}
