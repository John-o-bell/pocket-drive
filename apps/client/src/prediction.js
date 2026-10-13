import { snapshot, moveControlled, passPlan, DT } from "@pocket-drive/game";
const zero = () => ({ x: 0, y: 0, sprint: false });
export function projectGame(raw, slot) {
  const game = snapshot(raw);
  game.possession = raw.possession ^ slot;
  game.localSlot = slot;
  if (slot === 1) {
    game.score = raw.opponentScore;
    game.opponentScore = raw.score;
    game.stats = snapshot(raw.opponentStats);
    game.opponentStats = snapshot(raw.stats);
    const mapping = {
      "TOUCHDOWN!": "HALIFAX TOUCHDOWN.",
      "PORTLAND TOUCHDOWN.": "TOUCHDOWN!",
      "PICKED OFF.": "INTERCEPTED!",
      "INTERCEPTED!": "PICKED OFF.",
      "SAFETY.": "SAFETY! TWO FOR PORTLAND.",
      "SAFETY! TWO FOR HALIFAX.": "SAFETY.",
    };
    game.message = mapping[game.message] || game.message;
  }
  if (game.phase === "ready") {
    game.message =
      game.possession === 0
        ? "YOUR BALL. CALL THE PLAY."
        : "DEFENSE. MAKE A STOP.";
  }
  game.defenseStats = snapshot(raw.defenseByTeam[slot]);
  if (game.possession === 1) {
    game.stamina = raw.defenseStamina;
    game.sprinting = raw.defenseSprinting;
  }
  return game;
}
export function predict(session, input, dt = DT) {
  const self = session;
  self.latestInput = {
    x: Math.max(-1, Math.min(1, Number(input.x) || 0)),
    y: Math.max(-1, Math.min(1, Number(input.y) || 0)),
    sprint: !!input.sprint,
  };
  if (
    !self.state ||
    !self.raw ||
    self.room.stage !== "playing" ||
    self.disconnected ||
    self.state.phase !== "live"
  )
    return;
  const age = Math.min(0.15, (performance.now() - self.lastReceive) / 1000),
    defending = self.state.possession === 1,
    controlled = defending ? self.state.selectedDefender : self.state.carrier;
  for (const p of self.state.players) {
    const base = self.raw.players.find((q) => q.id === p.id);
    if (!base) continue;
    if (p.id === controlled) {
      let x = self.latestInput.x,
        y = self.latestInput.y,
        len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      if (!defending && p.id !== "qb" && len < 0.1) {
        const v = Math.hypot(base.vx, base.vy);
        x = v > 0.1 ? base.vx / v : 1;
        y = v > 0.1 ? base.vy / v : 0;
      }
      if (self.state.handoff > 0 && !defending) {
        p.x = base.x + base.vx * age;
        p.y = base.y + base.vy * age;
        continue;
      }
      const speed =
        (p.speed + (defending ? 0.2 : 0)) *
        1.1 *
        (self.latestInput.sprint && self.state.stamina > 1 ? 1.23 : 1) *
        (defending && p.blocked ? 0.08 : 1) *
        (p.stun > 0 ? 0.12 : 1) *
        (!defending && self.state.juke > 0 ? 1.15 : 1);
      if (p.diveTime > 0) {
        x = base.diveX;
        y = base.diveY;
      }
      moveControlled(p, x, y, p.diveTime > 0 ? p.speed * 1.8 : speed, dt);
      const tx = base.x + base.vx * (age + 0.04),
        ty = base.y + base.vy * (age + 0.04);
      if (Math.hypot(tx - p.x, ty - p.y) > 2.5) {
        p.x += (tx - p.x) * 0.25;
        p.y += (ty - p.y) * 0.25;
      }
    } else {
      const k = 1 - Math.exp(-dt / 0.055);
      p.x += (base.x + base.vx * age - p.x) * k;
      p.y += (base.y + base.vy * age - p.y) * k;
    }
  }
  if (self.state.ball && self.raw.ball) {
    const b = self.state.ball,
      r = self.raw.ball;
    b.t = Math.min(r.duration, r.t + age);
    const t = b.t / b.duration;
    b.x = r.fromX + (r.toX - r.fromX) * t;
    b.y = r.fromY + (r.toY - r.fromY) * t;
  }
}
