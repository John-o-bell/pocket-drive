import { createFootballServer } from "./server.js";

const port = Number(process.env.PORT || 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("PORT must be a valid TCP port.");
const { server } = createFootballServer();
await server.listen(port, "0.0.0.0");
console.log(`Pocket Drive listening on http://localhost:${port}`);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    await server.gracefullyShutdown(false);
    process.exit(0);
  });
