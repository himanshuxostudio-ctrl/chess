/**
 * Private-battle waiting room, used by both the host and the invited player once seated.
 * Everything displayed comes from the server snapshot (config, seats, ready flags), so both
 * players always see the same terms.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { sound } from '../audio/sound';
import { Icon } from '../ui/components/Icons';
import { describeTime, battlefieldName } from '../../shared/match';
import type { RoomSnapshot } from '../../shared/protocol';
import type { Color } from 'chess.js';
import { copyText } from './roomCode';
import { inviteBase, isLocalOnlyLink } from './prefs';

export const ARMY_OF_COLOR = { w: 'Sun Army', b: 'Shadow Army' } as const;

export function MatchTerms({ snap }: { snap: RoomSnapshot }) {
  const c = snap.config;
  return (
    <dl className="terms">
      <dt>Game</dt><dd>Standard chess</dd>
      <dt>Clock</dt><dd>{describeTime(c.timeControl)}</dd>
      <dt>Battlefield</dt><dd>{battlefieldName(c.battlefield)}</dd>
      <dt>Rated</dt><dd>{c.rated ? 'Yes' : 'No'}</dd>
      <dt>Spectators</dt><dd>{c.allowSpectators ? 'Allowed' : 'Not allowed'}</dd>
      <dt>Rematch</dt><dd>{c.allowRematch ? 'Allowed' : 'Not allowed'}</dd>
    </dl>
  );
}

function Seat({ snap, color, me }: { snap: RoomSnapshot; color: Color; me: Color | null }) {
  const p = snap.players[color];
  const ready = snap.ready[color];
  return (
    <div className={`seat seat-${color === 'w' ? 'sun' : 'shadow'}`}>
      <div className="avatar">{p?.avatar ? <img src={p.avatar} alt="" /> : p ? p.name[0] : '?'}</div>
      <div style={{ minWidth: 0 }}>
        <div className="label">{ARMY_OF_COLOR[color]} · {color === 'w' ? 'moves first' : 'moves second'}</div>
        <b className="seat-name">{p ? p.name : 'Waiting for a commander…'}{me === color && ' (you)'}</b>
        <div className="seat-status">
          {!p ? (
            <span className="muted">Seat open</span>
          ) : (
            <>
              <span className={`dot ${p.connected ? 'on' : 'off'}`} /> {p.connected ? 'Connected' : 'Disconnected'}
              {snap.status === 'ready' && <span className={`ready-tag ${ready ? 'on' : ''}`}>{ready ? 'Ready' : 'Not ready'}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function InviteLobby({ onStart, onLeave, autoReady }: { onStart: () => void; onLeave: () => void; autoReady?: boolean }) {
  const s = useGame();
  const snap = s.snapshot;
  const readySent = useRef(false);
  const [copied, setCopied] = useState<'' | 'play' | 'watch'>('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (snap?.status === 'active') onStart();
  }, [snap?.status, onStart]);
  // The invited player already accepted on the invitation screen: confirm readiness once seated.
  useEffect(() => {
    if (autoReady && !readySent.current && snap?.status === 'ready' && s.myColor && !snap.ready[s.myColor]) {
      readySent.current = true;
      s.sendReady();
    }
  }, [autoReady, snap, s]);

  if (!snap || !s.roomId) {
    if (s.peekError)
      return (
        <div className="panel prep-section" style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ marginTop: 0 }}>This invitation is unavailable</h2>
          <p className="muted">{s.peekError}</p>
          <button className="btn primary" onClick={onLeave}>Back to battle preparation</button>
        </div>
      );
    return (
      <div className="panel prep-section" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="waiting"><span className="spinner" /> {s.netStatus === 'reconnecting' ? 'Reconnecting to the war council…' : 'Raising your private battlefield…'}</div>
        <button className="btn ghost small" style={{ marginTop: 14 }} onClick={onLeave}>Cancel</button>
      </div>
    );
  }

  const me = s.myColor;
  const isHost = !!me && snap.hostColor === me;
  const link = `${inviteBase()}/game/${s.roomId}`;
  const watchLink = `${inviteBase()}/watch/${s.roomId}`;
  const copy = async (what: 'play' | 'watch') => {
    await copyText(what === 'play' ? link : watchLink);
    setCopied(what);
    sound.play('ui');
    setTimeout(() => setCopied(''), 2000);
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Ancient Warfare Chess', text: `I challenge you to battle — ${describeTime(snap.config.timeControl)} on ${battlefieldName(snap.config.battlefield)}.`, url: link });
    } catch {
      /* dismissed */
    }
  };
  const text = encodeURIComponent(`I challenge you to a battle of Ancient Warfare Chess! ${link}`);

  if (snap.status === 'cancelled') {
    return (
      <div className="panel prep-section" style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>{isHost ? 'Invitation cancelled' : 'The host withdrew this challenge'}</h2>
        <p className="muted">This invitation link no longer works.</p>
        <button className="btn primary" onClick={onLeave}>Back to battle preparation</button>
      </div>
    );
  }

  const myReady = me ? snap.ready[me] : false;
  const oppSeated = me ? !!snap.players[me === 'w' ? 'b' : 'w'] : false;

  return (
    <div className="prep-layout">
      <div className="prep-main">
        <section className="panel prep-section">
          <div className="label">Private battle · Room {s.roomId}</div>
          <h2 style={{ margin: '6px 0 4px' }}>{isHost ? (oppSeated ? 'Your opponent has arrived' : 'Summon your opponent') : 'You accepted the challenge'}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {snap.status === 'waiting'
              ? 'Send the invitation link. Your opponent will see these battle terms before accepting.'
              : 'Both commanders are here. The battle begins when both are ready.'}
          </p>
          <div className="seats">
            <Seat snap={snap} color="w" me={me} />
            <span className="vs display">VS</span>
            <Seat snap={snap} color="b" me={me} />
          </div>
          {snap.status === 'ready' && me && (
            <button className={`btn block ${myReady ? '' : 'primary'}`} disabled={myReady} onClick={() => { sound.play('ui'); s.sendReady(); }}>
              {myReady ? 'Waiting for your opponent to be ready…' : isHost ? 'Ready — start the battle' : 'Ready'}
            </button>
          )}
          {snap.status === 'waiting' && (
            <div className="waiting" style={{ marginTop: 6 }}><span className="spinner" /> Waiting for your opponent to join…</div>
          )}
          <div className="conn-line muted">
            <span className={`dot ${s.netStatus === 'open' ? 'on' : 'off'}`} /> Server: {s.netStatus === 'open' ? 'connected' : s.netStatus ?? 'offline'}
          </div>
        </section>

        {isHost && (
          <section className="panel prep-section">
            <div className="label">Invitation link</div>
            {isLocalOnlyLink() && (
              <div className="notice warn">
                This link points to <code>{inviteBase()}</code>, which only works on this computer. Deploy the game publicly and set
                <code> VITE_PUBLIC_URL</code> so friends on other devices can join.
              </div>
            )}
            <div className="invite" style={{ margin: '10px 0' }}><code>{link}</code></div>
            <button className="btn primary block" onClick={() => copy('play')}>
              <Icon.copy className="" /> {copied === 'play' ? 'Link copied' : 'Copy invitation link'}
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {'share' in navigator && <button className="btn small" onClick={share}><Icon.share className="" /> Share…</button>}
              <a className="btn small" href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <a className="btn small" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`} target="_blank" rel="noreferrer">Telegram</a>
              {snap.config.allowSpectators && (
                <button className="btn small ghost" onClick={() => copy('watch')}>{copied === 'watch' ? 'Spectator link copied' : 'Copy spectator link'}</button>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="prep-side">
        <section className="panel prep-section summary">
          <div className="label">Battle terms</div>
          <MatchTerms snap={snap} />
          <p className="muted small">You command the {me ? ARMY_OF_COLOR[me] : '—'}. Set by the server for both players.</p>
          {isHost ? (
            confirmCancel ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <span>Cancel this invitation? The link will stop working.</span>
                <button className="btn danger block" onClick={() => { s.cancelInvite(); setConfirmCancel(false); }}>Yes, cancel invitation</button>
                <button className="btn ghost small block" onClick={() => setConfirmCancel(false)}>Keep waiting</button>
              </div>
            ) : (
              <button className="btn ghost block" onClick={() => setConfirmCancel(true)}>Cancel invitation</button>
            )
          ) : (
            <button className="btn ghost block" onClick={onLeave}>Leave</button>
          )}
        </section>
      </aside>
    </div>
  );
}
