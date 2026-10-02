// Connexion WebSocket avec reconnexion automatique et reprise de place.

import type { ClientMessage, GameId, ServerMessage } from "../../shared/platform";

export type PlatformSend = (msg: ClientMessage) => void;

export interface Session {
  code: string;
  game: GameId;
  playerId: string;
  token: string;
}

export type Status = "connecting" | "open" | "closed";

interface Handlers {
  onState(game: GameId, state: unknown): void;
  onJoined(session: Session): void;
  onError(message: string, fatal: boolean): void;
  onStatus(status: Status): void;
}

const SESSION_KEY = "rumeurs.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : on jouera sans reprise.
  }
}

export class Connection {
  private ws: WebSocket | null = null;
  private retry = 0;
  private queue: ClientMessage[] = [];
  private closedByUs = false;

  constructor(private readonly handlers: Handlers) {}

  connect(): void {
    this.closedByUs = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.handlers.onStatus("connecting");

    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onStatus("open");
      const session = loadSession();
      if (session) {
        const { code, playerId, token } = session;
        ws.send(JSON.stringify({ t: "resume", code, playerId, token } satisfies ClientMessage));
      }
      for (const msg of this.queue.splice(0)) ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as ServerMessage;
      if (msg.t === "state") this.handlers.onState(msg.game, msg.state);
      else if (msg.t === "joined") {
        const session = { code: msg.code, game: msg.game, playerId: msg.playerId, token: msg.token };
        saveSession(session);
        this.handlers.onJoined(session);
      } else if (msg.t === "error") this.handlers.onError(msg.message, !!msg.fatal);
    };

    ws.onclose = () => {
      this.handlers.onStatus("closed");
      if (this.closedByUs) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }
}
