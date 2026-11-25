/**
 * Short, skippable pre-battle cinematic. The camera sweeps over the real 3D armies on the chosen
 * battlefield (see CameraRig intro) while this overlay presents both commanders and the terms.
 * Clocks are not running yet (they start with White's first move), so the intro costs no time.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { useSettings } from '../config/settings';
import { useView, INTRO_MS } from '../three/CameraRig';
import { sound } from '../audio/sound';
import { BATTLEFIELDS, describeTime } from '../../shared/match';

export function MatchIntro() {
  const s = useGame();
  const enabled = useSettings((x) => x.matchIntro);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const timer = useRef<number | null>(null);
  const key = `${s.mode}:${s.roomId ?? ''}:${s.startedAt}`;
  const fresh = s.mode !== 'showcase' && s.match.ply === 0 && !s.outcome.over && (s.mode !== 'online' || s.snapshot?.status === 'active');

  const finish = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setActive(false);
    useView.getState().endIntro();
  };

  useEffect(() => {
    if (!enabled || !fresh || shownFor === key) return;
    setShownFor(key);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) useView.getState().startIntro();
    setActive(true);
    sound.play('turn');
    timer.current = window.setTimeout(finish, reduced ? 2200 : INTRO_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fresh, key, shownFor]);
  // A move (e.g. the AI playing White) or leaving the game ends the intro.
  useEffect(() => {
    if (active && (s.match.ply > 0 || s.mode === 'showcase')) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.match.ply, s.mode, active]);
  useEffect(() => () => finish(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;
  const bf = BATTLEFIELDS.find((b) => b.id === s.battlefield)!;
  const kind = s.mode === 'ai' ? `Against the AI · ${s.aiLevel.name}` : s.mode === 'local' ? 'Local battle' : s.mode === 'spectate' ? 'Spectating' : s.rated ? 'Online · Rated' : 'Online · Unrated';
  return (
    <div className="intro" role="dialog" aria-label="Battle introduction" onClick={finish}>
      <div className="intro-band">
        <div className="intro-side sun">
          <span className="label">Sun Army</span>
          <b>{s.players.w.name}</b>
          {s.players.w.rating ? <small>{s.players.w.rating}</small> : null}
        </div>
        <div className="intro-vs display">VS</div>
        <div className="intro-side shadow">
          <span className="label">Shadow Army</span>
          <b>{s.players.b.name}</b>
          {s.players.b.rating ? <small>{s.players.b.rating}</small> : null}
        </div>
      </div>
      <div className="intro-terms">
        <h2 className="display">{bf.name}</h2>
        <div className="muted">{bf.subtitle}</div>
        <div className="intro-meta">
          <span>Standard chess</span>
          <span>{describeTime(s.timeControl)}</span>
          <span>{kind}</span>
        </div>
      </div>
      <button className="btn small ghost intro-skip" onClick={finish}>Skip intro</button>
    </div>
  );
}
