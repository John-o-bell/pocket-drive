import { randomInt } from "node:crypto";
import { Room, type Client } from "@colyseus/core";
import type { MatchModel, TeamSlot } from "@pocket-drive/game/types";
import {
  addPlayer,
  advance,
  connection,
  createMatch,
  finish,
  RECONNECT_SECONDS,
  ROOM_TTL_MS,
  snapshotFor,
  sync,
} from "./match.js";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export class FootballRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 90;
  model!: MatchModel;
  onCreate() {
    this.roomId = Array.from(
      { length: 7 },
      () => CODE_LETTERS[randomInt(CODE_LETTERS.length)],
    ).join("");
    this.setPrivate(true);
    this.model = createMatch(this.roomId);
    this.onMessage("sync", (client, payload) => {
      const slot = this.slot(client);
      if (slot === null) return;
      try {
        sync(this.model, slot, payload);
        if (
          payload?.commands?.length ||
          payload?.ready !== undefined ||
          payload?.rematch
        )
          this.publish();
      } catch (error) {
        client.send("error", {
          message: error instanceof Error ? error.message : "Invalid update.",
        });
      }
    });
    this.onMessage("snapshot", (client) => this.sendSnapshot(client));
    this.onMessage("ping", (client, payload) => client.send("pong", payload));
    this.setSimulationInterval(() => advance(this.model), 1000 / 60);
    this.clock.setInterval(() => this.publish(), 50);
    this.clock.setTimeout(() => this.disconnect(), ROOM_TTL_MS);
  }
  onJoin(client: Client, options: { name?: unknown }) {
    addPlayer(this.model, client.sessionId, options.name);
    this.publish();
  }
  onDrop(client: Client) {
    const slot = this.slot(client);
    if (slot !== null) connection(this.model, slot, false);
    this.allowReconnection(client, RECONNECT_SECONDS);
    this.publish();
  }
  onReconnect(client: Client) {
    const slot = this.slot(client);
    if (slot !== null) connection(this.model, slot, true);
    this.publish();
  }
  onLeave(client: Client) {
    const slot = this.slot(client);
    if (slot === null) return;
    connection(this.model, slot, false);
    if (this.model.stage === "lobby") {
      this.model.players[slot] = null;
      // A room's creator owns its invitation. Close it if they leave the lobby.
      if (slot === 0) this.disconnect();
    } else if (this.model.stage !== "finished")
      finish(
        this.model,
        this.model.players[1 - slot]?.connected
          ? ((1 - slot) as TeamSlot)
          : null,
        "MATCH ENDED BY DISCONNECT.",
      );
    this.publish();
  }
  private slot(client: Client): TeamSlot | null {
    const slot = this.model.players.findIndex(
      (p) => p?.sessionId === client.sessionId,
    );
    return slot < 0 ? null : (slot as TeamSlot);
  }
  private sendSnapshot(client: Client) {
    const slot = this.slot(client);
    if (slot !== null) client.send("snapshot", snapshotFor(this.model, slot));
  }
  private publish() {
    this.model.revision++;
    for (const client of this.clients) this.sendSnapshot(client);
  }
}
