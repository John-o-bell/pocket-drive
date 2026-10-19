// A read of current separation, not a prediction of completion probability.
export function receiverRead(s, receiver) {
  const gap = Math.min(
    ...s.players
      .filter((p) => p.team === 1 && !p.blocked && p.stun <= 0)
      .map((p) => Math.hypot(p.x - receiver.x, p.y - receiver.y)),
  );
  return gap > 4
    ? { label: "OPEN", color: "#91f0bd" }
    : gap > 2
      ? { label: "TIGHT", color: "#ffdb9b" }
      : { label: "COVERED", color: "#ff956d" };
}

// Quick clicks assist a receiver; dragging throws to a ground location.
// Use this for both the preview and release so their targets cannot disagree.
export function pointerPassTarget(s, point, gesture = null) {
  if (!point) return null;
  const moved =
    gesture &&
    Math.hypot(
      gesture.current.x - gesture.start.x,
      gesture.current.y - gesture.start.y,
    ) > 6;
  if (gesture?.mode === "pull" && !moved) return null;
  const receiver =
    !moved &&
    s.players.find(
      (p) => p.eligible && Math.hypot(p.x - point.x, p.y - point.y) < 3,
    );
  return receiver
    ? { receiver: receiver.number - 1 }
    : { x: point.x, y: point.y };
}
