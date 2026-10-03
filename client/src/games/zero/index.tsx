// Point d'entrée de Zéro pour la plateforme.

import { useMemo } from "preact/hooks";
import { DEGREES, GRIDS, RULES, TARGETS, cardKinds, rng, type ZeroAction, type ZeroView } from "../../../../shared/games/zero";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { Board } from "./Board";
import { ZCard } from "./cards";
import { Final } from "./Final";
import { Cover, Home } from "./Home";
import "./zero.css";

function Config({ view, send }: { view: ZeroView; send: (a: ZeroAction) => void }) {
  const host = view.players.find((p) => p.id === view.you)?.isHost;
  const { rows, cols, degree, target } = view.config;
  // Quelques cartes de ce degré, pour se faire une idée.
  const samples = useMemo(() => {
    const kinds = cardKinds(degree, rng(11));
    return [kinds[4], kinds[9], kinds[12], kinds[kinds.length - 1]].filter(Boolean).map((k) => k!.card);
  }, [degree]);
  return (
    <div class="zero-config">
      <h2 class="h5">La partie</h2>
      <div class="config-samples" aria-label="Exemples de cartes">
        {samples.map((p) => (
          <ZCard cell={{ card: p, up: true, removed: false }} size="md" />
        ))}
      </div>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Degré maximum des polynômes</legend>
        {DEGREES.map((d) => (
          <button type="button" class={`chip ${d === degree ? "is-active" : ""}`} aria-pressed={d === degree} data-sound="chip.select" onClick={() => send({ t: "configure", config: { degree: d } })}>
            {d === 0 ? "0 · constantes" : d === 1 ? "1 · affines" : d === 2 ? "2 · quadratiques" : "3 · cubiques"}
          </button>
        ))}
      </fieldset>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Grille</legend>
        {GRIDS.map((g) => (
          <button
            type="button"
            class={`chip grid-chip ${g.rows === rows && g.cols === cols ? "is-active" : ""}`}
            aria-pressed={g.rows === rows && g.cols === cols}
            data-sound="chip.select"
            onClick={() => send({ t: "configure", config: { rows: g.rows, cols: g.cols } })}
          >
            <span class="grid-shape" style={{ "--c": g.cols, "--r": g.rows } as never} aria-hidden="true">
              {Array.from({ length: g.rows * g.cols }, () => (
                <i />
              ))}
            </span>
            <span>
              {g.rows} × {g.cols} <span class="muted">{g.name}</span>
            </span>
          </button>
        ))}
      </fieldset>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Fin de partie</legend>
        {TARGETS.map((t) => (
          <button type="button" class={`chip mono ${t === target ? "is-active" : ""}`} aria-pressed={t === target} data-sound="chip.select" onClick={() => send({ t: "configure", config: { target: t } })}>
            {t} pts
          </button>
        ))}
      </fieldset>
      <p class="muted small">{host ? "Tu règles, tout le monde joue." : "L'hôte règle la partie."} Au degré 0, c'est presque un Skyjo classique.</p>
    </div>
  );
}

function ZeroRoom({ state, sendAction, onLeave }: RoomProps) {
  const view = state as ZeroView;
  const send = sendAction as (a: ZeroAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Zéro"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Distribuer les cartes"
        readyLabel="Prêt à tout annuler"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={<Config view={view} send={send} />}
      />
    );
  }
  if (view.phase === "final") return <Final view={view} send={send} onLeave={onLeave} />;
  return <Board view={view} send={send} onLeave={onLeave} />;
}

export const zero: GameClient = { Home, Cover, Room: ZeroRoom };
