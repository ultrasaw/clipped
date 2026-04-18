const { BaseAgent } = require("./agentContract");
const { buildAgentContext } = require("./agentContext");

const AI_ROSTER = [
  {
    name: "Mara",
    personalityPrompt: "Warm, observant, and lightly skeptical. Speaks casually and notices social tone.",
  },
  {
    name: "Jules",
    personalityPrompt: "Guarded, dry, and pattern-focused. Short replies, a little suspicious of everyone.",
  },
  {
    name: "Theo",
    personalityPrompt: "Playful, confident, and socially agile. Likes teasing reads without sounding robotic.",
  },
  {
    name: "Nia",
    personalityPrompt: "Calm, sharp, and understated. Tends to sound thoughtful rather than loud.",
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
    personalityPrompt: profile?.personalityPrompt || "Natural, human-sounding, and a bit suspicious.",
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

  function submitAiAction(room, action) {
    if (submitAction) {
      submitAction(action, { source: "agent" });
      return;
    }

    const result = applyAction(room, action, { source: "agent" });

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
      submitAiAction(room, action);
    }
  }

  function handlePhaseEntered(room) {
    cancelAll();

    const agents = room.players.filter((player) => player.role === "ai" && player.status === "alive");
    logger?.info("agent manager handling phase", { phase: room.phase, agents: agents.length });

    if (room.phase === "spark") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} spark answer`, () => runAgentMethod(room, agent, "getSparkAction"), 500 + index * 350);
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
