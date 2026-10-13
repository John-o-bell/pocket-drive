# Pocket Drive

A retro browser football game with solo exhibition and private online 1v1. Built with Vite, Canvas, TypeScript and a Node.js/Colyseus WebSocket server. This version runs independently of ChatGPT Sites and Cloudflare D1.

## Run locally

Install Node.js 22.13 or newer, then:

```sh
git clone https://github.com/John-o-bell/pocket-drive.git
cd pocket-drive
npm ci
npm run dev
```

Open **http://localhost:5173**. The client runs on port 5173 and the server on port 2567. Create a room in one independent tab and join its code in another. Both players ready up. Refresh preserves your player slot for 45 seconds.

For a production build served by one Node process:

```sh
npm run build
npm start
```

Open **http://localhost:2567**. No database setup is required for live matches.

## Where to work

| Folder          | Responsibility                                                                   |
| --------------- | -------------------------------------------------------------------------------- |
| `apps/client`   | Canvas graphics, camera, input, menus, client prediction and WebSocket transport |
| `apps/server`   | Authoritative live matches, rooms, validation and reconnects                     |
| `packages/game` | Shared football simulation and TypeScript contracts                              |
| `tests`         | Gameplay, camera, UI, room rules and real WebSocket integration                  |
| `docs`          | Architecture, development, deployment and roadmap                                |

The server decides scores, possession and collisions. The client predicts movement for responsiveness. Both solo play and the server use the same football engine.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

GitHub Actions runs all four checks on `main` and pull requests. The integration check starts the compiled Node server and two real Colyseus clients; it also checks refresh/reconnection, rotated tokens and rematches.

## Deploy under your own account

[Deploy to Render](https://render.com/deploy?repo=https://github.com/John-o-bell/pocket-drive)

The included `render.yaml` serves the built client and WebSocket server from one service. Review the service plan shown by Render, connect your GitHub account, and create the service. After setup, deployments follow passing GitHub checks. See [deployment instructions](docs/deployment.md).

Live matches currently live in one server process. A server restart or deployment ends them. Accounts, saved teams and persistent match history are future features; they will use PostgreSQL. Horizontal scaling requires a shared Colyseus driver/presence and routing, so keep this initial deployment at one instance.

## Football

11-on-11 formations, a running back, three running plays, four passing plays, bullet/lob passes, player-controlled defense, punts and actual opposing drives. First to 21 or four three-minute quarters. Controls and play instructions are available in the game's **How to Play** menu.

[Architecture](docs/architecture.md) · [Development](docs/development.md) · [Roadmap](docs/roadmap.md)
