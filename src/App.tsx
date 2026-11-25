/**
 * App shell: owns the current screen, URL routing (/game/:room, /watch/:room) and mounts the
 * persistent 3D battlefield behind every screen (the landing page shows it in showcase mode).
 *
 * Match preparation flow (src/match/):
 *   hub ─┬─ Quick Match ───────────────→ matchmaking ─→ game
 *        ├─ Create Challenge Link ─────→ lobby (host) ─→ game
 *        └─ Friend / AI / Custom / Local → custom ─→ (lobby | matchmaking | invitation | game)
 *   /game/:room (invited player) → invite ─→ lobby (guest) ─→ game
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Color } from 'chess.js';
import { useGame, startTicker } from './game/store';
import { sound } from './audio/sound';
import { useSettings } from './config/settings';
import { Landing, SpectateLobby, ProfileScreen, TopBar, type Screen } from './ui/screens/Menus';
import { GameScreen } from './ui/screens/GameScreen';
import { SettingsPanel } from './ui/components/SettingsPanel';
import { Board2D } from './ui/components/Board2D';
import { ROOM_ID_RE } from '../shared/protocol';
import { normalizeMatch } from '../shared/match';
import { MatchHub, type HubAction } from './match/MatchHub';
import { MatchSettings } from './match/MatchSettings';
import { InviteLobby } from './match/InviteLobby';
import { Invitation } from './match/Invitation';
import { Matchmaking } from './match/Matchmaking';
import { useMatchPrefs, sideToColor, type OpponentKind } from './match/prefs';

const Scene = lazy(() => import('./three/Scene'));

const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();

type Route = { screen: Screen | 'game'; room?: string; watch?: boolean; opponent?: OpponentKind; guest?: boolean };
function parseRoute(): Route {
  const m = location.pathname.match(/^\/(game|watch)\/([A-Za-z0-9]{10})\/?$/);
  if (m && ROOM_ID_RE.test(m[2].toUpperCase())) return { screen: m[1] === 'watch' ? 'game' : 'invite', room: m[2].toUpperCase(), watch: m[1] === 'watch' };
  return { screen: 'landing' };
}

/** Resolve the saved side preference to a concrete colour for offline games. */
const pickColor = (): Color => {
  const c = sideToColor(useMatchPrefs.getState().side);
  return c === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : c;
};

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
    // A spectator link goes straight to the battle; a reconnecting player with a token rejoins their seat.
    const r = parseRoute();
    if (r.room && r.watch) useGame.getState().joinRoom(r.room, true);
    else if (r.room && hasToken(r.room)) {
      useGame.getState().joinRoom(r.room);
      setRoute({ screen: 'lobby', room: r.room });
    }
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (screen: Screen | 'game', extra: Partial<Route> = {}) => {
    sound.play('ui');
    const inMatch = screen === 'game' || screen === 'lobby' || screen === 'matchmaking';
    if (!inMatch && screen !== 'invite' && location.pathname !== '/') history.pushState(null, '', '/');
    if (!inMatch && mode !== 'showcase') useGame.getState().leave();
    setRoute({ screen, ...extra });
  };
  const toGame = useCallback(() => setRoute((r) => ({ ...r, screen: 'game' })), []);
  const backToPrep = () => go('hub');

  // ---- starting matches (all settings come from the saved match preferences) ----
  const startAi = (level = useMatchPrefs.getState().aiLevel, color: Color = pickColor()) => {
    const p = useMatchPrefs.getState();
    const { battlefield } = normalizeMatch({ battlefield: p.battlefield });
    useGame.getState().newGame({ mode: 'ai', aiLevel: level, myColor: color, timeControl: p.timeControl, battlefield, rated: p.rated });
    toGame();
  };
  const startLocal = (names: { w: string; b: string }, passScreen: boolean) => {
    const p = useMatchPrefs.getState();
    const { battlefield } = normalizeMatch({ battlefield: p.battlefield });
    useGame.getState().newGame({ mode: 'local', names, timeControl: p.timeControl, passScreen, battlefield });
    toGame();
  };
  const createInvite = () => {
    const p = useMatchPrefs.getState();
    useGame.getState().createRoom(sideToColor(p.side), {
      timeControl: p.timeControl,
      battlefield: p.battlefield,
      rated: p.rated,
      allowSpectators: p.allowSpectators,
      allowRematch: p.allowRematch,
    });
    go('lobby');
  };
  const startSearch = () => {
    useGame.getState().quickMatch(useMatchPrefs.getState().timeControl);
    go('matchmaking');
  };
  const openInvitation = (id: string) => {
    history.pushState(null, '', `/game/${id}`);
    go('invite', { room: id });
  };

  const onHub = (a: HubAction | 'quick' | 'friend' | 'ai') => {
    if (a === 'quick') return startSearch();
    if (a === 'link') return createInvite();
    if (a === 'watch') return go('spectate');
    const opponent: OpponentKind = a === 'custom' ? useMatchPrefs.getState().opponent : a;
    go('custom', { opponent });
  };

  const playAgain = () => {
    const s = useGame.getState();
    if (s.mode === 'online') return s.rematch();
    if (s.mode === 'ai') {
      const { battlefield } = normalizeMatch({ battlefield: useMatchPrefs.getState().battlefield });
      s.newGame({ mode: 'ai', aiLevel: s.aiLevel.id, myColor: s.myColor ?? 'w', timeControl: s.timeControl, battlefield, rated: s.rated });
      return;
    }
    if (s.mode === 'local') s.newGame({ mode: 'local', names: { w: s.players.w.name, b: s.players.b.name }, timeControl: s.timeControl, passScreen: s.passScreen, battlefield: s.battlefield });
  };

  const common = { go: (s: Screen) => go(s), onSettings: () => setSettingsOpen(true) };
  const screen = route.screen;
  const prep = (back: Screen | undefined, body: React.ReactNode, wide = true) => (
    <div className="menu-screen">
      <div className="menu-wrap" style={wide ? undefined : { maxWidth: 640 }}>
        <TopBar {...common} back={back} />
        {body}
      </div>
    </div>
  );

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
        {screen === 'landing' && <Landing {...common} onPick={onHub} />}
        {screen === 'hub' && prep('landing', <MatchHub onPick={onHub} />)}
        {screen === 'custom' &&
          prep(
            'hub',
            <MatchSettings
              key={route.opponent}
              initialOpponent={route.opponent}
              onBack={backToPrep}
              start={{ ai: () => startAi(), local: startLocal, friend: createInvite, random: startSearch, code: openInvitation }}
            />,
          )}
        {screen === 'lobby' && prep(undefined, <InviteLobby onStart={toGame} onLeave={backToPrep} autoReady={route.guest} />)}
        {screen === 'matchmaking' &&
          prep(undefined, <Matchmaking timeControl={useMatchPrefs.getState().timeControl} onFound={toGame} onCancel={() => { useGame.getState().cancelSearch(); go('hub'); }} />, false)}
        {screen === 'invite' && route.room &&
          prep(
            undefined,
            <Invitation
              roomId={route.room}
              onAccept={() => {
                useGame.getState().joinRoom(route.room!);
                setRoute({ screen: 'lobby', room: route.room, guest: true });
              }}
              onWatch={() => {
                useGame.getState().joinRoom(route.room!, true);
                setRoute({ screen: 'game', room: route.room, watch: true });
              }}
              onDecline={backToPrep}
            />,
            false,
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
        {screen === 'game' && <GameScreen onMenu={() => go('hub')} onSettings={() => setSettingsOpen(true)} onPlayAgain={playAgain} />}
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
