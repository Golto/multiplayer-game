// Serveur HTTP (fichiers du client, API des salons) + WebSocket (salons de jeu, tous jeux confondus).

import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import sirv from "sirv";
import { WebSocketServer, type WebSocket } from "ws";
import { GameError, type GameRoom } from "./platform.js";
import { gameDefinition } from "./games/registry.js";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  type ClientMessage,
  type GameId,
  type RoomInfo,
  type ServerMessage,
} from "../shared/platform.js";

const PORT = Number(process.env.PORT ?? 3001);
/** Un salon vide est supprimé après ce délai. */
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
const MAX_MESSAGE_BYTES = 4096;

interface Room {
  gameId: GameId;
  game: GameRoom;
  sockets: Map<string, WebSocket>;
  emptySince: number | null;
}

interface Session {
  room: Room | null;
  playerId: string | null;
}

const rooms = new Map<string, Room>();

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function createRoom(gameId: unknown): Room {
  const definition = gameDefinition(gameId);
  if (!definition) throw new GameError("Ce jeu n'existe pas.");
  const code = newCode();
  const room: Room = {
    gameId: definition.id,
    sockets: new Map(),
    // Vide tant que personne n'y est attaché : un salon orphelin finit nettoyé.
    emptySince: Date.now(),
    game: definition.create(code, () => broadcast(room)),
  };
  rooms.set(code, room);
  return room;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room): void {
  for (const [playerId, ws] of room.sockets) {
    send(ws, { t: "state", game: room.gameId, state: room.game.view(playerId) });
  }
}

function attach(room: Room, session: Session, playerId: string, ws: WebSocket): void {
  const previous = room.sockets.get(playerId);
  if (previous && previous !== ws) {
    send(previous, { t: "error", message: "Ta place a été reprise depuis un autre onglet.", fatal: true });
    previous.close();
  }
  room.sockets.set(playerId, ws);
  room.emptySince = null;
  session.room = room;
  session.playerId = playerId;
}

function detach(session: Session, ws: WebSocket): void {
  const { room, playerId } = session;
  if (!room || !playerId) return;
  if (room.sockets.get(playerId) === ws) {
    room.sockets.delete(playerId);
    room.game.setConnected(playerId, false);
  }
  if (room.sockets.size === 0) room.emptySince = Date.now();
}

function handle(ws: WebSocket, session: Session, msg: ClientMessage): void {
  switch (msg.t) {
    case "create": {
      const room = createRoom(msg.game);
      const player = room.game.addPlayer(msg.name);
      attach(room, session, player.id, ws);
      send(ws, { t: "joined", code: room.game.code, game: room.gameId, playerId: player.id, token: player.token });
      broadcast(room);
      return;
    }
    case "join": {
      const room = rooms.get(String(msg.code ?? "").toUpperCase().trim());
      if (!room) throw new GameError("Aucun salon avec ce code.");
      const player = room.game.addPlayer(msg.name);
      attach(room, session, player.id, ws);
      send(ws, { t: "joined", code: room.game.code, game: room.gameId, playerId: player.id, token: player.token });
      broadcast(room);
      return;
    }
    case "resume": {
      const room = rooms.get(String(msg.code ?? "").toUpperCase());
      if (!room) throw new GameError("Ce salon n'existe plus.");
      const player = room.game.resume(msg.playerId, msg.token);
      attach(room, session, player.id, ws);
      send(ws, { t: "joined", code: room.game.code, game: room.gameId, playerId: player.id, token: player.token });
      broadcast(room);
      return;
    }
  }

  const { room, playerId } = session;
  if (!room || !playerId) throw new GameError("Rejoins d'abord un salon.");
  switch (msg.t) {
    case "action":
      return room.game.handle(playerId, msg.action);
    case "leave":
      room.sockets.delete(playerId);
      room.game.leave(playerId);
      session.room = null;
      session.playerId = null;
      if (room.sockets.size === 0) room.emptySince = Date.now();
      return;
    default:
      throw new GameError("Message inconnu.");
  }
}

// ---------------------------------------------------------------- HTTP

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = [join(here, "client"), join(here, "../dist/client")].find((d) => existsSync(d));
const serveStatic = clientDir ? sirv(clientDir, { single: true, etag: true, gzip: true }) : null;

const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`ok ${rooms.size}`);
    return;
  }
  const roomMatch = req.url?.match(/^\/api\/rooms\/([A-Za-z0-9]{1,12})$/);
  if (roomMatch) {
    const room = rooms.get(roomMatch[1]!.toUpperCase());
    const info: RoomInfo | null = room
      ? { code: room.game.code, game: room.gameId, players: room.game.playerCount, joinable: room.game.joinable }
      : null;
    res.writeHead(info ? 200 : 404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(info ?? { error: "Aucun salon avec ce code." }));
    return;
  }
  if (serveStatic) return serveStatic(req, res);
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Client non construit : lance `npm run build`, ou `npm run dev` pour développer.");
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MESSAGE_BYTES });

wss.on("connection", (ws) => {
  const session: Session = { room: null, playerId: null };
  let alive = true;
  ws.on("pong", () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 25_000);

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return send(ws, { t: "error", message: "Message illisible." });
    }
    try {
      handle(ws, session, msg);
    } catch (err) {
      const message = err instanceof GameError ? err.message : "Erreur inattendue du serveur.";
      if (!(err instanceof GameError)) console.error(err);
      send(ws, { t: "error", message });
    }
  });

  ws.on("close", () => {
    clearInterval(ping);
    detach(session, ws);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
      room.game.dispose();
      rooms.delete(code);
    }
  }
}, 60_000).unref();

server.listen(PORT, () => {
  console.log(`Rumeurs écoute sur http://localhost:${PORT}`);
});
