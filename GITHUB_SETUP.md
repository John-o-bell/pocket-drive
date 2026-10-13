# GitHub development setup

This export contains the complete source from the published online beta, plus standard test scripts and GitHub Actions checks. It does not contain installed dependencies, generated build output, production room data, or credentials.

## Run locally

Install Node.js 22.13 or newer and the package-manager version from `package.json` (`pnpm@11.25.0`). With Node installed, `npm install --global pnpm@11.25.0` installs that version.

```sh
git clone <your-repository-url>
cd pocket-drive
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate:local
pnpm start
```

Open the local address printed by Wrangler. The database migration is needed for room creation; solo play does not use the room database. The local database is separate from the hosted one. Apply the initial migration once per fresh local database. Apply later migrations in order.

For UI development, `pnpm dev` runs the development server; use `pnpm start` after building to test the production Worker locally.

## Checks

```sh
pnpm test
pnpm build
pnpm test:runtime
```

There are 69 rule, movement, passing, defense, room and client checks. The runtime check tests the compiled Worker against a disposable D1 database. The workflow in `.github/workflows/ci.yml` runs the same checks on pull requests and pushes to `main`. Its first actual GitHub run is still required to verify dependency installation on a GitHub runner.

## Hosting and portability

GitHub holds the source. It does not host the multiplayer server or copy the live database. The current Site remains published separately, and GitHub pushes do not automatically update it.

The application currently uses Vinext, a Cloudflare Worker, and a D1 database binding named `DB`. The tracked `.openai/hosting.json` and `build/sites-*` files preserve compatibility with the existing Site. Its project ID is configuration, not an API credential. The generated local Wrangler config contains a placeholder database ID, not a production deployment target.

If moving hosting to your own Cloudflare account, create your own D1 database, configure the Worker and asset bindings for that account, and apply the migrations to that new database before deploying. This export has not set up that account or an automatic production deployment workflow. A static GitHub Pages or static-only Vercel deployment will not run `/api/rooms`.

Online synchronization is currently HTTP polling backed by D1. A dedicated WebSocket match host is the next architecture step for lower latency; this GitHub move preserves the existing working beta rather than changing that transport.

## Source provenance

Game source exported from Site commit `b88210c6340413c5d969666e47e08abfde507d0f` on 2026-10-13. The export includes the existing starter utilities and their bundled license notices.
