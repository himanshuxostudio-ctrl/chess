import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/server';
import type { ClientMsg, ServerMsg } from '../shared/protocol';

const PORT = 18787;
const dataFile = join(mkdtempSync(join(tmpdir(), 'awc-')), 'rooms.json');
let server: ReturnType<typeof startServer>;

/** Small promise-based test client. */
class Client {
  ws: WebSocket;
  inbox: ServerMsg[] = [];
  waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
  ready: Promise<void>;
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ready = new Promise((r) => this.ws.once('open', () => r()));
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      const w = this.waiters.find((x) => x.pred(m));
      if (w) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.res(m);
      } else this.inbox.push(m);
    });
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true): Promise<Extract<ServerMsg, { t: T }>> {
    const p = (m: ServerMsg) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>);
    const i = this.inbox.findIndex(p);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), 3000);
      this.waiters.push({ pred: p, res: (m) => (clearTimeout(timer), res(m as Extract<ServerMsg, { t: T }>)) });
    });
  }
  close() {
    this.ws.close();
  }
}

beforeAll(() => {
  server = startServer({ port: PORT, dataFile, tickMs: 50 });
});
afterAll(async () => {
  await server.close();
});

async function newGame() {
  const a = new Client();
  await a.ready;
  a.send({ t: 'create', name: 'Alexios', color: 'w', timeControl: { initial: 0, increment: 0 } });
  const created = await a.next('joined');
  const b = new Client();
  await b.ready;
  b.send({ t: 'join', roomId: created.roomId, name: 'Darius' });
  const joined = await b.next('joined');
  return { a, b, roomId: created.roomId, tokenA: created.token!, tokenB: joined.token!, created, joined };
}

