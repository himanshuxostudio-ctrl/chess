/** Landing page, mode selection, lobbies and profile. */
import { useRef, useState } from 'react';
import type { Color } from 'chess.js';
import { AI_LEVELS } from '../../ai/stockfish';
import { TIME_CONTROLS, ROOM_ID_RE, type TimeControl } from '../../../shared/protocol';
import { useProfile, favouriteMode, fileToAvatar } from '../../profile/profile';
import { useSettings } from '../../config/settings';
import { Icon, Logo, ModeGlyph } from '../components/Icons';

export type Screen = 'landing' | 'modes' | 'ai' | 'friend' | 'local' | 'spectate' | 'profile' | 'join';

function TopBar({ go, onSettings, back }: { go: (s: Screen) => void; onSettings: () => void; back?: Screen }) {
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
          <Logo /> ANCIENT WARFARE CHESS
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

export function Landing({ go, onSettings, playNow }: { go: (s: Screen) => void; onSettings: () => void; playNow: () => void }) {
  return (
    <div className="menu-screen" style={{ background: 'linear-gradient(180deg, rgba(15,13,11,0.55) 0%, rgba(15,13,11,0) 30%, rgba(15,13,11,0) 55%, rgba(15,13,11,0.9) 100%)' }}>
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} />
        <section className="hero">
          <div className="label" style={{ color: 'var(--gold)' }}>The Hellenic League · versus · The Persian Immortals</div>
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
            <button className="btn primary" onClick={playNow}>
              Play Now
            </button>
            <button className="btn" onClick={() => go('friend')}>
              Play With Friend
            </button>
            <button className="btn" onClick={() => go('ai')}>
              Play Against AI
            </button>
            <button className="btn ghost" onClick={() => go('modes')}>
              Explore Game
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ModeSelect({ go, onSettings }: { go: (s: Screen) => void; onSettings: () => void }) {
  const cards: { id: Screen; title: string; text: string; tag: string; G: (p: { className?: string }) => React.ReactElement }[] = [
    { id: 'ai', title: 'Play Against AI', text: 'Face a Stockfish-driven enemy commander across six ranks of skill — from village levy to the Undying King.', tag: 'Single player · 6 difficulties', G: ModeGlyph.ai },
    { id: 'friend', title: 'Play With a Friend', text: 'Raise a private battlefield, send the invitation link, and fight in real time from anywhere in the world.', tag: 'Online · invite link · matchmaking', G: ModeGlyph.friend },
    { id: 'local', title: 'Pass and Play', text: 'Two commanders, one device. The board turns between moves and works without an internet connection.', tag: 'Same device · offline', G: ModeGlyph.local },
    { id: 'spectate', title: 'Spectator Mode', text: 'Watch a live online battle unfold, move by move, from the hills above the field.', tag: 'Watch live battles', G: ModeGlyph.spectate },
  ];
  return (
    <div className="menu-screen">
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} back="landing" />
        <h2 style={{ fontSize: 30, marginBottom: 6 }}>Choose Your Campaign</h2>
        <p className="muted" style={{ marginTop: 0 }}>Every mode uses the full official rules of chess.</p>
        <div className="mode-grid" style={{ marginTop: 18 }}>
          {cards.map(({ id, title, text, tag, G }) => (
            <button key={id} className="mode-card" onClick={() => go(id)}>
              <G className="glyph" />
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="tag">{tag}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimePicker({ value, onChange }: { value: TimeControl; onChange: (t: TimeControl) => void }) {
  return (
    <div className="choice-row">
      {TIME_CONTROLS.map((t) => (
        <button key={t.label} className={`chip ${t.tc.initial === value.initial && t.tc.increment === value.increment ? 'on' : ''}`} onClick={() => onChange(t.tc)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ArmyPicker({ color, onChange, allowRandom }: { color: Color | 'random'; onChange: (c: Color | 'random') => void; allowRandom?: boolean }) {
  const whiteArmy = useSettings((s) => s.whiteArmy);
  const name = (c: Color) => ((c === 'w') === (whiteArmy === 'hellenic') ? 'Hellenic League' : 'Persian Immortals');
  return (
    <div className="choice-row">
      <button className={`chip ${color === 'w' ? 'on' : ''}`} onClick={() => onChange('w')}>
        White · {name('w')}
      </button>
      <button className={`chip ${color === 'b' ? 'on' : ''}`} onClick={() => onChange('b')}>
        Black · {name('b')}
      </button>
      {allowRandom && (
        <button className={`chip ${color === 'random' ? 'on' : ''}`} onClick={() => onChange('random')}>
          Random
        </button>
      )}
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

export function AiLobby({ go, onSettings, start }: { go: (s: Screen) => void; onSettings: () => void; start: (level: number, color: Color, tc: TimeControl) => void }) {
  const [level, setLevel] = useState(3);
  const [color, setColor] = useState<Color | 'random'>('w');
  const [tc, setTc] = useState<TimeControl>({ initial: 0, increment: 0 });
  const lvl = AI_LEVELS[level - 1];
  return (
    <div className="menu-screen">
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} back="modes" />
        <h2 style={{ fontSize: 28, marginBottom: 16 }}>Battle the Enemy Commander</h2>
        <div className="lobby">
          <div className="panel">
            <div className="label">Choose your foe</div>
            <div className="level-list" style={{ marginTop: 10 }}>
              {AI_LEVELS.map((l) => (
                <button key={l.id} className={`level ${level === l.id ? 'on' : ''}`} onClick={() => setLevel(l.id)}>
                  <span className="display" style={{ color: 'var(--gold)', fontWeight: 700 }}>{l.id}</span>
                  <span>
                    <b>{l.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{l.title} · ~{l.elo}</div>
                  </span>
                  <span className="pips">
                    {AI_LEVELS.map((x) => (
                      <span key={x.id} className={`pip ${x.id <= l.id ? 'on' : ''}`} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <NameField />
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Your army</div>
              <ArmyPicker color={color} onChange={setColor} allowRandom />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Battle clock</div>
              <TimePicker value={tc} onChange={setTc} />
            </div>
            <div className="ornament" />
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Engine: Stockfish 19 (WASM) · Skill {lvl.skill}/20 · depth {lvl.depth} · {lvl.movetime} ms per move{lvl.limitElo ? ` · Elo-limited` : ''}.
            </p>
            <button className="btn primary" onClick={() => start(level, color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color, tc)}>
              March to Battle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FriendLobby({
  go,
  onSettings,
  create,
  join,
  quick,
}: {
  go: (s: Screen) => void;
  onSettings: () => void;
  create: (c: Color | 'random', tc: TimeControl) => void;
  join: (id: string) => void;
  quick: (tc: TimeControl) => void;
}) {
  const [color, setColor] = useState<Color | 'random'>('random');
  const [tc, setTc] = useState<TimeControl>({ initial: 600, increment: 0 });
  const [code, setCode] = useState('');
  const parsed = parseRoom(code);
  return (
    <div className="menu-screen">
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} back="modes" />
        <h2 style={{ fontSize: 28, marginBottom: 16 }}>Play With a Friend</h2>
        <div className="lobby">
          <div className="panel" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <div className="label">Raise a private battlefield</div>
            <NameField />
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Your army</div>
              <ArmyPicker color={color} onChange={setColor} allowRandom />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Battle clock</div>
              <TimePicker value={tc} onChange={setTc} />
            </div>
            <button className="btn primary" onClick={() => create(color, tc)}>
              Create Battle &amp; Get Invite Link
            </button>
          </div>
          <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
            <div className="panel" style={{ display: 'grid', gap: 12 }}>
              <div className="label">Join with an invitation</div>
              <input type="text" placeholder="Paste invite link or room code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn" disabled={!parsed} onClick={() => parsed && join(parsed)}>
                Join Battle
              </button>
            </div>
            <div className="panel" style={{ display: 'grid', gap: 12 }}>
              <div className="label">Random opponent</div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Matched with another commander who chose the same clock ({TIME_CONTROLS.find((t) => t.tc.initial === tc.initial && t.tc.increment === tc.increment)?.label}).</p>
              <button className="btn" onClick={() => quick(tc)}>
                Find Opponent
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function parseRoom(input: string): string | null {
  const m = input.trim().toUpperCase().match(/([A-HJ-NP-Z2-9]{10})\/?$/);
  return m && ROOM_ID_RE.test(m[1]) ? m[1] : null;
}

export function LocalLobby({ go, onSettings, start }: { go: (s: Screen) => void; onSettings: () => void; start: (names: { w: string; b: string }, tc: TimeControl, passScreen: boolean) => void }) {
  const [w, setW] = useState('');
  const [b, setB] = useState('');
  const [tc, setTc] = useState<TimeControl>({ initial: 0, increment: 0 });
  const [pass, setPass] = useState(true);
  const autoRotate = useSettings((s) => s.autoRotateBoard);
  return (
    <div className="menu-screen">
      <div className="menu-wrap">
        <TopBar go={go} onSettings={onSettings} back="modes" />
        <h2 style={{ fontSize: 28, marginBottom: 16 }}>Pass and Play</h2>
        <div className="lobby">
          <div className="panel" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="label">White commander</span>
              <input type="text" placeholder="Hellenic Commander" value={w} maxLength={24} onChange={(e) => setW(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="label">Black commander</span>
              <input type="text" placeholder="Persian Commander" value={b} maxLength={24} onChange={(e) => setB(e.target.value)} />
            </label>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Battle clock</div>
              <TimePicker value={tc} onChange={setTc} />
            </div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <label className="toggle">
              <span>
                Hand-over screen between turns
                <div className="muted" style={{ fontSize: 12 }}>Hides the battlefield until the next commander takes the device</div>
              </span>
              <input type="checkbox" checked={pass} onChange={(e) => setPass(e.target.checked)} />
            </label>
            <label className="toggle">
              <span>Rotate board to the side to move</span>
              <input type="checkbox" checked={autoRotate} onChange={(e) => useSettings.getState().set({ autoRotateBoard: e.target.checked })} />
            </label>
            <p className="muted" style={{ fontSize: 13 }}>Undo, resign, draw and full move history are available in-game. No internet connection is needed.</p>
            <button className="btn primary" onClick={() => start({ w: w.trim(), b: b.trim() }, tc, pass)}>
              Begin the Battle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SpectateLobby({ go, onSettings, watch }: { go: (s: Screen) => void; onSettings: () => void; watch: (id: string) => void }) {
  const [code, setCode] = useState('');
  const parsed = parseRoom(code);
  return (
    <div className="menu-screen">
      <div className="menu-wrap" style={{ maxWidth: 560 }}>
        <TopBar go={go} onSettings={onSettings} back="modes" />
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

export function JoinScreen({ roomId, go, onSettings, join, watch }: { roomId: string; go: (s: Screen) => void; onSettings: () => void; join: () => void; watch: () => void }) {
  return (
    <div className="menu-screen">
      <div className="menu-wrap" style={{ maxWidth: 560 }}>
        <TopBar go={go} onSettings={onSettings} />
        <div className="panel" style={{ padding: 22, display: 'grid', gap: 14 }}>
          <div className="label">You have been challenged · Room {roomId}</div>
          <h2>Answer the Call to Battle</h2>
          <AvatarField />
          <NameField />
          <button className="btn primary" onClick={join}>
            Enter the Battlefield
          </button>
          <button className="btn ghost small" onClick={watch}>
            Just watch as a spectator
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
