function getPublicState(room, viewerPlayerId = null) {
  const viewer = room.players.find((player) => player.id === viewerPlayerId);

  return {
    id: room.id,
    phase: room.phase,
    round: room.round,
    maxRounds: room.maxRounds,
    sparkPrompt: room.sparkPrompt,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    tiebreakPlayerIds: room.tiebreakPlayerIds,
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
              ? "You are human. There is one other human in the room. Find them and survive together."
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
