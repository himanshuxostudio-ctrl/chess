/**
 * Custom Match configuration. Every control here is backed by real behaviour:
 *  - opponent / side / time / battlefield → server match config (online) or local game config
 *  - rated → local rating update; spectators / rematch → enforced by the server
 *  - confirm resignation / sound → client preferences
 * Variants: only Standard exists today, so it is shown as fixed rather than as fake options.
 */
import { useState } from 'react';
import { AI_LEVELS } from '../ai/stockfish';
import { BATTLEFIELDS, TIME_PRESETS, TIME_LIMITS, describeTime, type BattlefieldChoice } from '../../shared/match';
import type { TimeControl } from '../../shared/protocol';
import { useMatchPrefs, type OpponentKind, type SideChoice } from './prefs';
import { useSettings } from '../config/settings';
import { useProfile } from '../profile/profile';
import { parseRoom } from './roomCode';

export const OPPONENTS: { id: OpponentKind; label: string; hint: string }[] = [
  { id: 'random', label: 'Random opponent', hint: 'Matchmaking with a commander who chose the same clock' },
  { id: 'friend', label: 'Invite a friend', hint: 'Private battle with a shareable invitation link' },
  { id: 'code', label: 'Enter invitation', hint: 'Paste a link or code you received' },
  { id: 'ai', label: 'Against the AI', hint: 'Stockfish-driven enemy commander' },
  { id: 'local', label: 'Local opponent', hint: 'Two commanders, one device, no internet needed' },
];

