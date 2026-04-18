const { BaseAgent } = require("./agentContract");
const { buildAgentContext, hasBothHumansRespondedThisPhase } = require("./agentContext");

const WAIT_FOR_BOTH_CURRENT_PHASE = "wait_for_both_current_phase";
const USE_PRIOR_SIGNALS_NOW = "use_prior_signals_now";

const AI_ROSTER = [
  {
    name: "Mara",
    timingProfile: WAIT_FOR_BOTH_CURRENT_PHASE,
    mimicStrategyPrompt: [
      "Blend both humans' cadence and social texture into a warm, natural reply.",
      "Use both voices together as inspiration, but do not echo either one directly.",
      "Sound like you belong in the room, not like you're quoting someone.",
    ].join(" "),
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
    timingProfile: USE_PRIOR_SIGNALS_NOW,
    mimicStrategyPrompt: [
      "Use prior human signals as context, then answer from a terser, more contrarian angle.",
      "Do not mirror either human too closely.",
      "Let the reply feel grounded in the room while still being noticeably your own take.",
    ].join(" "),
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
    timingProfile: USE_PRIOR_SIGNALS_NOW,
    mimicStrategyPrompt: [
      "Use prior human signals, then pivot playfully into something unexpectedly angled or oddly specific.",
      "You can sound noticeably different from the humans, but the reply still needs to fit the prompt and feel plausible.",
      "Aim for socially agile contrast, not randomness.",
    ].join(" "),
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
    timingProfile: WAIT_FOR_BOTH_CURRENT_PHASE,
    mimicStrategyPrompt: [
      "Wait for both current human replies, then remix them into a measured, analytical response.",
      "Pull in what feels useful from each human without mirroring their wording.",
      "You should sound composed and observant, not copied.",
    ].join(" "),
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
    timingProfile: profile?.timingProfile || USE_PRIOR_SIGNALS_NOW,
    mimicStrategyPrompt:
      profile?.mimicStrategyPrompt ||
      [
        "Use both humans as reference points instead of copying one.",
        "Stay recognizably yourself even when you blend in.",
        "A different angle is good; obvious copying is not.",
      ].join(" "),
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

function getPhaseKey(room) {
  return `${room.phase}:${room.round}:${room.phaseStartedAt || 0}`;
}

function getActionMethodName(room) {
  if (room.phase === "spark") {
    return "getSparkAction";
  }

  if (room.phase === "chat") {
    return "getChatActions";
  }

  if (room.phase === "final_statements") {
    return "getFinalStatementAction";
  }

  if (room.phase === "tiebreak_statements") {
    return "getTiebreakStatementAction";
  }

  if (room.phase === "vote") {
    return "getVoteAction";
  }

  if (room.phase === "tiebreak_vote") {
    return "getTiebreakVoteAction";
  }

  return null;
}

function getInitialDelayMs(phase, index) {
  if (phase === "chat") {
    return 1_200 + index * 1_500;
  }

  if (phase === "final_statements" || phase === "tiebreak_statements") {
    return 500 + index * 400;
  }

  if (phase === "vote" || phase === "tiebreak_vote") {
    return 650 + index * 450;
  }

  return 300 + index * 250;
}

function getReleaseDelayMs(phase, index) {
  if (phase === "spark") {
    return 300 + index * 300;
  }

  if (phase === "chat") {
    return 250 + index * 300;
  }

  if (phase === "final_statements") {
    return 200 + index * 220;
  }

  return 200 + index * 200;
}

function getFallbackDelayMs(room) {
  const phaseStartedAt = Number(room.phaseStartedAt || 0);
  const phaseEndsAt = Number(room.phaseEndsAt || 0);
  const durationMs = Math.max(phaseEndsAt - phaseStartedAt, 0);

  if (!phaseStartedAt || !phaseEndsAt || durationMs <= 0) {
    return null;
  }

  const reserveMs = Math.min(Math.round(durationMs * 0.2), 8_000);
  return Math.max(durationMs - reserveMs, 0);
}

function createPhaseState(room) {
  return {
    key: getPhaseKey(room),
    phase: room.phase,
    round: room.round,
    acted: new Set(),
    scheduled: new Set(),
    pending: new Map(),
    fallbackTimer: null,
  };
}

function createMockAgentManager({
  applyAction,
  broadcastState,
  logger,
  submitAction,
  agentFactory = createRuntimeAgent,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  const timeouts = new Set();
  const runtimeAgents = new Map();
  let phaseState = null;
  const pendingChatAgentIds = new Set();

  function schedule(label, callback, delayMs) {
    logger?.debug("agent scheduled", { label, inMs: delayMs });

    const timeout = setTimeoutFn(() => {
      timeouts.delete(timeout);
      Promise.resolve(callback()).catch((error) => {
        logger?.error("agent callback failed", {
          label,
          error: error.message || String(error),
        });
      });
    }, Math.max(0, delayMs));

    timeouts.add(timeout);
    return timeout;
  }

  function clearTrackedTimeout(timeout) {
    if (!timeout) {
      return;
    }

    clearTimeoutFn(timeout);
    timeouts.delete(timeout);
  }

  function cancelAll() {
    if (timeouts.size > 0) {
      logger?.debug("agent timers cancelled", { count: timeouts.size });
    }

    for (const timeout of timeouts) {
      clearTimeoutFn(timeout);
    }

    timeouts.clear();

    if (phaseState?.fallbackTimer) {
      clearTrackedTimeout(phaseState.fallbackTimer);
    }
    pendingChatAgentIds.clear();
    phaseState = null;
  }

  function getRuntimeAgent(player) {
    const existing = runtimeAgents.get(player.id);

    if (existing) {
      existing.player = player;
      return existing;
    }

    const agent = agentFactory(player);
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

  function isAgentCommitted(playerId) {
    return Boolean(
      phaseState &&
        (phaseState.acted.has(playerId) || phaseState.scheduled.has(playerId) || pendingChatAgentIds.has(playerId)),
    );
  }

  function markAgentCompleted(room, playerId) {
    if (!phaseState || !isCurrentPhaseState(room)) {
      return;
    }

    phaseState.scheduled.delete(playerId);
    phaseState.acted.add(playerId);
  }

  function clearAgentScheduled(playerId) {
    if (!phaseState) {
      return;
    }

    phaseState.scheduled.delete(playerId);
  }

  function scheduleTimedTextAction(room, player, delayMs, options) {
    const { methodName, expectedType, phase, timingLabel } = options;

    if (!phaseState || !isCurrentPhaseState(room) || isAgentCommitted(player.id)) {
      return;
    }

    phaseState.scheduled.add(player.id);

    schedule(`${player.name} prepare ${timingLabel}`, async () => {
      if (room.phase !== phase) {
        clearAgentScheduled(player.id);
        return;
      }

      const actions = await generateAgentActions(room, player, methodName);
      const textAction = actions.find((action) => action.type === expectedType && action.text);

      if (!textAction) {
        clearAgentScheduled(player.id);
        return;
      }

      const { wordCount, typingDurationMs, preTypingDelayMs, sendDelayMs } = getTextActionTiming(
        textAction.text,
      );

      const remainingMs = Math.max((room.phaseEndsAt || Infinity) - Date.now(), 0);
      const maxSendDelayMs = Math.max(remainingMs - 1500, 300);
      const clampedSendDelayMs = Math.min(sendDelayMs, maxSendDelayMs);
      const clampedPreTypingDelayMs = Math.min(preTypingDelayMs, Math.max(clampedSendDelayMs - 200, 100));

      logger?.info("agent response timing", {
        agent: player.name,
        phase,
        words: wordCount,
        preTypingDelayMs: clampedPreTypingDelayMs,
        typingDurationMs,
        sendInMs: clampedSendDelayMs,
        clamped: clampedSendDelayMs < sendDelayMs,
        remainingMs,
        preview: textAction.text,
      });

      schedule(`${player.name} ${timingLabel} typing start`, async () => {
        if (room.phase !== phase) {
          return;
        }

        await setAgentTyping(room, player, true);
      }, clampedPreTypingDelayMs);

      schedule(`${player.name} ${timingLabel}`, async () => {
        if (room.phase !== phase) {
          clearAgentScheduled(player.id);
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
          markAgentCompleted(room, player.id);
        }
      }, clampedSendDelayMs);
    }, delayMs);
  }

  function scheduleChatResponse(room, player, delayMs) {
    if (!phaseState || !isCurrentPhaseState(room) || isAgentCommitted(player.id)) {
      return;
    }

    phaseState.scheduled.add(player.id);
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
          pendingChatAgentIds.delete(player.id);
          clearAgentScheduled(player.id);
          return;
        }

        const actions = await generateAgentActions(room, player, "getChatActions", { recentChatMessages });
        const chatAction = actions.find((action) => action.type === "SEND_CHAT" && action.text);

        if (!chatAction) {
          pendingChatAgentIds.delete(player.id);
          clearAgentScheduled(player.id);
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
              clearAgentScheduled(player.id);
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
            markAgentCompleted(room, player.id);
          }
        }, sendDelayMs);
      } catch (error) {
        pendingChatAgentIds.delete(player.id);
        clearAgentScheduled(player.id);
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
      const runtimeAgent = getRuntimeAgent(agent);

      if (
        agent.id === message.playerId ||
        isAgentCommitted(agent.id) ||
        (shouldWaitForBothHumans(room, runtimeAgent) && !shouldReleasePendingNow(room))
      ) {
        continue;
      }

      const responseProbability = mentionsPlayer(message.text, agent.name) ? 0.8 : 0.4;

      if (Math.random() > responseProbability) {
        continue;
      }

      scheduleChatResponse(room, agent, randomInt(250, 1200));
    }
  }

  function isWaitingPhase(phase) {
    return phase === "spark" || phase === "chat" || phase === "final_statements";
  }

  function shouldWaitForBothHumans(room, agent) {
    if (room.phase === "spark") {
      return true;
    }

    if (room.phase === "chat" || room.phase === "final_statements") {
      return agent.timingProfile === WAIT_FOR_BOTH_CURRENT_PHASE;
    }

    return false;
  }

  function isCurrentPhaseState(room) {
    return Boolean(phaseState && phaseState.key === getPhaseKey(room));
  }

  function scheduleFallbackRelease(room) {
    if (!phaseState || !phaseState.pending.size || !isWaitingPhase(room.phase)) {
      return;
    }

    if (phaseState.fallbackTimer) {
      return;
    }

    const fallbackDelayMs = getFallbackDelayMs(room);

    if (fallbackDelayMs === null) {
      return;
    }

    phaseState.fallbackTimer = schedule(
      `${room.phase} fallback release`,
      () => {
        if (!isCurrentPhaseState(room)) {
          return;
        }

        releasePendingAgents(room, "fallback");
      },
      fallbackDelayMs,
    );
  }

  function clearFallbackRelease() {
    if (!phaseState?.fallbackTimer) {
      return;
    }

    clearTrackedTimeout(phaseState.fallbackTimer);
    phaseState.fallbackTimer = null;
  }

  function scheduleAgentRun(room, player, methodName, index, label) {
    if (!phaseState || !isCurrentPhaseState(room)) {
      return;
    }

    if (isAgentCommitted(player.id)) {
      return;
    }

    phaseState.scheduled.add(player.id);

    schedule(label, async () => {
      if (!phaseState || !isCurrentPhaseState(room)) {
        return;
      }

      if (phaseState.acted.has(player.id)) {
        clearAgentScheduled(player.id);
        return;
      }

      await runAgentMethod(room, player, methodName);
      markAgentCompleted(room, player.id);
    }, getInitialDelayMs(room.phase, index));
  }

  function releasePendingAgents(room, reason) {
    if (!phaseState || !isCurrentPhaseState(room) || phaseState.pending.size === 0) {
      return;
    }

    const pendingEntries = [...phaseState.pending.values()];
    phaseState.pending.clear();
    clearFallbackRelease();

    pendingEntries.forEach((entry, index) => {
      if (isAgentCommitted(entry.player.id)) {
        return;
      }

      const releaseDelayMs = getReleaseDelayMs(room.phase, index);

      if (room.phase === "chat") {
        scheduleChatResponse(room, entry.player, releaseDelayMs);
        return;
      }

      if (room.phase === "final_statements") {
        scheduleTimedTextAction(room, entry.player, releaseDelayMs, {
          methodName: "getFinalStatementAction",
          expectedType: "SUBMIT_FINAL",
          phase: "final_statements",
          timingLabel: `final statement (${reason})`,
        });
        return;
      }

      phaseState.scheduled.add(entry.player.id);

      schedule(`${entry.player.name} ${room.phase} release (${reason})`, async () => {
        if (!phaseState || !isCurrentPhaseState(room)) {
          return;
        }

        if (phaseState.acted.has(entry.player.id)) {
          clearAgentScheduled(entry.player.id);
          return;
        }

        await runAgentMethod(room, entry.player, entry.methodName);
        markAgentCompleted(room, entry.player.id);
      }, releaseDelayMs);
    });
  }

  function registerPendingAgent(player, methodName, index) {
    if (!phaseState || phaseState.pending.has(player.id)) {
      return;
    }

    phaseState.pending.set(player.id, {
      player,
      methodName,
      index,
    });
  }

  function shouldReleasePendingNow(room) {
    return hasBothHumansRespondedThisPhase(room);
  }

  function isRelevantHumanAction(room, action) {
    const actorId = action.playerId || action.voterId || null;
    const actor = room.players.find((player) => player.id === actorId);

    if (!actor || actor.role !== "human") {
      return false;
    }

    if (room.phase === "spark") {
      return action.type === "SUBMIT_SPARK";
    }

    if (room.phase === "chat") {
      return action.type === "SEND_CHAT";
    }

    if (room.phase === "final_statements") {
      return action.type === "SUBMIT_FINAL";
    }

    return false;
  }

  function handleActionAccepted(room, action) {
    if (!phaseState || !isCurrentPhaseState(room)) {
      return;
    }

    if (!phaseState.pending.size || !isRelevantHumanAction(room, action)) {
      return;
    }

    if (shouldReleasePendingNow(room)) {
      logger?.info("agent release triggered by human responses", {
        phase: room.phase,
        round: room.round,
        pendingAgents: phaseState.pending.size,
      });
      releasePendingAgents(room, "humans_ready");
    }
  }

  function handlePhaseEntered(room) {
    cancelAll();
    phaseState = createPhaseState(room);

    const agents = room.players.filter((player) => player.role === "ai" && player.status === "alive");
    const methodName = getActionMethodName(room);

    logger?.info("agent manager handling phase", { phase: room.phase, agents: agents.length });

    agents.forEach((player) => {
      const agent = getRuntimeAgent(player);
      agent.onPhaseStarted(buildAgentContext(room, player));
    });

    if (!methodName) {
      return;
    }

    if (room.phase === "tiebreak_statements") {
      const tiedAgents = agents.filter((player) => room.tiebreakPlayerIds.includes(player.id));

      tiedAgents.forEach((agent, index) => {
        scheduleTimedTextAction(room, agent, 500 + index * 400, {
          methodName: "getTiebreakStatementAction",
          expectedType: "SUBMIT_TIEBREAK",
          phase: "tiebreak_statements",
          timingLabel: "tiebreak statement",
        });
      });
      return;
    }

    if (room.phase === "tiebreak_vote") {
      const votingAgents = agents.filter((player) => !room.tiebreakPlayerIds.includes(player.id));

      votingAgents.forEach((player, index) => {
        scheduleAgentRun(room, player, methodName, index, `${player.name} tiebreak vote`);
      });
      return;
    }

    if (room.phase === "vote") {
      agents.forEach((player, index) => {
        scheduleAgentRun(room, player, methodName, index, `${player.name} vote`);
      });
      return;
    }

    agents.forEach((player, index) => {
      const agent = getRuntimeAgent(player);

      if (shouldWaitForBothHumans(room, agent)) {
        registerPendingAgent(player, methodName, index);
        return;
      }

      if (room.phase === "chat") {
        scheduleChatResponse(room, player, getInitialDelayMs(room.phase, index));
        return;
      }

      if (room.phase === "final_statements") {
        scheduleTimedTextAction(room, player, getInitialDelayMs(room.phase, index), {
          methodName: "getFinalStatementAction",
          expectedType: "SUBMIT_FINAL",
          phase: "final_statements",
          timingLabel: "final statement",
        });
        return;
      }

      scheduleAgentRun(room, player, methodName, index, `${player.name} ${room.phase}`);
    });

    if (shouldReleasePendingNow(room)) {
      releasePendingAgents(room, "phase_ready");
    } else {
      scheduleFallbackRelease(room);
    }
  }

  return {
    handleActionAccepted,
    handleChatActivity,
    handlePhaseEntered,
    cancelAll,
  };
}

module.exports = {
  AI_ROSTER,
  WAIT_FOR_BOTH_CURRENT_PHASE,
  USE_PRIOR_SIGNALS_NOW,
  createAiPlayers,
  createMockAgentManager,
  createRuntimeAgent,
  getFallbackDelayMs,
};
