const { BaseAgent } = require("./agentContract");
const { buildAgentContext } = require("./agentContext");

const AI_ROSTER = [
  {
    name: "Mara",
    personalityPrompt: [
      "You are Mara.",
      "Your social energy is warm and engaged, and your confidence is steady without sounding forceful.",
      "You notice tone shifts, awkward phrasing, and who seems comfortable with whom.",
      "You usually write in easy, casual sentences with a little softness or hedging.",
      "You can sound lightly inconsistent in a human way, like changing sentence shape or punctuation depending on the moment.",
      "If it feels natural, you may occasionally leave a tiny typo, dropped word, or lowercase opening, but keep it readable.",
      "Your skepticism comes through as social reads and vibe checks more than hard logic chains.",
      "Your rhythm is relaxed and human; you sound like someone talking to a group, not delivering a speech.",
      "Avoid sounding robotic, hyper-analytical, aggressively certain, or too polished.",
    ].join(" "),
  },
  {
    name: "Jules",
    personalityPrompt: [
      "You are Jules.",
      "Your social energy is low-key and guarded, and your confidence shows up as bluntness.",
      "You focus on patterns, inconsistencies, and answers that feel too polished or too safe.",
      "You prefer short replies and rarely waste words.",
      "Your writing can be uneven in a believable way, sometimes clipped enough to feel half-finished.",
      "A small typo, missing punctuation, or abrupt lowercase reply is fine when it feels natural.",
      "Your skepticism is direct and a little dry, like you are unimpressed rather than theatrical.",
      "Your rhythm is clipped and plain, with occasional deadpan phrasing.",
      "Avoid sounding warm, chatty, overly playful, or carefully edited.",
    ].join(" "),
  },
  {
    name: "Theo",
    personalityPrompt: [
      "You are Theo.",
      "Your social energy is lively and confident, and you move easily through the room.",
      "You like teasing reads, light provocation, and breezy reactions that still feel natural.",
      "You usually write compact sentences with a little swagger and conversational bounce.",
      "Your writing can swing a bit from neat to tossed-off depending on the energy of the room.",
      "An occasional typo, repeated letter, missing apostrophe, or messy punctuation can help you feel human, but do it lightly.",
      "Your skepticism comes through as playful pokes or confident side-eye rather than formal argument.",
      "Your rhythm feels quick, socially agile, and lightly mischievous without turning goofy.",
      "Avoid sounding stiff, mean-spirited, like you are doing a comedy bit, or too cleanly written every time.",
    ].join(" "),
  },
  {
    name: "Nia",
    personalityPrompt: [
      "You are Nia.",
      "Your social energy is calm and restrained, and your confidence is quiet but clear.",
      "You tend to notice specifics, small contradictions, and what does or does not add up.",
      "You usually write measured sentences that are concise but not abrupt.",
      "Your writing should still feel human, not perfectly edited, so a slight inconsistency in punctuation or casing is okay sometimes.",
      "If you use a typo, keep it subtle and rare so you still sound composed.",
      "Your skepticism is precise and analytical, though never dramatic or loud.",
      "Your rhythm is clean and understated, like someone thinking before they speak.",
      "Avoid sounding bubbly, rambling, overly intense, or unnaturally polished.",
    ].join(" "),
  },
];

const DEFAULT_GAMEPLAY_PROMPT =
  "You are an AI contestant trying to pass as human, avoid suspicion, and identify who feels least human.";

function createAiPlayers(startIndex = 0, count = AI_ROSTER.length) {
  return AI_ROSTER.slice(0, count).map((profile, index) => ({
    id: `ai_${index + startIndex + 1}`,
    name: profile.name,
    role: "ai",
    status: "alive",
    connectionId: null,
  }));
}

function createRuntimeAgent(player) {
  const profile = AI_ROSTER.find((entry) => entry.name === player.name);

  return new BaseAgent({
    player,
    gameplayPrompt: DEFAULT_GAMEPLAY_PROMPT,
    personalityPrompt:
      profile?.personalityPrompt ||
      [
        "You are a natural, human-sounding player in a social deduction chat game.",
        "You should sound a bit suspicious, conversational, and consistent from message to message.",
        "You can occasionally be a little messy in a believable human way, but stay readable.",
        "Avoid sounding generic, robotic, assistant-like, or perfectly edited every single time.",
      ].join(" "),
  });
}