export function TimePicker({ value, onChange }: { value: TimeControl; onChange: (t: TimeControl) => void }) {
  const isPreset = TIME_PRESETS.some((p) => p.tc.initial === value.initial && p.tc.increment === value.increment);
  const [custom, setCustom] = useState(!isPreset);
  const [mins, setMins] = useState(String(value.initial ? value.initial / 60 : 7));
  const [inc, setInc] = useState(String(value.increment || 0));
  const groups = ['Bullet', 'Blitz', 'Rapid', 'Classical', 'Unlimited'] as const;
  const applyCustom = (m: string, i: string) => {
    const mm = Math.min(TIME_LIMITS.maxMinutes, Math.max(0.5, Number(m) || 0.5));
    const ii = Math.min(TIME_LIMITS.maxIncrement, Math.max(0, Math.floor(Number(i) || 0)));
    onChange({ initial: Math.round(mm * 60), increment: ii });
  };
  return (
    <div className="tc-grid">
      {groups.map((g) => (
        <div key={g} className="tc-row">
          <span className="tc-group">{g}</span>
          <div className="choice-row">
            {TIME_PRESETS.filter((p) => p.group === g).map((p) => (
              <button
                key={p.id}
                className={`chip ${!custom && p.tc.initial === value.initial && p.tc.increment === value.increment ? 'on' : ''}`}
                onClick={() => {
                  setCustom(false);
                  onChange(p.tc);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="tc-row">
        <span className="tc-group">Custom</span>
        <div className="choice-row" style={{ alignItems: 'center' }}>
          <button className={`chip ${custom ? 'on' : ''}`} onClick={() => { setCustom(true); applyCustom(mins, inc); }}>
            Custom
          </button>
          {custom && (
            <>
              <label className="num-field">
                <input type="number" min={0.5} max={TIME_LIMITS.maxMinutes} step={0.5} value={mins} aria-label="Minutes per side"
                  onChange={(e) => { setMins(e.target.value); applyCustom(e.target.value, inc); }} />
                <span>min</span>
              </label>
              <span className="muted">+</span>
              <label className="num-field">
                <input type="number" min={0} max={TIME_LIMITS.maxIncrement} step={1} value={inc} aria-label="Increment seconds"
                  onChange={(e) => { setInc(e.target.value); applyCustom(mins, e.target.value); }} />
                <span>sec</span>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SidePicker({ value, onChange }: { value: SideChoice; onChange: (s: SideChoice) => void }) {
  const opts: { id: SideChoice; title: string; sub: string }[] = [
    { id: 'sun', title: 'Sun Army', sub: 'Gold & ivory · moves first' },
    { id: 'shadow', title: 'Shadow Army', sub: 'Black iron & crimson · moves second' },
    { id: 'random', title: 'Random', sub: 'Let fate decide' },
  ];
  return (
    <div className="side-grid">
      {opts.map((o) => (
        <button key={o.id} className={`side-card side-${o.id} ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          <span className="side-emblem" aria-hidden />
          <b>{o.title}</b>
          <small>{o.sub}</small>
        </button>
      ))}
    </div>
  );
}

export function BattlefieldPicker({ value, onChange }: { value: BattlefieldChoice; onChange: (b: BattlefieldChoice) => void }) {
  return (
    <div className="bf-grid">
      {[...BATTLEFIELDS, { id: 'random' as const, name: 'Random Battlefield', subtitle: 'Chosen by the war council' }].map((b) => (
        <button key={b.id} className={`bf-card bf-${b.id} ${value === b.id ? 'on' : ''}`} onClick={() => onChange(b.id)}>
          <span className="bf-art" aria-hidden />
          <b>{b.name}</b>
          <small>{b.subtitle}</small>
        </button>
      ))}
    </div>
  );
}

const Toggle = ({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <label className="toggle">
    <span>
      {label}
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </span>
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

export interface StartActions {
  ai: () => void;
  local: (names: { w: string; b: string }, passScreen: boolean) => void;
  friend: () => void;
  random: () => void;
  code: (roomId: string) => void;
}

export function MatchSettings({ initialOpponent, onBack, start }: { initialOpponent?: OpponentKind; onBack: () => void; start: StartActions }) {
  const prefs = useMatchPrefs();
  const settings = useSettings();
  const profileName = useProfile((p) => p.name);
  const setName = useProfile((p) => p.setName);
  const [opponent, setOpponent] = useState<OpponentKind>(initialOpponent ?? prefs.opponent);
  const [code, setCode] = useState('');
  const [names, setNames] = useState({ w: '', b: '' });
  const [passScreen, setPassScreen] = useState(true);
  const parsed = parseRoom(code);
  const online = opponent === 'friend' || opponent === 'random';
  const lvl = AI_LEVELS[prefs.aiLevel - 1];

  const go = () => {
    prefs.set({ opponent });
    if (opponent === 'ai') start.ai();
    else if (opponent === 'local') start.local({ w: names.w.trim(), b: names.b.trim() }, passScreen);
    else if (opponent === 'friend') start.friend();
    else if (opponent === 'random') start.random();
    else if (opponent === 'code' && parsed) start.code(parsed);
  };
  const cta = { ai: 'March to battle', local: 'Begin local battle', friend: 'Create invitation', random: 'Find opponent', code: 'View invitation' }[opponent];

  return (
    <div className="prep-layout">
      <div className="prep-main">
        <section className="panel prep-section">
          <div className="label">Opponent</div>
          <div className="opp-grid" role="radiogroup" aria-label="Opponent">
            {OPPONENTS.map((o) => (
              <button key={o.id} role="radio" aria-checked={opponent === o.id} className={`opp-card ${opponent === o.id ? 'on' : ''}`} onClick={() => setOpponent(o.id)}>
                <b>{o.label}</b>
                <small>{o.hint}</small>
              </button>
            ))}
          </div>
          {opponent === 'code' && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              <input type="text" placeholder="Paste invitation link or 10-letter code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              {code && !parsed && <span className="muted" style={{ fontSize: 12 }}>That doesn’t look like an invitation link or code yet.</span>}
            </div>
          )}
          {opponent === 'ai' && (
            <div className="level-list compact" style={{ marginTop: 12 }}>
              {AI_LEVELS.map((l) => (
                <button key={l.id} className={`level ${prefs.aiLevel === l.id ? 'on' : ''}`} onClick={() => prefs.set({ aiLevel: l.id })}>
                  <span className="display" style={{ color: 'var(--gold)', fontWeight: 700 }}>{l.id}</span>
                  <span><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{l.title} · ~{l.elo}</div></span>
                  <span className="pips">{AI_LEVELS.map((x) => <span key={x.id} className={`pip ${x.id <= l.id ? 'on' : ''}`} />)}</span>
                </button>
              ))}
            </div>
          )}
          {opponent === 'local' && (
            <div className="two-col" style={{ marginTop: 12 }}>
              <label className="field"><span className="label">Sun commander</span>
                <input type="text" placeholder="Sun Commander" maxLength={24} value={names.w} onChange={(e) => setNames({ ...names, w: e.target.value })} /></label>
              <label className="field"><span className="label">Shadow commander</span>
                <input type="text" placeholder="Shadow Commander" maxLength={24} value={names.b} onChange={(e) => setNames({ ...names, b: e.target.value })} /></label>
              <Toggle label="Hand-over screen between turns" hint="Hides the board until the next commander takes the device" value={passScreen} onChange={setPassScreen} />
              <Toggle label="Rotate board to the side to move" value={settings.autoRotateBoard} onChange={(v) => settings.set({ autoRotateBoard: v })} />
            </div>
          )}
          {online && (
            <label className="field" style={{ marginTop: 12 }}><span className="label">Your commander name</span>
              <input type="text" value={profileName} maxLength={24} onChange={(e) => setName(e.target.value)} /></label>
          )}
        </section>

        {opponent !== 'code' && opponent !== 'local' && (
          <section className="panel prep-section">
            <div className="label">Your army &amp; side</div>
            <SidePicker value={prefs.side} onChange={(side) => prefs.set({ side })} />
            {opponent === 'random' && <p className="muted small">Matchmaking assigns sides fairly; your choice applies to private and AI battles.</p>}
          </section>
        )}

        {opponent !== 'code' && (
          <section className="panel prep-section">
            <div className="label">Battle clock</div>
            <TimePicker value={prefs.timeControl} onChange={(timeControl) => prefs.set({ timeControl })} />
          </section>
        )}

        {opponent !== 'code' && opponent !== 'random' && (
          <section className="panel prep-section">
            <div className="label">Battlefield</div>
            <BattlefieldPicker value={prefs.battlefield} onChange={(battlefield) => prefs.set({ battlefield })} />
          </section>
        )}
      </div>

      <aside className="prep-side">
        <section className="panel prep-section summary">
          <div className="label">Battle orders</div>
          <dl>
            <dt>Game</dt><dd>Standard chess</dd>
            <dt>Opponent</dt><dd>{opponent === 'ai' ? `${lvl.name} AI · ${lvl.title}` : OPPONENTS.find((o) => o.id === opponent)!.label}</dd>
            {opponent !== 'code' && opponent !== 'local' && (<><dt>Army</dt><dd>{prefs.side === 'random' ? 'Random' : prefs.side === 'sun' ? 'Sun Army (White)' : 'Shadow Army (Black)'}</dd></>)}
            {opponent !== 'code' && (<><dt>Clock</dt><dd>{describeTime(prefs.timeControl)}</dd></>)}
            {opponent !== 'code' && (<><dt>Battlefield</dt><dd>{opponent === 'random' ? 'Chosen by the server' : prefs.battlefield === 'random' ? 'Random' : BATTLEFIELDS.find((b) => b.id === prefs.battlefield)!.name}</dd></>)}
          </dl>
          {opponent !== 'code' && (
            <div className="opt-list">
              {opponent !== 'local' && <Toggle label="Rated" hint="Updates your commander rating" value={prefs.rated} onChange={(rated) => prefs.set({ rated })} />}
              {opponent === 'friend' && <Toggle label="Allow spectators" hint="Others can watch through the spectator link" value={prefs.allowSpectators} onChange={(allowSpectators) => prefs.set({ allowSpectators })} />}
              {opponent === 'friend' && <Toggle label="Allow rematch" value={prefs.allowRematch} onChange={(allowRematch) => prefs.set({ allowRematch })} />}
              <Toggle label="Confirm resignation" value={settings.confirmResign} onChange={(confirmResign) => settings.set({ confirmResign })} />
              <Toggle label="Sound effects" value={settings.soundOn} onChange={(soundOn) => settings.set({ soundOn })} />
            </div>
          )}
          <button className="btn primary block" disabled={opponent === 'code' && !parsed} onClick={go}>{cta}</button>
          <button className="btn ghost small block" onClick={onBack}>Back</button>
        </section>
      </aside>
    </div>
  );
}
