/** In-game HUD laid over the 3D battlefield. The battlefield keeps most of the screen. */
import { useEffect, useMemo, useState } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { useGame, displayClock, type PlayerSide } from '../../game/store';
import { REASON_TEXT } from '../../../shared/rules';
import { useView } from '../../three/CameraRig';
import { Icon, UnitGlyph, UNIT_NAMES, Crest } from '../components/Icons';
import { useSettings, ARMY_NAME, armyOf } from '../../config/settings';
import { inviteBase } from '../../match/prefs';
import { MatchIntro } from '../../match/MatchIntro';
import { battlefieldName, describeTime } from '../../../shared/match';
import { sound } from '../../audio/sound';
import { useMediaQuery } from '../useMediaQuery';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function useNow(active: boolean) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Captured({ color }: { color: Color }) {
  // pieces of `color` that have been captured
  const version = useGame((s) => s.version);
  const match = useGame((s) => s.match);
  const list = useMemo(() => {
    void version;
    return match
      .history()
      .filter((m) => m.captured && m.color !== color)
      .map((m) => m.captured as PieceSymbol)
      .sort((a, b) => 'qrbnp'.indexOf(a) - 'qrbnp'.indexOf(b));
  }, [match, version, color]);
  return (
    <div className="captured" title="Fallen units">
      {list.map((p, i) => (
        <UnitGlyph key={i} type={p} className="" />
      ))}
    </div>
  );
}

function PlayerCard({ color, side, active }: { color: Color; side: PlayerSide; active: boolean }) {
  const s = useGame();
  const now = useNow(s.timeControl.initial > 0);
  const timed = s.timeControl.initial > 0;
  const clock = displayClock(s, now);
  const whiteArmy = useSettings((x) => x.whiteArmy);
  const army = armyOf(color, whiteArmy);
  const online = s.mode === 'online' || s.mode === 'spectate';
  const deadline = s.snapshot?.disconnectDeadline[color];
  return (
    <div className={`player-card ${active ? 'active' : ''}`} aria-label={`${color === 'w' ? 'White' : 'Black'} player`}>
      <div className="avatar">{side.avatar ? <img src={side.avatar} alt="" /> : <span>{side.name.slice(0, 1).toUpperCase()}</span>}</div>
      <div style={{ minWidth: 0 }}>
        <div className="pname">{side.name}</div>
        <div className="psub">
          {online && <span className={`dot ${side.connected ? '' : 'off'}`} title={side.connected ? 'Connected' : 'Disconnected'} />}
          <span>{ARMY_NAME[army]}</span>
          {side.rating ? <span>· {side.rating}</span> : null}
          {online && !side.connected && deadline ? <span style={{ color: 'var(--red-bright)' }}>· {fmt(deadline - Date.now())}</span> : null}
        </div>
        <Captured color={color === 'w' ? 'b' : 'w'} />
      </div>
      {timed && <div className={`clock ${clock.running === color ? 'running' : ''} ${clock[color] < 20000 ? 'low' : ''}`}>{fmt(clock[color])}</div>}
    </div>
  );
}

