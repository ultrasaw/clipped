/**
 * Agent compatibility contract.
 *
 * Teammates can implement this shape for mock, scripted, or LLM-powered agents.
 * The game server should treat agents as action producers only. Agents do not
 * mutate game state directly; they return actions that the game controller
 * validates through applyAction/applyAndBroadcast.
 */
const {
  answerQuestion,
  chooseVoteTarget,
  createChatMessage,
  createFinalStatement,
  createTiebreakStatement,
} = require("./questions");

const AGENT_ACTION_TYPES = {
  SUBMIT_SPARK: "SUBMIT_SPARK",
  SEND_CHAT: "SEND_CHAT",
  SUBMIT_FINAL: "SUBMIT_FINAL",
  CAST_VOTE: "CAST_VOTE",
  SUBMIT_TIEBREAK: "SUBMIT_TIEBREAK",
  CAST_TIEBREAK_VOTE: "CAST_TIEBREAK_VOTE",
};

class BaseAgent {
  constructor({ player, gameplayPrompt, personalityPrompt, mimicStrategyPrompt = "", timingProfile = "", memory = {} }) {
    if (!player?.id) {
      throw new Error("Agent requires a player with an id.");
    }

    this.player = player;
    this.gameplayPrompt = gameplayPrompt || "";
    this.personalityPrompt = personalityPrompt || "";
    this.mimicStrategyPrompt = mimicStrategyPrompt || "";
    this.timingProfile = timingProfile || "";
    this.memory = memory;
  }

  get id() {
    return this.player.id;
  }

  get name() {
    return this.player.name;
  }

  /**
   * Called when a new phase starts. Use this for internal memory updates only.
   */
  onPhaseStarted(_context) {}

  /**
   * Return a SUBMIT_SPARK action or null.
   */
  async getSparkAction(context) {
    if (!context?.game?.sparkPrompt) {
      return null;
    }

    const text = await answerQuestion(
      this.name,
      this.personalityPrompt,
      this.mimicStrategyPrompt,
      context.game.sparkPrompt,
      this.gameplayPrompt,
      {
        context,
        phase: context.game.phase,
        round: context.game.round,
      },
    );

    return createSparkAction(this.id, text);
  }

  /**
   * Return zero or more SEND_CHAT actions.
   */
  async getChatActions(context) {
    const text = await createChatMessage(
      this.name,
      this.personalityPrompt,
      this.mimicStrategyPrompt,
      this.gameplayPrompt,
      context,
    );

    return text ? [createChatAction(this.id, text)] : [];
  }

  /**
   * Return a SUBMIT_FINAL action or null.
   */
  async getFinalStatementAction(context) {
    const text = await createFinalStatement(
      this.name,
      this.personalityPrompt,
      this.mimicStrategyPrompt,
      this.gameplayPrompt,
      context,
    );

    return text ? createFinalStatementAction(this.id, text) : null;
  }

  /**
   * Return a CAST_VOTE action or null.
   */
  async getVoteAction(context) {
    if (!Array.isArray(context?.legalTargets) || context.legalTargets.length === 0) {
      return null;
    }

    const targetId = await chooseVoteTarget(
      this.name,
      this.personalityPrompt,
      this.mimicStrategyPrompt,
      this.gameplayPrompt,
      context,
    );

    return targetId ? createVoteAction(this.id, targetId) : null;
  }

  /**
   * Return a SUBMIT_TIEBREAK action or null.
   */
  async getTiebreakStatementAction(context) {
    if (!Array.isArray(context?.tiedPlayerIds) || !context.tiedPlayerIds.includes(this.id)) {
      return null;
    }

    const text = await createTiebreakStatement(
      this.name,
      this.personalityPrompt,
      this.mimicStrategyPrompt,
      this.gameplayPrompt,
      context,
    );

    return text ? createTiebreakStatementAction(this.id, text) : null;
  }

  /**
   * Return a CAST_TIEBREAK_VOTE action or null.
   */
  async getTiebreakVoteAction(context) {
    if (Array.isArray(context?.tiedPlayerIds) && context.tiedPlayerIds.includes(this.id)) {
      return null;
    }

    if (!Array.isArray(context?.legalTargets) || context.legalTargets.length === 0) {
      return null;
    }

    const targetId = await chooseVoteTarget(
      this.name,
      this.personalityPrompt,
      this.mimicStrategyPrompt,
      this.gameplayPrompt,
      context,
    );

    return targetId ? createTiebreakVoteAction(this.id, targetId) : null;
  }
}

function createSparkAction(agentId, text) {
  return {
    type: AGENT_ACTION_TYPES.SUBMIT_SPARK,
    playerId: agentId,
    text,
  };
}

function createChatAction(agentId, text) {
  return {
    type: AGENT_ACTION_TYPES.SEND_CHAT,
    playerId: agentId,
    text,
  };
}

function createFinalStatementAction(agentId, text) {
  return {
    type: AGENT_ACTION_TYPES.SUBMIT_FINAL,
    playerId: agentId,
    text,
  };
}

function createVoteAction(agentId, targetId) {
  return {
    type: AGENT_ACTION_TYPES.CAST_VOTE,
    voterId: agentId,
    targetId,
  };
}

function createTiebreakStatementAction(agentId, text) {
  return {
    type: AGENT_ACTION_TYPES.SUBMIT_TIEBREAK,
    playerId: agentId,
    text,
  };
}

function createTiebreakVoteAction(agentId, targetId) {
  return {
    type: AGENT_ACTION_TYPES.CAST_TIEBREAK_VOTE,
    voterId: agentId,
    targetId,
  };
}

module.exports = {
  AGENT_ACTION_TYPES,
  BaseAgent,
  createSparkAction,
  createChatAction,
  createFinalStatementAction,
  createVoteAction,
  createTiebreakStatementAction,
  createTiebreakVoteAction,
};
