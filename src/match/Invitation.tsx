/**
 * What an invited player sees on opening /game/:room — the host, the army they will command and
 * the server's battle terms (via `peek`, which takes no seat), then Accept / Watch / Decline.
 */
import { useEffect } from 'react';
import { useGame } from '../game/store';
import { useProfile } from '../profile/profile';
import { MatchTerms, ARMY_OF_COLOR } from './InviteLobby';

export function Invitation({ roomId, onAccept, onWatch, onDecline }: { roomId: string; onAccept: () => void; onWatch: () => void; onDecline: () => void }) {
  const peek = useGame((s) => s.peek);
  const peekError = useGame((s) => s.peekError);
  const netStatus = useGame((s) => s.netStatus);
  const name = useProfile((p) => p.name);
  const setName = useProfile((p) => p.setName);

  // Peek takes no seat; refresh it so a cancelled or filled invitation shows up without reloading.
  useEffect(() => {
    useGame.getState().peekRoom(roomId);
    const id = setInterval(() => useGame.getState().net?.send({ t: 'peek', roomId }), 4000);
    return () => clearInterval(id);
  }, [roomId]);

  const snap = peek && peek.roomId === roomId ? peek : null;
  const host = snap?.hostColor ? snap.players[snap.hostColor] : null;
  const myColor = snap?.hostColor === 'w' ? 'b' : 'w';
  const seatOpen = snap ? !snap.players[myColor] && snap.status === 'waiting' : false;

  return (
    <div className="panel prep-section invitation" style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="label">Battle invitation · Room {roomId}</div>
      {!snap && !peekError && (
        <div className="waiting" style={{ margin: '18px 0' }}>
          <span className="spinner" /> {netStatus === 'reconnecting' ? 'Reconnecting…' : 'Reading the invitation…'}
        </div>
      )}
      {peekError && !snap && (
        <>
          <h2>This invitation is unavailable</h2>
          <p className="muted">{peekError}</p>
          <button className="btn primary" onClick={onDecline}>Back to battle preparation</button>
        </>
      )}
      {snap && (
        <>
          <h2 style={{ margin: '6px 0' }}>{host ? `${host.name} challenges you` : 'You have been challenged'}</h2>
          {snap.status === 'cancelled' ? (
            <p className="muted">The host withdrew this challenge.</p>
          ) : seatOpen ? (
            <p className="muted" style={{ marginTop: 0 }}>
              You will command the <b className={`army-${myColor === 'w' ? 'sun' : 'shadow'}`}>{ARMY_OF_COLOR[myColor]}</b>
              {myColor === 'w' ? ' and move first.' : ' and move second.'}
            </p>
          ) : (
            <p className="muted">Both seats are taken — this battle {snap.status === 'over' ? 'has ended' : 'is under way'}.</p>
          )}
          <MatchTerms snap={snap} />
          {seatOpen && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="label">Your commander name</span>
              <input type="text" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <div className="invite-actions">
            {seatOpen && <button className="btn primary" onClick={onAccept}>Accept challenge</button>}
            {snap.config.allowSpectators && snap.status !== 'cancelled' && (
              <button className="btn" onClick={onWatch}>Watch as spectator</button>
            )}
            <button className="btn ghost" onClick={onDecline}>{seatOpen ? 'Decline' : 'Back'}</button>
          </div>
        </>
      )}
    </div>
  );
}
