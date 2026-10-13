# Deploying Pocket Drive

## Render

1. Sign in to your own Render account and connect GitHub.
2. Create a Blueprint from `John-o-bell/pocket-drive`, branch `main`. Render reads the root `render.yaml`.
3. Review the configuration and plan. The blueprint selects `0.5c-512mb`, a paid compute service in Ohio, with one instance. You can change the plan before creating it; sleeping free services are useful for experiments but should not be treated as an always-available match host.
4. Create the service. It runs `npm ci --include=dev && npm run build` and starts with `npm start`.
5. Open the generated HTTPS URL. Check `/health`, create a room, then test with another tab/device on that same URL.

The service serves both the client and server. The SDK derives its WebSocket address from the current origin, so there is no frontend API URL to configure for this deployment. The process binds to `0.0.0.0` and Render's supplied `PORT`. Keep the root directory at the repository root so all three workspaces are included.

After linking GitHub, `autoDeployTrigger: checksPass` gates updates on passing CI. Check Render's deployment logs for build/runtime failures. The health endpoint confirms the process is responding; it is not a load or latency test.

## Lifecycle and scaling

Rooms are held in memory and expire after two hours. Network drops reserve the player's seat for 45 seconds and pause the match; reconnection tokens rotate on a successful reconnect. Intentional leave ends that player's participation. A process restart/deployment loses rooms, so finish test sessions before deploying.

Use one instance initially. Creating more instances requires Colyseus's distributed matchmaking driver/presence and room-aware routing; simply increasing Render's instance count would not make this implementation safe to scale.

No database is provisioned. PostgreSQL will be added for durable profiles, saved teams and finished-match records. It will not store every movement tick.

## Separate frontend hosting

The client can later be hosted on a static CDN. At build time set `VITE_SERVER_URL` to the HTTPS address of the Node server, then run `npm run build -w @pocket-drive/client`. That value is a public endpoint, not a secret. Configure explicit allowed origins on the server when introducing account authentication or separating domains.

## Migration status

The GitHub version no longer includes Sites manifests, Vinext/Next.js, Cloudflare bindings, starter UI components or D1 migrations. The previous ChatGPT-hosted build remains a separate older deployment until you retire it. Deploying on Render does not automatically delete or redirect that old Site.

This environment cannot create a Render service in your account. The configuration is ready for you to apply. Browser visual checks and real cross-device latency still need play-testing after deployment.
