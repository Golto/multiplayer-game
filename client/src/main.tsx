import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ClientMessage, GameView } from "../../shared/protocol";
import { Connection, loadSession, saveSession, type Status } from "./net";
import { initTheme } from "./theme";
import { play } from "./sound/engine";
import { installUiSounds, useGameSounds } from "./sound/wiring";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { GameScreen } from "./screens/Game";
import { FinalScreen } from "./screens/Final";
import "./tokens.css";
import "./styles.css";

initTheme();
installUiSounds();

export type Send = (msg: ClientMessage) => void;

function codeFromUrl(): string | null {
  const match = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/);
  return match ? match[1]!.toUpperCase() : null;
}

function App() {
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [toast, setToast] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const joined = useRef(false);

  const conn = useMemo(() => {
    const urlCode = codeFromUrl();
    const session = loadSession();
    if (session && urlCode && session.code !== urlCode) saveSession(null);
    return new Connection({
      onState: (state, offset) => {
        setView(state);
        setClockOffset(offset);
      },
      onJoined: (session) => {
        joined.current = true;
        if (location.pathname !== `/r/${session.code}`) history.replaceState(null, "", `/r/${session.code}`);
      },
      onError: (message, fatal) => {
        if (!joined.current && loadSession()) {
          // La reprise a échoué : salon disparu ou place perdue.
          saveSession(null);
        }
        if (fatal) {
          saveSession(null);
          setView(null);
        }
        setToast(message);
        play("feedback.warning");
      },
      onStatus: setStatus,
    });
  }, []);

  useEffect(() => conn.connect(), [conn]);
  useGameSounds(view, status);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const send: Send = (msg) => conn.send(msg);

  const leave = () => {
    send({ t: "leave" });
    saveSession(null);
    joined.current = false;
    setView(null);
    history.replaceState(null, "", "/");
  };

  let screen;
  if (!view) screen = <Home send={send} initialCode={codeFromUrl()} connecting={status !== "open"} />;
  else if (view.phase === "lobby") screen = <Lobby view={view} send={send} onLeave={leave} />;
  else if (view.phase === "final") screen = <FinalScreen view={view} send={send} onLeave={leave} />;
  else screen = <GameScreen view={view} send={send} clockOffset={clockOffset} onLeave={leave} />;

  return (
    <>
      {screen}
      {status !== "open" && view && (
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

render(<App />, document.getElementById("app")!);