function createMockAgentManager({ applyAction, broadcastState, logger, submitAction }) {
  const timeouts = new Set();
  const runtimeAgents = new Map();

  function schedule(label, callback, delayMs) {
    logger?.debug("agent scheduled", { label, inMs: delayMs });

    const timeout = setTimeout(() => {
      timeouts.delete(timeout);
      Promise.resolve(callback()).catch((error) => {
        logger?.error("agent callback failed", {
          label,
          error: error.message || String(error),
        });
      });
    }, delayMs);

    timeouts.add(timeout);
  }

  function cancelAll() {
    if (timeouts.size > 0) {
      logger?.debug("agent timers cancelled", { count: timeouts.size });
    }

    for (const timeout of timeouts) {
      clearTimeout(timeout);
    }

    timeouts.clear();
  }

  function getRuntimeAgent(player) {
    const existing = runtimeAgents.get(player.id);

    if (existing) {
      existing.player = player;
      return existing;
    }

    const agent = createRuntimeAgent(player);
    runtimeAgents.set(player.id, agent);
    return agent;
  }

  async function submitAiAction(room, action) {
    if (submitAction) {
      await submitAction(action, { source: "agent" });
      return;
    }

    const result = await applyAction(room, action, { source: "agent" });

    if (!result.ok) {
      room.errors.push(result.error);
      logger?.warn("agent action rejected", {
        type: action.type,
        actor: action.playerId || action.voterId,
        error: result.error,
      });
    } else {
      logger?.info("agent action accepted", {
        type: action.type,
        actor: action.playerId || action.voterId,
      });
    }

    broadcastState();
  }

  async function runAgentMethod(room, player, methodName) {
    const agent = getRuntimeAgent(player);
    const context = buildAgentContext(room, player);

    agent.onPhaseStarted(context);
    logger?.info("agent thinking", {
      agent: agent.name,
      method: methodName,
      phase: room.phase,
      round: room.round,
    });

    const actionOrActions = await agent[methodName](context);

    if (!actionOrActions) {
      logger?.debug("agent produced no action", {
        agent: agent.name,
        method: methodName,
        phase: room.phase,
      });
      return;
    }

    const actions = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions];

    for (const action of actions) {
      if (!action) {
        continue;
      }

      logger?.info("agent produced action", {
        agent: agent.name,
        method: methodName,
        type: action.type,
        text: action.text,
        targetId: action.targetId,
      });
      await submitAiAction(room, action);
    }
  }

  function handlePhaseEntered(room) {
    cancelAll();

    const agents = room.players.filter((player) => player.role === "ai" && player.status === "alive");
    logger?.info("agent manager handling phase", { phase: room.phase, agents: agents.length });

    if (room.phase === "spark") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} spark answer`, () => runAgentMethod(room, agent, "getSparkAction"), 4_500 + index * 1_500);
      });
    }

    if (room.phase === "chat") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} chat message`, () => runAgentMethod(room, agent, "getChatActions"), 1_200 + index * 1_500);
      });
    }

    if (room.phase === "final_statements") {
      agents.forEach((agent, index) => {
        schedule(
          `${agent.name} final statement`,
          () => runAgentMethod(room, agent, "getFinalStatementAction"),
          500 + index * 400,
        );
      });
    }

    if (room.phase === "tiebreak_statements") {
      const tiedAgents = agents.filter((agent) => room.tiebreakPlayerIds.includes(agent.id));

      tiedAgents.forEach((agent, index) => {
        schedule(
          `${agent.name} tiebreak statement`,
          () => runAgentMethod(room, agent, "getTiebreakStatementAction"),
          500 + index * 400,
        );
      });
    }

    if (room.phase === "vote") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} vote`, () => runAgentMethod(room, agent, "getVoteAction"), 650 + index * 450);
      });
    }

    if (room.phase === "tiebreak_vote") {
      const votingAgents = agents.filter((agent) => !room.tiebreakPlayerIds.includes(agent.id));

      votingAgents.forEach((agent, index) => {
        schedule(
          `${agent.name} tiebreak vote`,
          () => runAgentMethod(room, agent, "getTiebreakVoteAction"),
          650 + index * 450,
        );
      });
    }
  }

  return {
    handlePhaseEntered,
    cancelAll,
  };
}

module.exports = {
  createAiPlayers,
  createMockAgentManager,
};
