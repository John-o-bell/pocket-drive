# Architecture

## Shared simulation

`packages/game/src/engine.js` is the seeded, fixed-step football simulation. It owns formations, routes, blocking, coverage, ball trajectories, tackles, downs, scoring and the clock. It has no DOM, database or hosting imports. Solo `LocalSession` and the server call the same functions.

`config.js` contains play definitions, receiver routes, coverage labels and pass trajectory tuning, so those can be edited without changing the simulation loop.

`types.ts` defines network input/action contracts and the stable shared state fields. The existing engine and Canvas client remain JavaScript; new room/server code is TypeScript. Convert gameplay modules gradually as features change rather than rewriting the rules during hosting migration.

## Client

- `app.js`: UI, Canvas rendering and keyboard/pointer/touch controls.
- `camera.js`: camera tracking and field/screen transforms.
- `network.js`: Colyseus room lifecycle, input delivery, action acknowledgements and tab session restoration.
- `prediction.js`: local team perspective, controlled-player prediction and other-player smoothing.

Vite bundles the source into `apps/client/dist`. The room menu does not pause an online game. Tab-scoped session storage holds only that tab's reconnection capability.

## Server

- `FootballRoom.ts`: Colyseus room, two seats, messages, network lifecycle and snapshot delivery.
- `match.ts`: match state, ready/countdown, authoritative fixed-step advancement, pause, forfeit and rematch.
- `validation.ts`: runtime validation of untrusted inputs/actions.
- `server.ts`: HTTP health/assets and WebSocket transport; reusable by integration tests.
- `index.ts`: process startup, port and shutdown handling.

The server wakes about 60 times per second. It accumulates elapsed time and steps at a fixed 1/60 second, capping catch-up to 250ms. Match progress never depends on a browser sending an HTTP request. Clients send input at 30Hz; normal snapshots are pushed at 20Hz, with immediate updates for commands and lobby votes. This initial transport sends full snapshots via Colyseus messages rather than Schema delta patches.

Movement stops after 350ms without fresh input. Actions are acknowledged by monotonically increasing sequences. Ownership is checked in the engine, so a defender cannot snap/throw for the opponent. Browser-supplied scores and match state are ignored. Player session IDs and reconnect capabilities are excluded from snapshots.

An unexpected socket drop reserves the seat for 45 seconds through Colyseus. The shared match pauses and resumes after a countdown when both players reconnect. Expiry awards a forfeit; both connected players can request another round afterward.

## Persistence

Matches are ephemeral and live in memory. PostgreSQL belongs behind a future repository interface for profiles and match results. Distributed presence/matchmaking belongs behind Colyseus's infrastructure adapters when multiple processes become necessary.
