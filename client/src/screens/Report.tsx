import { useEffect, useState } from "preact/hooks";
import { COMMODITY_IDS, RULES, describeRumor, formatSigned, type GameView, type PublicPlayer } from "../../../shared/protocol";
import { Card, CommodityGlyph, PlayerSeal, accentVar, commodityInfo } from "../art";
import { Icon } from "../icons";
import { play } from "../sound/engine";
import type { Send } from "../main";
import { Dispatch, serialOf } from "./Game";

interface Props {
  view: GameView;
  send: Send;
  playerOf: (id: string | null) => PublicPlayer | undefined;
  onClose: () => void;
}

export function ReportOverlay({ view, send, playerOf, onClose }: Props) {
  const report = view.reports[view.reports.length - 1];
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    setFlipped(false);
    const id = setTimeout(() => {
      setFlipped(true);
      play("card.flip");
    }, 1400);
    return () => clearTimeout(id);
  }, [report?.round]);

  // Le tampon tombe sur les rumeurs vérifiées par cette carte.
  const verdicts = report?.reveal
    ? view.rumors
        .filter((r) => r.author === report.reveal!.owner && r.input.kind === "card" && r.input.commodity === report.reveal!.commodity && r.verdict)
        .map((r) => r.verdict)
    : [];
  const verdictKey = verdicts.join(",");
  useEffect(() => {
    if (!flipped || verdicts.length === 0) return;
    const id = setTimeout(() => play(verdicts.includes("false") ? "feedback.error" : "feedback.success"), 650);
    return () => clearTimeout(id);
  }, [flipped, verdictKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!report) return null;
  const me = playerOf(view.you);
  const readyCount = view.players.filter((p) => p.done).length;
  const connected = view.players.filter((p) => p.connected).length;
  const reveal = report.reveal;
  const owner = reveal ? playerOf(reveal.owner) : undefined;
  const commodity = reveal ? view.commodities.find((c) => c.id === reveal.commodity) : undefined;
  const cardIndex = commodity?.cards.findIndex((c) => c.owner === reveal?.owner) ?? 0;
  const judged = reveal
    ? view.rumors.filter((r) => r.author === reveal.owner && r.input.kind === "card" && r.input.commodity === reveal.commodity && r.verdict)
    : [];
  const isLast = view.round + 1 >= RULES.rounds;

  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div class="overlay-card report">
        <header class="report-head">
          <div>
            <p class="eyebrow">Clôture</p>
            <h2 id="report-title" class="h3">
              Séance {report.round + 1}
            </h2>
          </div>
          <button class="btn btn-ghost btn-icon" type="button" data-sound="modal.close" onClick={onClose} aria-label="Voir le plateau">
            <Icon name="xmark" size={20} />
          </button>
        </header>

        <div class="report-grid">
          <section class="report-reveal" aria-labelledby="reveal-title">
            <h3 id="reveal-title" class="h6">
              La révélation
            </h3>
            {reveal && commodity && owner ? (
              <>
                <div class={`reveal-stage ${flipped ? "is-flipped" : ""}`}>
                  <div class="reveal-glow" style={accentVar(commodityInfo(reveal.commodity).accent)} />
                  <Card
                    commodity={reveal.commodity}
                    value={flipped ? reveal.value : null}
                    size="xl"
                    ownerName={owner.name}
                    ownerAccent={owner.accent}
                    serial={serialOf(view.code, reveal.commodity, cardIndex)}
                  />
                </div>
                <p class="reveal-caption">
                  La carte <strong>{commodityInfo(reveal.commodity).name}</strong> de{" "}
                  <strong style={accentVar(owner.accent)} class="accent-text">
                    {owner.id === view.you ? "toi" : owner.name}
                  </strong>
                  {flipped ? (
                    <>
                      {" "}
                      vaut <strong class={`mono ${reveal.value > 0 ? "up" : reveal.value < 0 ? "down" : ""}`}>{formatSigned(reveal.value)}</strong>. Le
                      cours passe à <strong class="mono">{reveal.priceAfter}</strong> é.
                    </>
                  ) : (
                    "…"
                  )}
                </p>
                {flipped &&
                  judged.map((r) => (
                    <div class="judged">
                      <Dispatch author={owner} text={describeRumor(r.input)} round={r.round} rumor={r} />
                    </div>
                  ))}
              </>
            ) : (
              <p class="muted">Aucune carte à retourner.</p>
            )}
          </section>

          <section class="report-market" aria-labelledby="market-title">
            <h3 id="market-title" class="h6">
              Le marché
            </h3>
            <ul class="price-moves">
              {COMMODITY_IDS.map((id) => {
                const move = report.prices[id];
                const delta = move.after - move.before;
                return (
                  <li style={accentVar(commodityInfo(id).accent)}>
                    <CommodityGlyph id={id} size={20} />
                    <span>{commodityInfo(id).name}</span>
                    <span class="mono muted">{move.before}</span>
                    <Icon name="arrowRight" size={14} />
                    <span class="mono">
                      <strong>{move.after}</strong>
                    </span>
                    <span class={`mono delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>{delta === 0 ? "=" : formatSigned(delta)}</span>
                  </li>
                );
              })}
            </ul>

            <h3 class="h6">Qui a fait quoi</h3>
            <div class="trades-table" role="table" aria-label="Ordres exécutés">
              <div class="trades-row trades-header" role="row">
                <span role="columnheader">Joueur</span>
                {COMMODITY_IDS.map((id) => (
                  <span role="columnheader" style={accentVar(commodityInfo(id).accent)} class="trades-col-head" title={commodityInfo(id).name}>
                    <CommodityGlyph id={id} size={18} />
                  </span>
                ))}
              </div>
              {report.trades.map((t) => {
                const p = playerOf(t.player);
                if (!p) return null;
                return (
                  <div class="trades-row" role="row">
                    <span role="cell" class="trades-player">
                      <PlayerSeal name={p.name} accent={p.accent} size={20} /> {p.name}
                    </span>
                    {COMMODITY_IDS.map((id) => {
                      const q = t.orders[id];
                      return (
                        <span role="cell" class={`mono trade-q ${q > 0 ? "buy" : q < 0 ? "sell" : "muted"}`}>
                          {q > 0 ? `▲${q}` : q < 0 ? `▼${-q}` : "·"}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p class="muted small">▲ achat, ▼ vente. Compare avec ce que chacun a raconté…</p>
          </section>
        </div>

        <footer class="report-foot">
          <span class="muted small">
            {readyCount}/{connected} prêts
          </span>
          <button class="btn btn-primary btn-lg" type="button" disabled={me?.done} onClick={() => send({ t: "ready" })}>
            {me?.done ? "En attente des autres…" : isLast ? "Vers le grand dévoilement" : "Séance suivante"}
            {!me?.done && <Icon name="arrowRight" size={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
