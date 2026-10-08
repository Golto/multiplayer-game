// La table : un tapis ovale, les joueurs tout autour (toi en bas, la parole tourne vers ta gauche),
// le tableau et le pot au centre avec la folle et la prime de la donne ; en dessous, tes cartes et
// tes paroles ; à droite, le fil de la donne.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  BOUNTIES,
  RULES,
  STREET_NAMES,
  bestHand,
  bountyById,
  cardLabel,
  cardName,
  handName,
  sameCard,
  wildOf,
  type Card,
  type TapisAction,
  type TapisPlayer,
  type TapisView,
} from "../../../../shared/games/tapis";
import { PlayerSeal, accentVar, hypotrochoid } from "../../ui/art";
import { Brand, SoundToggle, ThemeToggle } from "../../ui/chrome";
import { Icon } from "../../ui/icons";
import { play } from "../../sound/engine";
import { Chips, PlayingCard, chipCount, fmt } from "./cards";

interface Props {
  view: TapisView;
  send: (action: TapisAction) => void;
  onLeave: () => void;
}

function useWindow() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/** L'heure du serveur, rafraîchie quatre fois par seconde tant qu'un compte à rebours tourne. */
function useServerClock(view: TapisView) {
  const offset = useRef(0);
  useEffect(() => {
    offset.current = view.now - Date.now();
  }, [view.now]);
  const [, tick] = useState(0);
  const running = view.deadline !== null || view.nextAt !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [running]);
  return Date.now() + offset.current;
}

/** Tailles : le tapis prend ce qu'il peut, les cartes suivent. */
function layout(vw: number, vh: number) {
  const compact = vw < 900;
  const myCard = Math.round(Math.max(70, Math.min(108, vh * 0.13)));
  // En hauteur : l'en-tête, les places qui débordent du tapis, ta place en dessous (≈ 1,4 carte + marges).
  const tableW = compact ? vw - 24 : Math.max(520, Math.min(vw - 340 - 64, (vh - 64 - 140 - myCard * 1.4 - 70) * 2.05));
  const ratio = compact ? 1.05 : 2.05;
  return {
    compact,
    tableW,
    tableH: tableW / ratio,
    seatCard: Math.round(Math.max(30, Math.min(50, tableW * 0.042))),
    boardCard: Math.round(Math.max(44, Math.min(84, tableW * (compact ? 0.15 : 0.072)))),
    myCard,
  };
}

const ACTION_WORDS: Record<string, (n: number) => string> = {
  fold: () => "Couché",
  check: () => "Parole",
  call: (n) => `Suit ${fmt(n)}`,
  bet: (n) => `Mise ${fmt(n)}`,
  raise: (n) => `Relance à ${fmt(n)}`,
  allin: () => "Tapis !",
};

