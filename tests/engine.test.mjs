import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  command,
  step,
  snapshot,
  LocalSession,
} from "../packages/game/src/engine.js";
test("fresh game starts on the 25 with 10 yards to gain", () => {
  const s = createGame();
  assert.equal(s.spot, 25);
  assert.equal(s.firstDown, 35);
  assert.equal(s.down, 1);
  assert.equal(s.players.length, 22);
});
test("same seed and commands produce identical states", () => {
  const a = createGame(910),
    b = createGame(910);
  for (const s of [a, b]) {
    command(s, { type: "snap" });
    for (let i = 0; i < 160; i++) step(s, { x: i < 80 ? -1 : 1, y: 0 });
    command(s, { type: "throw", receiver: 0 });
    for (let i = 0; i < 200; i++) step(s, { x: 1, y: -0.2 });
  }
  assert.deepEqual(a, b);
});
test("a touchdown awards 7 points and ends the possession", () => {
  const s = createGame();
  command(s, { type: "snap" });
  s.players[0].x = 100;
  step(s);
  assert.equal(s.score, 7);
  assert.equal(s.phase, "dead");
  assert.equal(s.possessionEnded, true);
  assert.equal(s.stats.touchdowns, 1);
  command(s, { type: "next" });
  assert.equal(s.spot, 25);
  assert.equal(s.down, 1);
});
test("crossing the line to gain resets downs", () => {
  const s = createGame();
  command(s, { type: "snap" });
  s.players[0].x = 38;
  s.players[0].y = 0;
  step(s);
  assert.equal(s.down, 1);
  assert.equal(s.spot, 38);
  assert.equal(s.firstDown, 48);
});
test("four incomplete passes turn over possession", () => {
  const s = createGame();
  for (let i = 0; i < 4; i++) {
    command(s, { type: "snap" });
    command(s, { type: "throw", x: 95, y: 52 });
    for (let t = 0; t < 300 && s.phase === "live"; t++) step(s);
    assert.equal(s.phase, "dead");
    if (i < 3) command(s, { type: "next" });
  }
  assert.equal(s.possessionEnded, true);
  assert.equal(s.message, "TURNOVER ON DOWNS.");
  assert.equal(s.stats.attempts, 4);
});
test("only one forward pass and only behind the line", () => {
  const s = createGame();
  command(s, { type: "snap" });
  s.players[0].x = 28;
  command(s, { type: "throw", receiver: 0 });
  assert.equal(s.ball, null);
  s.players[0].x = 20;
  command(s, { type: "throw", receiver: 0 });
  assert.ok(s.ball);
  command(s, { type: "throw", receiver: 1 });
  assert.equal(s.stats.attempts, 1);
});
test("juke has a cooldown, snapshots are isolated", () => {
  const s = createGame();
  command(s, { type: "snap" });
  command(s, { type: "juke" });
  assert.equal(s.juke, 0.3);
  step(s);
  const remaining = s.juke;
  command(s, { type: "juke" });
  assert.equal(s.juke, remaining);
  const copy = snapshot(s);
  copy.players[0].x = 999;
  assert.notEqual(s.players[0].x, 999);
});
test("winning score ends game", () => {
  const s = createGame();
  s.score = 14;
  command(s, { type: "snap" });
  s.players[0].x = 100;
  step(s);
  assert.equal(s.score, 21);
  assert.equal(s.phase, "final");
});
test("snapshot round trip preserves simulation", () => {
  const a = new LocalSession(71);
  a.send({ type: "snap" });
  a.update({ x: 1 });
  const b = new LocalSession();
  b.restore(a.getSnapshot());
  for (let i = 0; i < 120; i++) {
    a.update({ x: 1 });
    b.update({ x: 1 });
  }
  assert.deepEqual(a.state, b.state);
});
test("run play gives control to runner and disables forward passes", () => {
  const s = createGame();
  command(s, { type: "select", play: "sweep" });
  command(s, { type: "snap" });
  assert.equal(s.carrier, "qb");
  for (let i = 0; i < 35; i++) step(s);
  assert.equal(s.carrier, "rb");
  command(s, { type: "throw", receiver: 0 });
  assert.equal(s.ball, null);
});
test("eleven players per side with a back, five linemen, and deep safety help", () => {
  const s = createGame();
  assert.equal(s.players.filter((p) => p.team === 0).length, 11);
  assert.equal(s.players.filter((p) => p.team === 1).length, 11);
  assert.equal(s.players.filter((p) => p.role === "OL").length, 5);
  assert.equal(s.players.filter((p) => p.role === "RB").length, 1);
  assert.equal(s.players.filter((p) => p.role === "S").length, 2);
});
test("selecting a play cannot reroll the defense", () => {
  const s = createGame(971);
  const d = s.defense,
    alignment = snapshot(s).players.filter((p) => p.team === 1);
  command(s, { type: "select", play: "inside" });
  command(s, { type: "select", play: "screen" });
  assert.equal(s.defense, d);
  assert.deepEqual(
    s.players.filter((p) => p.team === 1),
    alignment,
  );
});
test("running back handoff animates before control changes and records one rush", () => {
  const s = createGame();
  command(s, { type: "select", play: "inside" });
  command(s, { type: "snap" });
  for (let i = 0; i < 20; i++) step(s);
  assert.equal(s.carrier, "qb");
  for (let i = 0; i < 15; i++) step(s);
  assert.equal(s.carrier, "rb");
  assert.equal(s.stats.rushes, 1);
  assert.equal(s.passThrown, true);
});
test("screen pass can reach a real running back", () => {
  const s = createGame(9137);
  command(s, { type: "select", play: "screen" });
  command(s, { type: "snap" });
  for (let i = 0; i < 75; i++) step(s);
  command(s, { type: "throw", receiver: 4 });
  assert.ok(s.ball);
  for (let i = 0; i < 100 && s.carrier === null; i++) step(s);
  assert.equal(s.carrier, "rb");
  assert.equal(s.stats.completions, 1);
  assert.equal(s.stats.rushes, 0);
});
test("sprinting consumes stamina and a juke affects only nearby defenders", () => {
  const s = createGame();
  command(s, { type: "snap" });
  step(s, { x: -1, sprint: true });
  assert.ok(s.stamina < 100);
  const near = s.players.find((p) => p.id === "e0"),
    far = s.players.find((p) => p.id === "s1");
  near.x = s.players[0].x + 2;
  near.y = s.players[0].y;
  command(s, { type: "juke" });
  assert.ok(near.stun > 0);
  assert.equal(far.stun, 0);
  assert.ok(s.stamina < 83);
});
test("defensive rush eventually sacks an idle quarterback", () => {
  const s = createGame(192939);
  command(s, { type: "snap" });
  for (let i = 0; i < 900 && s.phase === "live"; i++) step(s);
  assert.equal(s.stats.sacks, 1);
  assert.ok(s.lastGain < 0);
});
test("crossing the line commits a QB to the run", () => {
  const s = createGame();
  command(s, { type: "snap" });
  s.players[0].x = s.spot + 0.1;
  step(s);
  s.players[0].x = s.spot - 1;
  command(s, { type: "throw", receiver: 0 });
  assert.equal(s.ball, null);
  assert.equal(s.stats.rushes, 1);
});
test("throw away costs a down and leaves the spot unchanged", () => {
  const s = createGame();
  command(s, { type: "snap" });
  command(s, { type: "throwAway" });
  assert.equal(s.phase, "dead");
  assert.equal(s.down, 2);
  assert.equal(s.spot, 25);
  assert.equal(s.stats.attempts, 1);
});
test("run blocking creates engagements and normal straight runs do not become free touchdowns", () => {
  for (const play of ["inside", "sweep", "draw"]) {
    const s = createGame(48271);
    command(s, { type: "select", play });
    command(s, { type: "snap" });
    let engaged = false;
    for (let i = 0; i < 1100 && s.phase === "live"; i++) {
      step(s);
      engaged ||= s.blocks.length > 0;
    }
    assert.ok(engaged, play);
    assert.equal(s.phase, "dead");
    assert.equal(s.score, 0);
    assert.ok(s.lastGain > -5, play);
  }
});
test("player starts promptly and reverses direction without a long windup", () => {
  const s = createGame();
  command(s, { type: "snap" });
  const qb = s.players[0],
    topSpeed = qb.speed * 1.1;
  for (let i = 0; i < 7; i++) step(s, { x: -1 });
  assert.ok(qb.vx < -topSpeed * 0.9, "reach 90% speed within 117ms");
  for (let i = 0; i < 7; i++) step(s, { x: 1 });
  assert.ok(qb.vx > topSpeed * 0.8, "reverse within 117ms");
});
test("releasing QB movement brakes promptly instead of sliding", () => {
  const s = createGame();
  command(s, { type: "snap" });
  const qb = s.players[0];
  for (let i = 0; i < 8; i++) step(s, { x: -1 });
  const x = qb.x;
  for (let i = 0; i < 6; i++) step(s, {});
  assert.ok(Math.abs(qb.vx) < 0.25);
  assert.ok(Math.abs(qb.x - x) < 0.18);
});
test("diagonal player input has the same speed cap as straight input", () => {
  const a = createGame(55),
    b = createGame(55);
  command(a, { type: "snap" });
  command(b, { type: "snap" });
  for (let i = 0; i < 12; i++) {
    step(a, { x: -1 });
    step(b, { x: -1, y: -1 });
  }
  assert.ok(
    Math.abs(
      Math.hypot(a.players[0].vx, a.players[0].vy) -
        Math.hypot(b.players[0].vx, b.players[0].vy),
    ) < 0.0001,
  );
});
function cpuGame(seed = 42) {
  const s = createGame(seed);
  s.phase = "dead";
  s.possessionEnded = true;
  s.nextPossessionSpot = 25;
  command(s, { type: "next" });
  return s;
}
test("possession changes into a real CPU drive without awarding random points", () => {
  const s = createGame();
  command(s, { type: "snap" });
  s.players[0].x = 100;
  step(s);
  command(s, { type: "next" });
  assert.equal(s.possession, 1);
  assert.equal(s.opponentScore, 0);
  assert.equal(s.phase, "ready");
  assert.equal(s.spot, 25);
  assert.equal(s.selectedDefender, "l1");
});
test("a fourth-down stop preserves the actual turnover spot", () => {
  const s = createGame();
  s.spot = 41;
  s.firstDown = 51;
  s.down = 4;
  command(s, { type: "snap" });
  command(s, { type: "throwAway" });
  assert.equal(s.nextPossessionSpot, 59);
  command(s, { type: "next" });
  assert.equal(s.possession, 1);
  assert.equal(s.spot, 59);
  assert.equal(s.firstDown, 69);
  assert.equal(s.down, 1);
});
test("punts change field position and never fabricate a score", () => {
  const s = createGame();
  s.down = 4;
  command(s, { type: "punt" });
  const receivingSpot = s.nextPossessionSpot;
  assert.ok(receivingSpot >= 31 && receivingSpot <= 39);
  command(s, { type: "next" });
  assert.equal(s.possession, 1);
  assert.equal(s.spot, receivingSpot);
  assert.equal(s.opponentScore, 0);
});
test("CPU touchdowns are credited to Portland and its own box score", () => {
  const s = cpuGame();
  s.play = "slants";
  command(s, { type: "snap" });
  s.players[0].x = 100;
  step(s);
  assert.equal(s.score, 0);
  assert.equal(s.opponentScore, 7);
  assert.equal(s.opponentStats.touchdowns, 1);
  assert.equal(s.stats.touchdowns, 0);
  command(s, { type: "next" });
  assert.equal(s.possession, 0);
  assert.equal(s.spot, 25);
});
test("the human cannot call plays or throw for the opposing offense", () => {
  const s = cpuGame();
  const play = s.play;
  command(s, { type: "select", play: "screen" });
  assert.equal(s.play, play);
  command(s, { type: "snap" });
  command(s, { type: "throw", receiver: 0 });
  command(s, { type: "throwAway" });
  assert.equal(s.opponentStats.attempts, 0);
  assert.equal(s.phase, "live");
});
test("user defensive movement uses the responsive controller and leaves CPU movement independent", () => {
  const a = cpuGame(571),
    b = cpuGame(571);
  command(a, { type: "snap" });
  command(b, { type: "snap" });
  for (let i = 0; i < 8; i++) {
    step(a, { x: 1 });
    step(b, { x: -1 });
  }
  const da = a.players.find((p) => p.id === a.selectedDefender),
    db = b.players.find((p) => p.id === b.selectedDefender);
  assert.ok(da.vx > 7);
  assert.ok(db.vx < -7);
  assert.equal(a.players[0].x, b.players[0].x);
});
test("Q selects the defender closest to the carrier and direct selection validates team", () => {
  const s = cpuGame();
  const qb = s.players[0],
    d = s.players.find((p) => p.id === "c0");
  d.x = qb.x + 0.3;
  d.y = qb.y;
  command(s, { type: "switch" });
  assert.equal(s.selectedDefender, "c0");
  command(s, { type: "selectDefender", id: "rb" });
  assert.equal(s.selectedDefender, "c0");
  command(s, { type: "selectDefender", id: "s1" });
  assert.equal(s.selectedDefender, "s1");
});
test("coverage choices survive the next CPU play", () => {
  const s = cpuGame();
  command(s, { type: "selectDefense", defense: "blitz" });
  assert.equal(s.defense, "blitz");
  command(s, { type: "snap" });
  s.players[0].y = 0;
  step(s);
  command(s, { type: "next" });
  assert.equal(s.possession, 1);
  assert.equal(s.defense, "blitz");
});
test("a timed defensive dive can sack the quarterback", () => {
  const s = cpuGame();
  s.play = "slants";
  command(s, { type: "snap" });
  s.elapsed = 1;
  s.aiThrowAt = 99;
  const qb = s.players[0];
  for (const d of s.players.filter((p) => p.team === 1)) {
    d.stun = 99;
  }
  const d = s.players.find((p) => p.id === "c0");
  d.stun = 0;
  d.x = qb.x + 2;
  d.y = qb.y;
  s.selectedDefender = "c0";
  command(s, { type: "tackle" });
  assert.ok(d.diveTime > 0);
  for (let i = 0; i < 12 && s.phase === "live"; i++) step(s);
  assert.equal(s.phase, "dead");
  assert.equal(s.defenseStats.sacks, 1);
  assert.equal(s.opponentStats.sacks, 1);
  assert.equal(s.stats.sacks, 0);
});
test("missing a dive has recovery and a cooldown", () => {
  const s = cpuGame();
  command(s, { type: "snap" });
  s.selectedDefender = "s1";
  const d = s.players.find((p) => p.id === "s1");
  command(s, { type: "tackle" });
  for (let i = 0; i < 18; i++) step(s);
  assert.equal(d.diveTime, 0);
  assert.ok(d.stun > 0);
  assert.ok(s.tackleCooldown > 0);
  const energy = s.stamina;
  command(s, { type: "tackle" });
  assert.equal(s.stamina, energy);
});
test("defensive interception uses the catch spot for the next possession", () => {
  const s = cpuGame();
  s.play = "slants";
  command(s, { type: "snap" });
  s.carrier = null;
  s.passThrown = true;
  for (const p of s.players) {
    p.x = 1;
    p.y = 2;
    p.vx = 0;
    p.vy = 0;
  }
  s.ball = {
    x: 55,
    y: 27,
    fromX: 21,
    fromY: 27,
    toX: 55,
    toY: 27,
    t: 0.27,
    duration: 0.28,
  };
  const d = s.players.find((p) => p.id === "c0");
  d.x = 55;
  d.y = 27;
  s.selectedDefender = "c0";
  step(s);
  assert.equal(s.phase, "dead");
  assert.equal(s.defenseStats.picks, 1);
  assert.equal(s.opponentStats.interceptions, 1);
  assert.equal(s.nextPossessionSpot, 45);
  command(s, { type: "next" });
  assert.equal(s.possession, 0);
  assert.equal(s.spot, 45);
});
test("CPU chooses and executes passing and running plays rather than abstract scores", () => {
  let attempts = 0,
    rushes = 0;
  for (let i = 1; i <= 16; i++) {
    const s = cpuGame(Math.imul(i, 2654435761) >>> 0);
    command(s, { type: "snap" });
    for (let t = 0; t < 1100 && s.phase === "live"; t++) step(s);
    assert.notEqual(s.phase, "live");
    attempts += s.opponentStats.attempts;
    rushes += s.opponentStats.rushes;
    assert.equal(s.stats.attempts, 0);
  }
  assert.ok(attempts > 0);
  assert.ok(rushes > 0);
});
test("CPU fourth-and-long produces an actual punt and a defensive stop", () => {
  const s = cpuGame();
  s.down = 4;
  s.spot = 30;
  s.firstDown = 41;
  command(s, { type: "snap" });
  assert.equal(s.phase, "dead");
  assert.equal(s.defenseStats.stops, 1);
  command(s, { type: "next" });
  assert.equal(s.possession, 0);
  assert.equal(s.down, 1);
});
test("snapshot replay on defense preserves CPU decisions, control, and stats", () => {
  const a = new LocalSession();
  a.restore(cpuGame(731));
  a.send({ type: "snap" });
  for (let i = 0; i < 70; i++) a.update({ x: -1, y: 0.4 });
  const b = new LocalSession();
  b.restore(a.getSnapshot());
  for (let i = 0; i < 180; i++) {
    a.update({ x: -1, y: 0.3 });
    b.update({ x: -1, y: 0.3 });
  }
  assert.deepEqual(a.state, b.state);
});
test("a full match reaches a final result through real drives and clock runoff", () => {
  const s = createGame(192971),
    seen = new Set();
  let plays = 0;
  while (s.phase !== "final" && plays < 150) {
    seen.add(s.possession);
    if (s.phase === "dead") {
      command(s, { type: "next" });
      continue;
    }
    if (s.phase === "ready") {
      if (s.possession === 0)
        command(s, {
          type: "select",
          play: plays % 3 === 0 ? "inside" : "slants",
        });
      command(s, { type: "snap" });
      plays++;
    }
    for (let i = 0; i < 1100 && s.phase === "live"; i++) {
      if (s.possession === 0 && i === 80)
        command(s, { type: "throw", receiver: 0 });
      step(s, s.possession === 0 && s.carrier !== "qb" ? { x: 1 } : {});
    }
  }
  assert.equal(seen.size, 2);
  assert.equal(s.phase, "final");
  assert.ok(s.opponentStats.attempts + s.opponentStats.rushes > 0);
  assert.ok(s.clock >= 0);
  assert.ok(
    s.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  );
});
test("switching prefers a nearby free defender over a closer blocked defender", () => {
  const s = cpuGame();
  const qb = s.players[0],
    blocked = s.players.find((p) => p.id === "c0"),
    free = s.players.find((p) => p.id === "c1");
  blocked.x = qb.x + 0.3;
  blocked.y = qb.y;
  blocked.blocked = true;
  free.x = qb.x + 2.7;
  free.y = qb.y;
  command(s, { type: "switch" });
  assert.equal(s.selectedDefender, "c1");
});
test("CPU cuts cannot stun a diving user defender or freeze multiple teammates", () => {
  const s = cpuGame();
  s.play = "inside";
  command(s, { type: "snap" });
  s.elapsed = 1.3;
  s.handoff = 0;
  s.carrier = "rb";
  s.rushAttempt = true;
  s.seed = 10000;
  s.aiNextRead = 0;
  const rb = s.players.find((p) => p.id === "rb");
  rb.x = 27;
  rb.y = 27;
  for (const d of s.players.filter((p) => p.team === 1)) {
    d.x = 70;
    d.y = 5;
    d.vx = 0;
    d.vy = 0;
  }
  const user = s.players.find((p) => p.id === "l1"),
    other = s.players.find((p) => p.id === "c0");
  user.x = 29.5;
  user.y = 27;
  user.diveTime = 0.1;
  user.diveX = -1;
  user.diveY = 0;
  other.x = 29;
  other.y = 27;
  step(s);
  assert.equal(user.stun, 0);
  assert.ok(s.players.filter((p) => p.team === 1 && p.stun > 0).length <= 1);
});
test("CPU runs no longer have a five-yard floor against the base defense", () => {
  for (const play of ["inside", "sweep", "draw"]) {
    const gains = [];
    for (let i = 1; i <= 24; i++) {
      const s = cpuGame(Math.imul(i, 2654435761) >>> 0);
      s.play = play;
      command(s, { type: "selectDefense", defense: "cover2" });
      command(s, { type: "snap" });
      for (let t = 0; t < 1100 && s.phase === "live"; t++) step(s);
      assert.equal(s.phase, "dead");
      gains.push(s.lastGain);
    }
    const average = gains.reduce((a, b) => a + b, 0) / gains.length;
    assert.ok(average < 5.5, `${play}: average ${average}`);
    assert.ok(
      gains.some((g) => g < 5),
      `${play}: every carry gained 5+`,
    );
    assert.ok(
      gains.every((g) => g < 75),
      `${play}: automatic touchdown`,
    );
  }
});

