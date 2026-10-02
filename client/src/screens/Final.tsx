import { useEffect, useState } from "preact/hooks";
import { RULES, describeRumor, formatSigned, type GameView } from "../../../shared/protocol";
import { Card, CommodityGlyph, PlayerSeal, Watermark, accentVar, commodityInfo } from "../art";
import { Icon } from "../icons";
import { play } from "../sound/engine";
import type { Send } from "../main";
import { Brand, SoundToggle, ThemeToggle } from "./common";
import { Dispatch, serialOf, usePlayers } from "./Game";

const AWARD_GLYPH: Record<string, string> = {
  vipere: "V",
  or: "Or",
  flair: "F",
  pigeon: "P",
  carpe: "…",
};

export function FinalScreen({ view, send, onLeave }: { view: GameView; send: Send; onLeave: () => void }) {
  const playerOf = usePlayers(view);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ids = [setTimeout(() => setShown(true), 400)];
    // Une cascade de retournements, une marchandise après l'autre.
    for (let row = 0; row < 4; row++) ids.push(setTimeout(() => play("carousel.next", { pitch: row * 2 }), 700 + row * 450));
    return () => ids.forEach(clearTimeout);
  }, []);

  const final = view.final;
  if (!final) return null;
  const me = playerOf(view.you);
  const best = final.standings[0]?.total ?? 1;
  const verified = view.rumors.filter((r) => r.verdict);
  const lies = verified.filter((r) => r.verdict === "false");

  return (
    <div class="page final">
      <Watermark />
      <header class="topbar">
        <Brand />
        <div class="topbar-actions">
          <SoundToggle />
          <ThemeToggle />
          <button class="btn btn-ghost" type="button" data-sound="nav.back" onClick={onLeave}>
            <Icon name="arrowLeft" size={16} /> Quitter
          </button>
        </div>
      </header>

      <main class="final-main">
        <section class="final-hero">
          <p class="eyebrow">Le grand dévoilement</p>
          <h1 class="hero-title final-title">
            {final.standings[0] && playerOf(final.standings[0].player)?.name}
            <span class="hero-dot">.</span>
          </h1>
          <p class="hero-lead">
            remporte le comptoir avec <strong class="mono">{final.standings[0]?.total}</strong> écus.
          </p>
        </section>

        <section class="panel truth" aria-labelledby="truth-title">
          <h2 id="truth-title" class="h4">
            Les vrais cours
          </h2>
          <div class="truth-rows">
            {view.commodities.map((c, row) => {
              const info = commodityInfo(c.id);
              const last = c.history[c.history.length - 1] ?? c.price;
              return (
                <div class="truth-row" style={accentVar(info.accent)}>
                  <div class="truth-name">
                    <span class="board-glyph">
                      <CommodityGlyph id={c.id} size={28} />
                    </span>
                    <div>
                      <h3 class="h6">{info.name}</h3>
                      <span class="muted small mono">dernier cours {last} é</span>
                    </div>
                  </div>
                  <ul class="truth-cards">
                    {c.cards.map((card, i) => {
                      const owner = playerOf(card.owner);
                      return (
                        <li>
                          <Card
                            commodity={c.id}
                            value={shown ? card.value : null}
                            size="sm"
                            sealed={!card.owner}
                            ownerName={owner?.name}
                            ownerAccent={owner?.accent}
                            highlight={card.owner === view.you}
                            serial={serialOf(view.code, c.id, i)}
                            flipDelay={row * 450 + i * 120}
                            title={owner ? `Carte de ${owner.name}` : "Carte scellée"}
                          />
                          <span class="truth-owner small">{owner ? owner.name : "scellée"}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div class="truth-sum">
                    <span class="muted small mono equation">
                      {RULES.basePrice} {c.cards.map((card) => ` ${(card.value ?? 0) < 0 ? "−" : "+"} ${Math.abs(card.value ?? 0)}`).join("")}
                    </span>
                    <span class="truth-value mono">{c.finalValue}</span>
                    <span class={`mono small ${(c.finalValue ?? 0) > last ? "up" : (c.finalValue ?? 0) < last ? "down" : ""}`}>
                      {formatSigned((c.finalValue ?? 0) - last)} vs marché
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div class="final-grid">
          <section class="panel standings" aria-labelledby="standings-title">
            <h2 id="standings-title" class="h4">
              Classement
            </h2>
            <ol class="standings-list">
              {final.standings.map((s, i) => {
                const p = playerOf(s.player);
                if (!p) return null;
                return (
                  <li class={`standing ${p.id === view.you ? "is-you" : ""}`} style={{ ...accentVar(p.accent), "--i": i } as never}>
                    <span class="rank mono">{i + 1}</span>
                    <PlayerSeal name={p.name} accent={p.accent} size={36} />
                    <div class="standing-body">
                      <div class="standing-top">
                        <span class="standing-name">{p.name}</span>
                        <span class="standing-total mono">{s.total} é</span>
                      </div>
                      <div class="standing-bar" aria-hidden="true">
                        <span class="bar-cash" style={{ width: `${(Math.max(0, s.cash) / best) * 100}%` }} />
                        <span class="bar-lots" style={{ width: `${(Math.max(0, s.lotsValue) / best) * 100}%` }} />
                      </div>
                      <span class="muted small mono">
                        {s.cash} en caisse + {s.lotsValue} en marchandises
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section class="panel awards" aria-labelledby="awards-title">
            <h2 id="awards-title" class="h4">
              Les distinctions
            </h2>
            {final.awards.length === 0 ? (
              <p class="muted">Une partie bien sage. Trop sage.</p>
            ) : (
              <ul class="award-list">
                {final.awards.map((a, i) => {
                  const p = playerOf(a.player);
                  return (
                    <li class={`award award-${a.id}`} style={{ "--i": i } as never}>
                      <span class="medal" aria-hidden="true">
                        {AWARD_GLYPH[a.id] ?? "★"}
                      </span>
                      <div>
                        <span class="award-title">{a.title}</span>
                        <span class="award-player">{p?.name}</span>
                        <span class="muted small">{a.detail}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section class="panel lies" aria-labelledby="lies-title">
          <div class="panel-head">
            <h2 id="lies-title" class="h4">
              Les rumeurs, vérifiées
            </h2>
            <span class="muted small">
              {verified.length - lies.length} confirmées · {lies.length} démenties
            </span>
          </div>
          <ul class="lies-grid">
            {verified.map((r) => {
              const author = playerOf(r.author);
              return author ? (
                <li>
                  <Dispatch author={author} text={describeRumor(r.input)} round={r.round} rumor={r} />
                </li>
              ) : null;
            })}
          </ul>
        </section>

        <div class="final-actions">
          {me?.isHost ? (
            <button class="btn btn-primary btn-lg" type="button" data-sound="refresh.release" onClick={() => send({ t: "rematch" })}>
              Revanche, même table
              <Icon name="arrowRight" size={20} />
            </button>
          ) : (
            <p class="waiting">
              <span class="pulse-dot" aria-hidden="true" />
              L'hôte peut relancer une revanche.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
