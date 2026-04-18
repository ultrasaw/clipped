function getPublicState(room, viewerPlayerId = null) {
  const viewer = room.players.find((player) => player.id === viewerPlayerId);
  const config = room.config;

  return {
    id: room.id,
    name: room.name,
    phase: room.phase,
    round: room.round,
    maxRounds: room.maxRounds,
    config: config
      ? {
          humansRequired: config.players.humansRequired,
          aiCount: config.players.aiCount,
          chatDurationSeconds: config.phaseDurations.chat / 1000,
        }
      : null,
    sparkPrompt: room.sparkPrompt,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    tiebreakPlayerIds: room.tiebreakPlayerIds,
    typingPlayerIds: room.typingPlayerIds,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      status: player.status,
      isYou: player.id === viewerPlayerId,
      revealedRole: room.revealedRoles[player.id] || null,
    })),
    viewer: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          role: viewer.role,
          briefing:
            viewer.role === "human"
              ? "Not everyone here is human. Survive the vote."
              : null,
          submissions: {
            spark: Boolean(room.sparkAnswers[viewer.id]),
            finalStatement: Boolean(room.finalStatements[viewer.id]),
            vote: Boolean(room.votes[viewer.id]),
            tiebreakStatement: Boolean(room.tiebreakStatements[viewer.id]),
            tiebreakVote: Boolean(room.tiebreakVotes[viewer.id]),
          },
        }
      : null,
    messages: room.messages,
    sparkAnswerPlayerIds: Object.keys(room.sparkAnswers),
    sparkAnswers: room.phase === "spark" ? {} : room.sparkAnswers,
    finalStatements: room.phase === "final_statements" ? {} : room.finalStatements,
    tiebreakStatements: room.phase === "tiebreak_statements" ? {} : room.tiebreakStatements,
    revealedVotes: room.revealedVotes,
    lastEjection: room.lastEjection,
    result: room.result,
    errors: room.errors.slice(-5),
  };
}

module.exports = {
  getPublicState,
};
