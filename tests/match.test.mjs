import test from "node:test";
import assert from "node:assert/strict";
import {
  createMatch,
  addPlayer,
  sync,
  advance,
  connection,
  finish,
  snapshotFor,
} from "../apps/server/src/match.ts";

function pair() {
  const m = createMatch("ABCDEFG", 0);
  addPlayer(m, "host", "Coach", 0);
  addPlayer(m, "guest", "Rival", 0);
  return m;
}
function started() {
  const m = pair();
  sync(m, 0, { ready: true }, 0);
  sync(m, 1, { ready: true }, 0);
  advance(m, 1800);
  return m;
}
test("rooms allocate exactly two slots and require both ready", () => {
  const m = pair();
  assert.throws(() => addPlayer(m, "third", "Third"), /two players/);
  sync(m, 0, { ready: true }, 0);
  assert.equal(m.stage, "lobby");
  sync(m, 1, { ready: true }, 0);
  assert.equal(m.stage, "countdown");
  advance(m, 1800);
  assert.equal(m.stage, "playing");
});
test("only the offense can snap and commands cannot replay", () => {
  const m = started();
  sync(m, 1, { commands: [{ type: "snap", seq: 1 }] }, 1800);
  assert.equal(m.game.phase, "ready");
  sync(m, 0, { commands: [{ type: "snap", seq: 1 }] }, 1800);
  assert.equal(m.game.phase, "live");
  sync(m, 0, { commands: [{ type: "throwAway", seq: 2 }] }, 1801);
  const down = m.game.down;
  sync(m, 0, { commands: [{ type: "throwAway", seq: 2 }] }, 1802);
  assert.equal(m.game.down, down);
  assert.equal(m.players[0].commandAck, 2);
});
test("server clock advances without requests from either browser", () => {
  const m = started();
  sync(m, 0, { commands: [{ type: "snap", seq: 1 }] }, 1800);
  const clock = m.game.clock;
  for (let now = 1817; now < 2100; now += 17) advance(m, now);
  assert.ok(m.game.clock < clock - 0.2);
});
test("movement is independently validated and sequence numbers cannot go backwards", () => {
  const m = started();
  sync(m, 0, { input: { x: 1, y: 0, sprint: true, seq: 100 } }, 1800);
  sync(m, 1, { input: { x: 0, y: 1, sprint: false, seq: 1 } }, 1800);
  sync(m, 0, { input: { x: -1, y: 0, sprint: false, seq: 99 } }, 1801);
  assert.equal(m.players[0].input.x, 1);
  assert.equal(m.players[1].input.y, 1);
  assert.throws(
    () => sync(m, 0, { input: { x: 2, y: 0, sprint: false, seq: 101 } }),
    /movement/,
  );
  assert.equal(snapshotFor(m, 0).inputAck, 100);
});
test("a stale movement packet stops driving the quarterback", () => {
  const m = started();
  sync(
    m,
    0,
    {
      input: { x: -1, y: 0, sprint: false, seq: 1 },
      commands: [{ type: "snap", seq: 1 }],
    },
    1800,
  );
  for (let now = 1817; now < 2300; now += 17) advance(m, now);
  const qb = m.game.players.find((p) => p.id === "qb"),
    x = qb.x;
  for (let now = 2300; now < 2500; now += 17) advance(m, now);
  assert.ok(
    Math.abs(qb.x - x) < 0.05,
    "expired input must not keep moving the QB",
  );
});
test("invalid actions reject before altering any state", () => {
  const m = started(),
    prior = structuredClone(m);
  assert.throws(
    () => sync(m, 0, { ready: true, commands: [{ seq: 1, type: "score" }] }),
    /action/,
  );
  assert.deepEqual(m, prior);
  assert.throws(
    () =>
      sync(m, 0, { commands: [{ seq: 1, type: "throw", x: Infinity, y: 2 }] }),
    /target/,
  );
});
test("client-supplied scores and state are ignored", () => {
  const m = started();
  sync(m, 0, { score: 999, game: { phase: "final", score: 999 } }, 1801);
  assert.equal(m.game.score, 0);
  assert.equal(m.game.phase, "ready");
});
test("a disconnect pauses the clock; reconnect restores the same slot", () => {
  const m = started();
  sync(m, 0, { commands: [{ type: "snap", seq: 1 }] }, 1800);
  connection(m, 1, false, 1900);
  const clock = m.game.clock;
  advance(m, 2900);
  assert.equal(m.game.clock, clock);
  assert.equal(m.stage, "paused");
  connection(m, 1, true, 3000);
  assert.equal(m.stage, "countdown");
  advance(m, 4000);
  assert.equal(m.stage, "playing");
  assert.equal(m.players[1].sessionId, "guest");
});
test("expired reconnect awards a forfeit to the connected player", () => {
  const m = started();
  connection(m, 0, false, 2000);
  advance(m, 47000);
  assert.equal(m.stage, "finished");
  assert.equal(m.winner, 1);
});
test("both players vote for rematch and retain action sequences", () => {
  const m = started();
  m.players[0].commandAck = 12;
  finish(m, 0, "WIN");
  sync(m, 0, { rematch: true }, 2000);
  assert.equal(m.stage, "finished");
  sync(m, 1, { rematch: true }, 2000);
  assert.equal(m.stage, "countdown");
  assert.equal(m.round, 2);
  assert.equal(m.players[0].commandAck, 12);
  assert.equal(m.game.score, 0);
});
test("snapshots never expose session IDs and guest perspective owns its score", async () => {
  const m = started();
  m.game.opponentScore = 7;
  const snapshot = snapshotFor(m, 1);
  assert.equal(JSON.stringify(snapshot).includes("sessionId"), false);
  const { projectGame } = await import("../apps/client/src/prediction.js");
  assert.equal(projectGame(snapshot.game, 1).score, 7);
  assert.equal(m.game.score, 0);
});
