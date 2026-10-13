import { randomInt } from "node:crypto";
import { createGame, command, step, DT } from "@pocket-drive/game";
import type {
  MatchModel,
  MatchPlayer,
  MovementInput,
  RoomSnapshot,
  SyncMessage,
  TeamSlot,
} from "@pocket-drive/game/types";
import { validateSync } from "./validation.js";

export const RECONNECT_SECONDS = 45;
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const zero = (seq = -1): MovementInput => ({
  x: 0,
  y: 0,
  sprint: false,
  seq,
});
export function createMatch(code: string, now = Date.now()): MatchModel {
  return {
    code,
    revision: 0,
    stage: "lobby",
    round: 0,
    countdownAt: null,
    pausedUntil: null,
    pauseReason: null,
    winner: null,
    missingSlot: null,
    createdAt: now,
    lastStepAt: now,
    carryMs: 0,
    players: [null, null],
    game: createGame(randomInt(0, 0xffffffff), "normal", "online"),
  };
}
export function addPlayer(
  m: MatchModel,
  sessionId: string,
  name: unknown,
  now = Date.now(),
): TeamSlot {
  if (m.stage !== "lobby") throw Error("This match has already started.");
  const slot = m.players.findIndex((p) => !p);
  if (slot < 0) throw Error("This room already has two players.");
  m.players[slot] = {
    sessionId,
    name: String(name || "Coach")
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 20),
    connected: true,
    ready: false,
    rematch: false,
    input: zero(),
    inputAt: now,
    commandAck: 0,
  };
  return slot as TeamSlot;
}
function startRound(m: MatchModel, now: number) {
  m.game = createGame(randomInt(0, 0xffffffff), "normal", "online");
  m.stage = "countdown";
  m.countdownAt = now + 1800;
  m.round++;
  m.winner = null;
  m.pausedUntil = null;
  m.pauseReason = null;
  m.carryMs = 0;
  m.lastStepAt = now;
  for (const p of m.players)
    if (p) {
      p.input = zero(p.input.seq);
      p.rematch = false;
    }
}
export function finish(m: MatchModel, winner: TeamSlot | null, reason: string) {
  m.stage = "finished";
  m.winner = winner;
  m.game.phase = "final";
  m.game.message = reason;
  m.game.detail = "Return to the lobby or request a rematch.";
  m.game.eventId++;
}
export function connection(
  m: MatchModel,
  slot: TeamSlot,
  connected: boolean,
  now = Date.now(),
) {
  const p = m.players[slot];
  if (!p) return;
  p.connected = connected;
  p.input = zero(p.input.seq);
  p.inputAt = now;
  if (!connected && !["lobby", "finished"].includes(m.stage)) {
    if (m.stage !== "paused") {
      m.stage = "paused";
      m.pausedUntil = now + RECONNECT_SECONDS * 1000;
      m.missingSlot = slot;
    }
    m.pauseReason = "Connection lost. Waiting for the other player.";
  }
  if (
    connected &&
    m.stage === "paused" &&
    m.players.every((p) => p?.connected)
  ) {
    m.stage = "countdown";
    m.countdownAt = now + 1000;
    m.pausedUntil = null;
    m.pauseReason = null;
  }
  m.lastStepAt = now;
  m.carryMs = 0;
}
export function sync(
  m: MatchModel,
  slot: TeamSlot,
  value: unknown,
  now = Date.now(),
) {
  const v = validateSync(value),
    p = m.players[slot];
  if (!p || !p.connected) return;
  if (m.stage === "lobby" && v.ready !== undefined) p.ready = v.ready;
  if (m.stage === "finished" && v.rematch) p.rematch = true;
  if (v.input && v.input.seq > p.input.seq) {
    p.input = { ...v.input };
    p.inputAt = now;
  }
  for (const c of v.commands ?? []) {
    if (c.seq <= p.commandAck) continue;
    if (c.seq !== p.commandAck + 1) break;
    p.commandAck = c.seq;
    if (m.stage === "playing") command(m.game, c, slot);
  }
  if (m.stage === "lobby" && m.players.every((p) => p?.connected && p.ready))
    startRound(m, now);
  if (
    m.stage === "finished" &&
    m.players.every((p) => p?.connected && p.rematch)
  )
    startRound(m, now);
  checkFinal(m);
}
function checkFinal(m: MatchModel) {
  if (m.stage === "playing" && m.game.phase === "final") {
    m.stage = "finished";
    m.winner =
      m.game.score === m.game.opponentScore
        ? null
        : m.game.score > m.game.opponentScore
          ? 0
          : 1;
  }
}
export function advance(m: MatchModel, now = Date.now()) {
  if (m.stage === "paused") {
    if (m.pausedUntil !== null && now >= m.pausedUntil)
      finish(
        m,
        m.players[0]?.connected ? 0 : m.players[1]?.connected ? 1 : null,
        "MATCH ENDED BY DISCONNECT.",
      );
    m.lastStepAt = now;
    m.carryMs = 0;
    return;
  }
  if (m.stage === "countdown" && now >= m.countdownAt!) {
    m.stage = "playing";
    m.lastStepAt = now;
  }
  if (m.stage !== "playing") {
    m.lastStepAt = now;
    return;
  }
  m.carryMs += Math.max(0, Math.min(250, now - m.lastStepAt));
  m.lastStepAt = now;
  const ticks = Math.min(15, Math.floor(m.carryMs / (DT * 1000)));
  m.carryMs -= ticks * DT * 1000;
  const input = m.players.map((p) =>
    p?.connected && now - p.inputAt < 350 ? p.input : zero(),
  );
  for (let i = 0; i < ticks && m.game.phase === "live"; i++)
    step(m.game, {
      offense: input[m.game.possession],
      defense: input[1 - m.game.possession],
    });
  checkFinal(m);
}
export function snapshotFor(
  m: MatchModel,
  slot: TeamSlot,
  now = Date.now(),
): RoomSnapshot {
  return {
    code: m.code,
    revision: m.revision,
    stage: m.stage,
    round: m.round,
    slot,
    serverTime: now,
    countdownAt: m.countdownAt,
    pausedUntil: m.pausedUntil,
    winner: m.winner,
    pauseReason: m.pauseReason,
    players: m.players.map((p) =>
      p
        ? {
            name: p.name,
            connected: p.connected,
            ready: p.ready,
            rematch: p.rematch,
          }
        : null,
    ),
    game: structuredClone(m.game),
    ack: m.players[slot]?.commandAck ?? 0,
    inputAck: m.players[slot]?.input.seq ?? -1,
    inputs: m.players.map((p) => p?.input ?? zero()),
  };
}
