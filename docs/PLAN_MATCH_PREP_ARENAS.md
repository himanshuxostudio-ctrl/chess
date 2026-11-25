# Match Preparation + Battlefield Arenas — audit and implementation plan

Branch: `feature/match-prep-arenas` (based on `feature/glb-armies`, which carries the 12 Sun/Shadow GLB armies).

## 1. Audit of the existing application

| Area | Where | State |
|---|---|---|
| App shell / routing | `src/App.tsx` | Screen state in React, URL routes `/game/:room` (join) and `/watch/:room` (spectate) |
| Menus | `src/ui/screens/Menus.tsx` | Landing, ModeSelect, AiLobby, FriendLobby, LocalLobby, SpectateLobby, JoinScreen, Profile |
| In-game HUD | `src/ui/screens/GameScreen.tsx` | Player cards + clocks, move list, captured, draw/resign, result modal, invite overlay |
| Game controller | `src/game/store.ts` | Zustand. Modes: showcase / ai / local / online / spectate; engine-first move flow |
| Rules | `shared/rules.ts` (chess.js) | Shared by client and server; covers 50/75-move and threefold/fivefold |
| AI | `src/ai/stockfish.ts` | Stockfish 19 WASM, 6 levels |
| Multiplayer | `server/rooms.ts`, `server/server.ts`, `shared/protocol.ts` | Authoritative rooms, seat tokens, clocks, draw/rematch, spectators, matchmaking by time control, disk persistence |
| 3D scene | `src/three/Scene.tsx` | Board, PieceActor (GLB armies + classic fallback), Effects, CameraRig |
| Environment | `src/three/env/Battlefield.tsx` | One hard-coded arena: sky shader, ground, colonnade, torches, banners, mountains, fortress, dust |
| Board | `src/three/Board.tsx` | 64 marble tiles, frame, coordinates, highlights. `sqToXZ` square mapping |
| Deployment | `Dockerfile`, `render.yaml` | Single service (server serves the client + `/ws`). **Not deployed yet.** |

### Gaps against the brief
1. No preparation flow: "Play Now" jumps straight to the board, and options are spread over separate lobbies.
2. Server rooms hold only the time control and the creator's colour. There is no match config (battlefield, rated, spectators, rematch), and nothing to send both players the same settings.
3. Rooms start as soon as the second seat is taken. There is no invitation/ready step, and no way to cancel an invitation.
4. Matchmaking has no waiting screen. Status appears as toasts only.
5. There is a single environment, with no theme system.
6. There is no match introduction.
7. Invite links use `location.origin`, so a locally run game produces `localhost` links.

## 2. Design decisions

- **Server-authoritative match config** (`shared/match.ts`):
  - `{ variant: 'standard', timeControl, battlefield, rated, allowSpectators, allowRematch }`
  - The server validates and normalises it, and resolves `random` battlefield and side choices.
  - It ships in every room snapshot. Clients render only what the server says.
- **Invitation lifecycle:**
  - `waiting` → (guest joins) → `ready` (both seated, each confirms "Ready") → `active`
  - The host can cancel while not active, which closes the room and notifies the guest.
  - Matchmaking rooms skip the ready step: both players chose to play now.
- **Settings exposed only where real:**
  - spectators and rematch: enforced by the server
  - rated: updates the local guest rating; unrated skips the update (there are no server accounts)
  - confirm resignation and sound: client preferences
  - variants: Standard only, with nothing non-functional shown
- **Battlefield theme system** (`src/three/arena/`):
  - A declarative `ArenaTheme` config per battlefield: board materials, frame, ground, sky, fog, lights, architecture set, banners, torches, particles, ambient sound.
  - One `Arena` component renders any theme; new themes are data plus one architecture component.
  - Four themes: Sun Kingdom, Shadow Kingdom, Eclipse Battlefield, Ancient Fortress.
  - The theme never touches rules, clocks or sync, and stays fixed for the whole match.
- **Board readability:** each theme keeps a minimum luminance contrast between light and dark squares, enforced by a unit test.
- **Public invite URL:** `VITE_PUBLIC_URL` overrides the invitation base. When the page runs on localhost without it, the invite panel warns that the link only works on this computer.

## 3. Stages
1. Audit and plan (this document)
2. Server match config, ready/cancel lifecycle, protocol and server tests
3. Match preparation UI: start screen, custom match panel, play-a-friend flow, invitation screen, matchmaking screen
4. Wire preparation into game start for AI, local, online and spectate
5. Arena theme system, extracted from the current battlefield, plus board theming
6. The four themes
7. Battlefield sync from the match config, the match introduction, and the in-game UI (connection status, rematch, exit)
8. Full test pass: unit and integration tests plus browser runs in every mode

Each stage is committed separately so every commit is a working version.

## 4. Requires the owner (cannot be done from this machine)
- **A public deployment** (e.g. Render via `render.yaml`) so invite links work across the internet.
- **A test on two separate physical devices.** Locally, two-player sync is tested with a browser plus a WebSocket client, which is the same server code path.
