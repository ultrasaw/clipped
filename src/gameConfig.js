const GAME_CONFIG = {
  players: {
    humansRequired: 2,
    aiCount: 4,
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
    reveal: 10_000,
    game_over: null,
  },
  textLimits: {
    playerName: 24,
    sparkAnswer: 80,
    chatMessage: 500,
    finalStatement: 240,
    maxStoredMessages: 200,
  },
};

module.exports = {
  GAME_CONFIG,
};
