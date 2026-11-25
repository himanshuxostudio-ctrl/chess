/**
 * Central game controller.
 *
 * Flow for every move, in every mode:
 *   1. the chess engine (ChessMatch / server) validates and applies it  ← single source of truth
 *   2. choreograph() turns the validated move into animation scripts
 *   3. input is locked until the animation finishes, then units snap to the engine's result
 */
import { create } from 'zustand';
import type { Color, Move, PieceSymbol, Square } from 'chess.js';
import { ChessMatch, START_FEN, REASON_TEXT, moveToUci, uciToInput, type Outcome } from '../../shared/rules';
import type { RoomSnapshot, ServerMsg, TimeControl } from '../../shared/protocol';
import { choreograph, unitsFromBoard, type Choreography, type Unit } from './choreography';
import { useSettings } from '../config/settings';
import { sound } from '../audio/sound';
import { engine, AI_LEVELS, type AiLevel } from '../ai/stockfish';
import { NetClient, tokenStore, type NetStatus } from '../net/client';
import { useProfile } from '../profile/profile';
import { dragState } from '../three/dragState';

export type Mode = 'showcase' | 'ai' | 'local' | 'online' | 'spectate';

export interface PlayerSide {
  name: string;
  avatar?: string;
  rating?: number;
  isAI?: boolean;
  connected?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'check' | 'error' | 'success';
}

export interface ActiveAnim extends Choreography {
  startedAt: number; // performance.now() ms
  firedCues: number;
}

export interface GameConfig {
  mode: Mode;
  myColor?: Color; // ai/online
  aiLevel?: number; // 1..6
  timeControl?: TimeControl;
  names?: { w: string; b: string };
  passScreen?: boolean; // local: show hand-over screen
}

interface GameState {
  mode: Mode;
  match: ChessMatch;
  version: number; // bumps on every engine change so React re-renders
  units: Unit[];
  anim: ActiveAnim | null;
  queue: string[]; // remote moves waiting for the current animation
  selected: Square | null;
  legal: Move[];
  hover: Square | null;
  dragging: Square | null;
  lastMove: { from: Square; to: Square } | null;
  pendingPromotion: { from: Square; to: Square } | null;
  myColor: Color | null; // null = both (local) or none (spectate/showcase)
  orientation: Color;
  players: { w: PlayerSide; b: PlayerSide };
  aiLevel: AiLevel;
  aiThinking: boolean;
  thinkMultiplier: number;
  timeControl: TimeControl;
  clock: { w: number; b: number; running: Color | null; lastTick: number };
  toasts: Toast[];
  outcome: Outcome;
  showResult: boolean;
  passScreen: boolean;
  handover: Color | null; // local mode: waiting for the next commander to take the device
  startedAt: number;
  endedAt: number | null;
  // online
  net: NetClient | null;
  netStatus: NetStatus | null;
  roomId: string | null;
  snapshot: RoomSnapshot | null;
  awaitingServer: boolean;
  focusRequest: { x: number; z: number; at: number; kind: 'select' | 'capture' | 'check' | 'mate' } | null;
  recorded: boolean;

  newGame: (cfg: GameConfig) => void;
  clickSquare: (sq: Square) => void;
  deselect: () => void;
  startDrag: (sq: Square) => void;
  setHover: (sq: Square | null) => void;
  endDrag: () => void;
  choosePromotion: (p: PieceSymbol | null) => void;
  undo: () => void;
  resign: () => void;
  offerDraw: () => void;
  respondDraw: (accept: boolean) => void;
  claimDraw: () => void;
  rematch: () => void;
  confirmHandover: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissResult: () => void;
  // online
  createRoom: (color: Color | 'random', tc: TimeControl) => void;
  joinRoom: (roomId: string, spectate?: boolean) => void;
  quickMatch: (tc: TimeControl) => void;
  leave: () => void;
  tick: (now: number) => void;
}

let toastId = 0;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const playerSideOf = (s: GameState): Color | null => s.myColor;

