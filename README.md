# Ancient Warfare Chess

Real chess, fought as an ancient battle in 3D. The **Hellenic League** (White) faces the
**Persian Immortals** (Black) on a ruined stone battlefield. Every piece is a 3D unit, and every
capture plays out as a short duel.

| Piece | Unit |
| --- | --- |
| King | Supreme Commander: crowned helm, cape, greatsword, larger than the other units |
| Queen | Warrior Empress: crown or diadem, cape, long spear (Hellenic) or sword (Persian) |
| Rook | Scythed War Chariot: armoured horse, spinning wheels, charioteer and banner |
| Bishop | Royal War Priest: robes, hood or mitre, staff with a glowing orb |
| Knight | Elite Cavalry: armoured warhorse and rider; leaps over units on its L-move |
| Pawn | Infantry: hoplites with round shields, or Immortals with wicker shields; 4 variants per army |

## Modes

- **Play against AI**: Stockfish 19 (WebAssembly) in a Web Worker, with six difficulty levels
  (Beginner → Grandmaster) set through the engine's Skill Level, Elo limit, depth and move time.
  It shows a thinking indicator and has adjustable thinking time.
- **Play with a friend (online)**: create a private room, copy the invitation link
  (`/game/ROOMID`) and send it. You can also use random matchmaking. The server validates every move.
- **Pass and play**: two players on one device, with an optional hand-over screen and automatic
  board rotation. Works offline once the page has loaded.
- **Spectator**: `/watch/ROOMID` shows a live online game. Spectators can only watch.

## Quick start

```bash
npm install          # also copies the Stockfish engine into public/engine
npm run build        # builds the client into dist/
npm start            # serves dist/ + the WebSocket server on http://localhost:8787
```

Development, with hot reload (two terminals):

```bash
npm run dev:server   # multiplayer server on :8787
npm run dev          # Vite on :5173; proxies /ws to :8787
```

Tests:

```bash
npm test             # 43 tests: chess rules, multiplayer server, Stockfish AI, choreography
```

Add `?debug` to the URL to get `window.__awc` (the game store) in the console. It is used for scripted browser tests.

## Architecture

```
shared/        rules.ts (chess.js wrapper: single source of truth), protocol.ts (WS messages)
server/        rooms.ts (authoritative room logic), server.ts (HTTP + WebSocket), index.ts
src/
  game/        store.ts (game controller), choreography.ts (move → animation scripts)
  three/       Scene, Board, PieceActor, CameraRig, Effects, env/Battlefield, units/*
  ai/          stockfish.ts (UCI over a Web Worker)
  net/         client.ts (reconnecting WebSocket, seat tokens)
  audio/       sound.ts (procedural Web Audio: ambience, combat, horns, victory music)
  profile/     profile.ts (guest profile, Elo rating, match history)
  ui/          screens (Menus, GameScreen), components (Settings, Icons, Board2D fallback)
  config/      settings.ts (persisted settings)
tests/         rules, server, ai, choreography
```

**How every move flows:** chess.js (on the client for local/AI games, on the server for online
games) validates and applies the move → `choreograph()` turns the validated move into timed
walk/attack/hit/defeat segments → input stays locked until the animation ends → the units
snap to the engine's position. Animations are computed *from* the engine's result, so they cannot
change it. Tests check that the 3D units match the engine after every capture, castling move,
en passant capture and promotion.

### Where the stack differs from the brief, and why

| Brief | Built | Reason |
| --- | --- | --- |
| Supabase Realtime + Postgres | Node `ws` server holding game state, persisted to disk | Move validation, clocks, timeouts and abandonment need a process that keeps running. Supabase Realtime only relays messages; validation would need an Edge Function per move plus a separate timer. A small Node server does all of this in one place, can be tested end-to-end (12 integration tests), and deploys as one container. |
| GLB / Mixamo character assets | Procedural, rigged 3D models built in code | No licensed character assets were available. Every unit is real 3D geometry with PBR materials and per-joint animation. `UnitModel.tsx` is the single place to swap in GLB models later. |
| Tailwind + Framer Motion | Hand-written CSS with design tokens and CSS transitions | Fewer dependencies for a mostly 3D app; the UI is small. |
| Next.js | Vite + React | Single-page app with a custom server; no SSR needed. |

## Deployment

