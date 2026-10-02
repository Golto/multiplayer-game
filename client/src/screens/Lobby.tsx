import { useState } from "preact/hooks";
import { RULES, type GameView } from "../../../shared/protocol";
import { PlayerSeal, Watermark } from "../art";
import { Icon } from "../icons";
import type { Send } from "../main";
import { Brand, ThemeToggle } from "./common";

export function Lobby({ view, send, onLeave }: { view: GameView; send: Send; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const me = view.players.find((p) => p.id === view.you);
  const isHost = !!me?.isHost;
  const connected = view.players.filter((p) => p.connected).length;
  const missing = Math.max(0, RULES.minPlayers - connected);
  const link = `${location.origin}/r/${view.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie ce lien :", link);
    }
  };

  const seats = Array.from({ length: RULES.maxPlayers }, (_, i) => view.players[i] ?? null);

  return (
    <div class="page lobby">
      <Watermark />
      <header class="topbar">
        <Brand />
        <div class="topbar-actions">
          <ThemeToggle />
          <button class="btn btn-ghost" type="button" onClick={onLeave}>
            <Icon name="arrowLeft" size={16} /> Quitter
          </button>
        </div>
      </header>

      <main class="lobby-grid">
        <section class="panel code-panel" aria-labelledby="code-title">
          <p class="eyebrow">Salon privé</p>
          <h1 id="code-title" class="sr-only">
            Code du salon {view.code.split("").join(" ")}
          </h1>
          <div class="code-tiles" aria-hidden="true">
            {view.code.split("").map((ch, i) => (
              <span class="code-tile" style={{ "--i": i } as never}>
                {ch}
              </span>
            ))}
          </div>
          <p class="muted">Donne ce code à tes amis, ou envoie-leur directement le lien.</p>
          <div class="code-actions">
            <button class="btn btn-outline" type="button" onClick={copy}>
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
              {view.players.length}/{RULES.maxPlayers}
            </span>
          </div>
          <ul class="seats">
            {seats.map((p, i) =>
              p ? (
                <li class={`seat ${p.connected ? "" : "is-away"} ${p.id === view.you ? "is-you" : ""}`} style={{ "--i": i } as never}>
                  <PlayerSeal name={p.name} accent={p.accent} size={40} />
                  <div class="seat-text">
                    <span class="seat-name">
                      {p.name}
                      {p.id === view.you && <span class="muted"> (toi)</span>}
                    </span>
                    <span class="seat-role muted small">
                      {p.isHost ? "Hôte du salon" : p.connected ? "Prêt à spéculer" : "Reconnexion…"}
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
              <button class="btn btn-primary btn-lg btn-block" type="button" disabled={missing > 0} onClick={() => send({ t: "start" })}>
                {missing > 0 ? `Encore ${missing} joueur${missing > 1 ? "s" : ""} pour commencer` : "Ouvrir la séance"}
                {missing === 0 && <Icon name="arrowRight" size={20} />}
              </button>
            ) : (
              <p class="waiting">
                <span class="pulse-dot" aria-hidden="true" />
                {missing > 0
                  ? `En attente de ${missing} joueur${missing > 1 ? "s" : ""}…`
                  : `${view.players.find((p) => p.isHost)?.name ?? "L'hôte"} peut lancer la partie.`}
              </p>
            )}
          </div>
        </section>

        <aside class="panel rules-panel" aria-labelledby="rules-title">
          <h2 id="rules-title" class="h5">
            Le règlement du comptoir
          </h2>
          <dl class="rules-list">
            <div>
              <dt class="mono">{RULES.rounds}</dt>
              <dd>séances, chacune avec une rumeur, un marché et une révélation</dd>
            </div>
            <div>
              <dt class="mono">{RULES.startCash}</dt>
              <dd>écus en caisse au départ, plus {RULES.startLots} lots de chaque marchandise</dd>
            </div>
            <div>
              <dt class="mono">±{RULES.maxOrder}</dt>
              <dd>lots maximum achetés ou vendus par marchandise et par séance</dd>
            </div>
            <div>
              <dt class="mono">{RULES.basePrice}</dt>
              <dd>écus + la somme des cartes : la vraie valeur, dévoilée à la fin</dd>
            </div>
          </dl>
          <p class="muted small">Mentir est permis. Se faire prendre, c'est autre chose.</p>
        </aside>
      </main>
    </div>
  );
}
