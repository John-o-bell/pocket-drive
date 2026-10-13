# Roadmap

1. Deploy the standalone build in the owner's Render account and play-test two devices: input delay, pass timing, disconnects and run defense.
2. Separate client rendering, input and menus into modules; extract engine configuration, formations and AI systems while keeping regression tests.
3. Improve reconciliation and interpolation using latency measurements. Reduce snapshot size or adopt Colyseus Schema patches when measurement justifies it.
4. Add Phaser scenes, sprites, audio and animations gradually while retaining the football engine.
5. Add accounts and PostgreSQL-backed profiles, saved teams and finished-match history.
6. Introduce distributed Colyseus presence/matchmaking and routing after measuring single-process capacity.

Gameplay priorities: richer blocking/pursuit decisions, special teams, clearer pass-defense feedback and two-player balance. Infrastructure changes should preserve the responsive movement already accepted by the player.
