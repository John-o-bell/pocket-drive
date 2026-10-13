import type {
  GameAction,
  MovementInput,
  SyncMessage,
} from "@pocket-drive/game/types";

export function validateSync(value: unknown): SyncMessage {
  if (
    !value ||
    typeof value !== "object" ||
    JSON.stringify(value).length > 12000
  )
    throw Error("Invalid room update.");
  const v = value as SyncMessage;
  if (v.ready !== undefined && typeof v.ready !== "boolean")
    throw Error("Invalid ready state.");
  if (v.rematch !== undefined && typeof v.rematch !== "boolean")
    throw Error("Invalid rematch vote.");
  if (v.input) validateInput(v.input);
  if (
    v.commands !== undefined &&
    (!Array.isArray(v.commands) || v.commands.length > 12)
  )
    throw Error("Too many queued actions.");
  for (const c of v.commands ?? []) {
    if (!Number.isSafeInteger(c?.seq) || c.seq <= 0)
      throw Error("Invalid action sequence.");
    validateAction(c);
  }
  return v;
}
function validateInput(v: MovementInput) {
  if (
    !Number.isSafeInteger(v.seq) ||
    v.seq < 0 ||
    !Number.isFinite(v.x) ||
    !Number.isFinite(v.y) ||
    Math.abs(v.x) > 1 ||
    Math.abs(v.y) > 1 ||
    typeof v.sprint !== "boolean"
  )
    throw Error("Invalid movement input.");
}
function validateAction(c: GameAction) {
  if (
    !c ||
    ![
      "select",
      "selectDefense",
      "selectDefender",
      "throw",
      "switch",
      "throwAway",
      "juke",
      "tackle",
      "swat",
      "pick",
      "punt",
      "snap",
      "next",
    ].includes(c.type)
  )
    throw Error("Invalid game action.");
  if (c.type === "select" && (typeof c.play !== "string" || c.play.length > 16))
    throw Error("Invalid play.");
  if (
    c.type === "selectDefense" &&
    (typeof c.defense !== "string" || c.defense.length > 16)
  )
    throw Error("Invalid coverage.");
  if (
    c.type === "selectDefender" &&
    (typeof c.id !== "string" || c.id.length > 8)
  )
    throw Error("Invalid defender.");
  if (c.type === "throw") {
    if (c.style !== undefined && !["bullet", "lob"].includes(c.style))
      throw Error("Invalid pass style.");
    if (c.receiver !== undefined) {
      if (!Number.isInteger(c.receiver) || c.receiver < 0 || c.receiver > 4)
        throw Error("Invalid receiver.");
    } else if (
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.y) ||
      c.x! < -10 ||
      c.x! > 110 ||
      c.y! < -5 ||
      c.y! > 58
    )
      throw Error("Invalid pass target.");
  }
}
