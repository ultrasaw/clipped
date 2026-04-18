function getHumanReplySamples(room) {
  const humanPlayers = room.players.filter((player) => player.role === "human");
  const humanIds = new Set(humanPlayers.map((player) => player.id));
  const playerNames = new Map(humanPlayers.map((player) => [player.id, player.name]));
  const sparkReplies = Object.entries(room.sparkAnswers || {})
    .filter(([playerId, text]) => humanIds.has(playerId) && text)
    .map(([playerId, text]) => ({
      playerId,
      playerName: playerNames.get(playerId) || "Human",
      kind: "spark",
      text,
      createdAt: room.phaseStartedAt || room.createdAt || Date.now(),
    }));
  const publicReplies = (room.messages || [])
    .filter((message) => humanIds.has(message.playerId) && message.kind !== "system" && message.text)
    .map((message) => ({
      playerId: message.playerId,
      playerName: message.sender,
      kind: message.kind,
      text: message.text,
      createdAt: message.createdAt,
    }));

  return [...sparkReplies, ...publicReplies]
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0))
    .slice(-10);
}

function buildAgentContext(room, agentPlayer) {
  const alivePlayers = room.players.filter((player) => player.status === "alive");
  const humanPlayers = room.players
    .filter((player) => player.role === "human")
    .map((player) => ({
      id: player.id,
      name: player.name,
      status: player.status,
    }));
  const publicPlayers = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    status: player.status,
    isSelf: player.id === agentPlayer.id,
    revealedRole: room.revealedRoles[player.id] || null,
  }));

  const defaultLegalTargets = alivePlayers
    .filter((player) => player.id !== agentPlayer.id)
    .map((player) => ({
      id: player.id,
      name: player.name,
      status: player.status,
      revealedRole: room.revealedRoles[player.id] || null,
    }));
  const tiebreakTargets = room.tiebreakPlayerIds
    .map((playerId) => room.players.find((player) => player.id === playerId))
    .filter(Boolean)
    .filter((player) => player.status === "alive")
    .map((player) => ({
      id: player.id,
      name: player.name,
      status: player.status,
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
    humanPlayers,
    humanReplySamples: getHumanReplySamples(room),
    alivePlayerIds: alivePlayers.map((player) => player.id),
    tiedPlayerIds: room.tiebreakPlayerIds,
    legalTargets: room.phase === "tiebreak_vote" ? tiebreakTargets : defaultLegalTargets,
    messages: room.messages.map((message) => ({
      id: message.id,
      playerId: message.playerId,
      sender: message.sender,
      text: message.text,
      kind: message.kind,
      createdAt: message.createdAt,
    })),
    sparkAnswers: { ...room.sparkAnswers },
    finalStatements: { ...room.finalStatements },
    revealedVotes: room.revealedVotes ? { ...room.revealedVotes } : null,
    lastEjection: room.lastEjection,
  };
}

module.exports = {
  buildAgentContext,
};
