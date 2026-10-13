# Pocket Drive

Original retro browser football with solo exhibition and private online 1v1. The game has 11-on-11 formations, three running concepts, four passing concepts, bullet/lob passing, player-controlled defense, possession changes, and a camera that follows the play.

For clone, installation, local database, and GitHub workflow instructions, see [GITHUB_SETUP.md](GITHUB_SETUP.md). Development guidelines are in [CONTRIBUTING.md](CONTRIBUTING.md). GitHub source management and the existing hosted Site are separate; this repository does not automatically deploy on push.

## Online match

1. Open the game and choose **Online 1v1**.
2. Enter a callsign, create a room, and copy the seven-character code or invite link.
3. Your opponent joins the room. Both players ready up.
4. Halifax starts on offense. Each player controls their own team on offense and defense; teammates remain AI-controlled. The player on offense snaps and advances between plays.
5. After the final whistle, both players can request a rematch. Leaving the room returns to solo play.

A room code joins the match; it does not grant access to a private Site. Give the opponent Site access separately. You can also test with two browser tabs, creating in one and joining in the other. Use two independent tabs rather than duplicating a connected tab's session.

The reconnect window is 45 seconds. Room credentials live in tab-scoped session storage so refresh preserves the player slot. Invite-link refreshes resume the saved slot when the room code matches. Server-confirmed input/action sequence numbers prevent delayed replay. An expired reconnect window ends the match by disconnect. Rooms expire two hours after creation.

P opens the room menu during online play; that menu does not stop the shared match. Opening it releases local movement. Disconnections pause the shared simulation. Solo P still pauses normally.

## Controls

- Enter: snap or next play/possession (the offense controls this online).
- WASD / arrows: move the current carrier or selected defender.
- Shift: sprint with stamina.
- Space: juke on offense; tackle or shed a block on defense.
- Passing: pull backward from the QB and release, or drag a target on the field and release. Quick receiver clicks still lead the receiver. Keys 1–4 pass to receivers; 5 passes to the RB.
- F: bullet/lob. Bullets arrive faster and can meet underneath coverage; lobs go higher and travel farther.
- Q / Tab while the field has focus: switch to an available defender. Clicking your own defender selects them.
- E: timed swat; R: timed interception attempt.
- X: throw away from behind the line.

Touch controls provide movement, sprint, juke/tackle, defender switching, pass targets, swat and pick actions.

## Rules and limits

First to 21, or lead after four three-minute quarters. Four downs, first downs, sacks, pass breakups, interceptions, touchdowns, safeties, punts and actual opposing drives are implemented. Touchdowns include an automatic extra point. A short huddle runoff advances the clock between plays. Interceptions change possession at the catch spot; return plays are not included. Kickoff animations, field-goal attempts, penalties, overtime, seasons and ranked matchmaking are not included.

Movement has the accepted fast steering/braking response. Run defense fills lanes earlier, sheds blocks sooner, and CPU cuts cannot freeze several defenders or cancel a controlled defender's dive.

## Source layout

- `public/game/engine.js`: fixed-step, seeded, serializable rules and AI. Simulation coordinates increase toward the offense's goal.
- `public/game/app.js`, `index.html`, `style.css`: game UI, input and Canvas rendering.
- `public/game/camera.js`: camera tracking and inverse screen/field coordinate mapping.
- `public/game/network.js`: room client, tab session restoration, perspective projection, pose smoothing and local controlled-player prediction.
- `server/rooms.js`: authoritative room protocol, capability checks, action validation, simulation ticks, reconnection and rematches.
- `app/api/rooms/route.ts`: hosted POST API using the D1 binding.
- `build/sites-worker.ts`: serves the game HTML at the root and game paths, and delegates API routing to Vinext. The Sites build integration remains installed.
- `db/schema.ts`, `drizzle/`: room-table schema and generated migrations.
- `.openai/hosting.json`: existing Site identity and logical D1 binding.

The shared database is the source of truth. Each update loads the room, advances the simulation at fixed 60Hz ticks, validates that player's commands, and commits with a revision condition. Conflicting updates retry against fresh state. Scores and outcomes are never accepted from the browser. Slot capability tokens are hashed in storage and never returned in opponent snapshots. Commands and inputs carry sequence numbers; acknowledged actions cannot replay after a lost response.

The first online version uses HTTP synchronization (approximately every 120ms plus request time), rather than a dedicated WebSocket match host. Clients predict only their own controlled player's movement and smooth other poses; server outcomes remain authoritative. This is intended for small private matches. A future WebSocket/Durable Object transport can reuse the engine and room protocol for lower latency and higher concurrency. Cross-device latency and human online balance still need play-testing.

## Development

Node 22+ and pnpm are required. This project runs on Vinext/Cloudflare Workers with D1, so a static-only server supports solo assets but not online rooms.

```sh
pnpm install
pnpm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_amazing_scalphunter.sql
pnpm start
```

Apply each pending migration once. Local and hosted databases are separate. Hosted publication provisions D1 and applies the migration through Sites.

```sh
node --test tests/*.test.mjs
node tests/production-runtime.mjs
```

The second check requires a current production build and exercises the built Worker with native Miniflare D1. It creates two test clients, readies and starts a match, verifies the guest sees the authoritative state, and verifies game assets. It does not use real players or the production database.

## Verification

69 automated tests cover football rules, the retained movement/run-defense tuning, passing trajectories, timed defense, full-match termination, camera mapping, room concurrency, slot ownership, replay prevention, disconnect/reconnect, rematches, client synchronization, restored movement sequence numbers, and DOM/canvas input contracts. The built Worker + native D1 integration check also passes. Browser visual QA and two-person cross-device play-testing remain unverified in the build environment.
