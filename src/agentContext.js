function buildAgentContext(room, agentPlayer) {
  const alivePlayers = room.players.filter((player) => player.status === "alive");
  const publicPlayers = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    status: player.status,
    isSelf: player.id === agentPlayer.id,
    revealedRole: room.revealedRoles[player.id] || null,
  }));

  return {
    agent: {
      id: agentPlayer.id,
      name: agentPlayer.name,
      status: agentPlayer.status,
    },
    game: {
      roomId: room.id,
      phase: room.phase,
      round: room.round,
      maxRounds: room.maxRounds,
      sparkPrompt: room.sparkPrompt,
      phaseStartedAt: room.phaseStartedAt,
      phaseEndsAt: room.phaseEndsAt,
    },
    players: publicPlayers,
    alivePlayerIds: alivePlayers.map((player) => player.id),
    legalTargets: alivePlayers
      .filter((player) => player.id !== agentPlayer.id)
      .map((player) => ({
        id: player.id,
        name: player.name,
        status: player.status,
        revealedRole: room.revealedRoles[player.id] || null,
      })),
    messages: room.messages.map((message) => ({
      id: message.id,
      playerId: message.playerId,
      sender: message.sender,
      text: message.text,
      kind: message.kind,
      createdAt: message.createdAt,
    })),
    sparkAnswers: room.phase === "spark" ? {} : { ...room.sparkAnswers },
    finalStatements: room.phase === "final_statements" ? {} : { ...room.finalStatements },
    revealedVotes: room.revealedVotes ? { ...room.revealedVotes } : null,
    lastEjection: room.lastEjection,
  };
}

module.exports = {
  buildAgentContext,
};