export const useGame = create<GameState>()((set, get) => {
  /** Is the local user allowed to move the side to move right now? */
  const canAct = () => {
    const s = get();
    if (s.anim || s.awaitingServer || s.aiThinking || s.pendingPromotion || s.handover) return false;
    if (s.match.outcome().over) return false;
    if (s.mode === 'showcase' || s.mode === 'spectate') return false;
    if (s.mode === 'local') return true;
    return s.match.turn === s.myColor;
  };

  const notifyAfterMove = (m: Move) => {
    const s = get();
    const o = s.match.outcome();
    if (o.over) return;
    if (s.match.inCheck()) {
      const king = s.match.chess.board().flat().find((p) => p && p.type === 'k' && p.color === s.match.turn);
      get().toast(`${m.color === 'w' ? s.players.w.name : s.players.b.name} threatens the King!`, 'check');
      sound.play('check');
      if (king) requestFocus(king.square, 'check');
    }
    const claim = s.match.claimableDraw();
    if (claim) get().toast(`${REASON_TEXT[claim]} available — you may claim a draw.`, 'info');
  };

  const requestFocus = (sq: string, kind: 'select' | 'capture' | 'check' | 'mate') => {
    const x = sq.charCodeAt(0) - 97 - 3.5;
    const z = 3.5 - (Number(sq[1]) - 1);
    set({ focusRequest: { x, z, at: performance.now(), kind } });
  };

  /** Apply a move that the engine has validated. `animate=false` snaps instantly. */
  const playValidated = (m: Move, animate: boolean) => {
    const s = get();
    const settings = useSettings.getState();
    const hidden = typeof document !== 'undefined' && document.hidden;
    const ch = choreograph(m, s.units, { combat: settings.combatAnimations, speed: settings.animationSpeed });
    // Clock handling for local/AI timed games
    if (s.mode !== 'online' && s.mode !== 'spectate' && s.timeControl.initial > 0) {
      const now = performance.now();
      const c = { ...s.clock };
      if (c.running) {
        c[c.running] -= now - c.lastTick;
        c[m.color] += s.timeControl.increment * 1000;
      }
      c.running = s.match.outcome().over ? null : s.match.turn;
      c.lastTick = now;
      set({ clock: c });
    }
    set({
      version: s.version + 1,
      selected: null,
      legal: [],
      lastMove: { from: m.from, to: m.to },
      outcome: s.match.outcome(),
    });
    if (!animate || hidden) {
      set({ units: ch.finalUnits, anim: null });
      afterAnim(m);
      return;
    }
    if (ch.isCapture && settings.cinematicCamera) requestFocus(m.to, 'capture');
    set({ anim: { ...ch, startedAt: performance.now(), firedCues: 0 } });
    pendingAfter = m;
  };
  let pendingAfter: Move | null = null;

  const afterAnim = (m: Move) => {
    const s = get();
    notifyAfterMove(m);
    const o = s.match.outcome();
    if (o.over) return finishGame();
    // queued remote moves
    if (s.queue.length) {
      const [next, ...rest] = s.queue;
      set({ queue: rest });
      applyRemote(next, rest.length < 2);
      return;
    }
    if (s.mode === 'local') {
      const settings = useSettings.getState();
      if (settings.autoRotateBoard) set({ orientation: s.match.turn });
      if (s.passScreen) set({ handover: s.match.turn });
      else sound.play('turn');
    }
    if (s.mode === 'ai' && s.match.turn !== s.myColor) void aiMove();
  };

  const finishGame = () => {
    const s = get();
    const o = s.match.outcome();
    set({ outcome: o, endedAt: Date.now(), clock: { ...s.clock, running: null } });
    if (o.reason === 'checkmate') {
      sound.play('checkmate');
      const king = s.match.chess.board().flat().find((p) => p && p.type === 'k' && p.color === s.match.turn);
      if (king) requestFocus(king.square, 'mate');
    } else if (o.result === '1/2-1/2') sound.play('draw');
    else sound.play('check');
    get().toast(o.result === '1/2-1/2' ? `Draw — ${REASON_TEXT[o.reason!]}` : `${o.winner === 'w' ? s.players.w.name : s.players.b.name} is victorious — ${REASON_TEXT[o.reason!]}`, 'success');
    setTimeout(() => set({ showResult: true }), o.reason === 'checkmate' ? 2600 : 1200);
    recordResult();
  };

  const recordResult = () => {
    const s = get();
    if (s.recorded || s.mode === 'showcase' || s.mode === 'spectate') return;
    const o = s.match.outcome();
    if (!o.over || s.match.ply === 0 && o.reason !== 'resign') return;
    const me: Color = s.myColor ?? 'w';
    const result = o.result === '1/2-1/2' ? 'draw' : o.winner === me ? 'win' : 'loss';
    const opp = s.players[other(me)];
    useProfile.getState().record(
      {
        mode: s.mode === 'online' ? 'online' : s.mode === 'ai' ? 'ai' : 'local',
        opponent: opp.name,
        color: me,
        result,
        reason: REASON_TEXT[o.reason!],
        moves: Math.ceil(s.match.ply / 2),
        durationSec: Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 1000),
        pgn: s.match.pgn({ White: s.players.w.name, Black: s.players.b.name, Event: 'Ancient Warfare Chess' }),
      },
      s.mode === 'local' ? undefined : opp.rating,
    );
    set({ recorded: true });
  };

  const aiMove = async () => {
    const s = get();
    if (s.match.outcome().over) return;
    set({ aiThinking: true });
    const fenAtRequest = s.match.fen;
    const started = performance.now();
    try {
      const uci = await engine.bestMove(fenAtRequest, s.aiLevel, s.thinkMultiplier);
      // a minimum "thinking" beat so the opponent feels deliberate
      const wait = Math.max(0, 450 - (performance.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      const now = get();
      if (now.mode !== 'ai' || now.match.fen !== fenAtRequest) return; // game changed meanwhile
      const m = now.match.tryMove(uciToInput(uci)); // never trust the engine either
      set({ aiThinking: false });
      if (!m) {
        get().toast('The enemy commander hesitated (engine returned an illegal move).', 'error');
        return;
      }
      playValidated(m, true);
    } catch (e) {
      console.error(e);
      set({ aiThinking: false });
      get().toast('AI engine failed to respond. Try restarting the battle.', 'error');
    }
  };

  /** A move from the server (ours echoed back, or the opponent's). */
  const applyRemote = (uci: string, animate: boolean) => {
    const m = get().match.tryMove(uciToInput(uci));
    if (!m) {
      // Desync should not happen; resync from the latest snapshot.
      const snap = get().snapshot;
      if (snap) syncFromSnapshot(snap, true);
      return;
    }
    playValidated(m, animate);
  };

  const syncFromSnapshot = (snap: RoomSnapshot, force = false) => {
    const s = get();
    const localMoves = s.match.uciHistory();
    const same = !force && snap.initialFen === s.match.initialFen && snap.moves.length === localMoves.length && snap.moves.every((m, i) => m === localMoves[i]);
    let match = s.match;
    if (!same) {
      match = new ChessMatch(snap.initialFen, snap.moves);
      const hist = match.history();
      const last = hist[hist.length - 1];
      set({
        match,
        units: unitsFromBoard(match.chess),
        anim: null,
        queue: [],
        lastMove: last ? { from: last.from, to: last.to } : null,
        selected: null,
        legal: [],
      });
    }
    match.setForced(snap.outcome.over && snap.outcome.reason && !['checkmate', 'stalemate', 'insufficient', 'fivefold', 'seventyfive'].includes(snap.outcome.reason) ? snap.outcome : undefined);
    const wasOver = s.outcome.over;
    set({
      snapshot: snap,
      version: get().version + 1,
      players: {
        w: snap.players.w ? { ...snap.players.w } : { name: 'Awaiting commander…', connected: false },
        b: snap.players.b ? { ...snap.players.b } : { name: 'Awaiting commander…', connected: false },
      },
      timeControl: snap.timeControl,
      outcome: match.outcome(),
      startedAt: snap.startedAt ?? Date.now(),
    });
    if (!wasOver && match.outcome().over && !get().anim) finishGame();
  };

  const onServer = (msg: ServerMsg) => {
    const s = get();
    switch (msg.t) {
      case 'joined': {
        if (msg.token) tokenStore.set(msg.roomId, msg.token);
        const myColor = msg.color;
        set({ roomId: msg.roomId, myColor, orientation: myColor ?? 'w', mode: myColor ? 'online' : 'spectate' });
        const path = myColor ? `/game/${msg.roomId}` : `/watch/${msg.roomId}`;
        if (location.pathname !== path) history.replaceState(null, '', path);
        syncFromSnapshot(msg.snapshot, s.roomId !== msg.roomId);
        break;
      }
      case 'moved': {
        set({ awaitingServer: false });
        const expectedPly = s.match.ply + s.queue.length;
        if (msg.ply === expectedPly) {
          if (s.anim) set({ queue: [...s.queue, msg.uci], snapshot: msg.snapshot });
          else {
            set({ snapshot: msg.snapshot });
            applyRemote(msg.uci, true);
          }
        } else if (msg.ply >= expectedPly) {
          syncFromSnapshot(msg.snapshot, true);
        }
        // update clocks/players without touching the board
        set({ snapshot: msg.snapshot });
        break;
      }
      case 'state': {
        const prev = s.snapshot;
        const moveCount = s.match.ply + s.queue.length;
        if (msg.snapshot.moves.length !== moveCount) syncFromSnapshot(msg.snapshot);
        else syncFromSnapshot({ ...msg.snapshot }, false);
        // connection notifications
        const opp = s.myColor ? other(s.myColor) : null;
        if (prev && opp) {
          const was = prev.players[opp]?.connected;
          const now = msg.snapshot.players[opp]?.connected;
          if (was && !now) get().toast('Opponent disconnected — waiting for them to return…', 'error');
          if (!was && now && prev.players[opp]) get().toast('Opponent reconnected.', 'success');
          if (!prev.players[opp] && msg.snapshot.players[opp]) {
            get().toast(`${msg.snapshot.players[opp]!.name} has joined the battle!`, 'success');
            sound.play('turn');
          }
        }
        if (msg.snapshot.drawOfferBy && msg.snapshot.drawOfferBy !== prev?.drawOfferBy && msg.snapshot.drawOfferBy !== s.myColor)
          get().toast('Your opponent offers a truce (draw).', 'info');
        break;
      }
      case 'matched': {
        tokenStore.set(msg.roomId, msg.token);
        set({ roomId: null, recorded: false, showResult: false });
        get().joinRoom(msg.roomId);
        break;
      }
      case 'queued':
        get().toast(`Searching for an opponent… (position ${msg.position})`, 'info');
        break;
      case 'error':
        set({ awaitingServer: false });
        if (msg.code === 'illegal_move' || msg.code === 'not_your_turn' || msg.code === 'stale_ply') sound.play('illegal');
        get().toast(msg.message, 'error');
        if (msg.code === 'stale_ply' && s.snapshot) syncFromSnapshot(s.snapshot, true);
        if (msg.code === 'room_full' && s.roomId === null && pendingJoin) {
          // seat taken: offer spectating automatically
          const id = pendingJoin;
          pendingJoin = null;
          get().joinRoom(id, true);
        }
        break;
      default:
        break;
    }
  };
  let pendingJoin: string | null = null;

  const ensureNet = () => {
    let net = get().net;
    if (!net) {
      net = new NetClient();
      net.onMessage = onServer;
      net.onStatus = (st) => set({ netStatus: st });
      set({ net });
      net.connect();
    }
    return net;
  };

  /** Submit a user move (after promotion choice). */
  const submitMove = (from: Square, to: Square, promotion?: PieceSymbol) => {
    const s = get();
    if (s.mode === 'online') {
      // Server is authoritative: pre-check locally for instant feedback, then wait for the echo.
      const ok = s.legal.some((m) => m.to === to) || s.match.legalMovesFrom(from).some((m) => m.to === to);
      if (!ok) return illegal();
      if (!s.net?.connected) {
        get().toast('Connection lost — reconnecting…', 'error');
        return;
      }
      set({ awaitingServer: true, selected: null, legal: [] });
      s.net.send({ t: 'move', uci: moveToUci({ from, to, promotion }), ply: s.match.ply });
      return;
    }
    const m = s.match.tryMove({ from, to, promotion });
    if (!m) return illegal();
    playValidated(m, true);
  };

  const illegal = () => {
    sound.play('illegal');
    get().toast('That order cannot be given — illegal move.', 'error');
    set({ selected: null, legal: [] });
  };

  const attemptMove = (from: Square, to: Square) => {
    const s = get();
    const options = s.match.legalMovesFrom(from).filter((m) => m.to === to);
    if (!options.length) return illegal();
    if (options.some((m) => m.promotion)) {
      set({ pendingPromotion: { from, to } });
      return;
    }
    submitMove(from, to);
  };

  const select = (sq: Square | null) => {
    const s = get();
    if (!sq) return set({ selected: null, legal: [] });
    const legal = s.match.legalMovesFrom(sq);
    set({ selected: sq, legal });
    sound.play('select');
    if (useSettings.getState().cinematicCamera) requestFocus(sq, 'select');
  };

  const initial = new ChessMatch();

  return {
    mode: 'showcase',
    match: initial,
    version: 0,
    units: unitsFromBoard(initial.chess),
    anim: null,
    queue: [],
    selected: null,
    legal: [],
    hover: null,
    dragging: null,
    lastMove: null,
    pendingPromotion: null,
    myColor: null,
    orientation: 'w',
    players: { w: { name: 'Sun Army' }, b: { name: 'Shadow Army' } },
    aiLevel: AI_LEVELS[2],
    aiThinking: false,
    thinkMultiplier: 1,
    timeControl: { initial: 0, increment: 0 },
    clock: { w: 0, b: 0, running: null, lastTick: 0 },
    toasts: [],
    outcome: { over: false, result: '*' },
    showResult: false,
    passScreen: false,
    handover: null,
    startedAt: Date.now(),
    endedAt: null,
    net: null,
    netStatus: null,
    roomId: null,
    snapshot: null,
    awaitingServer: false,
    focusRequest: null,
    recorded: false,

    newGame: (cfg) => {
      const s = get();
      if (cfg.mode !== 'online' && cfg.mode !== 'spectate' && s.net) {
        s.net.close();
        set({ net: null, netStatus: null, roomId: null, snapshot: null });
      }
      engine.stop();
      const match = new ChessMatch(START_FEN);
      const tc = cfg.timeControl ?? { initial: 0, increment: 0 };
      const profile = useProfile.getState();
      const lvl = AI_LEVELS.find((l) => l.id === cfg.aiLevel) ?? AI_LEVELS[2];
      const myColor = cfg.mode === 'ai' ? (cfg.myColor ?? 'w') : cfg.mode === 'online' ? (cfg.myColor ?? null) : null;
      const me: PlayerSide = { name: profile.name, avatar: profile.avatar, rating: profile.rating };
      const aiSide: PlayerSide = { name: lvl.title, isAI: true, rating: lvl.elo };
      const players =
        cfg.mode === 'ai'
          ? myColor === 'w'
            ? { w: me, b: aiSide }
            : { w: aiSide, b: me }
          : cfg.mode === 'local'
            ? { w: { name: cfg.names?.w || 'Sun Commander' }, b: { name: cfg.names?.b || 'Shadow Commander' } }
            : { w: { name: 'Sun Army' }, b: { name: 'Shadow Army' } };
      set({
        mode: cfg.mode,
        match,
        version: s.version + 1,
        units: unitsFromBoard(match.chess),
        anim: null,
        queue: [],
        selected: null,
        legal: [],
        dragging: null,
        hover: null,
        lastMove: null,
        pendingPromotion: null,
        myColor,
        orientation: myColor ?? 'w',
        players,
        aiLevel: lvl,
        aiThinking: false,
        timeControl: tc,
        clock: { w: tc.initial * 1000, b: tc.initial * 1000, running: null, lastTick: performance.now() },
        outcome: match.outcome(),
        showResult: false,
        passScreen: !!cfg.passScreen,
        handover: null,
        startedAt: Date.now(),
        endedAt: null,
        awaitingServer: false,
        recorded: false,
      });
      if (cfg.mode === 'ai' && myColor === 'b') void aiMove();
    },

    clickSquare: (sq) => {
      const s = get();
      if (!canAct()) {
        if (s.anim) return; // silently ignore during battle animations
        if (s.mode === 'online' && s.match.turn !== s.myColor && !s.match.outcome().over) get().toast("It is your opponent's turn.", 'info');
        return;
      }
      const piece = s.match.chess.get(sq);
      if (s.selected) {
        if (sq === s.selected) return select(null);
        if (s.legal.some((m) => m.to === sq)) return attemptMove(s.selected, sq);
        if (piece && piece.color === s.match.turn) return select(sq);
        return illegal();
      }
      if (piece && piece.color === s.match.turn) select(sq);
    },

    deselect: () => {
      if (!get().dragging && get().selected) set({ selected: null, legal: [] });
    },

    startDrag: (sq) => {
      const s = get();
      if (!canAct()) return;
      const piece = s.match.chess.get(sq);
      if (!piece || piece.color !== s.match.turn) return;
      if (s.selected !== sq) select(sq);
      set({ dragging: sq, hover: sq });
    },
    setHover: (sq) => {
      if (get().hover !== sq) set({ hover: sq });
    },
    endDrag: () => {
      const s = get();
      if (!s.dragging) return;
      const from = s.dragging;
      set({ dragging: null });
      dragState.point = null;
      const target = s.hover;
      if (target && target !== from) {
        dragState.startedOn = null;
        if (s.legal.some((m) => m.to === target)) attemptMove(from, target);
        else get().clickSquare(target); // dropped elsewhere: behave like a click there
      } else if (dragState.wasSelected) {
        select(null); // pressing an already-selected unit again deselects it
      }
    },

    choosePromotion: (p) => {
      const s = get();
      const pp = s.pendingPromotion;
      set({ pendingPromotion: null });
      if (!pp || !p) return select(null);
      submitMove(pp.from, pp.to, p);
    },

    undo: () => {
      const s = get();
      if (s.mode !== 'local' && s.mode !== 'ai') return;
      if (s.anim || s.aiThinking) return;
      if (s.match.outcome().over && s.match.forcedOutcome) return get().toast('The battle has ended.', 'info');
      // In AI games take back the AI reply as well so it is your turn again.
      const plies = s.mode === 'ai' ? (s.match.turn === s.myColor ? 2 : 1) : 1;
      let undone = 0;
      for (let i = 0; i < plies; i++) if (s.match.undo()) undone++;
      if (!undone) return;
      const hist = s.match.history();
      const last = hist[hist.length - 1];
      set({
        units: unitsFromBoard(s.match.chess),
        version: s.version + 1,
        lastMove: last ? { from: last.from, to: last.to } : null,
        selected: null,
        legal: [],
        outcome: s.match.outcome(),
        showResult: false,
        handover: null,
        orientation: s.mode === 'local' && useSettings.getState().autoRotateBoard ? s.match.turn : s.orientation,
      });
      sound.play('ui');
    },

    resign: () => {
      const s = get();
      if (s.match.outcome().over) return;
      if (s.mode === 'online') return s.net?.send({ t: 'resign' });
      if (s.mode === 'spectate' || s.mode === 'showcase') return;
      const who = s.mode === 'local' ? s.match.turn : s.myColor!;
      s.match.resign(who);
      set({ version: s.version + 1, aiThinking: false });
      engine.stop();
      finishGame();
    },
    offerDraw: () => {
      const s = get();
      if (s.match.outcome().over) return;
      if (s.mode === 'online') {
        s.net?.send({ t: 'offerDraw' });
        get().toast('Truce offered to your opponent.', 'info');
        return;
      }
      if (s.mode === 'local') {
        s.match.agreeDraw();
        set({ version: s.version + 1 });
        return finishGame();
      }
      if (s.mode === 'ai') {
        // The AI accepts a draw only if it is not ahead in material.
        const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        let bal = 0;
        for (const p of s.match.chess.board().flat()) if (p) bal += (p.color === s.myColor ? 1 : -1) * val[p.type];
        if (bal >= 2 || s.match.ply > 80 && bal >= 0) {
          s.match.agreeDraw();
          set({ version: s.version + 1 });
          finishGame();
        } else get().toast('The enemy commander refuses your truce.', 'info');
      }
    },
    respondDraw: (accept) => get().net?.send({ t: 'respondDraw', accept }),
    claimDraw: () => {
      const s = get();
      if (s.mode === 'online') return s.net?.send({ t: 'claimDraw' });
      if (s.match.claimDraw()) {
        set({ version: s.version + 1 });
        finishGame();
      } else get().toast('No draw can be claimed in this position.', 'info');
    },
    rematch: () => {
      const s = get();
      if (s.mode === 'online') {
        s.net?.send({ t: 'rematch' });
        get().toast('Rematch requested…', 'info');
      }
    },
    confirmHandover: () => {
      set({ handover: null });
      sound.play('turn');
    },
    toast: (text, kind = 'info') => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 3500 : 4500);
    },
    dismissResult: () => set({ showResult: false }),

    createRoom: (color, tc) => {
      const net = ensureNet();
      const p = useProfile.getState();
      get().newGame({ mode: 'online', timeControl: tc });
      net.resume = () => {
        const id = get().roomId;
        return id ? { t: 'join', roomId: id, name: p.name, avatar: p.avatar, rating: p.rating, token: tokenStore.get(id) } : null;
      };
      net.send({ t: 'create', name: p.name, avatar: p.avatar, rating: p.rating, color, timeControl: tc });
    },
    joinRoom: (roomId, spectate = false) => {
      const net = ensureNet();
      const p = useProfile.getState();
      const s = get();
      if (s.roomId !== roomId) {
        get().newGame({ mode: spectate ? 'spectate' : 'online' });
        set({ roomId: null });
      }
      pendingJoin = spectate ? null : roomId;
      const msg = () =>
        spectate
          ? ({ t: 'watch', roomId } as const)
          : ({ t: 'join', roomId, name: p.name, avatar: p.avatar, rating: p.rating, token: tokenStore.get(roomId) } as const);
      net.resume = () => {
        const s2 = get();
        // after a seat fell back to spectating, resume as spectator
        if (s2.mode === 'spectate') return { t: 'watch', roomId };
        return msg();
      };
      if (net.connected) net.send(msg());
    },
    quickMatch: (tc) => {
      const net = ensureNet();
      const p = useProfile.getState();
      get().newGame({ mode: 'online', timeControl: tc });
      net.resume = () => {
        const id = get().roomId;
        if (id) return { t: 'join', roomId: id, name: p.name, token: tokenStore.get(id) };
        return { t: 'queue', name: p.name, avatar: p.avatar, rating: p.rating, timeControl: tc };
      };
      if (net.connected) net.send({ t: 'queue', name: p.name, avatar: p.avatar, rating: p.rating, timeControl: tc });
    },
    leave: () => {
      const s = get();
      s.net?.send({ t: 'leaveQueue' });
      s.net?.close();
      engine.stop();
      set({ net: null, netStatus: null, roomId: null, snapshot: null, aiThinking: false });
      get().newGame({ mode: 'showcase' });
    },

    /** Called every animation frame (see startTicker). Drives cues, animation completion and clocks. */
    tick: (now) => {
      const s = get();
      if (s.anim) {
        const t = (now - s.anim.startedAt) / 1000;
        let i = s.anim.firedCues;
        while (i < s.anim.cues.length && s.anim.cues[i].t <= t) sound.play(s.anim.cues[i++].sfx);
        s.anim.firedCues = i;
        if (t >= s.anim.duration) {
          set({ units: s.anim.finalUnits, anim: null });
          const m = pendingAfter;
          pendingAfter = null;
          if (m) afterAnim(m);
        }
      }
      // local clocks
      if (s.mode !== 'online' && s.mode !== 'spectate' && s.clock.running && !s.outcome.over) {
        const c = s.clock.running;
        const remaining = s.clock[c] - (now - s.clock.lastTick);
        if (remaining <= 0) {
          s.match.timeout(c);
          set({ clock: { ...s.clock, [c]: 0, running: null }, version: s.version + 1 });
          engine.stop();
          set({ aiThinking: false });
          finishGame();
        }
      }
    },
  };
});