function MoveList() {
  const version = useGame((s) => s.version);
  const match = useGame((s) => s.match);
  const rows = useMemo(() => {
    void version;
    const h = match.history();
    const out: [number, string, string?][] = [];
    for (let i = 0; i < h.length; i += 2) out.push([i / 2 + 1, h[i].san, h[i + 1]?.san]);
    return { out, last: h.length };
  }, [match, version]);
  return (
    <div className="moves" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
      {rows.out.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 13 }}>No orders given yet. White commands first.</div>}
      <table>
        <tbody>
          {rows.out.map(([n, w, b]) => (
            <tr key={n}>
              <td>{n}.</td>
              <td className={(n - 1) * 2 + 1 === rows.last ? 'last' : ''}>{w}</td>
              <td className={(n - 1) * 2 + 2 === rows.last ? 'last' : ''}>{b ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromotionDialog() {
  const pending = useGame((s) => s.pendingPromotion);
  const choose = useGame((s) => s.choosePromotion);
  if (!pending) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal panel" role="dialog" aria-label="Choose promotion">
        <h2>A Soldier Rises</h2>
        <p className="muted">Your infantryman has crossed the battlefield. Choose his new command.</p>
        <div className="promo-grid">
          {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((p) => (
            <button key={p} onClick={() => choose(p)} autoFocus={p === 'q'}>
              <UnitGlyph type={p} />
              {UNIT_NAMES[p]}
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'right', marginTop: 14 }}>
          <button className="btn small ghost" onClick={() => choose(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Handover() {
  const handover = useGame((s) => s.handover);
  const players = useGame((s) => s.players);
  const confirm = useGame((s) => s.confirmHandover);
  if (!handover) return null;
  return (
    <div className="handover" onClick={confirm} role="dialog">
      <div>
        <div className="label">Pass the device</div>
        <h2>{players[handover].name}</h2>
        <p className="muted">{handover === 'w' ? 'White' : 'Black'} army awaits your command.</p>
        <button className="btn primary" style={{ marginTop: 18 }} onClick={confirm}>
          Take Command
        </button>
      </div>
    </div>
  );
}

export function ResultModal({ onMenu, onPlayAgain }: { onMenu: () => void; onPlayAgain: () => void }) {
  const s = useGame();
  if (!s.showResult || !s.outcome.over) return null;
  const o = s.outcome;
  const draw = o.result === '1/2-1/2';
  const me = s.myColor;
  const iWon = me && o.winner === me;
  const iLost = me && o.winner && o.winner !== me;
  const winnerName = o.winner ? s.players[o.winner].name : '';
  const loser = o.winner ? (o.winner === 'w' ? 'b' : 'w') : null;
  const whiteArmy = useSettings.getState().whiteArmy;
  const armyName = (c: Color) => ARMY_NAME[armyOf(c, whiteArmy)];
  const hist = s.match.history();
  const caps = { w: hist.filter((m) => m.captured && m.color === 'w').length, b: hist.filter((m) => m.captured && m.color === 'b').length };
  const dur = Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 1000);
  const title = draw ? 'Truce' : iWon ? 'Victory' : iLost ? 'Defeat' : `${winnerName} Triumphs`;
  const exportPgn = () => {
    const pgn = s.match.pgn({ Event: 'Ancient Warfare Chess', White: s.players.w.name, Black: s.players.b.name, Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.') });
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ancient-warfare-${Date.now()}.pgn`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="modal-backdrop">
      <div className={`modal panel result ${iLost ? 'defeat' : ''}`} role="dialog" aria-label="Game result">
        <Crest className="crest" />
        <h2>{title}</h2>
        <p style={{ fontSize: 16 }}>
          {draw ? `The armies withdraw — ${REASON_TEXT[o.reason!]}.` : `${winnerName} (${armyName(o.winner!)}) defeats the ${armyName(loser!)} by ${REASON_TEXT[o.reason!].toLowerCase()}.`}
        </p>
        <div className="stats-grid">
          <div className="stat">
            <b>{fmt(dur * 1000)}</b>Battle duration
          </div>
          <div className="stat">
            <b>{Math.ceil(s.match.ply / 2)}</b>Total moves
          </div>
          <div className="stat">
            <b>{caps.w}</b>Fallen by White
          </div>
          <div className="stat">
            <b>{caps.b}</b>Fallen by Black
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {s.mode === 'spectate' ? null : s.mode === 'online' && s.snapshot?.config.allowRematch === false ? (
            <span className="muted" style={{ alignSelf: 'center' }}>Rematches are off for this battle</span>
          ) : (
            <button className="btn primary" onClick={onPlayAgain} disabled={s.mode === 'online' && s.snapshot?.rematchBy === me}>
              {s.mode !== 'online'
                ? 'Play Again'
                : s.snapshot?.rematchBy === me
                  ? 'Rematch requested…'
                  : s.snapshot?.rematchBy
                    ? 'Accept Rematch'
                    : 'Request Rematch'}
            </button>
          )}
          <button className="btn" onClick={exportPgn}>
            <Icon.download className="" /> PGN
          </button>
          <button className="btn" onClick={() => s.dismissResult()}>
            View Battlefield
          </button>
          <button className="btn ghost" onClick={onMenu}>
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineWaiting() {
  const s = useGame();
  const [copied, setCopied] = useState(false);
  if (s.mode !== 'online' || !s.roomId || s.snapshot?.status !== 'waiting' || s.snapshot.hostColor !== s.myColor) return null;
  const link = `${inviteBase()}/game/${s.roomId}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    sound.play('ui');
    setTimeout(() => setCopied(false), 2000);
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Ancient Warfare Chess', text: 'I challenge you to battle! Join my army on the field:', url: link });
    } catch {
      /* dismissed */
    }
  };
  const text = encodeURIComponent(`I challenge you to a battle of Ancient Warfare Chess! ${link}`);
  return (
    <div className="modal-backdrop" style={{ background: 'rgba(5,4,3,0.45)' }}>
      <div className="modal panel" role="dialog" aria-label="Invite opponent">
        <div className="label">Private battle · Room {s.roomId}</div>
        <h2 style={{ marginTop: 6 }}>Summon Your Opponent</h2>
        <p className="muted">Send this invitation link. The battle begins the moment they arrive.</p>
        <div className="invite" style={{ margin: '14px 0' }}>
          <code>{link}</code>
        </div>
        <button className="btn primary" style={{ width: '100%' }} onClick={copy}>
          <Icon.copy className="" /> {copied ? 'Link Copied!' : 'Copy Invitation Link'}
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {'share' in navigator && (
            <button className="btn small" onClick={share}>
              <Icon.share className="" /> Share…
            </button>
          )}
          <a className="btn small" href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <a className="btn small" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`} target="_blank" rel="noreferrer">
            Telegram
          </a>
        </div>
        <div className="ornament" />
        <div className="waiting">
          <span className="spinner" /> Waiting for opponent to join…
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          You command the {s.myColor === 'w' ? 'White' : 'Black'} army. {s.timeControl.initial ? `Clock: ${s.timeControl.initial / 60} min + ${s.timeControl.increment}s.` : 'Untimed battle.'}
        </p>
      </div>
    </div>
  );
}

function DrawOffer() {
  const s = useGame();
  if (s.mode !== 'online' || !s.snapshot?.drawOfferBy || s.snapshot.drawOfferBy === s.myColor || s.outcome.over) return null;
  return (
    <div className="draw-offer panel">
      <span>Your opponent offers a truce.</span>
      <button className="btn small primary" onClick={() => s.respondDraw(true)}>
        Accept
      </button>
      <button className="btn small" onClick={() => s.respondDraw(false)}>
        Decline
      </button>
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function GameScreen({ onMenu, onSettings, onPlayAgain }: { onMenu: () => void; onSettings: () => void; onPlayAgain: () => void }) {
  const s = useGame();
  const narrow = useMediaQuery('(max-width: 900px)');
  const [panelOpen, setPanelOpen] = useState(!narrow);
  const [confirmResign, setConfirmResign] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { setView, reset } = useView();
  const soundOn = useSettings((x) => x.soundOn);
  useEffect(() => setPanelOpen(!narrow), [narrow]);
  // Keep the board clear of the desktop side panel.
  useEffect(() => {
    useView.setState({ panelOffset: panelOpen && !narrow ? 314 : 0 }); // px: panel width + margin
    return () => useView.setState({ panelOffset: 0 });
  }, [panelOpen, narrow]);

  const top: Color = s.orientation === 'w' ? 'b' : 'w';
  const bottom: Color = s.orientation;
  const over = s.outcome.over;
  const turn = s.match.turn;
  const myTurn = s.mode === 'local' || (s.myColor && s.myColor === turn);
  const turnText = over
    ? 'The battle is over'
    : s.mode === 'local'
      ? `${s.players[turn].name} to command`
      : s.mode === 'spectate'
        ? `Spectating · ${turn === 'w' ? 'White' : 'Black'} to move`
        : myTurn
          ? 'Your command'
          : s.aiThinking
            ? 'Enemy commander is plotting…'
            : "Opponent's turn";
  const canUndo = (s.mode === 'local' || s.mode === 'ai') && s.match.ply > 0 && !over && !s.anim;
  const canClaim = !over && !!s.match.claimableDraw() && (s.mode === 'local' || myTurn);
  const player = s.mode !== 'spectate';

  return (
    <>
      <div className="hud-top">
        <PlayerCard color={top} side={s.players[top]} active={!over && turn === top} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="icon-btn" title="Toggle sound" aria-label="Toggle sound" onClick={() => useSettings.getState().set({ soundOn: !soundOn })}>
            {soundOn ? <Icon.sound className="" /> : <Icon.mute className="" />}
          </button>
          <button className="icon-btn" title="Move history" aria-label="Move history" onClick={() => setPanelOpen((v) => !v)}>
            <Icon.list className="" />
          </button>
          <button className="icon-btn" title="Settings" aria-label="Settings" onClick={onSettings}>
            <Icon.settings className="" />
          </button>
        </div>
      </div>

      <div className="hud-top" style={{ top: 'auto', bottom: narrow ? (panelOpen ? 'calc(min(38vh, 320px) + 84px)' : 84) : 84, justifyContent: 'flex-start' }}>
        <PlayerCard color={bottom} side={s.players[bottom]} active={!over && turn === bottom} />
      </div>

      <div className={`side-panel panel ${panelOpen ? '' : 'collapsed'}`}>
        <div className={`turn-banner ${myTurn && !over ? 'mine' : ''}`}>{turnText}</div>
        {s.mode === 'online' && s.netStatus && s.netStatus !== 'open' && (
          <div className="turn-banner" style={{ color: 'var(--red-bright)' }}>
            <span className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
            Reconnecting to the battlefield…
          </div>
        )}
        <div className="match-info">
          <span>{battlefieldName(s.battlefield)}</span>
          <span>{describeTime(s.timeControl)}</span>
          {s.mode === 'online' && <span>{s.rated ? 'Rated' : 'Unrated'}</span>}
        </div>
        {s.mode === 'online' && (
          <div className="conn-line muted" style={{ marginTop: 0 }}>
            <span className={`dot ${s.netStatus === 'open' ? 'on' : 'off'}`} /> {s.netStatus === 'open' ? 'Connected to server' : 'Connection lost'}
          </div>
        )}
        {(s.mode === 'online' || s.mode === 'spectate') && s.roomId && (
          <div className="muted" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>Room {s.roomId}</span>
            <span>
              <Icon.eye className="" /> {s.snapshot?.spectators ?? 0}
            </span>
          </div>
        )}
        <div className="label">Chronicle of the Battle</div>
        <MoveList />
        {s.mode === 'online' && s.roomId && s.snapshot?.config.allowSpectators !== false && (
          <button
            className="btn small"
            onClick={() => {
              navigator.clipboard?.writeText(`${inviteBase()}/watch/${s.roomId}`);
              s.toast('Spectator link copied.', 'success');
            }}
          >
            <Icon.eye className="" /> Copy spectator link
          </button>
        )}
      </div>

      <div className="view-tools">
        <button className="icon-btn" title="Reset camera" aria-label="Reset camera" onClick={reset}>
          <Icon.camera className="" />
        </button>
        <button className="icon-btn" title="Top-down view" aria-label="Top-down view" onClick={() => setView('top')}>
          <Icon.top className="" />
        </button>
        <button className="icon-btn" title="Cinematic view" aria-label="Cinematic view" onClick={() => setView('cinematic')}>
          <Icon.film className="" />
        </button>
        <button className="icon-btn" title="Rotate board" aria-label="Rotate board" onClick={() => useGame.setState({ orientation: s.orientation === 'w' ? 'b' : 'w' })}>
          <Icon.rotate className="" />
        </button>
      </div>

      {s.aiThinking && (
        <div className="thinking panel">
          <span className="spinner" /> {s.players[turn].name} is thinking…
        </div>
      )}

      <div className="bottom-bar">
        <button className="btn small ghost" onClick={() => (s.mode === 'online' && s.snapshot?.status === 'active' && !s.outcome.over ? setConfirmLeave(true) : onMenu())}>
          <Icon.back className="" /> Exit
        </button>
        {canUndo && (
          <button className="btn small" onClick={s.undo}>
            <Icon.undo className="" /> Undo
          </button>
        )}
        {player && !over && (
          <>
            <button className="btn small" onClick={s.offerDraw} disabled={s.mode === 'online' && s.snapshot?.status !== 'active'}>
              <Icon.handshake className="" /> {s.mode === 'local' ? 'Agree Draw' : 'Offer Draw'}
            </button>
            {canClaim && (
              <button className="btn small primary" onClick={s.claimDraw}>
                Claim Draw
              </button>
            )}
            <button className="btn small danger" onClick={() => (useSettings.getState().confirmResign ? setConfirmResign(true) : s.resign())} disabled={s.mode === 'online' && s.snapshot?.status !== 'active'}>
              <Icon.flag className="" /> Resign
            </button>
          </>
        )}
        {over && (
          <button className="btn small primary" onClick={() => useGame.setState({ showResult: true })}>
            Results
          </button>
        )}
      </div>

      {confirmResign && (
        <div className="modal-backdrop" onClick={() => setConfirmResign(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>Surrender the field?</h2>
            <p className="muted">{s.mode === 'local' ? `${s.players[turn].name} will resign the battle.` : 'Your army will lay down its arms and the battle will be lost.'}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirmResign(false)}>
                Fight on
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  setConfirmResign(false);
                  s.resign();
                }}
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div className="modal-backdrop" onClick={() => setConfirmLeave(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>Leave the battle?</h2>
            <p className="muted">The battle continues without you. Open the invitation link again within 90 seconds to retake your seat, or the battle is lost.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirmLeave(false)}>Stay</button>
              <button className="btn danger" onClick={() => { setConfirmLeave(false); onMenu(); }}>Leave</button>
            </div>
          </div>
        </div>
      )}

      <Toasts />
      <DrawOffer />
      <PromotionDialog />
      <Handover />
      <OnlineWaiting />
      <MatchIntro />
      <ResultModal onMenu={onMenu} onPlayAgain={onPlayAgain} />
    </>
  );
}
