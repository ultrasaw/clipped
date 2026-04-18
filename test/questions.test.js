const test = require("node:test");
const assert = require("node:assert/strict");

const { buildIdentityBlock, buildVoiceGuidance, summarizeContext } = require("../src/questions");

test("identity block includes persona strategy metadata", () => {
  const identity = buildIdentityBlock("Mara", "warm and observant", "Blend both humans without copying", "Stay human");

  assert.match(identity, /Voice strategy: Blend both humans without copying/);
  assert.match(identity, /Gameplay guidance: Stay human/);
});

test("context summary groups both humans and avoids a single-anchor mimic framing", () => {
  const summary = summarizeContext({
    game: {
      phase: "chat",
      round: 2,
      maxRounds: 3,
      sparkPrompt: "best snack?",
    },
    players: [
      { id: "ai_1", name: "Mara", status: "alive", isSelf: true, revealedRole: null },
      { id: "h1", name: "Ava", status: "alive", isSelf: false, revealedRole: null },
      { id: "h2", name: "Bea", status: "alive", isSelf: false, revealedRole: null },
    ],
    humanPlayers: [
      { id: "h1", name: "Ava", status: "alive" },
      { id: "h2", name: "Bea", status: "alive" },
    ],
    bothHumansRespondedThisPhase: true,
    currentPhaseHumanReplies: [
      { playerId: "h1", playerName: "Ava", replies: [{ kind: "chat", phase: "chat", text: "tiny answer" }] },
      { playerId: "h2", playerName: "Bea", replies: [{ kind: "chat", phase: "chat", text: "different vibe" }] },
    ],
    priorHumanReplies: [
      { playerId: "h1", playerName: "Ava", replies: [{ kind: "spark", phase: "spark", text: "mint" }] },
      { playerId: "h2", playerName: "Bea", replies: [{ kind: "spark", phase: "spark", text: "coffee" }] },
    ],
    legalTargets: [],
    messages: [],
  });

  assert.match(summary, /Both humans responded this phase: yes/);
  assert.match(summary, /Current-phase human replies:/);
  assert.match(summary, /Ava: chat\/chat: tiny answer/);
  assert.match(summary, /Bea: chat\/chat: different vibe/);
  assert.doesNotMatch(summary, /Human reply samples to mimic/);
});

test("voice guidance explicitly allows distinct but plausible angles", () => {
  const guidance = buildVoiceGuidance();

  assert.match(guidance, /use both humans together as input/i);
  assert.match(guidance, /Never copy another player's exact wording/i);
  assert.match(guidance, /different but still plausible angle/i);
});
