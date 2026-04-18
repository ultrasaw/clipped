const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AI_ROSTER,
  createMockAgentManager,
  getFallbackDelayMs,
  WAIT_FOR_BOTH_CURRENT_PHASE,
} = require("../src/agents");

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    setTimeout(fn, delayMs) {
      const handle = { id: nextId++ };
      timers.set(handle.id, { fn, at: now + Math.max(0, delayMs) });
      return handle;
    },
    clearTimeout(handle) {
      if (!handle) {
        return;
      }

      timers.delete(handle.id);
    },
    async advance(ms) {
      const targetTime = now + ms;

      while (true) {
        const dueEntries = [...timers.entries()]
          .filter(([, timer]) => timer.at <= targetTime)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0]);

        if (!dueEntries.length) {
          break;
        }

        const [id, timer] = dueEntries[0];
        timers.delete(id);
        now = timer.at;
        await timer.fn();
        await Promise.resolve();
      }

      now = targetTime;
    },
  };
}

function createRoom(phase, overrides = {}) {
  return {
    id: "demo",
    createdAt: 0,
    phase,
    round: 1,
    maxRounds: 3,
    sparkPrompt: "best soup?",
    phaseStartedAt: 1_000,
    phaseEndsAt: phase === "chat" ? 121_000 : 31_000,
    players: [
      { id: "h1", name: "Ava", role: "human", status: "alive" },
      { id: "h2", name: "Bea", role: "human", status: "alive" },
      ...AI_ROSTER.map((profile, index) => ({
        id: `ai_${index + 1}`,
        name: profile.name,
        role: "ai",
        status: "alive",
      })),
    ],
    messages: [],
    sparkAnswers: {},
    finalStatements: {},
    tiebreakPlayerIds: [],
    revealedVotes: null,
    revealedRoles: {},
    lastEjection: null,
    errors: [],
    ...overrides,
  };
}

function createAgentFactory() {
  const profileByName = new Map(AI_ROSTER.map((profile) => [profile.name, profile]));

  return (player) => ({
    player,
    name: player.name,
    timingProfile: profileByName.get(player.name)?.timingProfile,
    onPhaseStarted() {},
    async getSparkAction() {
      return { type: "SUBMIT_SPARK", playerId: player.id, text: `${player.name} spark` };
    },
    async getChatActions() {
      return [{ type: "SEND_CHAT", playerId: player.id, text: `${player.name} chat` }];
    },
    async getFinalStatementAction() {
      return { type: "SUBMIT_FINAL", playerId: player.id, text: `${player.name} final` };
    },
    async getVoteAction() {
      return { type: "CAST_VOTE", voterId: player.id, targetId: "h1" };
    },
    async getTiebreakStatementAction() {
      return { type: "SUBMIT_TIEBREAK", playerId: player.id, text: `${player.name} tiebreak` };
    },
    async getTiebreakVoteAction() {
      return { type: "CAST_TIEBREAK_VOTE", voterId: player.id, targetId: "h1" };
    },
  });
}

function getNonTypingActions(submitted) {
  return submitted.filter((action) => action.type !== "SET_TYPING");
}

test("all spark AIs wait for both human spark answers before replying", async () => {
  const timers = createFakeTimers();
  const submitted = [];
  const room = createRoom("spark");
  const manager = createMockAgentManager({
    agentFactory: createAgentFactory(),
    applyAction: async () => ({ ok: true }),
    broadcastState: () => {},
    logger: null,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    submitAction: async (action) => {
      submitted.push(action);
    },
  });

  manager.handlePhaseEntered(room);
  await timers.advance(getFallbackDelayMs(room) - 1);
  assert.equal(getNonTypingActions(submitted).length, 0);

  room.sparkAnswers.h1 = "ramen";
  manager.handleActionAccepted(room, { type: "SUBMIT_SPARK", playerId: "h1", text: "ramen" });
  assert.equal(getNonTypingActions(submitted).length, 0);

  room.sparkAnswers.h2 = "soba";
  manager.handleActionAccepted(room, { type: "SUBMIT_SPARK", playerId: "h2", text: "soba" });
  await timers.advance(2_000);

  assert.equal(getNonTypingActions(submitted).length, 4);
  assert.deepEqual(
    getNonTypingActions(submitted).map((action) => action.type),
    ["SUBMIT_SPARK", "SUBMIT_SPARK", "SUBMIT_SPARK", "SUBMIT_SPARK"],
  );
});

test("chat phase releases proactive personas early and reactive personas after both humans speak", async () => {
  const timers = createFakeTimers();
  const submitted = [];
  const room = createRoom("chat");
  const manager = createMockAgentManager({
    agentFactory: createAgentFactory(),
    applyAction: async () => ({ ok: true }),
    broadcastState: () => {},
    logger: null,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    submitAction: async (action) => {
      submitted.push(action);
    },
  });

  manager.handlePhaseEntered(room);
  await timers.advance(10_000);

  assert.deepEqual(
    getNonTypingActions(submitted).map((action) => action.playerId),
    ["ai_2", "ai_3"],
  );

  room.messages.push({ id: "m1", playerId: "h1", sender: "Ava", text: "first", kind: "chat", createdAt: 2_000 });
  manager.handleActionAccepted(room, { type: "SEND_CHAT", playerId: "h1", text: "first" });
  await timers.advance(6_000);
  assert.deepEqual(
    getNonTypingActions(submitted).map((action) => action.playerId),
    ["ai_2", "ai_3"],
  );

  room.messages.push({ id: "m2", playerId: "h2", sender: "Bea", text: "second", kind: "chat", createdAt: 3_000 });
  manager.handleActionAccepted(room, { type: "SEND_CHAT", playerId: "h2", text: "second" });
  await timers.advance(8_000);

  assert.deepEqual(
    [...getNonTypingActions(submitted).map((action) => action.playerId)].sort(),
    ["ai_1", "ai_2", "ai_3", "ai_4"],
  );
});

test("waiting personas fall back near the deadline if one human never replies", async () => {
  const timers = createFakeTimers();
  const submitted = [];
  const room = createRoom("chat", {
    messages: [{ id: "m1", playerId: "h1", sender: "Ava", text: "only one", kind: "chat", createdAt: 2_000 }],
  });
  const manager = createMockAgentManager({
    agentFactory: createAgentFactory(),
    applyAction: async () => ({ ok: true }),
    broadcastState: () => {},
    logger: null,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    submitAction: async (action) => {
      submitted.push(action);
    },
  });

  manager.handlePhaseEntered(room);
  await timers.advance(getFallbackDelayMs(room) + 8_000);

  const reactiveIds = AI_ROSTER.filter((profile) => profile.timingProfile === WAIT_FOR_BOTH_CURRENT_PHASE).map(
    (profile) => `ai_${AI_ROSTER.findIndex((entry) => entry.name === profile.name) + 1}`,
  );

  assert.ok(getNonTypingActions(submitted).some((action) => reactiveIds.includes(action.playerId)));
});
