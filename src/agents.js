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

function pickRandomSubset(list, minCount, maxCount) {
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  const desiredCount = Math.min(
    shuffled.length,
    minCount + Math.floor(Math.random() * (Math.max(maxCount - minCount + 1, 1))),
  );

  return shuffled.slice(0, Math.max(1, desiredCount));
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsPlayer(messageText, playerName) {
  const pattern = new RegExp(`\\b${escapeRegex(playerName)}\\b`, "i");
  return pattern.test(String(messageText || ""));
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getTextActionTiming(text) {
  const wordCount = Math.max(1, countWords(text));
  const typingDurationMs = Math.round((wordCount / 55) * 60 * 1000) + randomInt(250, 550);
  const preTypingDelayMs = randomInt(150, 650);

  return {
    wordCount,
    typingDurationMs,
    preTypingDelayMs,
    sendDelayMs: preTypingDelayMs + typingDurationMs,
  };
}

function pickSparkAnswerDelay(room, index, totalAgents) {
  const remainingMs = Math.max(1_500, (room.phaseEndsAt || Date.now() + 8_000) - Date.now());
  const lateWindowMs = Math.min(5_000, Math.max(2_500, remainingMs - 1_000));
  const lateStartMs = Math.max(900, remainingMs - lateWindowMs);
  const lateEndMs = Math.max(lateStartMs, remainingMs - 700);
  const shouldAnswerLate = remainingMs <= 7_000 || Math.random() < 0.8;

  if (!shouldAnswerLate || lateStartMs <= 1_200) {
    return randomInt(700, Math.max(900, lateStartMs));
  }

  const slotWidth = Math.max(300, Math.floor((lateEndMs - lateStartMs) / Math.max(totalAgents, 1)));
  const slotStart = Math.min(lateEndMs, lateStartMs + index * slotWidth);
  const slotEnd = Math.min(lateEndMs, Math.max(slotStart, slotStart + slotWidth - 150));

  return randomInt(slotStart, Math.max(slotStart, slotEnd));
}

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
  const pendingChatAgentIds = new Set();

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
    pendingChatAgentIds.clear();
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

  async function setAgentTyping(room, player, isTyping) {
    await submitAiAction(room, {
      type: "SET_TYPING",
      playerId: player.id,
      isTyping,
    });
  }

  async function generateAgentActions(room, player, methodName, options = {}) {
    const agent = getRuntimeAgent(player);
    const context = buildAgentContext(room, player, options);

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
      return [];
    }

    return (Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions]).filter(Boolean);
  }

  async function runAgentMethod(room, player, methodName, options = {}) {
    const actions = await generateAgentActions(room, player, methodName, options);

    for (const action of actions) {
      logger?.info("agent produced action", {
        agent: player.name,
        method: methodName,
        type: action.type,
        text: action.text,
        targetId: action.targetId,
      });
      await submitAiAction(room, action);
    }

    return actions;
  }

  function scheduleTimedTextAction(room, player, delayMs, options) {
    const { methodName, expectedType, phase, timingLabel } = options;

    schedule(`${player.name} prepare ${timingLabel}`, async () => {
      if (room.phase !== phase) {
        return;
      }

      const actions = await generateAgentActions(room, player, methodName);
      const textAction = actions.find((action) => action.type === expectedType && action.text);

      if (!textAction) {
        return;
      }

      const { wordCount, typingDurationMs, preTypingDelayMs, sendDelayMs } = getTextActionTiming(
        textAction.text,
      );

      logger?.info("agent response timing", {
        agent: player.name,
        phase,
        words: wordCount,
        preTypingDelayMs,
        typingDurationMs,
        sendInMs: sendDelayMs,
        preview: textAction.text,
      });

      schedule(`${player.name} ${timingLabel} typing start`, async () => {
        if (room.phase !== phase) {
          return;
        }

        await setAgentTyping(room, player, true);
      }, preTypingDelayMs);

      schedule(`${player.name} ${timingLabel}`, async () => {
        if (room.phase !== phase) {
          return;
        }

        try {
          logger?.info("agent produced action", {
            agent: player.name,
            method: methodName,
            type: textAction.type,
            text: textAction.text,
            targetId: textAction.targetId,
          });
          await submitAiAction(room, textAction);
        } finally {
          await setAgentTyping(room, player, false);
        }
      }, sendDelayMs);
    }, delayMs);
  }

  function scheduleChatResponse(room, player, delayMs) {
    pendingChatAgentIds.add(player.id);
    const recentChatMessages = room.messages
      .filter((message) => message.kind === "chat")
      .slice(-3)
      .map((message) => ({
        id: message.id,
        playerId: message.playerId,
        sender: message.sender,
        text: message.text,
        kind: message.kind,
        createdAt: message.createdAt,
      }));

    schedule(`${player.name} prepare chat response`, async () => {
      try {
        if (room.phase !== "chat") {
          return;
        }

        const actions = await generateAgentActions(room, player, "getChatActions", { recentChatMessages });
        const chatAction = actions.find((action) => action.type === "SEND_CHAT" && action.text);

        if (!chatAction) {
          return;
        }

        const { wordCount, typingDurationMs, preTypingDelayMs, sendDelayMs } = getTextActionTiming(
          chatAction.text,
        );

        logger?.info("agent response timing", {
          agent: player.name,
          words: wordCount,
          preTypingDelayMs,
          typingDurationMs,
          sendInMs: sendDelayMs,
          preview: chatAction.text,
        });

        schedule(`${player.name} typing start`, async () => {
          if (room.phase !== "chat") {
            return;
          }

          await setAgentTyping(room, player, true);
        }, preTypingDelayMs);

        schedule(`${player.name} chat response`, async () => {
          try {
            if (room.phase !== "chat") {
              return;
            }

            logger?.info("agent produced action", {
              agent: player.name,
              method: "getChatActions",
              type: chatAction.type,
              text: chatAction.text,
              targetId: chatAction.targetId,
            });
            await submitAiAction(room, chatAction);
            await setAgentTyping(room, player, false);
          } finally {
            pendingChatAgentIds.delete(player.id);
          }
        }, sendDelayMs);
      } catch (error) {
        pendingChatAgentIds.delete(player.id);
        throw error;
      }
    }, delayMs);
  }

  function handleChatActivity(room, message) {
    if (room.phase !== "chat") {
      return;
    }

    const agents = room.players.filter((player) => player.role === "ai" && player.status === "alive");

    for (const agent of agents) {
      if (agent.id === message.playerId || pendingChatAgentIds.has(agent.id)) {
        continue;
      }

      const responseProbability = mentionsPlayer(message.text, agent.name) ? 0.8 : 0.4;

      if (Math.random() > responseProbability) {
        continue;
      }

      scheduleChatResponse(room, agent, randomInt(250, 1200));
    }
  }

  function handlePhaseEntered(room) {
    cancelAll();

    const agents = room.players.filter((player) => player.role === "ai" && player.status === "alive");
    logger?.info("agent manager handling phase", { phase: room.phase, agents: agents.length });

    if (room.phase === "spark") {
      const shuffledAgents = [...agents].sort(() => Math.random() - 0.5);

      shuffledAgents.forEach((agent, index) => {
        schedule(
          `${agent.name} spark answer`,
          () => runAgentMethod(room, agent, "getSparkAction"),
          pickSparkAnswerDelay(room, index, shuffledAgents.length),
        );
      });
    }

    if (room.phase === "chat") {
      const visibleTypers = pickRandomSubset(agents, 1, Math.min(3, agents.length));

      visibleTypers.forEach((agent, index) => {
        scheduleChatResponse(room, agent, randomInt(200, 900) + index * 180);
      });
    }

    if (room.phase === "final_statements") {
      agents.forEach((agent, index) => {
        scheduleTimedTextAction(room, agent, 500 + index * 400, {
          methodName: "getFinalStatementAction",
          expectedType: "SUBMIT_FINAL",
          phase: "final_statements",
          timingLabel: "final statement",
        });
      });
    }

    if (room.phase === "tiebreak_statements") {
      const tiedAgents = agents.filter((agent) => room.tiebreakPlayerIds.includes(agent.id));

      tiedAgents.forEach((agent, index) => {
        scheduleTimedTextAction(room, agent, 500 + index * 400, {
          methodName: "getTiebreakStatementAction",
          expectedType: "SUBMIT_TIEBREAK",
          phase: "tiebreak_statements",
          timingLabel: "tiebreak statement",
        });
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
    handleChatActivity,
    handlePhaseEntered,
    cancelAll,
  };
}

module.exports = {
  createAiPlayers,
  createMockAgentManager,
};
