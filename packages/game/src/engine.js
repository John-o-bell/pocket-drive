import { DT, PASS_TYPES, PLAYS, DEFENSES, DEFENSE_CALLS } from "./config.js";
export { DT, PASS_TYPES, PLAYS, DEFENSES, DEFENSE_CALLS } from "./config.js";
// Pure, fixed-step simulation. No DOM, wall clock, network, or global randomness.

export function passHeight(ball) {
  const t = clamp(ball.t / ball.duration, 0, 1);
  return (
    1 + Math.sin(Math.PI * t) * (PASS_TYPES[ball.style || "bullet"]?.arc ?? 1.6)
  );
}

const TUNING = {
  easy: { speed: -0.6, reaction: 0.42, hold: 0.65 },
  normal: { speed: 0, reaction: 0.28, hold: 0 },
  hard: { speed: 0.45, reaction: 0.17, hold: -0.4 },
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function humanOffense(s) {
  return s.mode === "online" || s.possession === 0;
}
function humanDefense(s) {
  return s.mode === "online" || s.possession === 1;
}
function defenseStats(s) {
  return s.mode === "online"
    ? s.defenseByTeam[1 - s.possession]
    : s.defenseStats;
}
function defenseEnergy(s) {
  return s.mode === "online" ? s.defenseStamina : s.stamina;
}
function setDefenseEnergy(s, value) {
  if (s.mode === "online") s.defenseStamina = value;
  else s.stamina = value;
}
function offenseStats(s) {
  return s.possession === 0 ? s.stats : s.opponentStats;
}
function award(s, team, points) {
  if (team === 0) s.score += points;
  else s.opponentScore += points;
}
function rand(s) {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function createGame(seed = 42, difficulty = "normal", mode = "solo") {
  const s = {
    version: 5,
    mode,
    seed: seed >>> 0,
    tick: 0,
    phase: "ready",
    possession: 0,
    defenseCall: "cover2",
    defenseCalls: ["cover2", "cover2"],
    selectedDefender: "l1",
    nextPossessionSpot: 25,
    difficulty,
    score: 0,
    opponentScore: 0,
    drive: 1,
    spot: 25,
    firstDown: 35,
    down: 1,
    play: "slants",
    players: [],
    carrier: "qb",
    ball: null,
    elapsed: 0,
    clock: 180,
    quarter: 1,
    message: "YOUR DRIVE. YOUR CALL.",
    detail: "Start at your 25. Move the chains.",
    eventId: 0,
    stats: {
      yards: 0,
      attempts: 0,
      completions: 0,
      touchdowns: 0,
      interceptions: 0,
      rushes: 0,
      rushYards: 0,
      sacks: 0,
    },
    opponentStats: {
      yards: 0,
      attempts: 0,
      completions: 0,
      touchdowns: 0,
      interceptions: 0,
      rushes: 0,
      rushYards: 0,
      sacks: 0,
    },
    defenseStats: { tackles: 0, sacks: 0, picks: 0, stops: 0, breakups: 0 },
    defenseByTeam: [
      { tackles: 0, sacks: 0, picks: 0, stops: 0, breakups: 0 },
      { tackles: 0, sacks: 0, picks: 0, stops: 0, breakups: 0 },
    ],
    lastGain: 0,
    juke: 0,
    jukeCooldown: 0,
    passThrown: false,
    log: [],
  };
  formation(s);
  return s;
}
function formation(s, chooseDefense = true) {
  const x = s.spot;
  if (chooseDefense) {
    if (!humanOffense(s)) s.play = chooseCpuPlay(s);
    s.defense =
      s.mode === "online"
        ? s.defenseCalls[1 - s.possession]
        : s.possession === 1
          ? s.defenseCall
          : ["cover2", "cover3", "man", "blitz"][Math.floor(rand(s) * 4)];
    s.alignmentSeed = Math.floor(rand(s) * 4294967295);
  }
  const make = (id, team, role, px, y, speed, extra = {}) => ({
    id,
    team,
    role,
    x: px,
    y,
    speed,
    vx: 0,
    vy: 0,
    startX: px,
    startY: y,
    routeIndex: 0,
    stun: 0,
    diveTime: 0,
    swatWindow: 0,
    pickWindow: 0,
    blockTime: 0,
    shedUntil: 0,
    ...extra,
  });
  s.players = [
    make("qb", 0, "QB", x - 4, 27, 6.5),
    make("rb", 0, "RB", x - 7, 30, 8.4, { number: 5, eligible: true }),
    ...[7, 46, 16, 34].map((y, i) =>
      make(
        "r" + i,
        0,
        i === 3 ? "TE" : "WR",
        x - (i === 2 ? 1.5 : 0.6),
        y,
        i === 3 ? 7.9 : 8.5,
        { number: i + 1, eligible: true },
      ),
    ),
    ...[21, 24, 27, 30, 33].map((y, i) =>
      make("b" + i, 0, "OL", x - 0.9, y, 4.5),
    ),
    ...[21, 25, 29, 34].map((y, i) =>
      make("e" + i, 1, "DL", x + 1.5, y, i === 0 || i === 3 ? 6.7 : 5.9),
    ),
    ...[7, 46].map((y, i) =>
      make("c" + i, 1, "CB", x + 5, y, 8.7, { mark: "r" + i }),
    ),
    ...[17, 27, 37].map((y, i) =>
      make("l" + i, 1, "LB", x + 4.5, y, 7.7, { mark: ["r2", "rb", "r3"][i] }),
    ),
    ...[16, 38].map((y, i) => make("s" + i, 1, "S", x + 18, y, 9.05)),
  ];
  for (const p of s.players.filter((p) => p.team === 1)) {
    const hash =
      (Math.imul(s.alignmentSeed ^ p.id.charCodeAt(0), 2654435761) +
        Math.imul(p.id.charCodeAt(1), 2246822519)) >>>
      0;
    const v = hash / 4294967296;
    p.strength = 0.82 + v * 0.36;
    p.x += (v - 0.5) * 1.2;
    p.y += (v - 0.5) * 1.5;
    p.startX = p.x;
    p.startY = p.y;
  }
  s.carrier = "qb";
  s.ball = null;
  s.elapsed = 0;
  s.juke = 0;
  s.jukeCooldown = 0;
  s.passThrown = false;
  s.handoff = 0;
  s.stamina = 100;
  s.pressure = 0;
  s.contactGrace = 0;
  s.rushAttempt = false;
  s.runIndex = 0;
  s.sprinting = false;
  s.lastInput = { x: 0, y: 0 };
  s.tackle = null;
  s.blocks = [];
  s.selectedDefender = "l1";
  s.tackleCooldown = 0;
  s.aiStamina = 100;
  s.aiJukeCooldown = 0;
  s.aiNextRead = 0;
  s.aiThrowAt =
    (s.play === "verticals" ? 1.55 : s.play === "screen" ? 1.0 : 1.1) +
    (chooseDefense ? rand(s) * 0.45 : 0);
  s.offenseJuking = false;
  s.passDefenseCooldown = 0;
  s.passEffect = null;
  s.defenseStamina = 100;
  s.defenseSprinting = false;
}
export function snapshot(s) {
  return JSON.parse(JSON.stringify(s));
}
function event(s, message, detail) {
  s.message = message;
  s.detail = detail;
  s.eventId++;
}
export function command(s, c, team = 0) {
  const offensive = [
    "select",
    "throw",
    "throwAway",
    "juke",
    "punt",
    "snap",
    "next",
  ];
  const defensive = [
    "selectDefense",
    "switch",
    "selectDefender",
    "tackle",
    "swat",
    "pick",
  ];
  if (s.mode === "online") {
    if (team !== 0 && team !== 1) return false;
    if (offensive.includes(c.type) && team !== s.possession) return false;
    if (defensive.includes(c.type) && team === s.possession) return false;
    if (!offensive.includes(c.type) && !defensive.includes(c.type))
      return false;
  } else if (
    s.possession === 1 &&
    ["select", "throw", "throwAway", "juke", "punt"].includes(c.type)
  )
    return false;
  applyCommand(s, c);
  return true;
}
function applyCommand(s, c) {
  if (c.type === "select" && s.phase === "ready" && PLAYS[c.play]) {
    s.play = c.play;
    formation(s, false);
  }
  if (c.type === "difficulty" && s.phase === "ready" && TUNING[c.value])
    s.difficulty = c.value;
  if (
    c.type === "selectDefense" &&
    s.phase === "ready" &&
    humanDefense(s) &&
    DEFENSES[c.defense]
  ) {
    const selected = s.selectedDefender;
    s.defense = c.defense;
    s.defenseCall = c.defense;
    s.defenseCalls[1 - s.possession] = c.defense;
    formation(s, false);
    s.selectedDefender = selected;
  }
  if (
    c.type === "switch" &&
    humanDefense(s) &&
    ["ready", "live"].includes(s.phase)
  ) {
    const target = s.ball
      ? { x: s.ball.toX, y: s.ball.toY }
      : s.players.find((p) => p.id === s.carrier) || s.players[0];
    const choices = s.players.filter((p) => p.team === 1 && p.stun <= 0);
    const cost = (d) =>
      dist(d, target) +
      (d.blocked ? 10 : 0) +
      (s.carrier && s.carrier !== "qb" && d.x < target.x - 2 ? 3 : 0);
    choices.sort((a, b) => cost(a) - cost(b));
    if (choices[0]) s.selectedDefender = choices[0].id;
  }
  if (
    c.type === "selectDefender" &&
    humanDefense(s) &&
    ["ready", "live"].includes(s.phase) &&
    s.players.some((p) => p.id === c.id && p.team === 1)
  )
    s.selectedDefender = c.id;
  if (
    c.type === "tackle" &&
    humanDefense(s) &&
    s.phase === "live" &&
    s.tackleCooldown <= 0 &&
    defenseEnergy(s) >= 15
  ) {
    const d = s.players.find((p) => p.id === s.selectedDefender);
    if (!d || d.stun > 0 || d.diveTime > 0) return;
    setDefenseEnergy(s, defenseEnergy(s) - 15);
    s.tackleCooldown = 0.85;
    if (d.blocked) {
      d.blockTime += 1.8;
      d.shedUntil = s.elapsed + 0.4;
      d.blocked = false;
      event(
        s,
        "SHED THE BLOCK.",
        "Keep pursuing · Q switches to an available defender",
      );
    } else {
      const target =
        s.players.find((p) => p.id === s.carrier) || s.ball || s.players[0];
      let x = s.lastInput.x,
        y = s.lastInput.y;
      if (Math.hypot(x, y) < 0.1 || dist(d, target) < 4.2) {
        x = target.x + (target.vx || 0) * 0.08 - d.x;
        y = target.y + (target.vy || 0) * 0.08 - d.y;
      }
      const len = Math.hypot(x, y) || 1;
      d.diveX = x / len;
      d.diveY = y / len;
      d.diveTime = 0.23;
      event(
        s,
        "MAKE THE STOP.",
        "A missed dive leaves you recovering briefly.",
      );
    }
  }
  if (
    ["swat", "pick"].includes(c.type) &&
    humanDefense(s) &&
    s.phase === "live" &&
    s.ball &&
    s.passDefenseCooldown <= 0
  ) {
    const d = s.players.find((p) => p.id === s.selectedDefender),
      cost = c.type === "swat" ? 8 : 12;
    if (
      !d ||
      d.blocked ||
      d.stun > 0 ||
      d.diveTime > 0 ||
      defenseEnergy(s) < cost
    )
      return;
    setDefenseEnergy(s, defenseEnergy(s) - cost);
    s.passDefenseCooldown = c.type === "swat" ? 0.7 : 1.0;
    if (c.type === "swat") d.swatWindow = 0.32;
    else d.pickWindow = 0.22;
    event(
      s,
      c.type === "swat" ? "HANDS UP." : "PLAY THE BALL.",
      c.type === "swat"
        ? "Time E near the ball to break up the pass."
        : "Time R at the catch point to attempt the pick.",
    );
  }
  if (c.type === "snap" && s.phase === "ready") {
    if (
      !humanOffense(s) &&
      s.down === 4 &&
      s.firstDown - s.spot > 3 &&
      s.spot < 68
    ) {
      punt(s);
      return;
    }
    s.phase = "live";
    s.elapsed = 0;
    const run = PLAYS[s.play].type === "RUN";
    s.handoff = run ? PLAYS[s.play].handoff : 0;
    s.passThrown = run;
    event(
      s,
      run ? "FOLLOW YOUR BLOCKS." : "READ THE COVERAGE.",
      run
        ? "Handoff coming · steer with WASD · Shift to sprint"
        : "1–4 receivers · 5 running back · X throw away",
    );
    if (!humanOffense(s))
      event(
        s,
        "PORTLAND SNAPS.",
        "WASD: move · Q: switch · Space: tackle · Shift: sprint",
      );
  }
  if (
    c.type === "throwAway" &&
    s.phase === "live" &&
    s.carrier === "qb" &&
    !s.passThrown &&
    s.players[0].x <= s.spot
  ) {
    offenseStats(s).attempts++;
    s.passThrown = true;
    endPlay(s, s.spot, "incomplete");
  }
  if (
    c.type === "throw" &&
    s.phase === "live" &&
    s.carrier === "qb" &&
    !s.passThrown
  ) {
    const qb = s.players[0];
    if (qb.x > s.spot || s.handoff > 0) return;
    const style = PASS_TYPES[c.style] ? c.style : "bullet",
      plan = passPlan(s, c, style);
    if (!plan) return;
    let target = { x: plan.x, y: plan.y };
    const moving = Math.hypot(qb.vx, qb.vy) > 3,
      spread = (moving ? 0.9 : 0.12) + s.pressure * 1.2;
    target.x += (rand(s) - 0.5) * spread;
    target.y += (rand(s) - 0.5) * spread;
    offenseStats(s).attempts++;
    s.passThrown = true;
    s.carrier = null;
    s.ball = {
      x: qb.x,
      y: qb.y,
      fromX: qb.x,
      fromY: qb.y,
      toX: target.x,
      toY: target.y,
      t: 0,
      style,
      height: 1,
      duration: Math.max(
        PASS_TYPES[style].minTime,
        Math.hypot(target.x - qb.x, target.y - qb.y) / PASS_TYPES[style].speed,
      ),
    };
    event(
      s,
      style === "lob" ? "LOB IN THE AIR." : "BULLET AWAY.",
      s.possession === 0
        ? "Take control after the catch."
        : "E: swat · R: pick · Close on the landing marker",
    );
  }
  if (
    c.type === "juke" &&
    s.phase === "live" &&
    s.carrier &&
    s.handoff <= 0 &&
    s.jukeCooldown <= 0 &&
    s.stamina >= 18
  ) {
    s.juke = 0.3;
    s.jukeCooldown = 2.0;
    s.stamina -= 18;
    const p = s.players.find((p) => p.id === s.carrier);
    for (const d of s.players.filter((d) => d.team === 1))
      if (dist(p, d) < 3.4) {
        d.stun = 0.55;
        d.vx *= 0.2;
        d.vy *= 0.2;
      }
  }
  if (c.type === "next" && s.phase === "dead") {
    if (s.score >= 21 || s.opponentScore >= 21 || s.quarter > 4) {
      finishGame(s);
      return;
    }
    s.clock -= s.possessionEnded ? 6 : 8;
    advanceClock(s);
    if (s.quarter > 4) {
      finishGame(s);
      return;
    }
    if (s.possessionEnded) {
      s.possession = 1 - s.possession;
      s.drive++;
      s.spot = s.nextPossessionSpot;
      s.firstDown = Math.min(100, s.spot + 10);
      s.down = 1;
      s.possessionEnded = false;
    }
    s.phase = "ready";
    formation(s);
    event(
      s,
      s.possession === 0
        ? "YOUR BALL. CALL THE PLAY."
        : "DEFENSE. MAKE A STOP.",
      `Drive ${s.drive} · ${ordinal(s.down)} & ${Math.ceil(s.firstDown - s.spot)} · ${s.possession === 0 ? "Halifax" : "Portland"} possession`,
    );
  }
  if (c.type === "punt" && s.phase === "ready" && s.down === 4) punt(s);
}
function punt(s) {
  const landing = s.spot + 36 + Math.floor(rand(s) * 9);
  s.phase = "dead";
  s.possessionEnded = true;
  s.nextPossessionSpot = landing >= 100 ? 20 : clamp(100 - landing, 1, 99);
  if (humanDefense(s)) defenseStats(s).stops++;
  event(
    s,
    s.possession === 0 ? "PUNT AWAY." : "PORTLAND PUNTS.",
    `Possession changes · ${landing >= 100 ? "Touchback at the 20." : "Ball at the " + s.nextPossessionSpot + "."}`,
  );
}
export function ordinal(n) {
  return ["", "1st", "2nd", "3rd", "4th"][n] || "1st";
}
function finishGame(s) {
  s.phase = "final";
  event(
    s,
    s.score > s.opponentScore
      ? "THAT’S A WIN."
      : s.score < s.opponentScore
        ? "NEXT TIME, COACH."
        : "ALL SQUARE.",
    `${s.score}–${s.opponentScore} · ${s.stats.yards} yards of offense`,
  );
}
function chooseCpuPlay(s) {
  const need = s.firstDown - s.spot;
  let passRate = s.down >= 3 ? 0.8 : need <= 4 ? 0.38 : 0.6;
  if (s.spot > 93) passRate = 0.4;
  const passing = rand(s) < passRate;
  const plays = passing
    ? need > 12
      ? ["verticals", "cross", "slants"]
      : ["slants", "cross", "screen", "verticals"]
    : ["inside", "sweep", "draw"];
  return plays[Math.floor(rand(s) * plays.length)];
}
function advanceClock(s) {
  while (s.clock <= 0 && s.quarter < 4) {
    s.clock += 180;
    s.quarter++;
  }
  if (s.clock <= 0 && s.quarter >= 4) {
    s.clock = 0;
    s.quarter = 5;
  }
}
function endPlay(s, spot, kind = "tackle") {
  if (s.phase !== "live") return;
  s.phase = "dead";
  s.ball = null;
  const gain =
    kind === "incomplete" || kind === "interception"
      ? 0
      : Math.floor(spot) - s.spot;
  s.lastGain = gain;
  offenseStats(s).yards += gain;
  if (s.rushAttempt) offenseStats(s).rushYards += gain;
  if (kind === "sack") offenseStats(s).sacks++;
  if (["tackle", "sack"].includes(kind))
    s.tackle = { id: s.carrier, tick: s.tick };
  if (humanDefense(s) && ["tackle", "sack"].includes(kind)) {
    defenseStats(s).tackles++;
    if (kind === "sack") defenseStats(s).sacks++;
  }
  if (kind === "interception") {
    offenseStats(s).interceptions++;
    s.possessionEnded = true;
    s.nextPossessionSpot = clamp(100 - Math.floor(spot), 1, 99);
    if (spot >= 100) s.nextPossessionSpot = 20;
    if (humanDefense(s)) {
      defenseStats(s).picks++;
      defenseStats(s).stops++;
    }
    event(
      s,
      s.possession === 0 ? "PICKED OFF." : "INTERCEPTED!",
      `${s.possession === 0 ? "Portland" : "Halifax"} takes over at its ${s.nextPossessionSpot}.`,
    );
  } else if (spot >= 100 && kind !== "incomplete") {
    award(s, s.possession, 7);
    offenseStats(s).touchdowns++;
    s.possessionEnded = true;
    s.nextPossessionSpot = 25;
    event(
      s,
      s.possession === 0 ? "TOUCHDOWN!" : "PORTLAND TOUCHDOWN.",
      "+7 · Extra point is automatic.",
    );
  } else if (spot <= 0 && kind !== "incomplete") {
    if (humanDefense(s)) defenseStats(s).stops++;
    award(s, 1 - s.possession, 2);
    s.possessionEnded = true;
    s.nextPossessionSpot = 25;
    event(
      s,
      s.possession === 0 ? "SAFETY." : "SAFETY! TWO FOR HALIFAX.",
      "The defense gets 2 points and possession.",
    );
  } else {
    if (kind !== "incomplete") s.spot = clamp(Math.floor(spot), 1, 99);
    if (s.spot >= s.firstDown) {
      s.down = 1;
      s.firstDown = Math.min(100, s.spot + 10);
      event(s, "MOVE THE CHAINS.", `+${gain} yards · First down`);
    } else {
      s.down++;
      event(
        s,
        kind === "incomplete"
          ? "INCOMPLETE."
          : kind === "sack"
            ? "SACKED."
            : kind === "bounds"
              ? "OUT OF BOUNDS."
              : "WHISTLE.",
        `${gain >= 0 ? "+" : ""}${gain} yards · ${ordinal(s.down)} & ${Math.ceil(s.firstDown - s.spot)}`,
      );
    }
    if (s.down > 4) {
      s.possessionEnded = true;
      s.nextPossessionSpot = clamp(100 - s.spot, 1, 99);
      if (humanDefense(s)) defenseStats(s).stops++;
      event(
        s,
        "TURNOVER ON DOWNS.",
        `${s.possession === 0 ? "Portland" : "Halifax"} takes over at its ${s.nextPossessionSpot}.`,
      );
    }
  }
  s.log.unshift({
    text: s.message + " " + (gain ? `${gain > 0 ? "+" : ""}${gain} yd` : ""),
    type: spot >= 100 ? "td" : "play",
  });
  s.log = s.log.slice(0, 6);
  if (s.score >= 21 || s.opponentScore >= 21 || s.quarter > 4) finishGame(s);
}
function move(p, x, y, speed, dt, accel = 24) {
  const dx = x - p.x,
    dy = y - p.y,
    d = Math.hypot(dx, dy),
    v = Math.min(speed, d / Math.max(dt, 0.001));
  const tx = d > 0.025 ? (dx / d) * v : 0,
    ty = d > 0.025 ? (dy / d) * v : 0,
    k = Math.min(1, (accel * dt) / Math.max(1, speed));
  p.vx += (tx - p.vx) * k;
  p.vy += (ty - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, -9, 109);
  p.y = clamp(p.y, -1, 54.3);
}
// Player input needs a much shorter response than AI steering and blocking.
// Keep a little smoothing, but make cuts, reversals, and stops feel immediate.
export function moveControlled(p, x, y, speed, dt) {
  const moving = Math.hypot(x, y) > 0.1;
  const response = moving ? 0.045 : 0.028;
  const k = 1 - Math.exp(-dt / response);
  p.vx += ((moving ? x * speed : 0) - p.vx) * k;
  p.vy += ((moving ? y * speed : 0) - p.vy) * k;
  if (!moving && Math.hypot(p.vx, p.vy) < 0.05) {
    p.vx = 0;
    p.vy = 0;
  }
  p.x = clamp(p.x + p.vx * dt, -9, 109);
  p.y = clamp(p.y + p.vy * dt, -1, 54.3);
}
export function routePoints(s, p) {
  return p.role === "RB"
    ? PLAYS[s.play].rbRoute || [
        [2, 0],
        [15, 0],
      ]
    : PLAYS[s.play].routes?.[Number(p.id.slice(1))] || [
        [12, 0],
        [24, 0],
      ];
}
function routeVector(s, p) {
  const points = routePoints(s, p),
    a = points[Math.min(p.routeIndex, points.length - 1)],
    x = Math.min(105, p.startX + a[0]),
    y = clamp(p.startY + a[1], 3, 50),
    d = Math.hypot(x - p.x, y - p.y);
  return {
    x: d > 0.1 ? ((x - p.x) / d) * p.speed : 0,
    y: d > 0.1 ? ((y - p.y) / d) * p.speed : 0,
    targetX: x,
    targetY: y,
    d,
  };
}
function predictReceiver(s, p, time) {
  let x = p.x,
    y = p.y,
    remaining = p.speed * time;
  const route = routePoints(s, p);
  for (
    let i = Math.min(p.routeIndex, route.length - 1);
    i < route.length;
    i++
  ) {
    const tx = Math.min(105, p.startX + route[i][0]),
      ty = clamp(p.startY + route[i][1], 3, 50),
      distance = Math.hypot(tx - x, ty - y);
    if (distance >= remaining && distance > 0)
      return {
        x: x + ((tx - x) * remaining) / distance,
        y: y + ((ty - y) * remaining) / distance,
      };
    remaining -= distance;
    x = tx;
    y = ty;
  }
  return { x, y };
}
// Shared by aim previews, assisted throws and the CPU. This function consumes no RNG.
export function passPlan(s, target, style = "bullet") {
  const qb = s.players[0],
    config = PASS_TYPES[style] || PASS_TYPES.bullet;
  let point;
  if (target.receiver !== undefined) {
    const receiver = s.players.find(
      (p) => p.id === (target.receiver === 4 ? "rb" : "r" + target.receiver),
    );
    if (!receiver?.eligible) return null;
    let time = dist(qb, receiver) / config.speed;
    for (let i = 0; i < 4; i++) {
      point = predictReceiver(s, receiver, time);
      time = Math.hypot(point.x - qb.x, point.y - qb.y) / config.speed;
    }
  } else point = { x: Number(target.x), y: Number(target.y) };
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < qb.x
  )
    return null;
  let x = clamp(point.x, -9, 109),
    y = clamp(point.y, 0.5, 52.8),
    distance = Math.hypot(x - qb.x, y - qb.y);
  if (distance > config.maxRange) {
    const k = config.maxRange / distance;
    x = qb.x + (x - qb.x) * k;
    y = qb.y + (y - qb.y) * k;
    distance = config.maxRange;
  }
  return {
    x,
    y,
    style: PASS_TYPES[style] ? style : "bullet",
    distance,
    duration: Math.max(config.minTime, distance / config.speed),
  };
}
function pursuit(p, c, tune) {
  const lead = clamp(dist(p, c) / (p.speed + 3), 0.1, 1.25);
  return {
    x: clamp(c.x + c.vx * lead * 0.85, -8, 105),
    y: clamp(c.y + c.vy * lead * 0.8, 1, 52.3),
  };
}
function coverage(s, d) {
  const qb = s.players[0],
    receivers = s.players.filter((p) => p.eligible),
    mark = s.players.find((p) => p.id === d.mark);
  if (d.role === "DL" || (s.defense === "blitz" && d.id === "l1")) return qb;
  if ((s.defense === "man" || s.defense === "blitz") && mark)
    return { x: mark.x + 1.1, y: mark.y + (mark.y < 27 ? 1 : -1) };
  if (d.role === "S") {
    const half =
      Number(d.id.slice(1)) === 0
        ? receivers.filter((r) => r.y < 27)
        : receivers.filter((r) => r.y >= 27);
    const deep = half.sort((a, b) => b.x - a.x)[0];
    return {
      x: Math.min(
        103,
        Math.max(
          s.spot + (s.defense === "cover3" ? 20 : 17),
          (deep?.x || s.spot) + 7,
        ),
      ),
      y: deep ? clamp(deep.y, 8, 45) : d.startY,
    };
  }
  const zoneX =
      s.spot + (d.role === "CB" ? (s.defense === "cover3" ? 17 : 6) : 8),
    zoneY = d.startY;
  const threat = receivers
    .filter(
      (r) =>
        Math.abs(r.y - zoneY) < (d.role === "CB" ? 9 : 8) &&
        r.x > s.spot - 1 &&
        r.x < s.spot + 27,
    )
    .sort((a, b) => dist(a, d) - dist(b, d))[0];
  if (threat)
    return {
      x:
        s.defense === "cover3" && d.role === "CB"
          ? Math.max(zoneX, threat.x + 3)
          : clamp(
              threat.x + 1,
              s.spot + 3,
              s.spot + (d.role === "CB" ? 14 : 17),
            ),
      y: threat.y,
    };
  return { x: zoneX, y: zoneY + (qb.y - 27) * 0.12 };
}
function blocking(s, dt, running, carrier, tune) {
  const defense = s.players.filter((p) => p.team === 1);
  s.blocks = [];
  for (const d of defense) {
    d.blocked = false;
    d.stun = Math.max(0, d.stun - dt);
  }
  const used = new Set();
  for (const b of s.players
    .filter(
      (p) => p.role === "OL" || (running && p.eligible && p.id !== s.carrier),
    )
    .sort((a, b) => (a.role === "OL" ? 0 : 1) - (b.role === "OL" ? 0 : 1))) {
    let target;
    const lead = carrier || s.players.find((p) => p.id === "rb");
    if (!b.blockTarget) {
      if (b.role === "OL")
        b.blockTarget = (
          running
            ? ["e0", "e1", "e1", "e2", "e3"]
            : ["e0", "e1", "l1", "e2", "e3"]
        )[Number(b.id.slice(1))];
      else
        b.blockTarget = { r0: "c0", r1: "c1", r2: "l0", r3: "l2", rb: "l1" }[
          b.id
        ];
    }
    target = defense.find((d) => d.id === b.blockTarget);
    if (running && target && target.x < lead.x - 3) {
      target = defense
        .filter((d) => !used.has(d.id) && d.stun <= 0 && d.x > lead.x)
        .sort(
          (a, c) =>
            dist(a, b) +
            dist(a, lead) * 0.4 -
            (dist(c, b) + dist(c, lead) * 0.4),
        )[0];
      if (target) b.blockTarget = target.id;
    }
    if (!target) continue;
    used.add(target.id);
    const pulling =
      running && s.play === "sweep" && b.id === "b1" && s.elapsed < 1.15;
    const screenRelease =
      s.play === "screen" &&
      b.role === "OL" &&
      ["b3", "b4"].includes(b.id) &&
      s.ball;
    const tx = screenRelease
        ? s.spot + 1
        : pulling
          ? s.spot - 0.5
          : target.x - 0.95,
      ty = screenRelease ? 39 : pulling ? 18 : target.y;
    const hold =
      ((running ? (b.role === "OL" ? 0.65 : 0.55) : 2.55) + tune.hold) /
      (target.strength || 1);
    // Once linemen engage, resolve the contest together instead of letting
    // the blocker chase forward and displace the defender every frame.
    const lineContact =
      b.role === "OL" &&
      dist(b, target) < 2.1 &&
      target.blockTime < hold &&
      s.elapsed > target.shedUntil &&
      !pulling &&
      !screenRelease;
    if (!lineContact)
      move(
        b,
        tx,
        ty,
        b.role === "OL" ? (running ? 5.5 : 4.4) : b.speed * 0.8,
        dt,
      );
    if (
      dist(b, target) < 2.1 &&
      target.blockTime < hold &&
      s.elapsed > target.shedUntil
    ) {
      target.blocked = true;
      target.blockTime += dt;
      s.blocks.push([b.id, target.id]);
      if (b.role === "OL") {
        // Seeded strength varies by matchup: some blocks gain ground while
        // stronger rushers drive the pocket backward. No per-frame randomness.
        const drive = clamp(
          (1 - (target.strength || 1)) * 5 + (running ? 0.2 : -0.15),
          -1.2,
          1.2,
        );
        b.vx = target.vx = drive;
        b.vy *= 0.45;
        target.vy *= 0.45;
        b.x = clamp(b.x + drive * dt, -9, 109);
        target.x = clamp(target.x + drive * dt, -9, 109);
      } else {
        target.vx *= 0.45;
        target.vy *= 0.45;
        if (running && target.x < b.x + 1.25) target.x = b.x + 1.25;
      }
      if (target.blockTime >= hold) {
        target.shedUntil = s.elapsed + 1.6;
        target.stun = 0.05;
      }
    }
  }
}
function cpuDecision(s) {
  if (humanOffense(s) || s.phase !== "live" || s.elapsed < s.aiNextRead) return;
  s.aiNextRead = s.elapsed + 0.12;
  if (
    s.carrier === "qb" &&
    !s.passThrown &&
    s.handoff <= 0 &&
    s.elapsed >= s.aiThrowAt
  ) {
    const qb = s.players[0],
      defenders = s.players.filter(
        (p) => p.team === 1 && !p.blocked && p.stun <= 0,
      );
    const receivers = s.players.filter((p) => p.eligible && p.x >= qb.x);
    let best = null,
      bestScore = -Infinity;
    for (const r of receivers) {
      const style = dist(qb, r) > 23 ? "lob" : "bullet",
        aim = passPlan(s, { receiver: r.number - 1 }, style);
      if (!aim) continue;
      const space = Math.min(...defenders.map((d) => dist(d, aim)));
      const gain = aim.x - s.spot;
      const value =
        space + Math.min(12, Math.max(0, gain)) * 0.12 - (gain < 0 ? 2 : 0);
      if (value > bestScore) {
        bestScore = value;
        best = { r, space, style };
      }
    }
    const threshold =
      s.elapsed > 2.7 ? 1.3 : s.difficulty === "hard" ? 1.8 : 2.3;
    if (best && best.space > threshold) {
      applyCommand(s, {
        type: "throw",
        receiver: best.r.number - 1,
        style: best.style,
      });
      return;
    }
    if (s.elapsed > 3.3 && s.pressure > 0.65)
      applyCommand(s, { type: "throwAway" });
  }
  if (
    s.carrier &&
    s.handoff <= 0 &&
    s.aiJukeCooldown <= 0 &&
    s.aiStamina > 20
  ) {
    const c = s.players.find((p) => p.id === s.carrier);
    const nearest = s.players
      .filter(
        (p) => p.team === 1 && !p.blocked && p.stun <= 0 && p.diveTime <= 0,
      )
      .sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (nearest && c.id !== "qb" && dist(nearest, c) < 2.3) {
      // An occasional cut can beat one pursuer; it cannot freeze the whole defense.
      s.aiJukeCooldown = 2.4;
      const chance =
        s.difficulty === "easy" ? 0.12 : s.difficulty === "hard" ? 0.36 : 0.22;
      if (rand(s) < chance) {
        s.aiStamina -= 14;
        s.juke = 0.2;
        if (nearest.id !== s.selectedDefender) {
          nearest.stun = 0.18;
          nearest.vx *= 0.5;
          nearest.vy *= 0.5;
        }
      }
    }
  }
}
function cpuMovement(s, c) {
  const threats = s.players.filter(
    (p) => p.team === 1 && !p.blocked && p.stun <= 0,
  );
  if (c.id === "qb" && !s.passThrown && c.x <= s.spot) {
    const nearest = threats.sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (nearest && dist(nearest, c) < 4) {
      return { x: -0.25, y: c.y < nearest.y ? -0.8 : 0.8, sprint: false };
    }
    if (s.elapsed > 3.4)
      return { x: 0.95, y: c.y < 27 ? -0.2 : 0.2, sprint: true };
    return { x: 0, y: 0, sprint: false };
  }
  let x = 1,
    y = 0;
  if (PLAYS[s.play].type === "RUN" && c.id === "rb" && c.x < s.spot + 7) {
    const points = PLAYS[s.play].runPath,
      a = points[Math.min(s.runIndex, points.length - 1)],
      dx = s.spot + a[0] - c.x,
      dy = 27 + a[1] - c.y,
      len = Math.hypot(dx, dy) || 1;
    if (len < 1.4) s.runIndex++;
    x = dx / len;
    y = dy / len;
  }
  const ahead = threats
    .filter((p) => p.x > c.x - 0.8 && p.x < c.x + 8 && Math.abs(p.y - c.y) < 5)
    .sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (ahead && c.x > s.spot) {
    y = (c.y < ahead.y ? -1 : 1) * 0.75;
    if (c.y < 6) y = Math.max(0, y);
    if (c.y > 47) y = Math.min(0, y);
    x = 0.9;
  }
  const len = Math.hypot(x, y) || 1;
  return {
    x: x / len,
    y: y / len,
    sprint: !ahead && c.x > s.spot + 3 && s.aiStamina > 25,
  };
}
export function step(s, input = {}, dt = DT) {
  if (s.phase !== "live") return;
  const defensiveDifficulty =
    s.mode === "online"
      ? "normal"
      : s.possession === 0
        ? s.difficulty
        : s.difficulty === "hard"
          ? "easy"
          : s.difficulty === "easy"
            ? "hard"
            : "normal";
  const tune = TUNING[defensiveDifficulty] || TUNING.normal;
  s.tick++;
  s.elapsed += dt;
  s.clock -= dt;
  s.juke = Math.max(0, s.juke - dt);
  s.jukeCooldown = Math.max(0, s.jukeCooldown - dt);
  s.contactGrace = Math.max(0, s.contactGrace - dt);
  s.tackleCooldown = Math.max(0, s.tackleCooldown - dt);
  s.aiJukeCooldown = Math.max(0, s.aiJukeCooldown - dt);
  s.passDefenseCooldown = Math.max(0, s.passDefenseCooldown - dt);
  for (const p of s.players) {
    p.swatWindow = Math.max(0, p.swatWindow - dt);
    p.pickWindow = Math.max(0, p.pickWindow - dt);
  }
  cpuDecision(s);
  if (s.phase !== "live") return;
  const qb = s.players[0],
    rb = s.players.find((p) => p.id === "rb"),
    runPlay = PLAYS[s.play].type === "RUN";
  let carrier = s.players.find((p) => p.id === s.carrier);
  const offenseInput = s.mode === "online" ? input.offense || {} : input,
    defenseInput = s.mode === "online" ? input.defense || {} : input;
  let mx = clamp(Number(offenseInput.x) || 0, -1, 1),
    my = clamp(Number(offenseInput.y) || 0, -1, 1),
    magnitude = Math.hypot(mx, my);
  if (magnitude > 1) {
    mx /= magnitude;
    my /= magnitude;
  }
  s.lastInput =
    s.mode === "online"
      ? {
          x: clamp(Number(defenseInput.x) || 0, -1, 1),
          y: clamp(Number(defenseInput.y) || 0, -1, 1),
        }
      : { x: mx, y: my };
  if (s.mode === "online") {
    const length = Math.hypot(s.lastInput.x, s.lastInput.y);
    if (length > 1) {
      s.lastInput.x /= length;
      s.lastInput.y /= length;
    }
  }
  if (s.handoff > 0) {
    s.handoff = Math.max(0, s.handoff - dt);
    move(qb, s.spot - 3, 27, 3, dt);
    move(rb, qb.x - 0.4, qb.y, 7.5, dt);
    if (s.handoff === 0) {
      s.carrier = "rb";
      carrier = rb;
      s.rushAttempt = true;
      offenseStats(s).rushes++;
      s.contactGrace = 0.08;
      event(
        s,
        s.possession === 0 ? "HANDOFF. HIT THE HOLE." : "PORTLAND HANDOFF.",
        s.possession === 0
          ? "Follow your blocks · Shift to sprint · Space to cut"
          : "Read the runner · Q switch · Space tackle",
      );
    }
  } else if (carrier) {
    if (!humanOffense(s)) {
      const ai = cpuMovement(s, carrier);
      mx = ai.x;
      my = ai.y;
      magnitude = Math.hypot(mx, my);
      input = { ...input, aiSprint: ai.sprint };
    }
    if (carrier.role !== "QB" && magnitude < 0.1) {
      if (runPlay && carrier.id === "rb" && carrier.x < s.spot + 7) {
        const points = PLAYS[s.play].runPath,
          a = points[Math.min(s.runIndex, points.length - 1)],
          dx = s.spot + a[0] - carrier.x,
          dy = 27 + a[1] - carrier.y,
          d = Math.hypot(dx, dy);
        if (d < 1.4) s.runIndex++;
        mx = dx / Math.max(0.1, d);
        my = dy / Math.max(0.1, d);
      } else {
        mx = 1;
        my = 0;
      }
    }
    const sprint = humanOffense(s)
      ? !!offenseInput.sprint && s.stamina > 1 && Math.hypot(mx, my) > 0.1
      : !!input.aiSprint && s.aiStamina > 1;
    if (humanOffense(s)) {
      s.sprinting = sprint;
      s.stamina = clamp(s.stamina + (sprint ? -24 : 13) * dt, 0, 100);
    } else s.aiStamina = clamp(s.aiStamina + (sprint ? -24 : 13) * dt, 0, 100);
    const speed =
      carrier.speed * 1.1 * (sprint ? 1.23 : 1) * (s.juke > 0 ? 1.15 : 1);
    moveControlled(carrier, mx, my, speed, dt);
    if (carrier.id === "qb" && carrier.x > s.spot && !s.rushAttempt) {
      s.rushAttempt = true;
      offenseStats(s).rushes++;
      s.passThrown = true;
    }
  }
  const running =
    (runPlay && s.elapsed > PLAYS[s.play].handoff * 0.7) ||
    (s.carrier && s.carrier !== "qb" && !s.handoff) ||
    (s.carrier === "qb" && qb.x > s.spot + 1);
  for (const p of s.players.filter((p) => p.eligible && p.id !== s.carrier)) {
    if (p.id === "rb" && s.handoff > 0) continue;
    if (running) continue;
    if (p.id === "rb" && s.elapsed < (PLAYS[s.play].release ?? 0.3)) continue;
    const v = routeVector(s, p),
      adjust = s.ball && Math.hypot(s.ball.toX - p.x, s.ball.toY - p.y) < 8;
    move(
      p,
      adjust ? s.ball.toX : v.targetX,
      adjust ? s.ball.toY : v.targetY,
      p.speed,
      dt,
    );
    if (!adjust && v.d < 0.75) p.routeIndex++;
  }
  blocking(s, dt, running, carrier, tune);
  for (const d of s.players.filter((p) => p.team === 1)) {
    let dest = coverage(s, d),
      speed = d.speed + tune.speed;
    if (
      running &&
      s.elapsed >
        (runPlay
          ? PLAYS[s.play].handoff * 0.65 + tune.reaction * 0.4
          : tune.reaction)
    ) {
      const runner = s.handoff > 0 ? rb : carrier || rb;
      dest = pursuit(d, runner, tune);
      if (d.role === "LB" && runner.x < s.spot + 3) {
        dest.x = s.spot + 0.5;
        dest.y = clamp(runner.y + runner.vy * 0.22, 5, 48);
      }
      // The backside safety protects the angle instead of following everyone into the pile.
      if (d.role === "S" && d.x > (carrier || rb).x + 8)
        dest.x = Math.max(dest.x, (carrier || rb).x + 5);
    } else if (s.ball && s.ball.t > tune.reaction) {
      const b = s.ball;
      if (dist(d, { x: b.toX, y: b.toY }) < 25 || d.role === "S")
        dest = { x: b.toX, y: b.toY };
    }
    if (
      d.role === "DL" &&
      !running &&
      !s.ball &&
      (d.id === "e0" || d.id === "e3") &&
      s.elapsed < 1.5
    )
      dest = { x: qb.x + 2, y: qb.y + (d.id === "e0" ? -5 : 5) };
    if (d.blocked) speed *= 0.06;
    if (d.stun > 0) speed *= 0.12;
    if (s.elapsed < tune.reaction) speed *= 0.25;
    if (d.diveTime > 0) {
      d.diveTime = Math.max(0, d.diveTime - dt);
      moveControlled(
        d,
        d.diveX,
        d.diveY,
        (d.speed + tune.speed) * 1.8 * (d.blocked ? 0.1 : 1),
        dt,
      );
      if (d.diveTime === 0) d.stun = 0.28;
    } else if (humanDefense(s) && d.id === s.selectedDefender) {
      const x = s.lastInput.x,
        y = s.lastInput.y,
        sprint =
          !!defenseInput.sprint &&
          defenseEnergy(s) > 1 &&
          Math.hypot(x, y) > 0.1;
      if (s.mode === "online") s.defenseSprinting = sprint;
      else s.sprinting = sprint;
      setDefenseEnergy(
        s,
        clamp(defenseEnergy(s) + (sprint ? -24 : 13) * dt, 0, 100),
      );
      moveControlled(
        d,
        x,
        y,
        (d.speed + 0.2) *
          1.1 *
          (sprint ? 1.23 : 1) *
          (d.blocked ? 0.08 : 1) *
          (d.stun > 0 ? 0.12 : 1),
        dt,
      );
    } else move(d, dest.x, dest.y, speed, dt, d.role === "DL" ? 19 : 26);
  }
  // A defender cannot ghost through an engaged blocker to reach the carrier.
  for (const [bid, did] of s.blocks) {
    const b = s.players.find((p) => p.id === bid),
      d = s.players.find((p) => p.id === did);
    if (dist(b, d) < 1.25) {
      const dx = d.x - b.x,
        dy = d.y - b.y,
        len = Math.hypot(dx, dy) || 1;
      if (b.role === "OL") {
        const nx = dx === 0 && dy === 0 ? 1 : dx / len,
          ny = dy / len,
          correction = (1.25 - Math.hypot(dx, dy)) / 2;
        b.x -= nx * correction;
        b.y -= ny * correction;
        d.x += nx * correction;
        d.y += ny * correction;
      } else {
        d.x = b.x + (dx / len) * 1.25;
        d.y = b.y + (dy / len) * 1.25;
      }
    }
  }
  s.pressure = clamp(
    (6 -
      Math.min(
        ...s.players
          .filter((p) => p.team === 1 && !p.blocked)
          .map((p) => dist(p, qb)),
      )) /
      4.5,
    0,
    1,
  );
  if (s.ball) {
    const b = s.ball;
    b.t += dt;
    const t = Math.min(1, b.t / b.duration);
    b.x = b.fromX + (b.toX - b.fromX) * t;
    b.y = b.fromY + (b.toY - b.fromY) * t;
    b.height = passHeight(b);
    const manual = humanDefense(s)
      ? s.players.find((p) => p.id === s.selectedDefender)
      : null;
    if (manual && !manual.blocked && manual.stun <= 0) {
      if (manual.pickWindow > 0 && b.height <= 3.5 && dist(manual, b) < 2.0) {
        s.passEffect = { kind: "pick", x: b.x, y: b.y, tick: s.tick };
        endPlay(s, b.x, "interception");
        return;
      }
      if (manual.swatWindow > 0 && b.height <= 4 && dist(manual, b) < 3.0) {
        defenseStats(s).breakups++;
        s.passEffect = { kind: "swat", x: b.x, y: b.y, tick: s.tick };
        endPlay(s, s.spot, "incomplete");
        event(s, "PASS BROKEN UP.", "A timed swat makes the stop.");
        return;
      }
    }
    // Low throws can be challenged in the lane; a high lob clears underneath coverage.
    if (
      (b.style || "bullet") === "bullet" &&
      t > 0.22 &&
      t < 0.85 &&
      b.t > 0.18
    ) {
      const lane = s.players.find(
        (d) =>
          d.team === 1 &&
          !d.blocked &&
          d.stun <= 0 &&
          !(humanDefense(s) && d.id === s.selectedDefender) &&
          dist(d, b) < 0.7 &&
          b.height <= 2.7,
      );
      if (lane) {
        s.passEffect = { kind: "swat", x: b.x, y: b.y, tick: s.tick };
        if (humanDefense(s)) defenseStats(s).breakups++;
        endPlay(s, s.spot, "incomplete");
        event(s, "BATTED DOWN.", "The low pass met underneath coverage.");
        return;
      }
    }
    if (t >= 1) {
      const receivers = s.players
          .filter((p) => p.eligible)
          .sort((a, c) => dist(a, b) - dist(c, b)),
        defenders = s.players
          .filter((p) => p.team === 1 && !p.blocked && p.stun <= 0)
          .sort((a, c) => dist(a, b) - dist(c, b));
      const r = receivers[0],
        d = defenders[0],
        rd = dist(r, b),
        dd = d ? dist(d, b) : 99;
      if (dd < 1.4 && dd + 0.35 < rd) endPlay(s, b.x, "interception");
      else if (rd < 2.7 && b.y >= 0.7 && b.y <= 52.6) {
        const contested = d && dist(d, r) < 1.8;
        if (
          contested &&
          rand(s) <
            (defensiveDifficulty === "easy"
              ? 0.16
              : defensiveDifficulty === "hard"
                ? 0.5
                : 0.32)
        )
          endPlay(s, s.spot, "incomplete");
        else {
          s.carrier = r.id;
          offenseStats(s).completions++;
          s.ball = null;
          s.contactGrace = 0.12;
          r.vx = Math.max(1, r.vx);
          event(
            s,
            s.possession === 0 ? "CAUGHT. GO!" : "PORTLAND COMPLETES.",
            s.possession === 0
              ? "Steer with WASD · Shift to sprint · Space to juke"
              : "Close on the receiver · Q switch · Space tackle",
          );
        }
      } else endPlay(s, s.spot, "incomplete");
    }
  }
  const c = s.players.find((p) => p.id === s.carrier);
  if (c && s.phase === "live") {
    if (c.x >= 100) endPlay(s, c.x, "touchdown");
    else if (c.y < 0.7 || c.y > 52.6) endPlay(s, c.x, "bounds");
    else if (s.elapsed > 0.5 && s.contactGrace <= 0) {
      const tackler = s.players.find(
        (d) =>
          d.team === 1 &&
          !d.blocked &&
          d.stun <= 0 &&
          dist(d, c) <
            (d.diveTime > 0
              ? 2.1
              : humanDefense(s) && d.id === s.selectedDefender
                ? 1.2
                : s.juke > 0
                  ? 0.85
                  : 1.35),
      );
      if (tackler)
        endPlay(s, c.x, c.id === "qb" && c.x < s.spot ? "sack" : "tackle");
    }
  }
  if (s.elapsed > 18 && s.phase === "live")
    endPlay(s, c?.x ?? s.spot, c ? "tackle" : "incomplete");
  if (s.clock <= 0) {
    advanceClock(s);
    if (s.quarter > 4 && s.phase !== "live") finishGame(s);
  }
}
// Replace this adapter with an authoritative socket session for online play.
export class LocalSession {
  constructor(seed = 42, difficulty = "normal") {
    this.state = createGame(seed, difficulty);
    this.inputs = [];
  }
  send(c) {
    this.inputs.push({ tick: this.state.tick, command: { ...c } });
    command(this.state, c);
  }
  update(input) {
    step(this.state, input);
  }
  getSnapshot() {
    return snapshot(this.state);
  }
  restore(state) {
    if (state.version !== 5) throw Error("Unsupported state version");
    this.state = snapshot(state);
  }
}
