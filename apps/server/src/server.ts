import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { FootballRoom } from "./FootballRoom.js";

export function createFootballServer() {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) =>
    res.json({ ok: true, version: "0.2.0", transport: "websocket" }),
  );
  const assets = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  app.use(express.static(assets));
  app.get("/", (_req, res) =>
    existsSync(assets + "index.html")
      ? res.sendFile(assets + "index.html")
      : res
          .status(503)
          .send("Build the client with npm run build, or run npm run dev."),
  );
  const http = createServer(app);
  const server = new Server({
    transport: new WebSocketTransport({
      server: http,
      maxPayload: 16000,
      pingInterval: 1000,
      pingMaxRetries: 3,
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define("football", FootballRoom);
  return { server, http, app };
}