test("line matchups move both players forward or backward according to rush strength", () => {
  for (const strength of [0.82, 1.18]) {
    const s = createGame(42);
    command(s, { type: "snap" });
    const blocker = s.players.find((p) => p.id === "b0");
    const rusher = s.players.find((p) => p.id === "e0");
    blocker.x = 24;
    blocker.y = rusher.y = 21;
    rusher.x = 25.25;
    rusher.strength = strength;
    for (let i = 0; i < 12; i++) step(s);
    assert.ok(s.blocks.some(([b, d]) => b === "b0" && d === "e0"));
    if (strength > 1) {
      assert.ok(blocker.x < 23.9, "strong rush drives the blocker backward");
      assert.ok(rusher.x < 25.15, "rusher advances with the collapsing pocket");
    } else {
      assert.ok(blocker.x > 24.1, "offensive win gains ground");
      assert.ok(rusher.x > 25.35, "weaker rusher is pushed back");
    }
    assert.ok(
      Math.hypot(blocker.x - rusher.x, blocker.y - rusher.y) >= 1.24,
      "engaged players do not overlap",
    );
  }
});

test("engaged defensive linemen shed and penetrate the pocket across seeded matchups", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = createGame(seed);
    command(s, { type: "snap" });
    const engaged = new Set();
    let penetrated = false;
    for (let i = 0; i < 600 && s.phase === "live"; i++) {
      step(s);
      for (const [bid, did] of s.blocks)
        if (bid.startsWith("b") && did.startsWith("e")) engaged.add(did);
      penetrated ||= s.players.some(
        (p) => engaged.has(p.id) && !p.blocked && p.x < s.spot - 1,
      );
    }
    assert.ok(
      penetrated,
      `seed ${seed}: a previously blocked lineman breaks through`,
    );
    assert.equal(s.stats.sacks, 1, `seed ${seed}: idle QB can be sacked`);
    assert.ok(s.elapsed > 2, "pass protection provides time to make a play");
  }
});
