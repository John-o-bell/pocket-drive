# Contributing

Start with [development instructions](docs/development.md) and [architecture](docs/architecture.md). Use a branch and pull request for each focused change. CI must pass before merging.

Preserve the shared engine's fixed timestep and seeded randomness. Keep the server authoritative. Validate all client messages at the boundary, and keep reconnect secrets out of shared snapshots and logs.

Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:integration`. Play-test both teams and refresh/reconnect when changing online behavior.
