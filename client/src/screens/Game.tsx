import { useEffect, useMemo, useState } from "preact/hooks";
import {
  COMMODITIES,
  COMMODITY_IDS,
  RULES,
  describeRumor,
  emptyOrders,
  formatSigned,
  type CardClaim,
  type CommodityId,
  type CommodityView,
  type GameView,
  type PublicPlayer,
  type Rumor,
  type RumorInput,
} from "../../../shared/protocol";
import { Card, CommodityGlyph, PlayerSeal, Sparkline, accentVar, commodityInfo } from "../art";
import { Icon } from "../icons";
import { play } from "../sound/engine";
import type { Send } from "../main";
import { Brand, SoundToggle, ThemeToggle } from "./common";
import { ReportOverlay } from "./Report";

interface Props {
  view: GameView;
  send: Send;
  clockOffset: number;
  onLeave: () => void;
}

export function usePlayers(view: GameView) {
  return useMemo(() => {
    const map = new Map(view.players.map((p) => [p.id, p]));
    return (id: string | null): PublicPlayer | undefined => (id ? map.get(id) : undefined);
  }, [view.players]);
}

function useNow(clockOffset: number) {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 250);
    return () => clearInterval(id);
  }, [clockOffset]);
  return now;
}

const PHASES = [
  { id: "rumor", label: "Rumeurs" },
  { id: "market", label: "Marché" },
  { id: "report", label: "Clôture" },
] as const;

