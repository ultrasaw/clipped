const GAME_CONFIG = {
  players: {
    humansRequired: 2,
    aiCount: 4,
    lobbyAutoStartDelay: 10_000,
  },
  rounds: {
    maxRounds: 3,
  },
  phaseDurations: {
    lobby: null,
    spark: 30_000,
    spark_reveal: 8_000,
    chat: 120_000,
    final_statements: 35_000,
    vote: 30_000,
    tiebreak_statements: 25_000,
    tiebreak_vote: 20_000,
    reveal: 10_000,
    game_over: null,
  },
  textLimits: {
    playerName: 24,
    sparkAnswer: 80,
    chatMessage: 500,
    finalStatement: 240,
    tiebreakStatement: 200,
    maxStoredMessages: 200,
    maxStoredEvents: 500,
  },
};

function clampInteger(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function createRoomConfig(overrides = {}) {
  const players = overrides.players || {};
  const rounds = overrides.rounds || {};
  const phaseDurations = overrides.phaseDurations || {};
  const humansRequired = clampInteger(
    overrides.humansRequired ?? players.humansRequired,
    1,
    6,
    GAME_CONFIG.players.humansRequired,
  );
  const aiCount = clampInteger(overrides.aiCount ?? players.aiCount, 0, 10, GAME_CONFIG.players.aiCount);
  const maxRounds = clampInteger(overrides.maxRounds ?? rounds.maxRounds, 1, 8, GAME_CONFIG.rounds.maxRounds);
  const chatDurationSeconds = clampInteger(
    overrides.chatDurationSeconds ?? (phaseDurations.chat ? phaseDurations.chat / 1000 : undefined),
    20,
    600,
    GAME_CONFIG.phaseDurations.chat / 1000,
  );

  return {
    ...GAME_CONFIG,
    players: {
      ...GAME_CONFIG.players,
      humansRequired,
      aiCount,
    },
    rounds: {
      ...GAME_CONFIG.rounds,
      maxRounds,
    },
    phaseDurations: {
      ...GAME_CONFIG.phaseDurations,
      chat: chatDurationSeconds * 1000,
    },
    textLimits: {
      ...GAME_CONFIG.textLimits,
    },
  };
}

module.exports = {
  GAME_CONFIG,
  createRoomConfig,
};
