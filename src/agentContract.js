/**
 * Agent compatibility contract.
 *
 * Teammates can implement this shape for mock, scripted, or LLM-powered agents.
 * The game server should treat agents as action producers only. Agents do not
 * mutate game state directly; they return actions that the game controller
 * validates through applyAction/applyAndBroadcast.
 */

const AGENT_ACTION_TYPES = {
  SUBMIT_SPARK: "SUBMIT_SPARK",
  SEND_CHAT: "SEND_CHAT",
  SUBMIT_FINAL: "SUBMIT_FINAL",
  CAST_VOTE: "CAST_VOTE",
};

class BaseAgent {
  constructor({ player, gameplayPrompt, personalityPrompt, memory = {} }) {
    if (!player?.id) {
      throw new Error("Agent requires a player with an id.");
    }

    this.player = player;
    this.gameplayPrompt = gameplayPrompt || "";
    this.personalityPrompt = personalityPrompt || "";
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
  async getSparkAction(_context) {
    return null;
  }

  /**
   * Return zero or more SEND_CHAT actions.
   */
  async getChatActions(_context) {
    return [];
  }

  /**
   * Return a SUBMIT_FINAL action or null.
   */
  async getFinalStatementAction(_context) {
    return null;
  }

  /**
   * Return a CAST_VOTE action or null.
   */
  async getVoteAction(_context) {
    return null;
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

module.exports = {
  AGENT_ACTION_TYPES,
  BaseAgent,
  createSparkAction,
  createChatAction,
  createFinalStatementAction,
  createVoteAction,
};
