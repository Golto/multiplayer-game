// Point d'entrée de Tapis pour la plateforme.

import { BLINDS, LENGTHS, LEVEL_HANDS, RULES, SPEEDS, type TapisAction, type TapisConfig, type TapisView } from "../../../../shared/games/tapis";
import { RoomLobby } from "../../ui/RoomLobby";
import type { GameClient, RoomProps } from "../types";
import { Board } from "./Board";
import { Final } from "./Final";
import { Cover, Home } from "./Home";
import "./tapis.css";

const TWISTS: { key: "wild" | "exchange" | "bounty"; name: string; text: string }[] = [
  { key: "wild", name: "La folle", text: "Une carte retournée à chaque donne : sa jumelle (même hauteur, même couleur) remplace n'importe quelle carte." },
  { key: "exchange", name: "L'échange", text: "Une fois par donne, au flop : deux grosses blindes pour remplacer une de ses cartes, montrée à tous." },
  { key: "bounty", name: "La prime", text: "Un défi par donne ; le relever en gagnant rapporte une petite blinde de chacun." },
];

const SPEED_NAMES: Record<string, string> = { calme: "Calme", normal: "Normale", rapide: "Rapide" };

function Config({ view, send }: { view: TapisView; send: (a: TapisAction) => void }) {
  const host = view.players.find((p) => p.id === view.you)?.isHost;
  const set = (config: Partial<TapisConfig>) => send({ t: "configure", config });
  const { config } = view;
  return (
    <div class="tapis-config">
      <h2 class="h5">La table</h2>
      <p class="muted small">
        Hold'em sans limite, {RULES.stack.toLocaleString("fr-FR")} jetons chacun, blindes {BLINDS[0]![0]}/{BLINDS[0]![1]} au départ.
      </p>
      <fieldset class="tapis-twists" disabled={!host}>
        <legend class="field-label">Les entorses</legend>
        {TWISTS.map((t) => (
          <button
            type="button"
            class={`tapis-twist ${config[t.key] ? "is-active" : ""}`}
            aria-pressed={config[t.key]}
            data-sound={config[t.key] ? "toggle.off" : "toggle.on"}
            onClick={() => set({ [t.key]: !config[t.key] })}
          >
            <span class="tapis-twist-check" aria-hidden="true">
              {config[t.key] ? "✓" : ""}
            </span>
            <span>
              <strong>{t.name}</strong>
              <span class="muted small">{t.text}</span>
            </span>
          </button>
        ))}
      </fieldset>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Montée des blindes</legend>
        {SPEEDS.map((s) => (
          <button type="button" class={`chip ${s === config.speed ? "is-active" : ""}`} aria-pressed={s === config.speed} data-sound="chip.select" onClick={() => set({ speed: s })}>
            {SPEED_NAMES[s]} <span class="muted">· {LEVEL_HANDS[s]} donnes</span>
          </button>
        ))}
      </fieldset>
      <fieldset class="chip-group" disabled={!host}>
        <legend class="field-label">Fin de partie</legend>
        {LENGTHS.map((l) => (
          <button type="button" class={`chip ${l === config.length ? "is-active" : ""}`} aria-pressed={l === config.length} data-sound="chip.select" onClick={() => set({ length: l })}>
            {l === 0 ? "Jusqu'au dernier" : `${l} donnes`}
          </button>
        ))}
      </fieldset>
      <p class="muted small">
        {host ? "Tu règles, tout le monde joue." : "L'hôte règle la table."} Sans entorse, c'est un hold'em classique. Avec une durée fixe, le plus
        gros tapis gagne.
      </p>
    </div>
  );
}

function TapisRoom({ state, sendAction, onLeave }: RoomProps) {
  const view = state as TapisView;
  const send = sendAction as (a: TapisAction) => void;
  if (view.phase === "lobby") {
    return (
      <RoomLobby
        gameName="Tapis"
        code={view.code}
        you={view.you}
        players={view.players}
        minPlayers={RULES.minPlayers}
        maxPlayers={RULES.maxPlayers}
        startLabel="Distribuer"
        readyLabel="Prêt à bluffer"
        onStart={() => send({ t: "start" })}
        onLeave={onLeave}
        rules={<Config view={view} send={send} />}
      />
    );
  }
  if (view.phase === "final") return <Final view={view} send={send} onLeave={onLeave} />;
  return <Board view={view} send={send} onLeave={onLeave} />;
}

export const tapis: GameClient = { Home, Cover, Room: TapisRoom };
