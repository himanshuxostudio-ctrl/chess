/** Matchmaking waiting screen: profile, chosen clock, live connection state, elapsed time and cancel. */
import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { useProfile } from '../profile/profile';
import { describeTime } from '../../shared/match';
import type { TimeControl } from '../../shared/protocol';

export function Matchmaking({ timeControl, onFound, onCancel }: { timeControl: TimeControl; onFound: () => void; onCancel: () => void }) {
  const p = useProfile();
  const netStatus = useGame((s) => s.netStatus);
  const searching = useGame((s) => s.searching);
  const position = useGame((s) => s.queuePosition);
  const status = useGame((s) => s.snapshot?.status);
  const roomId = useGame((s) => s.roomId);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (roomId && status === 'active') onFound();
  }, [roomId, status, onFound]);

  const found = !searching && !!roomId;
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return (
    <div className="panel prep-section matchmaking" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      <div className="avatar" style={{ width: 72, height: 72, margin: '0 auto 10px' }}>{p.avatar ? <img src={p.avatar} alt="" /> : p.name[0]}</div>
      <b style={{ fontSize: 18 }}>{p.name}</b>
      <div className="muted">Rating {p.rating}</div>
      <div className="ornament" />
      <div className="waiting" style={{ justifyContent: 'center' }}>
        <span className="spinner" /> {found ? 'Opponent found — entering the battlefield…' : 'Searching for an opponent…'}
      </div>
      <dl className="terms" style={{ textAlign: 'left', marginTop: 14 }}>
        <dt>Clock</dt><dd>{describeTime(timeControl)}</dd>
        <dt>Battlefield</dt><dd>Chosen by the server</dd>
        <dt>Time searching</dt><dd>{mm}</dd>
        {position != null && (<><dt>Queue position</dt><dd>{position}</dd></>)}
        <dt>Connection</dt>
        <dd><span className={`dot ${netStatus === 'open' ? 'on' : 'off'}`} /> {netStatus === 'open' ? 'Connected' : netStatus ?? 'Connecting'}</dd>
      </dl>
      {elapsed > 45 && !found && <p className="muted small">Few commanders are searching for this clock right now. You can keep waiting or invite a friend instead.</p>}
      <button className="btn ghost block" onClick={onCancel}>Cancel search</button>
    </div>
  );
}
