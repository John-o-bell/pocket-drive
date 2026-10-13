export type TeamSlot = 0 | 1;
export interface GamePlayer {
  id: string;
  team: string;
  role: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  [field: string]: unknown;
}
export interface GameState {
  phase: "ready" | "live" | "dead" | "final";
  mode: string;
  possession: TeamSlot;
  score: number;
  opponentScore: number;
  players: GamePlayer[];
  clock: number;
  quarter: number;
  carrier: string;
  selectedDefender: string;
  message: string;
  detail: string;
  eventId: number;
  [field: string]: unknown;
}
export interface MovementInput {
  x: number;
  y: number;
  sprint: boolean;
  seq: number;
}
export type GameAction =
  | { type: "select"; play: string }
  | { type: "selectDefense"; defense: string }
  | { type: "selectDefender"; id: string }
  | {
      type: "throw";
      style?: "bullet" | "lob";
      receiver?: number;
      x?: number;
      y?: number;
    }
  | {
      type:
        | "switch"
        | "throwAway"
        | "juke"
        | "tackle"
        | "swat"
        | "pick"
        | "punt"
        | "snap"
        | "next";
    };
export type QueuedAction = GameAction & { seq: number };
export interface SyncMessage {
  input?: MovementInput;
  commands?: QueuedAction[];
  ready?: boolean;
  rematch?: boolean;
}
export type MatchStage =
  | "lobby"
  | "countdown"
  | "playing"
  | "paused"
  | "finished";
export interface MatchPlayer {
  sessionId: string;
  name: string;
  connected: boolean;
  ready: boolean;
  rematch: boolean;
  input: MovementInput;
  inputAt: number;
  commandAck: number;
}
export interface MatchModel {
  code: string;
  revision: number;
  stage: MatchStage;
  round: number;
  countdownAt: number | null;
  pausedUntil: number | null;
  pauseReason: string | null;
  winner: TeamSlot | null;
  missingSlot: TeamSlot | null;
  createdAt: number;
  lastStepAt: number;
  carryMs: number;
  players: [MatchPlayer | null, MatchPlayer | null];
  game: GameState;
}
export interface RoomSnapshot {
  code: string;
  revision: number;
  stage: MatchStage;
  round: number;
  slot: TeamSlot;
  serverTime: number;
  countdownAt: number | null;
  pausedUntil: number | null;
  winner: TeamSlot | null;
  pauseReason: string | null;
  players: ({
    name: string;
    connected: boolean;
    ready: boolean;
    rematch: boolean;
  } | null)[];
  game: GameState;
  ack: number;
  inputAck: number;
  inputs: MovementInput[];
}
