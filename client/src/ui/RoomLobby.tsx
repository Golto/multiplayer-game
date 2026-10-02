// Salle d'attente commune à tous les jeux : code du salon, sièges, lancement, règlement.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { PlayerSeal, Watermark } from "./art";
import { Brand, SoundToggle, ThemeToggle } from "./chrome";
import { Icon } from "./icons";

export interface LobbyPlayer {
  id: string;
  name: string;
  accent: string;
  connected: boolean;
  isHost: boolean;
}

interface Props {
  gameName: string;
  code: string;
  you: string;
  players: LobbyPlayer[];
  minPlayers: number;
  maxPlayers: number;
  /** Libellé du bouton de lancement, et statut d'un joueur prêt. */
  startLabel: string;
  readyLabel: string;
  onStart: () => void;
  onLeave: () => void;
  /** Contenu du panneau de règles, à droite. */
  rules: ComponentChildren;
}

export function RoomLobby({ gameName, code, you, players, minPlayers, maxPlayers, startLabel, readyLabel, onStart, onLeave, rules }: Props) {
  const [copied, setCopied] = useState(false);
  const me = players.find((p) => p.id === you);
  const isHost = !!me?.isHost;
  const connected = players.filter((p) => p.connected).length;
  const missing = Math.max(0, minPlayers - connected);
  const link = `${location.origin}/r/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie ce lien :", link);
    }
  };

  const seats = Array.from({ length: maxPlayers }, (_, i) => players[i] ?? null);

  return (
    <div class="page lobby">
      <Watermark />
      <header class="topbar">
        <Brand name={gameName} />
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
          <button class="btn btn-ghost" type="button" data-sound="nav.back" onClick={onLeave}>
            <Icon name="arrowLeft" size={16} /> Quitter
          </button>
        </div>
      </header>

      <main class="lobby-grid">
        <section class="panel code-panel" aria-labelledby="code-title">
          <p class="eyebrow">Salon privé</p>
          <h1 id="code-title" class="sr-only">
            Code du salon {code.split("").join(" ")}
          </h1>
          <div class="code-tiles" aria-hidden="true">
            {code.split("").map((ch, i) => (
              <span class="code-tile" style={{ "--i": i } as never}>
                {ch}
              </span>
            ))}
          </div>
          <p class="muted">Donne ce code à tes amis, ou envoie-leur directement le lien.</p>
          <div class="code-actions">
            <button class="btn btn-outline" type="button" data-sound="feedback.success" onClick={copy}>
              <Icon name={copied ? "check" : "envelope"} size={16} />
              {copied ? "Lien copié" : "Copier le lien d'invitation"}
            </button>
          </div>
        </section>

        <section class="panel seats-panel" aria-labelledby="seats-title">
          <div class="panel-head">
            <h2 id="seats-title" class="h5">
              Autour de la table
            </h2>
            <span class="pill mono">
              {players.length}/{maxPlayers}
            </span>
          </div>
          <ul class="seats">
            {seats.map((p, i) =>
              p ? (
                <li class={`seat ${p.connected ? "" : "is-away"} ${p.id === you ? "is-you" : ""}`} style={{ "--i": i } as never}>
                  <PlayerSeal name={p.name} accent={p.accent} size={40} />
                  <div class="seat-text">
                    <span class="seat-name">
                      {p.name}
                      {p.id === you && <span class="muted"> (toi)</span>}
                    </span>
                    <span class="seat-role muted small">
                      {p.isHost ? "Hôte du salon" : p.connected ? readyLabel : "Reconnexion…"}
                    </span>
                  </div>
                </li>
              ) : (
                <li class="seat seat-empty">
                  <span class="seal seal-empty" aria-hidden="true" />
                  <span class="muted small">Siège libre</span>
                </li>
              ),
            )}
          </ul>

          <div class="lobby-start">
            {isHost ? (
              <button class="btn btn-primary btn-lg btn-block" type="button" disabled={missing > 0} onClick={onStart}>
                {missing > 0 ? `Encore ${missing} joueur${missing > 1 ? "s" : ""} pour commencer` : startLabel}
                {missing === 0 && <Icon name="arrowRight" size={20} />}
              </button>
            ) : (
              <p class="waiting">
                <span class="pulse-dot" aria-hidden="true" />
                {missing > 0
                  ? `En attente de ${missing} joueur${missing > 1 ? "s" : ""}…`
                  : `${players.find((p) => p.isHost)?.name ?? "L'hôte"} peut lancer la partie.`}
              </p>
            )}
          </div>
        </section>

        <aside class="panel rules-panel" aria-label="Règles">
          {rules}
        </aside>
      </main>
    </div>
  );
}
