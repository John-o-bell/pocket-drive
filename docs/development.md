# Development

Use Node.js 22.13+ and npm workspaces. The root lockfile is authoritative; run `npm ci` for a clean checkout.

`npm run dev` starts Vite and the TypeScript server watcher together. `npm run build` creates both deployable outputs. `npm start` runs the compiled server and serves the built client. The development URL is port 5173; production-local is port 2567.

Create a branch for each gameplay change and open a pull request. CI checks type contracts, game/room rules, production builds and the real WebSocket integration. Run the checks listed in the README before pushing.

When modifying the football simulation, add a regression test for the behavior and confirm both solo and online modes. Changes to match transport should exercise two clients, ownership, disconnects and replay prevention. The integration test's server-side final-score fixture is test-only; clients have no score-setting endpoint.

Rendering, UI and football engine files were formatted during migration to make them readable. Play definitions and pass tuning now live in `packages/game/src/config.js`. The next refactor should split `app.js` into rendering, controls and UI modules and split engine systems along their existing responsibilities. Preserve the deterministic engine contract while doing so.

Do not add database or browser imports to the shared engine. Keep gameplay tuning separate from transport concerns. Never check in credentials or generated `dist` and `node_modules` folders.
