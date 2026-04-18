function createReplyEntry({ playerId, playerName, kind, text, createdAt, phase }) {
  return {
    playerId,
    playerName,
    kind,
    text,
    createdAt,
    phase,
  };
}

function getHumanPlayers(room, options = {}) {
  const requireAlive = Boolean(options.requireAlive);

  return room.players
    .filter((player) => player.role === "human")
    .filter((player) => !requireAlive || player.status === "alive")
    .map((player) => ({
      id: player.id,
      name: player.name,
      status: player.status,
    }));
}

function getReplyNamesMap(humanPlayers) {
  return new Map(humanPlayers.map((player) => [player.id, player.name]));
}

function getCurrentPhaseHumanReplies(room) {
  const humanPlayers = getHumanPlayers(room, { requireAlive: true });
  const humanIds = new Set(humanPlayers.map((player) => player.id));
  const playerNames = getReplyNamesMap(humanPlayers);
  const phaseStartedAt = Number(room.phaseStartedAt || 0);

  if (room.phase === "spark") {
    return Object.entries(room.sparkAnswers || {})
      .filter(([playerId, text]) => humanIds.has(playerId) && text)
      .map(([playerId, text]) =>
        createReplyEntry({
          playerId,
          playerName: playerNames.get(playerId) || "Human",
          kind: "spark",
          text,
          createdAt: phaseStartedAt || room.createdAt || Date.now(),
          phase: "spark",
        }),
      )
      .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
  }

  if (!["chat", "final_statements", "tiebreak_statements"].includes(room.phase)) {
    return [];
  }

  const messageKind = room.phase === "chat" ? "chat" : "final";

  return (room.messages || [])
    .filter((message) => humanIds.has(message.playerId) && message.kind === messageKind && message.text)
    .filter((message) => Number(message.createdAt || 0) >= phaseStartedAt)
    .map((message) =>
      createReplyEntry({
        playerId: message.playerId,
        playerName: message.sender,
        kind: message.kind,
        text: message.text,
        createdAt: message.createdAt,
        phase: room.phase,
      }),
    )
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
}

function getPriorHumanReplies(room) {
  const humanPlayers = getHumanPlayers(room);
  const humanIds = new Set(humanPlayers.map((player) => player.id));
  const playerNames = getReplyNamesMap(humanPlayers);
  const phaseStartedAt = Number(room.phaseStartedAt || 0);
  const currentPhaseMessageKind = room.phase === "chat" ? "chat" : room.phase === "final_statements" ? "final" : null;

  const sparkReplies =
    room.phase === "spark"
      ? []
      : Object.entries(room.sparkAnswers || {})
          .filter(([playerId, text]) => humanIds.has(playerId) && text)
          .map(([playerId, text]) =>
            createReplyEntry({
              playerId,
              playerName: playerNames.get(playerId) || "Human",
              kind: "spark",
              text,
              createdAt: room.createdAt || 0,
              phase: "spark",
            }),
          );

  const publicReplies = (room.messages || [])
    .filter((message) => humanIds.has(message.playerId) && message.kind !== "system" && message.text)
    .filter((message) => {
      if (!currentPhaseMessageKind) {
        return true;
      }

      return !(
        message.kind === currentPhaseMessageKind &&
        Number(message.createdAt || 0) >= phaseStartedAt
      );
    })
    .map((message) =>
      createReplyEntry({
        playerId: message.playerId,
        playerName: message.sender,
        kind: message.kind,
        text: message.text,
        createdAt: message.createdAt,
        phase: message.kind === "chat" ? "chat" : "final_statements",
      }),
    );

  return [...sparkReplies, ...publicReplies]
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0))
    .slice(-12);
}

function groupRepliesByHuman(humanPlayers, replies) {
  const grouped = new Map(
    humanPlayers.map((player) => [
      player.id,
      {
        playerId: player.id,
        playerName: player.name,
        status: player.status,
        replies: [],
      },
    ]),
  );

  for (const reply of replies) {
    if (!grouped.has(reply.playerId)) {
      grouped.set(reply.playerId, {
        playerId: reply.playerId,
        playerName: reply.playerName,
        status: "unknown",
        replies: [],
      });
    }

    grouped.get(reply.playerId).replies.push(reply);
  }

  return humanPlayers.map((player) => grouped.get(player.id));
}

function hasBothHumansRespondedThisPhase(room) {
  const aliveHumanPlayers = getHumanPlayers(room, { requireAlive: true });

  if (aliveHumanPlayers.length <= 1) {
    return true;
  }

  const repliedIds = new Set(getCurrentPhaseHumanReplies(room).map((reply) => reply.playerId));
  return aliveHumanPlayers.every((player) => repliedIds.has(player.id));
}

function getHumanReplySamples(room) {
  return [...getPriorHumanReplies(room), ...getCurrentPhaseHumanReplies(room)]
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0))
    .slice(-10);
}

function buildAgentContext(room, agentPlayer, options = {}) {
  const alivePlayers = room.players.filter((player) => player.status === "alive");
  const humanPlayers = getHumanPlayers(room);
  const recentChatMessages =
    options.recentChatMessages ||
    room.messages
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
  const publicPlayers = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    status: player.status,
    isSelf: player.id === agentPlayer.id,
    revealedRole: room.revealedRoles[player.id] || null,
  }));
  const currentPhaseHumanReplies = groupRepliesByHuman(humanPlayers, getCurrentPhaseHumanReplies(room));
  const priorHumanReplies = groupRepliesByHuman(humanPlayers, getPriorHumanReplies(room));

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
    currentPhaseHumanReplies,
    priorHumanReplies,
    bothHumansRespondedThisPhase: hasBothHumansRespondedThisPhase(room),
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
    recentChatMessages,
    sparkAnswers: room.phase === "spark" ? {} : { ...room.sparkAnswers },
    finalStatements: room.phase === "final_statements" ? {} : { ...room.finalStatements },
    revealedVotes: room.revealedVotes ? { ...room.revealedVotes } : null,
    lastEjection: room.lastEjection,
  };
}

module.exports = {
  buildAgentContext,
  getCurrentPhaseHumanReplies,
  getPriorHumanReplies,
  getHumanReplySamples,
  hasBothHumansRespondedThisPhase,
};
