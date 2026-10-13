import type {
  GameState,
  GameAction,
  MovementInput,
  TeamSlot,
} from "./types.js";
export const DT: number;
export function createGame(
  seed?: number,
  difficulty?: string,
  mode?: string,
): GameState;
export function command(
  state: GameState,
  action: GameAction,
  team?: TeamSlot,
): void;
export function step(
  state: GameState,
  input?:
    | Partial<MovementInput>
    | { offense?: Partial<MovementInput>; defense?: Partial<MovementInput> },
  dt?: number,
): void;