**Recommended: one service (Docker).** The server serves the built client and the WebSocket on
the same origin, so no CORS or URL configuration is needed.

- **Render:** create a Blueprint from this repo. `render.yaml` sets up a Docker web service with a
  1 GB disk at `/data` for room persistence, plus a health check at `/healthz`.
- **Fly.io / Railway / any Docker host:** `docker build -t awc . && docker run -p 8787:8787 -v awc-data:/data awc`.
- The host needs WebSocket support (Render, Fly and Railway all have it). Use HTTPS so the
  client connects over `wss://`.

**Split hosting (optional):** host `dist/` on Vercel or Netlify and the server elsewhere. Build with
`VITE_WS_URL=wss://your-server/ws`, and add a rewrite so `/game/*` and `/watch/*` serve `index.html`.

No API keys or secrets are needed. See `.env.example`.

## Security & reliability (online)

- Room IDs: 10 characters from a 32-symbol alphabet using `crypto.randomInt` (~50 bits), so they can't be guessed.
- Each seat gets a secret 192-bit token, compared in constant time. The token is stored in the
  player's browser, which is how refresh and reconnection recover the right seat. A forged token gets you nothing.
- The server checks every move: the move format, that it is that player's turn, legality (chess.js), and an
  expected `ply` number. The `ply` check rejects duplicate and conflicting moves.
- Rate limiting is a token bucket per connection (10 msgs/s, burst 20). Messages are capped at 64 KB.
  Names and avatars are cleaned up on the server.
- Server-side clocks: flag-fall, the FIDE rule that you can't lose on time to bare material,
  and a 90-second disconnect grace period before an abandonment loss.
- Rooms are saved to disk (atomic write) and restored on restart. Expired rooms are cleaned up after
  1 h unjoined, 6 h after the game ends, or 24 h idle.

## Feature status

Done, and tested by automated tests or in the browser:

- All chess rules: castling (and not through check), en passant, promotion to Q/R/B/N, check, checkmate, stalemate,
  insufficient material, threefold (claim) / fivefold (automatic), 50-move (claim) / 75-move
  (automatic), resignation, draw offers, timeouts, undo (local/AI), SAN history, FEN, PGN export
- Six AI levels that make legal moves, find mate-in-one and handle terminal positions
- Online: create/join by link, copy invitation link and share buttons, matchmaking, spectators,
  real-time sync, wrong-turn/illegal/duplicate rejection, disconnect notice and countdown, reconnect,
  browser refresh recovery, resign, draw offer/accept, rematch with swapped colours, server clocks
- 3D: 32 units with idle/walk/attack/hit/defeat/promotion animations, a different attack for each unit type,
  sparks and dust, cinematic camera on capture, check and mate, orbit/zoom/pan, top-down and
  cinematic views, board rotation, fixed-camera setting, drag-and-drop and tap-to-move,
  legal/capture/special-move markers, last-move highlight, check ring
- Battlefield: dusk sky, fog, terrain, instanced ruined colonnade, torches with fire and light,
  waving army banners, mountains, fortress, drifting dust; Low/Medium/High quality presets
- Procedural audio on four volume buses (music, environment, combat, UI) plus master and mute
- Guest profile: name, avatar upload, Elo rating, W/L/D, favourite mode, last 50 games with PGN
- Responsive layouts for desktop, tablet and mobile (phone portrait checked in the browser), plus a playable 2D board when WebGL is missing

Outstanding (needs your input or external services):

1. **Registered accounts (register, log in, profiles synced across devices).** Right now profiles are
   guest profiles stored in the browser. Adding accounts needs an auth provider and a database. Supabase
   Auth fits: create a project, add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and store
   profiles and match history in a `profiles` / `matches` table with row-level security.
   The server would then check the Supabase JWT when a player joins.
2. **Studio-quality character models.** The procedural units work and are animated, but licensed or
   commissioned GLB models with skinned Mixamo-style animation would look much better. Swap
   them in at `src/three/units/UnitModel.tsx`.
3. **Recorded music and sound effects.** Audio is synthesized. Licensed recordings can replace the
   cases in `src/audio/sound.ts`.
4. **Real-device performance check on low-end phones.** Quality presets exist (Low is the default on
   touch devices), but they have only been tested in a desktop browser at phone size.