export function GameScreen({ view, send, clockOffset, onLeave }: Props) {
  const now = useNow(clockOffset);
  const playerOf = usePlayers(view);
  const me = playerOf(view.you)!;
  const [showReport, setShowReport] = useState(true);
  useEffect(() => setShowReport(true), [view.phase, view.round]);

  const total = view.deadline ? (view.phase === "rumor" ? RULES.rumorSeconds : view.phase === "market" ? RULES.marketSeconds : RULES.reportSeconds) : 1;
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : 0;

  // Les cinq dernières secondes battent, de plus en plus aigu.
  useEffect(() => {
    if (view.phase === "report" || left > 5 || left === 0 || me?.done) return;
    play("slider.tick", { pitch: (5 - left) * 2 });
  }, [left]);

  return (
    <div class={`page game phase-${view.phase}`}>
      <header class="game-header">
        <Brand compact />
        <div class="round-info">
          <span class="round-label">
            Séance <span class="mono">{view.round + 1}</span>
            <span class="muted">/{RULES.rounds}</span>
          </span>
          <ol class="stepper" aria-label="Phase en cours">
            {PHASES.map((p) => (
              <li class={p.id === view.phase ? "is-current" : ""} aria-current={p.id === view.phase ? "step" : undefined}>
                {p.label}
              </li>
            ))}
          </ol>
        </div>
        <Timer left={left} total={total} />
        <div class="header-actions">
          <span class="pill mono" title="Code du salon">
            {view.code}
          </span>
          <SoundToggle />
          <ThemeToggle />
          <button
            class="btn btn-ghost btn-icon"
            type="button"
            data-sound="nav.back"
            onClick={() => {
              if (confirm("Quitter la partie ? Tu pourras revenir avec le même lien tant que la partie dure.")) onLeave();
            }}
            aria-label="Quitter la partie"
            title="Quitter"
          >
            <Icon name="xmark" size={20} />
          </button>
        </div>
      </header>

      <Ticker view={view} playerOf={playerOf} />
      <PlayersStrip view={view} />

      <main class="game-grid">
        <div class="game-main">
          <Hand view={view} me={me} />
          <div class="boards">
            {view.commodities.map((c) => (
              <Board commodity={c} view={view} playerOf={playerOf} />
            ))}
          </div>
        </div>
        <aside class="game-side">
          <section class="panel action-panel" aria-live="polite">
            {view.phase === "rumor" && <RumorComposer view={view} send={send} />}
            {view.phase === "market" && <OrderTicket view={view} me={me} send={send} />}
            {view.phase === "report" && (
              <div class="report-mini">
                <h2 class="h5">Clôture de la séance {view.round + 1}</h2>
                <p class="muted small">Les ordres sont passés et une carte vient d'être retournée.</p>
                <button class="btn btn-outline btn-block" type="button" data-sound="modal.open" onClick={() => setShowReport(true)}>
                  <Icon name="eye" size={16} /> Revoir la clôture
                </button>
              </div>
            )}
          </section>
          <Feed view={view} playerOf={playerOf} />
        </aside>
      </main>

      {view.phase === "report" && showReport && (
        <ReportOverlay view={view} send={send} playerOf={playerOf} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- en-tête

function Timer({ left, total }: { left: number; total: number }) {
  const ratio = Math.max(0, Math.min(1, left / total));
  const c = 2 * Math.PI * 18;
  const urgent = left <= 10;
  return (
    <div class={`timer ${urgent ? "is-urgent" : ""}`} role="timer" aria-label={`${left} secondes restantes`}>
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" class="timer-track" />
        <circle cx="22" cy="22" r="18" class="timer-bar" stroke-dasharray={c} stroke-dashoffset={c * (1 - ratio)} transform="rotate(-90 22 22)" />
      </svg>
      <span class="timer-text mono">{left}</span>
    </div>
  );
}

function Ticker({ view, playerOf }: { view: GameView; playerOf: (id: string | null) => PublicPlayer | undefined }) {
  const items = [
    ...view.commodities.map((c) => {
      const prev = c.history[c.history.length - 2] ?? c.price;
      const delta = c.price - prev;
      return (
        <span class="tick" style={accentVar(commodityInfo(c.id).accent)}>
          <span class="tick-name">{commodityInfo(c.id).name.toUpperCase()}</span>
          <span class="mono">{c.price}</span>
          <span class={`mono tick-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {formatSigned(delta)}
          </span>
        </span>
      );
    }),
    ...view.rumors
      .filter((r) => r.input.kind !== "silence")
      .slice(-4)
      .reverse()
      .map((r) => (
        <span class="tick tick-news">
          <span class="tick-name">DÉPÊCHE</span> {playerOf(r.author)?.name} : « {describeRumor(r.input)} »
        </span>
      )),
  ];
  return (
    <div class="ticker" aria-hidden="true">
      <div class="ticker-track">
        <div class="ticker-run">{items}</div>
        <div class="ticker-run">{items}</div>
      </div>
    </div>
  );
}

function PlayersStrip({ view }: { view: GameView }) {
  return (
    <ul class="players-strip" aria-label="Joueurs">
      {view.players.map((p) => (
        <li class={`player-chip ${p.connected ? "" : "is-away"} ${p.id === view.you ? "is-you" : ""}`}>
          <PlayerSeal name={p.name} accent={p.accent} size={28} />
          <div class="player-chip-text">
            <span class="player-chip-name">
              {p.name}
              {!p.connected && <span class="muted small"> · absent</span>}
            </span>
            <span class="player-chip-meta mono small">
              {p.cash} é
              <span class="lots-mini" aria-label="Lots détenus">
                {COMMODITY_IDS.map((id) => (
                  <span class="lot-dot" style={accentVar(commodityInfo(id).accent)} title={`${commodityInfo(id).name} : ${p.lots[id]} lots`}>
                    {p.lots[id]}
                  </span>
                ))}
              </span>
            </span>
          </div>
          {view.phase !== "report" && (
            <span class={`done-mark ${p.done ? "is-done" : ""}`} title={p.done ? "A joué" : "Réfléchit…"}>
              {p.done ? <Icon name="check" size={14} label="A joué" /> : <span class="thinking" aria-label="Réfléchit" />}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- plateau

function Hand({ view, me }: { view: GameView; me: PublicPlayer }) {
  return (
    <section class="hand" aria-labelledby="hand-title">
      <div class="hand-head">
        <h2 id="hand-title" class="h5">
          Ta main
        </h2>
        <p class="muted small">Toi seul vois ces cartes, jusqu'à ce qu'on les retourne.</p>
      </div>
      <div class="hand-fan">
        {view.commodities.map((c, i) => {
          const index = c.cards.findIndex((card) => card.owner === view.you);
          const card = c.cards[index]!;
          return (
            <div class="hand-slot" style={{ "--i": i, "--n": view.commodities.length } as never}>
              <Card
                commodity={c.id}
                value={card.value}
                size="lg"
                ownerName={me.name}
                ownerAccent={me.accent}
                serial={serialOf(view.code, c.id, index)}
              />
              {card.revealed && <span class="revealed-tag">Révélée</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function serialOf(code: string, id: CommodityId, index: number): number {
  let h = 0;
  for (const ch of code + id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h + index * 37) % 1000;
}

function Board({ commodity: c, view, playerOf }: { commodity: CommodityView; view: GameView; playerOf: (id: string | null) => PublicPlayer | undefined }) {
  const info = commodityInfo(c.id);
  const prev = c.history[c.history.length - 2] ?? c.price;
  const delta = c.price - prev;
  const lots = playerOf(view.you)?.lots[c.id] ?? 0;
  const focus = view.round % view.commodities.length === COMMODITY_IDS.indexOf(c.id) && view.phase !== "report";
  return (
    <article class={`board ${focus ? "is-focus" : ""}`} style={accentVar(info.accent)} aria-labelledby={`board-${c.id}`}>
      <header class="board-head">
        <span class="board-glyph">
          <CommodityGlyph id={c.id} size={30} />
        </span>
        <div class="board-title">
          <h3 id={`board-${c.id}`} class="h6">
            {info.name}
          </h3>
          <span class="muted small">{info.motto}</span>
        </div>
        <div class="board-price">
          <span class="price mono">{c.price}</span>
          <span class={`delta mono ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>{delta === 0 ? "=" : formatSigned(delta)}</span>
        </div>
      </header>
      {focus && <p class="board-focus">Dossier de la séance : une carte sera retournée ici.</p>}
      <div class="board-chart">
        <Sparkline values={c.history} width={220} height={36} stretch />
      </div>
      <ul class="board-cards">
        {c.cards.map((card, i) => {
          const owner = playerOf(card.owner);
          return (
            <li>
              <Card
                commodity={c.id}
                value={card.value}
                size="sm"
                sealed={!card.owner}
                ownerName={owner?.name}
                ownerAccent={owner?.accent}
                highlight={card.owner === view.you}
                serial={serialOf(view.code, c.id, i)}
                title={card.owner ? `Carte de ${owner?.name ?? "?"}` : "Carte scellée"}
              />
            </li>
          );
        })}
      </ul>
      <footer class="board-foot small">
        <span>
          Tu détiens <strong class="mono">{lots}</strong> lot{lots > 1 ? "s" : ""}
        </span>
        <span class="muted mono">≈ {lots * c.price} é</span>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------- rumeurs

type Mode = "card" | "value" | "free" | "silence";

function RumorComposer({ view, send }: { view: GameView; send: Send }) {
  const [mode, setMode] = useState<Mode>("card");
  const [commodity, setCommodity] = useState<CommodityId>("safran");
  const [claim, setClaim] = useState<CardClaim>("pos");
  const [exact, setExact] = useState(2);
  const [valueClaim, setValueClaim] = useState<"gte" | "lte">("gte");
  const [target, setTarget] = useState(25);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(true);

  useEffect(() => setEditing(true), [view.round]);
  const submitted = view.yourRumor;
  const waiting = view.players.filter((p) => p.connected && !p.done).length;

  const myCard = view.commodities.find((c) => c.id === commodity)?.cards.find((card) => card.owner === view.you)?.value ?? 0;
  const currentPrice = view.commodities.find((c) => c.id === commodity)?.price ?? RULES.basePrice;

  const input: RumorInput | null =
    mode === "card"
      ? claim === "eq"
        ? { kind: "card", commodity, claim, value: exact }
        : { kind: "card", commodity, claim }
      : mode === "value"
        ? { kind: "value", commodity, claim: valueClaim, value: target }
        : mode === "free"
          ? text.trim()
            ? { kind: "free", text: text.trim() }
            : null
          : { kind: "silence" };

  const isLie =
    mode === "card" &&
    ((claim === "pos" && myCard <= 0) || (claim === "neg" && myCard >= 0) || (claim === "zero" && myCard !== 0) || (claim === "eq" && myCard !== exact));

  if (submitted && !editing) {
    return (
      <div class="composer">
        <h2 class="h5">Ta rumeur est partie</h2>
        <Dispatch author={view.players.find((p) => p.id === view.you)!} text={describeRumor(submitted)} round={view.round} pending />
        <p class="muted small">
          {waiting > 0 ? `En attente de ${waiting} joueur${waiting > 1 ? "s" : ""}…` : "Tout le monde a parlé."} Elle sera publiée quand tout
          le monde aura parlé.
        </p>
        <button class="btn btn-ghost btn-block" type="button" data-sound="press.abort" onClick={() => setEditing(true)}>
          <Icon name="arrowLeft" size={16} /> Changer d'avis
        </button>
      </div>
    );
  }

  return (
    <form
      class="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!input) return;
        send({ t: "rumor", rumor: input });
        setEditing(false);
      }}
    >
      <div class="panel-head">
        <h2 class="h5">Lancer une rumeur</h2>
        <span class="muted small">Vraie ou fausse, elle sera signée.</span>
      </div>

      <div class="segmented" role="tablist" aria-label="Type de rumeur">
        {(
          [
            ["card", "Ma carte"],
            ["value", "Cours final"],
            ["free", "Texte libre"],
            ["silence", "Me taire"],
          ] as const
        ).map(([id, label]) => (
          <button type="button" role="tab" data-sound="nav.tab" aria-selected={mode === id} class={mode === id ? "is-active" : ""} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {(mode === "card" || mode === "value") && (
        <fieldset class="chip-group">
          <legend class="field-label">Marchandise</legend>
          {COMMODITIES.map((c) => (
            <button
              type="button"
              data-sound="chip.select"
              class={`chip ${commodity === c.id ? "is-active" : ""}`}
              style={accentVar(c.accent)}
              aria-pressed={commodity === c.id}
              onClick={() => {
                setCommodity(c.id);
                const price = view.commodities.find((x) => x.id === c.id)?.price;
                if (price) setTarget(price);
              }}
            >
              <CommodityGlyph id={c.id} size={18} />
              {c.name}
            </button>
          ))}
        </fieldset>
      )}

      {mode === "card" && (
        <>
          <fieldset class="chip-group">
            <legend class="field-label">J'affirme que ma carte est…</legend>
            {(
              [
                ["pos", "positive"],
                ["neg", "négative"],
                ["zero", "nulle"],
                ["eq", "exactement"],
              ] as const
            ).map(([id, label]) => (
              <button type="button" data-sound="chip.select" class={`chip ${claim === id ? "is-active" : ""}`} aria-pressed={claim === id} onClick={() => setClaim(id)}>
                {label}
              </button>
            ))}
          </fieldset>
          {claim === "eq" && <Stepper value={exact} min={-8} max={8} onChange={setExact} label="Valeur annoncée" signed />}
          <p class={`truth-hint small ${isLie ? "is-lie" : ""}`}>
            Ta vraie carte {commodityInfo(commodity).name} : <strong class="mono">{formatSigned(myCard)}</strong>
            {isLie ? " · c'est un mensonge, et il sera vérifiable." : " · c'est la vérité."}
          </p>
        </>
      )}

      {mode === "value" && (
        <>
          <fieldset class="chip-group">
            <legend class="field-label">Le cours final sera…</legend>
            <button type="button" data-sound="chip.select" class={`chip ${valueClaim === "gte" ? "is-active" : ""}`} aria-pressed={valueClaim === "gte"} onClick={() => setValueClaim("gte")}>
              au moins
            </button>
            <button type="button" data-sound="chip.select" class={`chip ${valueClaim === "lte" ? "is-active" : ""}`} aria-pressed={valueClaim === "lte"} onClick={() => setValueClaim("lte")}>
              au plus
            </button>
          </fieldset>
          <Stepper value={target} min={0} max={99} onChange={setTarget} label="Écus" />
          <p class="muted small">
            Cours actuel : <span class="mono">{currentPrice}</span> é. Vérifié au dévoilement final.
          </p>
        </>
      )}

      {mode === "free" && (
        <label class="field">
          <span class="field-label">Ta rumeur (invérifiable)</span>
          <textarea class="input textarea" rows={3} maxLength={RULES.freeTextMax} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Paraît que quelqu'un vend tout son cacao en douce…" />
          <span class="muted small mono counter">
            {text.length}/{RULES.freeTextMax}
          </span>
        </label>
      )}

      {mode === "silence" && <p class="muted">Tu ne diras rien cette séance. Le silence aussi, ça se remarque.</p>}

      {input && (
        <div class="preview">
          <span class="field-label">Aperçu</span>
          <Dispatch author={view.players.find((p) => p.id === view.you)!} text={describeRumor(input)} round={view.round} pending />
        </div>
      )}

      <button class="btn btn-primary btn-lg btn-block" type="submit" data-sound="input.submit" disabled={!input}>
        {submitted ? "Remplacer ma rumeur" : "Publier la rumeur"}
        <Icon name="envelope" size={20} />
      </button>
    </form>
  );
}

function Stepper({ value, min, max, onChange, label, signed }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; signed?: boolean }) {
  return (
    <div class="stepper-input" role="group" aria-label={label}>
      <button type="button" data-sound="stepper.decrement" class="btn btn-outline btn-icon" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Moins">
        −
      </button>
      <output class="mono stepper-value">{signed ? formatSigned(value) : value}</output>
      <button type="button" data-sound="stepper.increment" class="btn btn-outline btn-icon" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Plus">
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- marché

function OrderTicket({ view, me, send }: { view: GameView; me: PublicPlayer; send: Send }) {
  const [orders, setOrders] = useState(() => view.yourOrders ?? emptyOrders());
  const [editing, setEditing] = useState(true);
  useEffect(() => {
    setOrders(emptyOrders());
    setEditing(true);
  }, [view.round]);

  const submitted = view.yourOrders;
  const waiting = view.players.filter((p) => p.connected && !p.done).length;
  const estimate = view.commodities.reduce((s, c) => s - orders[c.id] * c.price, 0);

  if (submitted && !editing) {
    const lines = COMMODITY_IDS.filter((id) => submitted[id] !== 0);
    return (
      <div class="composer">
        <h2 class="h5">Ordres transmis</h2>
        <ul class="order-summary">
          {lines.length === 0 && <li class="muted">Tu ne bouges pas cette séance.</li>}
          {lines.map((id) => (
            <li style={accentVar(commodityInfo(id).accent)}>
              <CommodityGlyph id={id} size={18} />
              <span>{commodityInfo(id).name}</span>
              <span class={`mono ${submitted[id] > 0 ? "buy" : "sell"}`}>
                {submitted[id] > 0 ? `Achat ${submitted[id]}` : `Vente ${-submitted[id]}`}
              </span>
            </li>
          ))}
        </ul>
        <p class="muted small">{waiting > 0 ? `En attente de ${waiting} joueur${waiting > 1 ? "s" : ""}…` : "Le marché va clôturer."}</p>
        <button class="btn btn-ghost btn-block" type="button" data-sound="press.abort" onClick={() => setEditing(true)}>
          <Icon name="arrowLeft" size={16} /> Modifier mes ordres
        </button>
      </div>
    );
  }

  return (
    <form
      class="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send({ t: "orders", orders });
        setEditing(false);
      }}
    >
      <div class="panel-head">
        <h2 class="h5">Passer tes ordres</h2>
        <span class="muted small">Tout le monde passe ses ordres en même temps.</span>
      </div>
      <ul class="orders">
        {view.commodities.map((c) => {
          const info = commodityInfo(c.id);
          const q = orders[c.id];
          const minQ = -Math.min(RULES.maxOrder, me.lots[c.id]);
          return (
            <li class="order-row" style={accentVar(info.accent)}>
              <span class="board-glyph small-glyph">
                <CommodityGlyph id={c.id} size={20} />
              </span>
              <div class="order-name">
                <span>{info.name}</span>
                <span class="muted small mono">
                  {c.price} é · {me.lots[c.id]} lot{me.lots[c.id] > 1 ? "s" : ""}
                </span>
              </div>
              <div class="order-stepper" role="group" aria-label={`Ordre ${info.name}`}>
                <button type="button" data-sound="stepper.decrement" class="btn btn-outline btn-icon" disabled={q <= minQ} onClick={() => setOrders({ ...orders, [c.id]: q - 1 })} aria-label={`Vendre un lot de ${info.name}`}>
                  −
                </button>
                <output class={`mono order-q ${q > 0 ? "buy" : q < 0 ? "sell" : ""}`}>
                  {q > 0 ? `Achat ${q}` : q < 0 ? `Vente ${-q}` : "—"}
                </output>
                <button type="button" data-sound="stepper.increment" class="btn btn-outline btn-icon" disabled={q >= RULES.maxOrder} onClick={() => setOrders({ ...orders, [c.id]: q + 1 })} aria-label={`Acheter un lot de ${info.name}`}>
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div class="order-total">
        <span class="muted small">Caisse estimée après échanges</span>
        <span class={`mono ${me.cash + estimate < 0 ? "sell" : ""}`}>
          {me.cash} {estimate >= 0 ? "+" : "−"} {Math.abs(estimate)} = <strong>{me.cash + estimate}</strong> é
        </span>
      </div>
      <p class="muted small">
        Le prix réel dépend de la demande de tous : chaque lot net acheté fait monter le cours de {view.players.length <= 4 ? 2 : 1} écu
        {view.players.length <= 4 ? "s" : ""}. Les achats que ta caisse ne couvre pas seront réduits.
      </p>
      <button class="btn btn-primary btn-lg btn-block" type="submit" data-sound="press.commit">
        {submitted ? "Remplacer mes ordres" : "Passer les ordres"}
        <Icon name="check" size={20} />
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- fil des dépêches

export function Dispatch({
  author,
  text,
  round,
  rumor,
  pending,
}: {
  author: PublicPlayer;
  text: string;
  round: number;
  rumor?: Rumor;
  pending?: boolean;
}) {
  const silent = rumor?.input.kind === "silence";
  const free = rumor?.input.kind === "free";
  return (
    <div class={`dispatch ${silent ? "is-silent" : ""} ${pending ? "is-pending" : ""} ${rumor?.verdict ? "has-verdict" : ""}`} style={accentVar(author.accent)}>
      <div class="dispatch-head">
        <PlayerSeal name={author.name} accent={author.accent} size={22} />
        <span class="dispatch-author">{author.name}</span>
        <span class="dispatch-meta mono">Séance {round + 1}</span>
      </div>
      <p class="dispatch-text">{silent ? text : `« ${text} »`}</p>
      {free && <span class="dispatch-tag small">invérifiable</span>}
      {rumor?.verdict && (
        <span class={`stamp stamp-${rumor.verdict}`} key={rumor.verdict}>
          {rumor.verdict === "true" ? "Confirmé" : "Démenti"}
        </span>
      )}
    </div>
  );
}

function Feed({ view, playerOf }: { view: GameView; playerOf: (id: string | null) => PublicPlayer | undefined }) {
  const rumors = [...view.rumors].reverse();
  return (
    <section class="panel feed" aria-labelledby="feed-title">
      <div class="panel-head">
        <h2 id="feed-title" class="h5">
          Le fil des dépêches
        </h2>
        <span class="pill mono">{view.rumors.filter((r) => r.input.kind !== "silence").length}</span>
      </div>
      {rumors.length === 0 ? (
        <p class="muted small feed-empty">Aucune rumeur pour l'instant. Les premières tombent à la fin de la phase des rumeurs.</p>
      ) : (
        <ul class="feed-list">
          {rumors.map((r) => {
            const author = playerOf(r.author);
            if (!author) return null;
            return (
              <li key={r.id}>
                <Dispatch author={author} text={describeRumor(r.input)} round={r.round} rumor={r} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
