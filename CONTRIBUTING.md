# Working on Pocket Drive

Start from the `main` branch and create a branch for each change. Run the football tests before opening a pull request. Changes to the room API, engine state, or network adapter should also pass the built Worker integration check.

```sh
pnpm test
pnpm build
pnpm test:runtime
```

The GitHub Actions workflow runs these checks on pushes to `main` and pull requests. It verifies code but does not deploy it.

Keep movement, actions, scores, and possession decisions authoritative in `server/rooms.js` and `public/game/engine.js`. The browser may predict movement but must not decide a shared match's outcome. Preserve the fixed timestep and seeded simulation so snapshots can be replayed.

Generate database migrations with `pnpm db:generate`; commit the SQL and Drizzle metadata together. Do not rewrite migrations that have already been applied to a database.

Never commit `.env` files, Cloudflare API tokens, production database contents, or local room session credentials. Local caches and generated builds are ignored.

Before shipping a gameplay change, play both offense and defense. Before shipping network changes, test two separate tabs and two separate devices, including refreshing either player and briefly disconnecting. Automated tests do not verify cross-device latency or game feel.
