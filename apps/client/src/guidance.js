// Guidance follows the player's view of possession, including online guests.
export function playGuidance(s, { online = false, aiming = false } = {}) {
  const defending = s.possession === 1;
  const defender = s.players.find((p) => p.id === s.selectedDefender);
  if (s.phase === "final")
    return {
      title: "Final whistle",
      controls: online
        ? "Request a rematch · Both players must agree"
        : "Enter / Play again",
      next: online
        ? "Request a rematch in the lobby."
        : "Press Enter to start a new game.",
    };
  if (s.phase === "dead") {
    const next =
      online && defending
        ? "Your opponent advances the play."
        : s.possessionEnded
          ? "Enter / Change possession · Get ready to switch sides"
          : "Enter / Next play · Choose your next call";
    return {
      title: s.possessionEnded ? "Drive complete" : "Play complete",
      controls: next,
      next,
    };
  }
  if (s.phase === "ready")
    return defending
      ? {
          title: `You control ${defender?.role || "a defender"} · Cyan ring`,
          controls: `Choose coverage · Q / Switch defender · ${online ? "Opponent calls the snap" : "Enter / Let them snap"}`,
          next: "",
        }
      : {
          title: "Your ball · Choose a play",
          controls: `Select a play card · Enter / Snap${s.down === 4 ? " · Punt is available on fourth down" : ""}`,
          next: "",
        };
  if (defending)
    return {
      title: `You control ${defender?.role || "a defender"} · Cyan ring`,
      controls:
        defender?.stun > 0
          ? "Recovering · Q / Switch to another defender"
          : defender?.blocked
            ? "Space / Shed block · Q / Switch defender"
            : s.ball
              ? "Move to the landing ring · E / Swat · R / Pick · Time the arrival"
              : "WASD or arrows / Move · Shift / Sprint · Q / Switch · Space / Tackle",
      next: "",
    };
  if (s.handoff > 0)
    return {
      title: "Handoff in progress",
      controls:
        "Your running back takes the ball automatically · Steer after the handoff",
      next: "",
    };
  if (s.ball)
    return {
      title: "Pass in flight · Watch the landing ring",
      controls:
        "After the catch, steer with WASD or arrows · Shift / Sprint · Space / Juke",
      next: "",
    };
  if (s.carrier === "qb" && !s.passThrown)
    return {
      title: aiming ? "Aim your pass" : "You control QB · Gold ring",
      controls: aiming
        ? "Release / Throw · F / Change bullet or lob"
        : "WASD / Move · Drag and release / Pass · 1–5 / Receivers · F / Arc · X / Throw away",
      next: "",
    };
  return {
    title:
      s.carrier === "qb"
        ? "QB scramble · Run for the yellow line"
        : "You control the runner · Gold ring",
    controls:
      "WASD or arrows / Steer · Shift / Sprint · Space / Juke · Follow your blockers",
    next: "",
  };
}
