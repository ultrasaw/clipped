const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAgentContext } = require("../src/agentContext");

function createBaseRoom(overrides = {}) {
  const room = {
    id: "demo",
    createdAt: 100,
    phase: "chat",
    round: 1,
    maxRounds: 3,
    sparkPrompt: "favorite smell?",
    phaseStartedAt: 200,
    phaseEndsAt: 320,
    players: [
      { id: "h1", name: "Ava", role: "human", status: "alive" },
      { id: "h2", name: "Bea", role: "human", status: "alive" },
      { id: "ai_1", name: "Mara", role: "ai", status: "alive" },
    ],
    messages: [],
    sparkAnswers: {
      h1: "wet asphalt",
      h2: "oranges",
    },
    finalStatements: {},
    revealedVotes: null,
    revealedRoles: {},
    tiebreakPlayerIds: [],
    lastEjection: null,
  };

  return {
    ...room,
    ...overrides,
  };
}

test("buildAgentContext separates current-phase and prior human replies", () => {
  const room = createBaseRoom({
    messages: [
      { id: "m1", playerId: "h1", sender: "Ava", text: "old chat", kind: "chat", createdAt: 150 },
      { id: "m2", playerId: "h1", sender: "Ava", text: "current one", kind: "chat", createdAt: 210 },
      { id: "m3", playerId: "h2", sender: "Bea", text: "current two", kind: "chat", createdAt: 220 },
      { id: "m4", playerId: "h2", sender: "Bea", text: "older final", kind: "final", createdAt: 180 },
    ],
  });

  const context = buildAgentContext(room, room.players[2]);

  assert.equal(context.bothHumansRespondedThisPhase, true);
  assert.deepEqual(
    context.currentPhaseHumanReplies.map((group) => ({
      name: group.playerName,
      replies: group.replies.map((reply) => reply.text),
    })),
    [
      { name: "Ava", replies: ["current one"] },
      { name: "Bea", replies: ["current two"] },
    ],
  );
  assert.deepEqual(
    context.priorHumanReplies.map((group) => ({
      name: group.playerName,
      replies: group.replies.map((reply) => reply.text),
    })),
    [
      { name: "Ava", replies: ["wet asphalt", "old chat"] },
      { name: "Bea", replies: ["oranges", "older final"] },
    ],
  );
});

test("buildAgentContext marks bothHumansRespondedThisPhase false when one human is still missing", () => {
  const room = createBaseRoom({
    phase: "final_statements",
    messages: [{ id: "m1", playerId: "h1", sender: "Ava", text: "i'm still here", kind: "final", createdAt: 210 }],
  });

  const context = buildAgentContext(room, room.players[2]);

  assert.equal(context.bothHumansRespondedThisPhase, false);
  assert.deepEqual(
    context.currentPhaseHumanReplies.map((group) => group.replies.map((reply) => reply.text)),
    [["i'm still here"], []],
  );
});
