/** Landing page, top bar, spectator entry and profile. Match preparation lives in src/match/. */
import { useRef, useState } from 'react';
import { parseRoom } from '../../match/roomCode';
import { useProfile, favouriteMode, fileToAvatar } from '../../profile/profile';
import { Icon, Logo } from '../components/Icons';

export type Screen = 'landing' | 'hub' | 'custom' | 'lobby' | 'invite' | 'matchmaking' | 'spectate' | 'profile';

export function TopBar({ go, onSettings, back }: { go: (s: Screen) => void; onSettings: () => void; back?: Screen }) {
  const name = useProfile((p) => p.name);
  const avatar = useProfile((p) => p.avatar);
  return (
    <div className="topbar">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {back && (
          <button className="icon-btn" aria-label="Back" onClick={() => go(back)}>
            <Icon.back className="" />
          </button>
        )}
        <button className="logo" onClick={() => go('landing')}>
          <Logo /> <span className="logo-text">ANCIENT WARFARE CHESS</span>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn small ghost" onClick={() => go('profile')} aria-label="Profile">
          <span className="avatar" style={{ width: 26, height: 26, borderRadius: 6 }}>
            {avatar ? <img src={avatar} alt="" /> : name[0]}
          </span>
          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <Icon.settings className="" />
        </button>
      </div>
    </div>
  );
}

export function Landing({ go, onSettings, onPick }: { go: (s: Screen) => void; onSettings: () => void; onPick: (a: 'quick' | 'friend' | 'ai') => void }) {
  return (
    <div className="menu-screen" style={{ background: 'linear-gradient(180deg, rgba(15,13,11,0.55) 0%, rgba(15,13,11,0) 30%, rgba(15,13,11,0) 55%, rgba(15,13,11,0.9) 100%)' }}>
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} />
        <section className="hero">
          <div className="label" style={{ color: 'var(--gold)' }}>The Sun Army · versus · The Shadow Army</div>
          <h1>
            Command your army.
            <span>Conquer the board.</span>
          </h1>
          <p>
            Real chess, fought as an ancient battle. Every soldier, war priest, chariot and commander is a living 3D unit —
            every capture a duel, every checkmate the fall of an empire. Battle the Stockfish engine, challenge a friend anywhere
            in the world, or share one device.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={() => go('hub')}>
              Play Now
            </button>
            <button className="btn" onClick={() => onPick('quick')}>
              Quick Match
            </button>
            <button className="btn" onClick={() => onPick('friend')}>
              Play a Friend
            </button>
            <button className="btn" onClick={() => onPick('ai')}>
              Play Against AI
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function NameField() {
  const name = useProfile((p) => p.name);
  const setName = useProfile((p) => p.setName);
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span className="label">Commander name</span>
      <input type="text" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
    </label>
  );
}


export function SpectateLobby({ go, onSettings, watch }: { go: (s: Screen) => void; onSettings: () => void; watch: (id: string) => void }) {
  const [code, setCode] = useState('');
  const parsed = parseRoom(code);
  return (
    <div className="menu-screen">
      <div className="menu-wrap" style={{ maxWidth: 560 }}>
        <TopBar go={go} onSettings={onSettings} back="hub" />
        <div className="panel" style={{ padding: 22, display: 'grid', gap: 12 }}>
          <h2>Watch a Battle</h2>
          <p className="muted" style={{ margin: 0 }}>Paste a spectator link, invitation link or room code. Spectators see every move live but cannot give orders.</p>
          <input type="text" placeholder="https://…/watch/ROOMCODE" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn primary" disabled={!parsed} onClick={() => parsed && watch(parsed)}>
            Take Your Seat on the Hill
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarField() {
  const avatar = useProfile((p) => p.avatar);
  const setAvatar = useProfile((p) => p.setAvatar);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div className="avatar" style={{ width: 64, height: 64 }}>{avatar ? <img src={avatar} alt="Your avatar" /> : <Icon.user className="" />}</div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setAvatar(await fileToAvatar(f));
        }}
      />
      <button className="btn small" onClick={() => input.current?.click()}>
        Upload avatar
      </button>
      {avatar && (
        <button className="btn small ghost" onClick={() => setAvatar(undefined)}>
          Remove
        </button>
      )}
    </div>
  );
}

export function ProfileScreen({ go, onSettings }: { go: (s: Screen) => void; onSettings: () => void }) {
  const p = useProfile();
  const fav = favouriteMode(p.modeCounts);
  const modeName = { ai: 'Against AI', online: 'Online', local: 'Pass & Play' } as const;
  return (
    <div className="menu-screen">
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} back="landing" />
        <div className="lobby">
          <div className="panel" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <h2>Commander Profile</h2>
            <AvatarField />
            <NameField />
            <div className="stats-grid" style={{ margin: 0 }}>
              <div className="stat"><b>{p.rating}</b>Rating</div>
              <div className="stat"><b>{p.stats.wins}</b>Victories</div>
              <div className="stat"><b>{p.stats.losses}</b>Defeats</div>
              <div className="stat"><b>{p.stats.draws}</b>Truces</div>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>Favourite mode: {fav ? modeName[fav] : '—'}</div>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Guest profile saved on this device. Rating is Elo-based (K=32) from games against the AI and online opponents.
            </p>
            <button className="btn small ghost" onClick={() => confirm('Reset rating, statistics and history?') && p.reset()}>
              Reset statistics
            </button>
          </div>
          <div className="panel" style={{ alignContent: 'start' }}>
            <div className="label">Match history</div>
            {p.history.length === 0 ? (
              <p className="muted">No battles fought yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table-list">
                  <thead>
                    <tr><th>Date</th><th>Mode</th><th>Opponent</th><th>Result</th><th>Moves</th><th /></tr>
                  </thead>
                  <tbody>
                    {p.history.map((h) => (
                      <tr key={h.id}>
                        <td>{new Date(h.date).toLocaleDateString()}</td>
                        <td>{modeName[h.mode]}</td>
                        <td>{h.opponent}</td>
                        <td style={{ color: h.result === 'win' ? 'var(--gold)' : h.result === 'loss' ? 'var(--red-bright)' : 'var(--muted)' }} title={h.reason}>
                          {h.result.toUpperCase()}
                          {h.ratingAfter ? ` · ${h.ratingAfter}` : ''}
                        </td>
                        <td>{h.moves}</td>
                        <td>
                          <button
                            className="btn small ghost"
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = URL.createObjectURL(new Blob([h.pgn], { type: 'application/x-chess-pgn' }));
                              a.download = `battle-${h.id.slice(0, 8)}.pgn`;
                              a.click();
                            }}
                          >
                            PGN
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