export function Board({ view, send, onLeave }: Props) {
  const me = view.players.find((p) => p.id === view.you);
  const { w: vw, h: vh } = useWindow();
  const size = layout(vw, vh);
  const now = useServerClock(view);
  const wild = wildOf(view.wildCard);
  const result = view.result;
  const myTurn = !!me && view.toAct === me.slot && !result;
  const actor = view.players.find((p) => p.slot === view.toAct);

  // Toi en bas, puis les autres dans l'ordre de la parole (vers ta gauche).
  const seats = useMemo(() => {
    const i = Math.max(0, view.players.findIndex((p) => p.id === view.you));
    return view.players.map((_, k) => view.players[(i + k) % view.players.length]!);
  }, [view.players, view.you]);

  // Les cartes gagnantes à mettre en avant : celles du (premier) gagnant du pot principal.
  const winners = new Set(result?.pots.flatMap((p) => (p.returned ? [] : p.winners)) ?? []);
  const mainWinner = result?.pots[0]?.winners[0] ?? null;
  const winUsed = mainWinner !== null ? (result?.hands[mainWinner]?.used ?? []) : [];

  // Sons.
  const lastKey = useRef("");
  useEffect(() => {
    const e = view.lastEvent;
    const key = JSON.stringify(e) + view.hand;
    if (!e || key === lastKey.current) return;
    lastKey.current = key;
    if (e.k === "deal") play("card.hover");
    else if (e.k === "fold") play("press.abort", { gain: 0.7 });
    else if (e.k === "check") play("button.tap", { gain: 0.8 });
    else if (e.k === "call" || e.k === "bet" || e.k === "raise") play("drag.drop", { gain: 0.8 });
    else if (e.k === "allin") play("feedback.warning");
    else if (e.k === "exchange" || e.k === "street" || e.k === "show") play("card.flip");
    else if (e.k === "win") play(me && e.slots.includes(me.slot) ? "feedback.success" : "feedback.complete", { gain: 0.8 });
  }, [view.lastEvent, view.hand]);
  useEffect(() => {
    if (myTurn) play("system.ready", { gain: 0.6 });
  }, [myTurn, view.street, view.hand]);

  const bounty = bountyById(view.bounty);

  return (
    <div class={`page tapis-board ${size.compact ? "is-compact" : ""}`}>
      <header class="game-header tapis-header">
        <Brand name="Tapis" compact />
        <div class="round-info">
          <span class="round-label">
            Donne <span class="mono">{view.hand + 1}</span>
            {view.config.length ? <span class="muted"> / {view.config.length}</span> : null}
          </span>
          <span class="level-pill mono" title={view.blinds.nextIn ? `Les blindes montent dans ${view.blinds.nextIn} donne(s)` : "Dernier niveau"}>
            {fmt(view.blinds.sb)}/{fmt(view.blinds.bb)}
            {view.blinds.nextIn ? <span class="muted"> · ↑ {view.blinds.nextIn}</span> : null}
          </span>
        </div>
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
            onClick={() => confirm("Quitter la table ? Tu pourras revenir avec le même lien tant que la partie dure.") && onLeave()}
            aria-label="Quitter la partie"
            title="Quitter"
          >
            <Icon name="xmark" size={20} />
          </button>
        </div>
      </header>

      <main class="tapis-main">
        <section class="tapis-play">
          <div class="tapis-table" style={{ width: `${size.tableW}px`, height: `${size.tableH}px` }}>
            <Felt />
            {seats.map((p, i) => (
              <Seat
                key={p.slot}
                view={view}
                p={p}
                me={p.id === view.you}
                angle={90 + (i * 360) / seats.length}
                compact={size.compact}
                cardW={size.seatCard}
                now={now}
                won={winners.has(p.slot)}
                winUsed={p.slot === mainWinner ? winUsed : []}
                wild={wild}
              />
            ))}

            <div class="table-center">
              <div class="twists">
                {view.wildCard && wild && (
                  <span class="twist-badge is-wild" title={`La carte retournée est le ${cardName(view.wildCard)} : sa jumelle, le ${cardName(wild)}, remplace n'importe quelle carte.`}>
                    <PlayingCard card={wild} w={26} wild />
                    <span>
                      Folle : <strong>{cardLabel(wild)}</strong> <span class="muted">· jumelle du {cardLabel(view.wildCard)}</span>
                    </span>
                  </span>
                )}
                {bounty && (
                  <span class={`twist-badge is-bounty ${result?.bounty ? "is-won" : ""}`} title={bounty.text}>
                    <span class="bounty-star" aria-hidden="true">
                      ✦
                    </span>
                    <span>
                      Prime : <strong>{bounty.name}</strong>
                    </span>
                  </span>
                )}
              </div>
              <div class="tboard" aria-label="Cartes communes">
                {Array.from({ length: 5 }, (_, i) => {
                  const c = view.board[i];
                  return c ? (
                    <PlayingCard
                      card={c}
                      w={size.boardCard}
                      wild={sameCard(c, wild)}
                      glow={result?.showdown && winUsed.includes(i + 2) ? "win" : null}
                      dim={!!result?.showdown && !winUsed.includes(i + 2)}
                      fresh={i >= view.board.length - (view.street === "flop" ? 3 : 1) && !result}
                    />
                  ) : (
                    <span class="tboard-slot" style={{ "--w": `${size.boardCard}px` } as never} />
                  );
                })}
              </div>
              {result ? (
                <ResultBanner view={view} now={now} send={send} />
              ) : (
                <div class="tpot" aria-live="polite">
                  <Chips n={chipCount(view.pot, view.blinds.bb)} accent="yellow" />
                  <span>
                    Pot <strong class="mono">{fmt(view.pot)}</strong>
                  </span>
                  <span class="muted small">{STREET_NAMES[view.street]}</span>
                </div>
              )}
            </div>
          </div>

          {me && <MyPanel view={view} me={me} send={send} size={size} myTurn={myTurn} actor={actor} wild={wild} winUsed={me.slot === mainWinner ? winUsed : []} />}
        </section>

        <aside class="tapis-side small">
          {bounty && (
            <section class="panel side-block">
              <h2 class="h6">
                Prime de la donne : <span class="accent-text">{bounty.name}</span>
              </h2>
              <p class="muted">
                {bounty.text} Elle rapporte {fmt(view.blinds.sb)} de chacun des autres.
              </p>
            </section>
          )}
          <section class="panel side-block log-block">
            <h2 class="h6">La donne</h2>
            <ol class="tapis-log">
              {view.log.map((l) => {
                const who = view.players.find((p) => p.slot === l.slot);
                return (
                  <li class={l.slot === null ? "is-dealer" : ""} style={who ? accentVar(who.accent) : undefined}>
                    {who && <strong>{who.name}</strong>} {l.text}
                  </li>
                );
              })}
            </ol>
          </section>
          <details class="panel side-block side-rules">
            <summary class="h6">Les entorses</summary>
            <ul class="muted">
              {view.config.wild && <li>La folle : la jumelle de la carte retournée (même hauteur, même couleur) remplace n'importe quelle carte.</li>}
              {view.config.exchange && (
                <li>L'échange : une fois par donne, au flop, {fmt(view.blinds.bb * RULES.exchangeBB)} pour remplacer une de tes cartes ; la carte rendue est montrée à tous.</li>
              )}
              {view.config.bounty && <li>La prime : {BOUNTIES.length} défis possibles, un par donne.</li>}
              {!view.config.wild && !view.config.exchange && !view.config.bounty && <li>Aucune : hold'em classique.</li>}
            </ul>
          </details>
        </aside>
      </main>
    </div>
  );
}

/** La table : une surface ovale, une piste en pointillés et une rosace guillochée au centre. */
function Felt() {
  const rosette = useMemo(() => hypotrochoid({ R: 60, r: 23, d: 40, cx: 50, cy: 50, scale: 0.5, steps: 1400 }), []);
  const inner = useMemo(() => hypotrochoid({ R: 45, r: 16, d: 22, cx: 50, cy: 50, scale: 0.6, steps: 1000 }), []);
  return (
    <div class="felt" aria-hidden="true">
      <svg class="felt-art" viewBox="0 0 200 100" preserveAspectRatio="none">
        <ellipse cx="100" cy="50" rx="94" ry="45" class="felt-track" vector-effect="non-scaling-stroke" />
        <ellipse cx="100" cy="50" rx="78" ry="34" class="felt-track is-dashed" vector-effect="non-scaling-stroke" />
      </svg>
      <svg class="felt-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <path d={rosette} class="felt-rosette" />
        <path d={inner} class="felt-rosette is-second" />
      </svg>
    </div>
  );
}

function Seat({
  view,
  p,
  me,
  angle,
  cardW,
  now,
  won,
  winUsed,
  wild,
  compact,
}: {
  view: TapisView;
  p: TapisPlayer;
  me: boolean;
  angle: number;
  compact: boolean;
  cardW: number;
  now: number;
  won: boolean;
  winUsed: number[];
  wild: Card | null;
}) {
  const rad = (angle * Math.PI) / 180;
  // Sur un petit écran, les places se resserrent pour ne pas sortir de l'écran.
  const rx = compact ? 36 : 50;
  const pos = { left: `${50 + rx * Math.cos(rad)}%`, top: `${50 + 50 * Math.sin(rad)}%` };
  // La mise est posée entre le joueur et le centre.
  const betPos = { left: `${50 + (compact ? 24 : 33) * Math.cos(rad)}%`, top: `${50 + (compact ? 36 : 30) * Math.sin(rad)}%` };
  const turn = view.toAct === p.slot && !view.result;
  const left = turn && view.deadline ? Math.max(0, Math.min(1, (view.deadline - now) / (RULES.turnSeconds * 1000))) : 0;
  const ev = view.lastEvent;
  const said = ev && "slot" in ev && ev.slot === p.slot && ev.k in ACTION_WORDS ? ACTION_WORDS[ev.k]!("amount" in ev ? ev.amount : 0) : null;
  const handInfo = view.result?.hands[p.slot];
  const delta = view.result?.delta[p.slot];
  const out = p.place !== null && !p.inHand;
  const markers = [p.slot === view.button ? "D" : null, p.slot === view.sbSlot ? "PB" : null, p.slot === view.bbSlot ? "GB" : null].filter(Boolean);
  const cls = ["tseat", me ? "is-me" : "", turn ? "is-turn" : "", p.folded ? "is-folded" : "", out ? "is-out" : "", p.connected ? "" : "is-away", won ? "is-winner" : ""].join(" ");
  return (
    <>
      <div class={cls} style={{ ...pos, ...accentVar(p.accent) }}>
        {!me && p.cards.length > 0 && (
          <div class="tseat-cards">
            {p.cards.map((c, i) => (
              <PlayingCard card={c} w={cardW} wild={sameCard(c, wild)} glow={winUsed.includes(i) ? "win" : null} dim={p.folded} />
            ))}
          </div>
        )}
        <div class="tseat-plate">
          <PlayerSeal name={p.name} accent={p.accent} size={24} />
          <span class="tseat-name">{p.name}</span>
          <span class="tseat-stack mono">{out ? `${p.place}e` : fmt(p.stack)}</span>
          {turn && <span class="tseat-timer" style={{ "--t": left } as never} aria-hidden="true" />}
        </div>
        <div class="tseat-tags">
          {markers.map((m) => (
            <span class={`marker ${m === "D" ? "is-dealer" : ""}`}>{m}</span>
          ))}
          {p.allIn && !view.result && <span class="tag is-allin">Tapis</span>}
          {p.discarded && (
            <span class="tag is-discard" title={`A échangé et rendu le ${cardName(p.discarded)}`}>
              ⇄ rend {cardLabel(p.discarded)}
            </span>
          )}
          {!p.connected && <span class="tag">absent</span>}
          {handInfo && !p.folded && <span class="tag is-hand">{handInfo.name}</span>}
          {delta !== undefined && delta !== 0 && <span class={`tag mono ${delta > 0 ? "is-gain" : "is-loss"}`}>{delta > 0 ? `+${fmt(delta)}` : `−${fmt(-delta)}`}</span>}
          {said && !view.result && <span class="tag is-said">{said}</span>}
          {compact && p.bet > 0 && !view.result && !said && <span class="tag mono">{fmt(p.bet)}</span>}
        </div>
      </div>
      {p.bet > 0 && !view.result && !compact && (
        <div class="tseat-bet" style={{ ...betPos, ...accentVar(p.accent) }}>
          <Chips n={chipCount(p.bet, view.blinds.bb)} accent={p.accent} />
          <span class="mono">{fmt(p.bet)}</span>
        </div>
      )}
    </>
  );
}

function ResultBanner({ view, now, send }: { view: TapisView; now: number; send: (a: TapisAction) => void }) {
  const r = view.result!;
  const name = (slot: number) => view.players.find((p) => p.slot === slot)?.name ?? "?";
  const me = view.players.find((p) => p.id === view.you);
  const pots = r.pots.filter((p) => !p.returned && p.amount > 0);
  const bounty = r.bounty ? bountyById(r.bounty.id) : null;
  const secs = view.nextAt ? Math.max(0, Math.ceil((view.nextAt - now) / 1000)) : 0;
  const alive = view.players.filter((p) => p.place === null || p.inHand);
  const ready = view.players.filter((p) => p.ready).length;
  const canShow = me && me.cards.length > 0 && !me.shown && !(r.showdown && me.inHand && !me.folded);
  return (
    <div class="result-banner" role="status">
      {pots.map((pot, i) => (
        <p class="result-line">
          {pots.length > 1 && <span class="muted small">{i === 0 ? "Pot principal" : `Pot annexe ${i}`} · </span>}
          <strong>{pot.winners.map(name).join(" et ")}</strong> {pot.winners.length > 1 ? "partagent" : "remporte"}{" "}
          <strong class="mono">{fmt(pot.amount)}</strong>
          {r.showdown && pot.winners[0] !== undefined && r.hands[pot.winners[0]] && <span> · {r.hands[pot.winners[0]]!.name}</span>}
        </p>
      ))}
      {bounty && r.bounty && (
        <p class="result-line is-bounty">
          ✦ Prime « {bounty.name} » : {r.bounty.winners.map(name).join(" et ")} touche{r.bounty.winners.length > 1 ? "nt" : ""} {fmt(r.bounty.each)} de chacun
        </p>
      )}
      {r.eliminated.length > 0 && <p class="result-line muted">{r.eliminated.map(name).join(", ")} quitte{r.eliminated.length > 1 ? "nt" : ""} la table.</p>}
      <div class="result-actions">
        {canShow && (
          <button class="btn btn-outline btn-sm" type="button" data-sound="none" onClick={() => send({ t: "show" })}>
            Montrer mes cartes
          </button>
        )}
        {me && me.place === null && (
          <button class="btn btn-primary btn-sm" type="button" disabled={me.ready} onClick={() => send({ t: "ready" })}>
            {me.ready ? `En attente… ${secs}s` : `Donne suivante · ${secs}s`}
          </button>
        )}
        <span class="muted small">
          {ready}/{alive.filter((p) => p.place === null && p.connected).length} prêts
        </span>
      </div>
    </div>
  );
}

function MyPanel({
  view,
  me,
  send,
  size,
  myTurn,
  actor,
  wild,
  winUsed,
}: {
  view: TapisView;
  me: TapisPlayer;
  send: (a: TapisAction) => void;
  size: ReturnType<typeof layout>;
  myTurn: boolean;
  actor: TapisPlayer | undefined;
  wild: Card | null;
  winUsed: number[];
}) {
  const cards = me.cards.filter((c): c is Card => !!c);
  const hand = useMemo(() => (cards.length ? handName(bestHand([...cards, ...view.board], wild)) : null), [JSON.stringify(cards), view.board.length, wild]);
  const [swapMode, setSwapMode] = useState(false);
  useEffect(() => setSwapMode(false), [view.street, view.hand, myTurn]);

  const toCall = Math.max(0, view.currentBet - me.bet);
  const maxTo = me.bet + me.stack;
  const minTo = Math.min(view.minRaiseTo, maxTo);
  const raiseOk = myTurn && view.canRaise && maxTo > view.currentBet;
  const [raiseTo, setRaiseTo] = useState(minTo);
  useEffect(() => setRaiseTo(minTo), [minTo, myTurn, view.street]);
  const bb = view.blinds.bb;
  const swapCost = bb * RULES.exchangeBB;
  const potAfterCall = view.pot + toCall;
  const presets: [string, number][] = [
    ["Min", minTo],
    ["½ pot", view.currentBet + Math.round(potAfterCall / 2)],
    ["Pot", view.currentBet + potAfterCall],
    ["Tapis", maxTo],
  ];
  const clamp = (x: number) => Math.max(minTo, Math.min(maxTo, Math.round(x)));
  const canSwap =
    myTurn && view.config.exchange && view.street === "flop" && !me.exchanged && me.stack > swapCost && !me.folded;

  const status = (() => {
    if (view.result) return null;
    if (me.place !== null && !me.inHand) return "Tu es éliminé : tu regardes la fin de la partie.";
    if (me.folded) return "Tu t'es couché pour cette donne.";
    if (me.allIn) return "Tu es à tapis : plus rien à dire, place aux cartes.";
    if (!myTurn) return actor ? `${actor.name} réfléchit…` : "Les cartes tombent…";
    return null;
  })();

  return (
    <section class={`my-panel ${myTurn ? "is-turn" : ""}`} style={accentVar(me.accent)} aria-label="Ta place">
      <div class="my-cards">
        {me.cards.map((c, i) => (
          <PlayingCard
            card={c}
            w={size.myCard}
            wild={sameCard(c, wild)}
            glow={swapMode ? "pick" : winUsed.includes(i) ? "win" : null}
            dim={me.folded}
            onClick={swapMode ? () => (send({ t: "exchange", index: i }), setSwapMode(false)) : undefined}
            label={swapMode && c ? `Échanger : ${cardName(c)}` : undefined}
          />
        ))}
      </div>
      <div class="my-side">
        <div class="my-info">
          <span class="my-stack">
            <PlayerSeal name={me.name} accent={me.accent} size={22} /> <span class="mono">{fmt(me.stack)}</span> jetons
          </span>
          {hand && !me.folded && (
            <span class="my-hand">
              {view.board.length < 5 && !view.result ? "Pour l'instant : " : "Ta main : "}
              <strong>{hand}</strong>
            </span>
          )}
        </div>
        {status && <p class="my-status muted">{status}</p>}
        {myTurn && (
          <div class="tactions">
            {swapMode ? (
              <div class="action-row">
                <span class="swap-hint">Clique la carte à remplacer ({fmt(swapCost)} au pot) : elle sera montrée à tous.</span>
                <button class="btn btn-ghost btn-sm" type="button" onClick={() => setSwapMode(false)}>
                  Annuler
                </button>
              </div>
            ) : (
              <>
                <div class="action-row">
                  <button class="btn btn-outline" type="button" data-sound="none" onClick={() => send({ t: "fold" })}>
                    Se coucher
                  </button>
                  {toCall === 0 ? (
                    <button class="btn btn-secondary" type="button" data-sound="none" onClick={() => send({ t: "check" })}>
                      Parler
                    </button>
                  ) : (
                    <button class="btn btn-secondary" type="button" data-sound="none" onClick={() => send({ t: "call" })}>
                      {toCall >= me.stack ? `Suivre à tapis (${fmt(me.stack)})` : `Suivre ${fmt(toCall)}`}
                    </button>
                  )}
                  {raiseOk && (
                    <button class="btn btn-primary" type="button" data-sound="none" onClick={() => send(raiseTo >= maxTo ? { t: "allin" } : { t: "bet", to: raiseTo })}>
                      {raiseTo >= maxTo ? `Tapis (${fmt(maxTo)})` : view.currentBet === 0 ? `Miser ${fmt(raiseTo)}` : `Relancer à ${fmt(raiseTo)}`}
                    </button>
                  )}
                  {canSwap && (
                    <button class="btn btn-ghost" type="button" data-sound="card.hover" onClick={() => setSwapMode(true)} title="Une fois par donne">
                      ⇄ Échanger · {fmt(swapCost)}
                    </button>
                  )}
                </div>
                {raiseOk && maxTo > minTo && (
                  <div class="raise-row">
                    <input
                      type="range"
                      min={minTo}
                      max={maxTo}
                      step={Math.max(1, Math.round(bb / 2))}
                      value={raiseTo}
                      onInput={(e) => setRaiseTo(clamp(Number((e.target as HTMLInputElement).value)))}
                      aria-label="Montant de la relance"
                    />
                    {presets.map(([label, x]) => (
                      <button type="button" class={`chip chip-sm ${clamp(x) === raiseTo ? "is-active" : ""}`} data-sound="chip.select" onClick={() => setRaiseTo(clamp(x))}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
