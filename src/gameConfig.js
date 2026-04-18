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

module.exports = {
  GAME_CONFIG,
};
