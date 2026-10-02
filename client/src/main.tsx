import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GameId, RoomInfo } from "../../shared/platform";
import { pageMeta } from "../../shared/catalog";
import { Connection, loadSession, saveSession, type PlatformSend, type Status } from "./net";
import { navigate, roomCodeFromPath, usePath } from "./router";
import { initTheme } from "./theme";
import { play } from "./sound/engine";
import { installUiSounds, useConnectionSounds } from "./sound/wiring";
import { GAME_CLIENTS } from "./games/registry";
import { Hub } from "./hub/Hub";
import "./tokens.css";
import "./styles.css";
import "./hub/hub.css";

initTheme();
installUiSounds();

interface Room {
  game: GameId;
  state: unknown;
}

function isGameId(id: string): id is GameId {
  return Object.hasOwn(GAME_CLIENTS, id);
}

function App() {
  const path = usePath();
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [toast, setToast] = useState<string | null>(null);
  const joined = useRef(false);
  const listeners = useRef(new Set<(event: unknown) => void>());

  const conn = useMemo(() => {
    const urlCode = roomCodeFromPath(location.pathname);
    const session = loadSession();
    if (session && urlCode && session.code !== urlCode) saveSession(null);
    return new Connection({
      onState: (game, state) => setRoom({ game, state }),
      onEvent: (_game, event) => listeners.current.forEach((l) => l(event)),
      onJoined: (session) => {
        joined.current = true;
        navigate(`/r/${session.code}`, { replace: true });
      },
      onError: (message, fatal) => {
        if (!joined.current && loadSession()) {
          // La reprise a échoué : salon disparu ou place perdue.
          saveSession(null);
        }
        if (fatal) {
          saveSession(null);
          setRoom(null);
        }
        setToast(message);
        play("feedback.warning");
      },
      onStatus: setStatus,
    });
  }, []);

  useEffect(() => conn.connect(), [conn]);

  // Titre de l'onglet : le jeu en cours, ou celui de la page.
  const slug = path.replace(/^\/|\/$/g, "");
  const pageGame = room?.game ?? (isGameId(slug) ? slug : (loadSession()?.game ?? null));
  useEffect(() => {
    document.title = pageMeta(pageGame, room ? null : roomCodeFromPath(path)).title;
  }, [pageGame, room !== null, path]);
  useConnectionSounds(status, room !== null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const send: PlatformSend = (msg) => conn.send(msg);
  const subscribe = useMemo(
    () => (listener: (event: unknown) => void) => {
      listeners.current.add(listener);
      return () => void listeners.current.delete(listener);
    },
    [],
  );

  const leave = () => {
    const game = room?.game;
    send({ t: "leave" });
    saveSession(null);
    joined.current = false;
    setRoom(null);
    navigate(game ? `/${game}` : "/", { replace: true });
  };

  let screen;
  if (room) {
    const { Room: RoomScreen } = GAME_CLIENTS[room.game];
    screen = (
      <RoomScreen
        state={room.state}
        sendAction={(action) => send({ t: "action", action })}
        subscribe={subscribe}
        onLeave={leave}
      />
    );
  } else {
    screen = <Route path={path} send={send} connecting={status !== "open"} onMissingRoom={setToast} />;
  }

  return (
    <>
      {screen}
      {status !== "open" && room && (
        <div class="connection-banner" role="status">
          Connexion perdue, on se reconnecte…
        </div>
      )}
      {toast && (
        <div class="toast" role="alert">
          {toast}
        </div>
      )}
    </>
  );
}

/** Pages hors salon : la salle de jeux, la page d'un jeu, ou un lien d'invitation. */
function Route({ path, send, connecting, onMissingRoom }: { path: string; send: PlatformSend; connecting: boolean; onMissingRoom: (msg: string) => void }) {
  const code = roomCodeFromPath(path);
  const [invite, setInvite] = useState<RoomInfo | null>(null);

  useEffect(() => {
    setInvite(null);
    if (!code || loadSession()?.code === code) return;
    let cancelled = false;
    fetch(`/api/rooms/${code}`)
      .then((res) => (res.ok ? (res.json() as Promise<RoomInfo>) : null))
      .then((info) => {
        if (cancelled) return;
        if (info) setInvite(info);
        else {
          onMissingRoom(`Aucun salon ${code} : il a peut-être fermé.`);
          navigate("/", { replace: true });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (code) {
    // Reprise en cours, ou lien d'invitation : on affiche la page du bon jeu, code prérempli.
    const game = invite?.game ?? loadSession()?.game;
    if (!game) return <div class="page" aria-busy="true" />;
    const { Home } = GAME_CLIENTS[game];
    return <Home send={send} initialCode={code} connecting={connecting} />;
  }

  const slug = path.replace(/^\/|\/$/g, "");
  if (slug && !isGameId(slug)) queueMicrotask(() => navigate("/", { replace: true }));
  if (slug && isGameId(slug)) {
    const { Home } = GAME_CLIENTS[slug];
    return <Home send={send} initialCode={null} connecting={connecting} />;
  }
  return <Hub send={send} connecting={connecting} />;
}

render(<App />, document.getElementById("app")!);
