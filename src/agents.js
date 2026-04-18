const AI_NAMES = ["Mara", "Jules", "Theo", "Nia"];

const SPARK_ANSWERS = [
  "cold pizza",
  "rain smell",
  "too quiet",
  "tiny spoons",
  "night",
  "overthinking",
  "bad coffee",
  "long walks",
];

const CHAT_TEMPLATES = [
  "{target}, that felt a little too neat.",
  "I do not buy the confidence from {target}.",
  "{target}'s answer is normal, but maybe too normal.",
  "I keep rereading {target}. Something is off.",
  "Could be nothing, but {target} dodged the actual vibe.",
  "I trust {target} less after that.",
  "This room is making everyone sound rehearsed.",
  "I am more suspicious of the people trying very hard to be casual.",
];

const FINAL_TEMPLATES = [
  "My final read is {target}. Too controlled.",
  "I am voting {target}. The pattern feels careful.",
  "{target} still feels like the safest fake to me.",
  "If I am wrong, fine, but {target} is my best read.",
];

function createAiPlayers(startIndex = 0) {
  return AI_NAMES.map((name, index) => ({
    id: `ai_${index + startIndex + 1}`,
    name,
    role: "ai",
    status: "alive",
    connectionId: null,
  }));
}

function livingTargets(room, agentId) {
  return room.players.filter((player) => player.status === "alive" && player.id !== agentId);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fillTemplate(template, target) {
  return template.replaceAll("{target}", target.name);
}

function createMockAgentManager({ applyAction, broadcastState, logger, submitAction }) {
  const timeouts = new Set();

  function schedule(label, callback, delayMs) {
    logger?.debug("agent scheduled", { label, inMs: delayMs });

    const timeout = setTimeout(() => {
      timeouts.delete(timeout);
      callback();
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

  function handlePhaseEntered(room) {
    cancelAll();

    const agents = room.players.filter((player) => player.role === "ai" && player.status === "alive");
    logger?.info("agent manager handling phase", { phase: room.phase, agents: agents.length });

    if (room.phase === "spark") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} spark answer`, () => {
          submitAiAction(room, {
            type: "SUBMIT_SPARK",
            playerId: agent.id,
            text: pick(SPARK_ANSWERS),
          });
        }, 500 + index * 350);
      });
    }

    if (room.phase === "chat") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} chat message`, () => {
          const target = pick(livingTargets(room, agent.id));

          if (!target) {
            logger?.warn("agent has no chat target", { agent: agent.name });
            return;
          }

          submitAiAction(room, {
            type: "SEND_CHAT",
            playerId: agent.id,
            text: fillTemplate(pick(CHAT_TEMPLATES), target),
          });
        }, 1_200 + index * 1_500);
      });
    }

    if (room.phase === "final_statements") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} final statement`, () => {
          const target = pick(livingTargets(room, agent.id));

          if (!target) {
            logger?.warn("agent has no final target", { agent: agent.name });
            return;
          }

          submitAiAction(room, {
            type: "SUBMIT_FINAL",
            playerId: agent.id,
            text: fillTemplate(pick(FINAL_TEMPLATES), target),
          });
        }, 500 + index * 400);
      });
    }

    if (room.phase === "vote") {
      agents.forEach((agent, index) => {
        schedule(`${agent.name} vote`, () => {
          const target = pick(livingTargets(room, agent.id));

          if (!target) {
            logger?.warn("agent has no vote target", { agent: agent.name });
            return;
          }

          submitAiAction(room, {
            type: "CAST_VOTE",
            voterId: agent.id,
            targetId: target.id,
          });
        }, 650 + index * 450);
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
