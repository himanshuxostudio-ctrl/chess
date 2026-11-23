/**
 * Real-time multiplayer server: HTTP (serves the built client) + WebSocket at /ws.
 *
 * Responsibilities: room creation with unguessable ids, secret per-seat tokens (reconnect /
 * refresh recovery), authoritative move validation, clocks, draw/resign/rematch, spectators,
 * random matchmaking, rate limiting, persistence to disk and expired-room cleanup.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, RoomError, cleanInfo, type PersistedRoom } from './rooms';
import { ROOM_ID_RE, type ClientMsg, type ServerMsg, type TimeControl } from '../shared/protocol';
import type { Color } from '../shared/rules';

export interface ServerOptions {
  port: number;
  staticDir?: string;
  dataFile?: string;
  tickMs?: number;
}

interface Conn {
  ws: WebSocket;
  room?: Room;
  color: Color | null; // null = spectator
  bucket: number;
  bucketAt: number;
  queued?: { info: ReturnType<typeof cleanInfo>; tc: TimeControl };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const validTc = (tc: unknown): TimeControl => {
  const t = tc as TimeControl;
  const initial = Number.isFinite(t?.initial) ? Math.min(7200, Math.max(0, Math.floor(t.initial))) : 0;
  const increment = Number.isFinite(t?.increment) ? Math.min(60, Math.max(0, Math.floor(t.increment))) : 0;
  return { initial, increment };
};

export function startServer(opts: ServerOptions) {
  const rooms = new Map<string, Room>();
  const conns = new Set<Conn>();
  let dirty = false;

  // ---------- persistence ----------
  if (opts.dataFile && existsSync(opts.dataFile)) {
    try {
      const saved = JSON.parse(readFileSync(opts.dataFile, 'utf8')) as PersistedRoom[];
      for (const d of saved) {
        for (const c of ['w', 'b'] as Color[]) {
          const s = d.seats[c];
          if (s) {
            s.sockets = 0;
            s.info.connected = false;
            s.disconnectedAt = s.disconnectedAt ?? Date.now();
          }
        }
        // Don't let a server restart burn players' clocks or trigger abandonment.
        d.clock.lastTick = Date.now();
        for (const c of ['w', 'b'] as Color[]) if (d.seats[c]) d.seats[c]!.disconnectedAt = Date.now();
        rooms.set(d.id, new Room(d));
      }
      console.log(`[server] restored ${rooms.size} rooms`);
    } catch (e) {
      console.error('[server] could not restore rooms', e);
    }
  }
  const persist = () => {
    if (!opts.dataFile || !dirty) return;
    dirty = false;
    mkdirSync(resolve(opts.dataFile, '..'), { recursive: true });
    const tmp = opts.dataFile + '.tmp';
    writeFileSync(tmp, JSON.stringify([...rooms.values()].map((r) => r.data)));
    renameSync(tmp, opts.dataFile);
  };

  // ---------- helpers ----------
  const send = (c: Conn, msg: ServerMsg) => {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  };
  const broadcast = (room: Room, make: () => ServerMsg) => {
    const msg = JSON.stringify(make());
    for (const c of conns) if (c.room === room && c.ws.readyState === c.ws.OPEN) c.ws.send(msg);
    dirty = true;
  };
  const broadcastState = (room: Room) => broadcast(room, () => ({ t: 'state', snapshot: room.snapshot() }));
  const err = (c: Conn, e: unknown) => {
    if (e instanceof RoomError) send(c, { t: 'error', code: e.code, message: e.message });
    else {
      console.error(e);
      send(c, { t: 'error', code: 'bad_request', message: 'Bad request' });
    }
  };
  const leaveRoom = (c: Conn) => {
    const room = c.room;
    if (!room) return;
    if (c.color) room.disconnect(c.color);
    else room.spectators = Math.max(0, room.spectators - 1);
    c.room = undefined;
    broadcastState(room);
  };
  const attach = (c: Conn, room: Room, color: Color | null, token: string | null) => {
    leaveRoom(c);
    c.room = room;
    c.color = color;
    if (color) room.connect(color);
    else room.spectators++;
    send(c, { t: 'joined', roomId: room.id, token, color, snapshot: room.snapshot() });
    broadcastState(room);
  };

  // ---------- matchmaking ----------
  const queue: Conn[] = [];
  const tryMatch = () => {
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i], b = queue[j];
        if (a.queued!.tc.initial === b.queued!.tc.initial && a.queued!.tc.increment === b.queued!.tc.increment) {
          queue.splice(j, 1);
          queue.splice(i, 1);
          const room = Room.create(a.queued!.tc);
          rooms.set(room.id, room);
          const [w, bl] = Math.random() < 0.5 ? [a, b] : [b, a];
          const tw = room.seat('w', w.queued!.info);
          const tb = room.seat('b', bl.queued!.info);
          w.queued = bl.queued = undefined;
          send(w, { t: 'matched', roomId: room.id, token: tw, color: 'w' });
          send(bl, { t: 'matched', roomId: room.id, token: tb, color: 'b' });
          dirty = true;
          return tryMatch();
        }
      }
    }
    queue.forEach((c, i) => send(c, { t: 'queued', position: i + 1 }));
  };

  // ---------- message handling ----------
  const handle = (c: Conn, msg: ClientMsg) => {
    switch (msg.t) {
      case 'ping':
        return send(c, { t: 'pong', at: msg.at, serverTime: Date.now() });
      case 'create': {
        const room = Room.create(validTc(msg.timeControl));
        rooms.set(room.id, room);
        const color: Color = msg.color === 'w' || msg.color === 'b' ? msg.color : Math.random() < 0.5 ? 'w' : 'b';
        const token = room.seat(color, cleanInfo(msg));
        return attach(c, room, color, token);
      }
      case 'join': {
        if (typeof msg.roomId !== 'string' || !ROOM_ID_RE.test(msg.roomId)) throw new RoomError('bad_request', 'Invalid room link');
        const room = rooms.get(msg.roomId);
        if (!room) throw new RoomError('not_found', 'This battle no longer exists');
        // Reconnect / refresh: the secret token identifies the seat.
        const existing = room.colorForToken(msg.token);
        if (existing) return attach(c, room, existing, msg.token!);
        const free = room.freeColor();
        if (!free) throw new RoomError('room_full', 'Both commanders are already present. You can watch as a spectator.');
        const token = room.seat(free, cleanInfo(msg));
        return attach(c, room, free, token);
      }
      case 'watch': {
        if (typeof msg.roomId !== 'string' || !ROOM_ID_RE.test(msg.roomId)) throw new RoomError('bad_request', 'Invalid room link');
        const room = rooms.get(msg.roomId);
        if (!room) throw new RoomError('not_found', 'This battle no longer exists');
        return attach(c, room, null, null);
      }
      case 'queue': {
        if (queue.includes(c)) return;
        leaveRoom(c);
        c.queued = { info: cleanInfo(msg), tc: validTc(msg.timeControl) };
        queue.push(c);
        return tryMatch();
      }
      case 'leaveQueue': {
        const i = queue.indexOf(c);
        if (i >= 0) queue.splice(i, 1);
        c.queued = undefined;
        return;
      }
    }

    // Everything below requires being a seated player in a room.
    const room = c.room;
    if (!room || !c.color) throw new RoomError('not_player', 'Spectators cannot act');
    const color = c.color;
    switch (msg.t) {
      case 'move': {
        room.move(color, msg.uci, msg.ply);
        const snap = room.snapshot();
        return broadcast(room, () => ({ t: 'moved', uci: msg.uci, ply: msg.ply, snapshot: snap }));
      }
      case 'resign':
        room.resign(color);
        return broadcastState(room);
      case 'offerDraw':
        room.offerDraw(color);
        return broadcastState(room);
      case 'respondDraw':
        room.respondDraw(color, !!msg.accept);
        return broadcastState(room);
      case 'claimDraw':
        room.claimDraw(color);
        return broadcastState(room);
      case 'rematch': {
        if (room.data.status !== 'over') throw new RoomError('bad_request', 'Game still running');
        if (room.data.rematchRoomId) return;
        if (room.data.rematchBy && room.data.rematchBy !== color) {
          // Both agreed: new room with colours swapped.
          const next = Room.create(room.data.timeControl);
          rooms.set(next.id, next);
          room.data.rematchRoomId = next.id;
          const sw = room.data.seats;
          const tokens: Record<Color, string> = {
            b: next.seat('b', { ...sw.w!.info }),
            w: next.seat('w', { ...sw.b!.info }),
          };
          for (const cc of conns) {
            if (cc.room !== room || !cc.color) continue;
            const newColor: Color = cc.color === 'w' ? 'b' : 'w';
            send(cc, { t: 'matched', roomId: next.id, token: tokens[newColor], color: newColor });
          }
          dirty = true;
          return;
        }
        room.data.rematchBy = color;
        return broadcastState(room);
      }
      default:
        throw new RoomError('bad_request', 'Unknown message');
    }
  };

  // ---------- HTTP ----------
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null;
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size, connections: conns.size }));
    }
    if (!staticRoot) {
      res.writeHead(404);
      return res.end('Not found');
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(staticRoot, p);
    if (!file.startsWith(staticRoot)) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(staticRoot, 'index.html'); // SPA fallback for /game/:id, /watch/:id
      p = '/index.html';
    }
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  });

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    const c: Conn = { ws, color: null, bucket: 20, bucketAt: Date.now() };
    conns.add(c);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => ((ws as WebSocket & { isAlive?: boolean }).isAlive = true));
    ws.on('message', (raw) => {
      // Token-bucket rate limit: 10 msg/s sustained, burst of 20.
      const now = Date.now();
      c.bucket = Math.min(20, c.bucket + ((now - c.bucketAt) / 1000) * 10);
      c.bucketAt = now;
      if (c.bucket < 1) return send(c, { t: 'error', code: 'rate_limited', message: 'Slow down, commander' });
      c.bucket -= 1;
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
        if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') throw new Error();
      } catch {
        return send(c, { t: 'error', code: 'bad_request', message: 'Malformed message' });
      }
      try {
        handle(c, msg);
      } catch (e) {
        err(c, e);
      }
    });
    ws.on('close', () => {
      conns.delete(c);
      const i = queue.indexOf(c);
      if (i >= 0) queue.splice(i, 1);
      leaveRoom(c);
    });
  });

  // Clocks, abandonment, heartbeat, cleanup, persistence.
  const tick = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.tick(now)) broadcastState(room);
      if (room.expired(now)) {
        rooms.delete(room.id);
        dirty = true;
      }
    }
    persist();
  }, opts.tickMs ?? 250);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { isAlive?: boolean }>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 20_000);

  httpServer.listen(opts.port);

  return {
    httpServer,
    rooms,
    close: () =>
      new Promise<void>((done) => {
        clearInterval(tick);
        clearInterval(heartbeat);
        dirty = true;
        persist();
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        httpServer.close(() => done());
      }),
  };
}
