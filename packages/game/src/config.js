export const DT = 1 / 60;

export const PASS_TYPES = {
  bullet: { speed: 38, arc: 1.6, maxRange: 45, minTime: 0.18 },
  lob: { speed: 22, arc: 7, maxRange: 70, minTime: 0.4 },
};

export const PLAYS = {
  slants: {
    name: "Quick slants",
    type: "PASS",
    desc: "Beat the blitz. Hit a receiver in stride.",
    routes: [
      [
        [6, 8],
        [24, 13],
      ],
      [
        [6, -8],
        [24, -13],
      ],
      [
        [5, 7],
        [22, 7],
      ],
      [
        [8, -4],
        [24, -4],
      ],
    ],
    rbRoute: [
      [1, 9],
      [13, 9],
    ],
  },
  verticals: {
    name: "Four verticals",
    type: "PASS",
    desc: "Four deep routes. Check down to the back.",
    routes: [[[52, 0]], [[52, 0]], [[45, 0]], [[40, 2]]],
    rbRoute: [
      [3, 8],
      [10, 8],
    ],
  },
  cross: {
    name: "Mesh cross",
    type: "PASS",
    desc: "Cross underneath the linebackers.",
    routes: [
      [
        [5, 0],
        [10, 29],
        [26, 29],
      ],
      [
        [8, 0],
        [13, -29],
        [29, -29],
      ],
      [
        [16, 0],
        [24, -9],
      ],
      [
        [6, 0],
        [12, 9],
      ],
    ],
    rbRoute: [
      [1, -10],
      [14, -10],
    ],
  },
  screen: {
    name: "RB screen",
    type: "PASS",
    desc: "Let the rush in. Throw to RB with 5.",
    routes: [
      [[28, 0]],
      [[30, 0]],
      [
        [18, -8],
        [32, -8],
      ],
      [
        [9, 5],
        [20, 5],
      ],
    ],
    rbRoute: [
      [5, 10],
      [17, 10],
    ],
    release: 0.35,
  },
  inside: {
    name: "Inside zone",
    type: "RUN",
    desc: "Take the handoff. Read the inside blocks.",
    runPath: [
      [-2, 0],
      [3, -2],
      [18, -2],
    ],
    handoff: 0.55,
  },
  sweep: {
    name: "Outside sweep",
    type: "RUN",
    desc: "Follow the pulling guard. Turn upfield.",
    runPath: [
      [-3, -6],
      [0, -12],
      [20, -12],
    ],
    handoff: 0.55,
  },
  draw: {
    name: "Shotgun draw",
    type: "RUN",
    desc: "Sell the pass, then burst through the middle.",
    runPath: [
      [-2, 0],
      [4, 2],
      [18, 2],
    ],
    handoff: 1.05,
  },
};

export const DEFENSES = {
  cover2: "COVER 2",
  cover3: "COVER 3",
  man: "MAN FREE",
  blitz: "LB BLITZ",
};

export const DEFENSE_CALLS = {
  cover2: {
    name: "Cover 2",
    desc: "Two safeties deep. Rally to short passes.",
  },
  cover3: {
    name: "Cover 3",
    desc: "Protect the deep thirds. Watch the seams.",
  },
  man: { name: "Man free", desc: "Match receivers. Safety help over the top." },
  blitz: {
    name: "LB blitz",
    desc: "Send the middle linebacker. Get home fast.",
  },
};