describe('multiplayer server', () => {
  it('creates an unguessable room and lets a second player join via link id', async () => {
    const { a, b, roomId, created, joined } = await newGame();
    expect(roomId).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(created.color).toBe('w');
    expect(joined.color).toBe('b');
    expect(joined.snapshot.status).toBe('active');
    expect(joined.snapshot.players.w?.name).toBe('Alexios');
    a.close();
    b.close();
  });

  it('two room ids are never the same', () => {
    const ids = new Set<string>();
    for (const r of server.rooms.keys()) ids.add(r);
    expect(ids.size).toBe(server.rooms.size);
  });

  it('syncs moves to both players and rejects wrong-turn, illegal, duplicate moves', async () => {
    const { a, b } = await newGame();
    // Black tries to move first
    b.send({ t: 'move', uci: 'e7e5', ply: 0 });
    expect((await b.next('error')).code).toBe('not_your_turn');
    // Illegal move
    a.send({ t: 'move', uci: 'e2e5', ply: 0 });
    expect((await a.next('error')).code).toBe('illegal_move');
    // Legal move reaches both
    a.send({ t: 'move', uci: 'e2e4', ply: 0 });
    const ma = await a.next('moved');
    const mb = await b.next('moved');
    expect(ma.snapshot.moves).toEqual(['e2e4']);
    expect(mb.snapshot.moves).toEqual(['e2e4']);
    // Duplicate resend of same move is rejected as stale
    a.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect((await a.next('error')).code).toBe('stale_ply');
    // Malformed
    a.send({ t: 'move', uci: '<script>', ply: 1 });
    expect((await a.next('error')).code).toBe('bad_request');
    a.close();
    b.close();
  });

  it('third player cannot take a seat; spectators can watch but not move', async () => {
    const { a, b, roomId } = await newGame();
    const c = new Client();
    await c.ready;
    c.send({ t: 'join', roomId, name: 'Intruder' });
    expect((await c.next('error')).code).toBe('room_full');
    c.send({ t: 'watch', roomId });
    const w = await c.next('joined');
    expect(w.color).toBeNull();
    c.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect((await c.next('error')).code).toBe('not_player');
    a.send({ t: 'move', uci: 'd2d4', ply: 0 });
    const seen = await c.next('moved');
    expect(seen.uci).toBe('d2d4');
    [a, b, c].forEach((x) => x.close());
  });

  it('notifies disconnect and restores the game on reconnect with token (refresh recovery)', async () => {
    const { a, b, roomId, tokenB } = await newGame();
    a.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await a.next('moved');
    await b.next('moved');
    b.close();
    const st = await a.next('state', (m) => m.snapshot.players.b?.connected === false);
    expect(st.snapshot.disconnectDeadline.b).toBeGreaterThan(Date.now());
    const b2 = new Client();
    await b2.ready;
    b2.send({ t: 'join', roomId, name: 'Darius', token: tokenB });
    const re = await b2.next('joined');
    expect(re.color).toBe('b');
    expect(re.snapshot.moves).toEqual(['e2e4']);
    await a.next('state', (m) => m.snapshot.players.b?.connected === true);
    b2.send({ t: 'move', uci: 'e7e5', ply: 1 });
    expect((await a.next('moved')).uci).toBe('e7e5');
    a.close();
    b2.close();
  });

  it('a forged token does not grant a seat', async () => {
    const { a, b, roomId } = await newGame();
    const x = new Client();
    await x.ready;
    x.send({ t: 'join', roomId, name: 'Forger', token: 'deadbeef'.repeat(6) });
    expect((await x.next('error')).code).toBe('room_full');
    [a, b, x].forEach((c) => c.close());
  });

  it('checkmate ends the game for both; further moves rejected', async () => {
    const { a, b } = await newGame();
    const seq = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    for (let i = 0; i < seq.length; i++) {
      (i % 2 ? b : a).send({ t: 'move', uci: seq[i], ply: i });
      await a.next('moved');
      await b.next('moved');
    }
    a.send({ t: 'move', uci: 'a2a3', ply: 4 });
    expect((await a.next('error')).code).toBe('game_over');
    a.close();
    b.close();
  });

  it('resignation, draw offer/accept, and rematch with swapped colours', async () => {
    const g1 = await newGame();
    g1.b.send({ t: 'resign' });
    const s1 = await g1.a.next('state', (m) => m.snapshot.status === 'over');
    expect(s1.snapshot.outcome).toMatchObject({ result: '1-0', reason: 'resign' });
    g1.a.send({ t: 'rematch' });
    await g1.b.next('state', (m) => m.snapshot.rematchBy === 'w');
    g1.b.send({ t: 'rematch' });
    const ra = await g1.a.next('matched');
    const rb = await g1.b.next('matched');
    expect(ra.roomId).toBe(rb.roomId);
    expect(ra.color).toBe('b');
    expect(rb.color).toBe('w');

    const g2 = await newGame();
    g2.a.send({ t: 'offerDraw' });
    await g2.b.next('state', (m) => m.snapshot.drawOfferBy === 'w');
    g2.b.send({ t: 'respondDraw', accept: true });
    const s2 = await g2.a.next('state', (m) => m.snapshot.status === 'over');
    expect(s2.snapshot.outcome).toMatchObject({ result: '1/2-1/2', reason: 'agreement' });
    [g1.a, g1.b, g2.a, g2.b].forEach((c) => c.close());
  });

  it('flags a player whose clock runs out', async () => {
    const a = new Client();
    await a.ready;
    a.send({ t: 'create', name: 'A', color: 'w', timeControl: { initial: 1, increment: 0 } });
    const cr = await a.next('joined');
    const b = new Client();
    await b.ready;
    b.send({ t: 'join', roomId: cr.roomId, name: 'B' });
    await b.next('joined');
    a.send({ t: 'move', uci: 'e2e4', ply: 0 }); // starts black's clock
    await b.next('moved');
    const over = await a.next('state', (m) => m.snapshot.status === 'over');
    expect(over.snapshot.outcome).toMatchObject({ reason: 'timeout', result: '1-0' });
    a.close();
    b.close();
  });

  it('random matchmaking pairs two queued players', async () => {
    const a = new Client();
    const b = new Client();
    await Promise.all([a.ready, b.ready]);
    const tc = { initial: 300, increment: 0 };
    a.send({ t: 'queue', name: 'Q1', timeControl: tc });
    await a.next('queued');
    b.send({ t: 'queue', name: 'Q2', timeControl: tc });
    const ma = await a.next('matched');
    const mb = await b.next('matched');
    expect(ma.roomId).toBe(mb.roomId);
    expect(new Set([ma.color, mb.color])).toEqual(new Set(['w', 'b']));
    a.close();
    b.close();
  });

  it('rate-limits floods and rejects unknown rooms', async () => {
    const a = new Client();
    await a.ready;
    a.send({ t: 'join', roomId: 'ZZZZZZZZZZ', name: 'x' });
    expect((await a.next('error')).code).toBe('not_found');
    for (let i = 0; i < 40; i++) a.send({ t: 'ping', at: i });
    expect((await a.next('error', (m) => m.code === 'rate_limited')).code).toBe('rate_limited');
    a.close();
  });

  it('persists rooms to disk and restores them after a restart', async () => {
    const { a, b, roomId, tokenA } = await newGame();
    a.send({ t: 'move', uci: 'g1f3', ply: 0 });
    await b.next('moved');
    a.close();
    b.close();
    await server.close();
    server = startServer({ port: PORT, dataFile, tickMs: 50 });
    const a2 = new Client();
    await a2.ready;
    a2.send({ t: 'join', roomId, name: 'Alexios', token: tokenA });
    const j = await a2.next('joined');
    expect(j.color).toBe('w');
    expect(j.snapshot.moves).toEqual(['g1f3']);
    a2.close();
  });
});