/** Remaining clock time for display (handles both local and server clocks). */
export function displayClock(s: GameState, now: number): { w: number; b: number; running: Color | null } {
  if ((s.mode === 'online' || s.mode === 'spectate') && s.snapshot) {
    const snap = s.snapshot;
    const c = { w: snap.clock.w, b: snap.clock.b, running: snap.clock.running };
    if (snap.status === 'active' && c.running) {
      const serverNow = Date.now() + (s.net?.offset ?? 0);
      c[c.running] = Math.max(0, c[c.running] - (serverNow - snap.serverTime));
    }
    return c;
  }
  const c = { w: s.clock.w, b: s.clock.b, running: s.clock.running };
  if (c.running && !s.outcome.over) c[c.running] = Math.max(0, c[c.running] - (now - s.clock.lastTick));
  return c;
}

let ticking = false;
export function startTicker() {
  if (ticking) return;
  ticking = true;
  const loop = (t: number) => {
    useGame.getState().tick(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // rAF pauses in hidden tabs: finish animations instantly so state never lags behind.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const s = useGame.getState();
      if (s.anim) s.tick(s.anim.startedAt + s.anim.duration * 1000 + 1);
    }
  });
  setInterval(() => {
    if (document.hidden) useGame.getState().tick(performance.now());
  }, 500);
}

export { playerSideOf };
