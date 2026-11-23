/**
 * App shell: owns the current screen, URL routing (/game/:room, /watch/:room) and mounts the
 * persistent 3D battlefield behind every screen (the landing page shows it in showcase mode).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Color } from 'chess.js';
import { useGame, startTicker } from './game/store';
import { sound } from './audio/sound';
import { useSettings } from './config/settings';
import { Landing, ModeSelect, AiLobby, FriendLobby, LocalLobby, SpectateLobby, ProfileScreen, JoinScreen, type Screen } from './ui/screens/Menus';
import { GameScreen } from './ui/screens/GameScreen';
import { SettingsPanel } from './ui/components/SettingsPanel';
import { Board2D } from './ui/components/Board2D';
import { ROOM_ID_RE } from '../shared/protocol';

const Scene = lazy(() => import('./three/Scene'));

const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();

type Route = { screen: Screen | 'game'; room?: string; watch?: boolean };
function parseRoute(): Route {
  const m = location.pathname.match(/^\/(game|watch)\/([A-Za-z0-9]{10})\/?$/);
  if (m && ROOM_ID_RE.test(m[2].toUpperCase())) return { screen: m[1] === 'watch' ? 'game' : 'join', room: m[2].toUpperCase(), watch: m[1] === 'watch' };
  return { screen: 'landing' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mode = useGame((s) => s.mode);

  useEffect(() => {
    startTicker();
    // Audio can only start after a user gesture.
    const unlock = () => {
      sound.unlock();
      if (useSettings.getState().soundOn) sound.startAmbient();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    // A spectator link goes straight to the battle; a reconnecting player with a token skips the join form.
    const r = parseRoute();
    if (r.room && r.watch) useGame.getState().joinRoom(r.room, true);
    else if (r.room && hasToken(r.room)) {
      useGame.getState().joinRoom(r.room);
      setRoute({ screen: 'game', room: r.room });
    }
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (screen: Screen | 'game') => {
    sound.play('ui');
    if (screen !== 'game' && location.pathname !== '/') history.pushState(null, '', '/');
    if (screen !== 'game' && mode !== 'showcase') useGame.getState().leave();
    setRoute({ screen });
  };
  const toGame = () => setRoute((r) => ({ ...r, screen: 'game' }));

  const startAi = (level: number, color: Color, tc: { initial: number; increment: number }) => {
    useGame.getState().newGame({ mode: 'ai', aiLevel: level, myColor: color, timeControl: tc });
    toGame();
  };
  const playAgain = () => {
    const s = useGame.getState();
    if (s.mode === 'online') return s.rematch();
    if (s.mode === 'ai') return startAi(s.aiLevel.id, s.myColor ?? 'w', s.timeControl);
    if (s.mode === 'local') s.newGame({ mode: 'local', names: { w: s.players.w.name, b: s.players.b.name }, timeControl: s.timeControl, passScreen: s.passScreen });
  };

  const common = { go, onSettings: () => setSettingsOpen(true) };
  const screen = route.screen;

  return (
    <>
      <div className="scene-layer" aria-hidden={screen !== 'game'}>
        {hasWebGL ? (
          <Suspense fallback={<div className="loading-screen"><div className="waiting"><span className="spinner" /> Raising the battlefield…</div></div>}>
            <Scene />
          </Suspense>
        ) : (
          screen === 'game' && <Board2D />
        )}
      </div>
      <div className="ui-layer">
        {screen === 'landing' && <Landing {...common} playNow={() => startAi(2, 'w', { initial: 0, increment: 0 })} />}
        {screen === 'modes' && <ModeSelect {...common} />}
        {screen === 'ai' && <AiLobby {...common} start={startAi} />}
        {screen === 'friend' && (
          <FriendLobby
            {...common}
            create={(c, tc) => {
              useGame.getState().createRoom(c, tc);
              toGame();
            }}
            join={(id) => {
              history.pushState(null, '', `/game/${id}`);
              setRoute({ screen: 'join', room: id });
            }}
            quick={(tc) => {
              useGame.getState().quickMatch(tc);
              toGame();
            }}
          />
        )}
        {screen === 'local' && (
          <LocalLobby
            {...common}
            start={(names, tc, pass) => {
              useGame.getState().newGame({ mode: 'local', names, timeControl: tc, passScreen: pass });
              toGame();
            }}
          />
        )}
        {screen === 'spectate' && (
          <SpectateLobby
            {...common}
            watch={(id) => {
              useGame.getState().joinRoom(id, true);
              setRoute({ screen: 'game', room: id, watch: true });
            }}
          />
        )}
        {screen === 'profile' && <ProfileScreen {...common} />}
        {screen === 'join' && route.room && (
          <JoinScreen
            roomId={route.room}
            {...common}
            join={() => {
              useGame.getState().joinRoom(route.room!);
              toGame();
            }}
            watch={() => {
              useGame.getState().joinRoom(route.room!, true);
              toGame();
            }}
          />
        )}
        {screen === 'game' && <GameScreen onMenu={() => go('modes')} onSettings={() => setSettingsOpen(true)} onPlayAgain={playAgain} />}
        {!hasWebGL && screen !== 'game' && (
          <div className="toast error" style={{ position: 'fixed', bottom: 12, left: 12, right: 12 }}>
            3D graphics (WebGL) are unavailable on this device — battles will use a simplified 2D board.
          </div>
        )}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
    </>
  );
}

function hasToken(room: string) {
  try {
    return !!JSON.parse(localStorage.getItem('awc-room-tokens') ?? '{}')[room];
  } catch {
    return false;
  }
}
