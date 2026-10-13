import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";
import { matchMaker } from "@colyseus/core";
import { createFootballServer } from "../apps/server/dist/server.js";
import { RoomSession } from "../apps/client/src/network.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, timeout = 6000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw Error("Timed out waiting for match state");
    await sleep(20);
  }
}
const { server, http } = createFootballServer();
const sessions = [];
try {
  await server.listen(0, "127.0.0.1");
  const endpoint = "http://127.0.0.1:" + http.address().port;
  assert.equal((await fetch(endpoint + "/health")).status, 200);
  const page = await fetch(endpoint + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ONLINE 1V1/);
  const host = await RoomSession.connect({ endpoint, name: "Host" });
  sessions.push(host);
  host.start();
  const guest = await RoomSession.connect({
    action: "join",
    code: host.code,
    endpoint,
    name: "Guest",
  });
  sessions.push(guest);
  guest.start();
  assert.equal(host.slot, 0);
  assert.equal(guest.slot, 1);
  assert.match(host.code, /^[A-Z2-9]{7}$/);
  await assert.rejects(
    new Client(endpoint).joinById(host.code, { name: "Third" }),
  );
  host.ready();
  await sleep(100);
  assert.equal(host.room.stage, "lobby");
  guest.ready();
  await until(
    () => host.room.stage === "playing" && guest.room.stage === "playing",
  );
  guest.send({ type: "snap" });
  await until(() => guest.room.ack === 1);
  assert.equal(host.state.phase, "ready");
  host.send({ type: "snap" });
  await until(() => guest.state.phase === "live");
  const clock = host.raw.clock;
  host.update({ x: -1, y: 0, sprint: false });
  guest.update({ x: 0, y: 1, sprint: false });
  await until(() => host.raw.clock < clock - 0.25);
  assert.equal(host.room.inputs[0].x, -1);
  assert.equal(host.room.inputs[1].y, 1);
  host.stop();
  guest.stop();
  const autonomousClock = host.raw.clock;
  await sleep(150);
  assert.ok(
    host.raw.clock < autonomousClock,
    "server keeps simulating without input messages",
  );
  host.start();
  guest.start();
  const saved = {
    code: guest.code,
    token: guest.socketRoom.reconnectionToken,
    slot: 1,
  };
  guest.stop();
  guest.socketRoom.reconnection.enabled = false;
  guest.socketRoom.connection.close(1000);
  await until(() => host.room.stage === "paused");
  await assert.rejects(
    new Client(endpoint).joinById(host.code, { name: "Seat thief" }),
  );
  const pausedClock = host.raw.clock;
  await sleep(100);
  assert.equal(host.raw.clock, pausedClock);
  const resumed = RoomSession.restore(saved, { endpoint });
  sessions.push(resumed);
  resumed.active = true;
  await resumed.poll();
  resumed.stop();
  resumed.start();
  assert.equal(resumed.slot, 1);
  assert.equal(resumed.socketRoom.sessionId, guest.socketRoom.sessionId);
  assert.notEqual(resumed.socketRoom.reconnectionToken, saved.token);
  await until(() => host.room.stage === "playing");
  assert.equal(resumed.raw.score, host.raw.score);
  const beforeAutomatic = host.socketRoom.reconnectionToken;
  const liveRoom = matchMaker.getLocalRoomById(host.code);
  liveRoom.clients
    .find((client) => client.sessionId === host.socketRoom.sessionId)
    .ref.terminate();
  await until(() => host.disconnected);
  await until(() => !host.disconnected && host.room.stage === "playing");
  assert.notEqual(host.socketRoom.reconnectionToken, beforeAutomatic);
  // Test fixture ends a match on the server, then exercises rematch over sockets.
  liveRoom.model.game.phase = "final";
  liveRoom.model.game.score = 21;
  await until(
    () => host.room.stage === "finished" && resumed.room.stage === "finished",
  );
  host.rematch();
  resumed.rematch();
  await until(() => host.room.round === 2 && resumed.room.round === 2);
  assert.equal(host.raw.score, 0);
  assert.equal(resumed.raw.score, 0);
  console.log(
    "WebSocket integration passed: built assets, two slots, ready, ownership, continuous simulation, both inputs, reserved seats, refresh and automatic reconnect, rotated tokens and rematch.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const s of sessions) {
    s.stop();
    s.socketRoom && (s.socketRoom.reconnection.enabled = false);
    try {
      if (s.socketRoom?.connection.isOpen) await s.socketRoom.leave();
    } catch {}
  }
  await server.gracefullyShutdown(false);
}
