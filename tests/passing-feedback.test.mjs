import test from "node:test";
import assert from "node:assert/strict";
import {
  receiverRead,
  pointerPassTarget,
} from "../apps/client/src/passing-feedback.js";
import { createGame, command, passPlan } from "../packages/game/src/engine.js";

test("coverage reads distinguish open, tight, and covered without counting disabled defenders", () => {
  const receiver = { x: 20, y: 20, eligible: true, number: 1 };
  const defender = { team: 1, x: 25, y: 20, stun: 0 };
  const s = { players: [receiver, defender] };
  assert.equal(receiverRead(s, receiver).label, "OPEN");
  defender.x = 23;
  assert.equal(receiverRead(s, receiver).label, "TIGHT");
  defender.x = 21;
  assert.equal(receiverRead(s, receiver).label, "COVERED");
  defender.blocked = true;
  assert.equal(receiverRead(s, receiver).label, "OPEN");
  defender.blocked = false;
  defender.stun = 0.2;
  assert.equal(receiverRead(s, receiver).label, "OPEN");
});

test("quick receiver clicks preview the same assisted target that is thrown", () => {
  const s = createGame(42);
  command(s, { type: "snap" });
  const receiver = s.players.find((p) => p.id === "r0");
  const before = structuredClone(s);
  const point = { x: receiver.x, y: receiver.y };
  const click = {
    mode: "point",
    start: { x: 10, y: 10 },
    current: { x: 12, y: 10 },
  };
  const target = pointerPassTarget(s, point, click);
  assert.deepEqual(target, { receiver: 0 });
  const plan = passPlan(s, target, "lob");
  assert.deepEqual(
    s,
    before,
    "feedback must not change simulation or randomness",
  );
  command(s, { type: "throw", ...target, style: "lob" });
  assert.ok(Math.abs(s.ball.toX - plan.x) < 0.1);
  assert.ok(Math.abs(s.ball.toY - plan.y) < 0.1);
});

test("dragging keeps the ground target and an unpulled QB gesture has no target", () => {
  const s = createGame(42),
    r = s.players.find((p) => p.id === "r0");
  const point = { x: r.x, y: r.y };
  const drag = {
    mode: "point",
    start: { x: 10, y: 10 },
    current: { x: 30, y: 10 },
  };
  assert.deepEqual(pointerPassTarget(s, point, drag), point);
  assert.equal(
    pointerPassTarget(s, point, { ...drag, mode: "pull", current: drag.start }),
    null,
  );
  assert.equal(pointerPassTarget(s, null), null);
});
