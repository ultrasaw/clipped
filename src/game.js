const crypto = require("node:crypto");
const { createAiPlayers } = require("./agents");
const { GAME_CONFIG } = require("./gameConfig");

const PHASES = [
  "lobby",
  "spark",
  "spark_reveal",
  "chat",
  "final_statements",
  "vote",
  "reveal",
  "game_over",
];

const SPARK_PROMPTS = [
  "Name one thing people pretend to like.",
  "Say one small thing that annoys you.",
  "Pick one: morning or night.",
  "What's worse: too hot or too cold?",
  "Say one habit you have.",
];

function createDemoRoom() {
  return {
    id: "demo",
    phase: "lobby",
    round: 0,
    maxRounds: GAME_CONFIG.rounds.maxRounds,
    players: [],
    messages: [
      {
        id: crypto.randomUUID(),
        playerId: "system",
        sender: "System",
        text: "Welcome. Join with a name, then start the demo game when two humans are ready.",
        createdAt: Date.now(),
        kind: "system",
      },
    ],
    sparkPrompt: null,
    sparkAnswers: {},
    finalStatements: {},
    votes: {},
    revealedVotes: null,
    revealedRoles: {},
    eliminatedPlayerIds: [],
    lastEjection: null,
    result: null,
    phaseStartedAt: null,
    phaseEndsAt: null,
    errors: [],
  };
}

function createHumanPlayer(name, connectionId = null) {
  return {
    id: crypto.randomUUID(),
    name: cleanText(name, GAME_CONFIG.textLimits.playerName),
    role: "human",
    status: "alive",
    connectionId,
  };
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function getAlivePlayers(room) {
  return room.players.filter((player) => player.status === "alive");
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function addSystemMessage(room, text) {
  room.messages.push({
    id: crypto.randomUUID(),
    playerId: "system",
    sender: "System",
    text,
    createdAt: Date.now(),
    kind: "system",
  });
}

function addPlayerMessage(room, player, text, kind = "chat") {
  room.messages.push({
    id: crypto.randomUUID(),
    playerId: player.id,
    sender: player.name,
    text,
    createdAt: Date.now(),
    kind,
  });

  if (room.messages.length > GAME_CONFIG.textLimits.maxStoredMessages) {
    room.messages.shift();
  }
}

function pickSparkPrompt() {
  return SPARK_PROMPTS[Math.floor(Math.random() * SPARK_PROMPTS.length)];
}

function enterPhase(room, nextPhase) {
  room.phase = nextPhase;
  room.phaseStartedAt = Date.now();
  room.phaseEndsAt = GAME_CONFIG.phaseDurations[nextPhase]
    ? room.phaseStartedAt + GAME_CONFIG.phaseDurations[nextPhase]
    : null;

  if (nextPhase === "spark") {
    room.round += 1;
    room.sparkPrompt = pickSparkPrompt();
    room.sparkAnswers = {};
    room.finalStatements = {};
    room.votes = {};
    room.revealedVotes = null;
    room.lastEjection = null;
    addSystemMessage(room, `Round ${room.round}: ${room.sparkPrompt}`);
  }

  if (nextPhase === "spark_reveal") {
    addSystemMessage(room, "Spark answers are revealed.");
  }

  if (nextPhase === "chat") {
    addSystemMessage(room, "Chat is open. Say what feels true, or suspicious.");
  }

  if (nextPhase === "final_statements") {
    addSystemMessage(room, "Final statements. Give one read, defense, or accusation.");
  }

  if (nextPhase === "vote") {
    addSystemMessage(room, "Vote for whoever feels least convincingly human.");
  }

  if (nextPhase === "game_over") {
    resolveGame(room);
    addSystemMessage(room, room.result.summary);
  }
}

function startGame(room) {
  const humans = room.players.filter((player) => player.role === "human");

  if (humans.length < GAME_CONFIG.players.humansRequired) {
    return {
      ok: false,
      error: `${GAME_CONFIG.players.humansRequired} human players must join before starting.`,
    };
  }

  room.players = humans.slice(0, GAME_CONFIG.players.humansRequired);
  room.players.push(...createAiPlayers(0, GAME_CONFIG.players.aiCount));
  room.round = 0;
  room.eliminatedPlayerIds = [];
  room.revealedRoles = {};
  room.result = null;
  addSystemMessage(room, "The room fills with six voices. Two are human.");
  enterPhase(room, "spark");

  return { ok: true };
}

function advancePhase(room) {
  if (room.phase === "lobby") {
    return startGame(room);
  }

  if (room.phase === "spark") {
    enterPhase(room, "spark_reveal");
    return { ok: true };
  }

  if (room.phase === "spark_reveal") {
    enterPhase(room, "chat");
    return { ok: true };
  }

  if (room.phase === "chat") {
    enterPhase(room, "final_statements");
    return { ok: true };
  }

  if (room.phase === "final_statements") {
    enterPhase(room, "vote");
    return { ok: true };
  }

  if (room.phase === "vote") {
    resolveVote(room);
    enterPhase(room, "reveal");
    return { ok: true };
  }

  if (room.phase === "reveal") {
    if (isGameOver(room)) {
      enterPhase(room, "game_over");
      return { ok: true };
    }

    enterPhase(room, "spark");
    return { ok: true };
  }

  return { ok: false, error: "The game is already over." };
}

function assertPhase(room, phase) {
  if (room.phase !== phase) {
    return `Action is only allowed during ${phase}. Current phase is ${room.phase}.`;
  }

  return null;
}

function assertAlive(room, playerId) {
  const player = findPlayer(room, playerId);

  if (!player) {
    return "Player was not found.";
  }

  if (player.status !== "alive") {
    return `${player.name} has been ejected.`;
  }

  return null;
}

function submitSpark(room, playerId, text) {
  const phaseError = assertPhase(room, "spark");
  const aliveError = assertAlive(room, playerId);

  if (phaseError || aliveError) {
    return { ok: false, error: phaseError || aliveError };
  }

  const answer = cleanText(text, GAME_CONFIG.textLimits.sparkAnswer);

  if (!answer) {
    return { ok: false, error: "Spark answer cannot be empty." };
  }

  room.sparkAnswers[playerId] = answer;

  return { ok: true };
}

function sendChat(room, playerId, text) {
  const phaseError = assertPhase(room, "chat");
  const aliveError = assertAlive(room, playerId);

  if (phaseError || aliveError) {
    return { ok: false, error: phaseError || aliveError };
  }

  const message = cleanText(text, GAME_CONFIG.textLimits.chatMessage);

  if (!message) {
    return { ok: false, error: "Message cannot be empty." };
  }

  addPlayerMessage(room, findPlayer(room, playerId), message, "chat");

  return { ok: true };
}

function submitFinal(room, playerId, text) {
  const phaseError = assertPhase(room, "final_statements");
  const aliveError = assertAlive(room, playerId);

  if (phaseError || aliveError) {
    return { ok: false, error: phaseError || aliveError };
  }

  const statement = cleanText(text, GAME_CONFIG.textLimits.finalStatement);

  if (!statement) {
    return { ok: false, error: "Final statement cannot be empty." };
  }

  room.finalStatements[playerId] = statement;
  addPlayerMessage(room, findPlayer(room, playerId), statement, "final");

  return { ok: true };
}

function castVote(room, voterId, targetId) {
  const phaseError = assertPhase(room, "vote");
  const voterError = assertAlive(room, voterId);
  const targetError = assertAlive(room, targetId);

  if (phaseError || voterError || targetError) {
    return { ok: false, error: phaseError || voterError || targetError };
  }

  if (voterId === targetId) {
    return { ok: false, error: "Self-votes are not allowed." };
  }

  room.votes[voterId] = targetId;

  return { ok: true };
}

function resolveVote(room) {
  const counts = new Map();

  for (const targetId of Object.values(room.votes)) {
    counts.set(targetId, (counts.get(targetId) || 0) + 1);
  }

  if (counts.size === 0) {
    room.lastEjection = null;
    room.revealedVotes = {};
    addSystemMessage(room, "No votes were cast, so no one was ejected.");
    return;
  }

  let ejectedId = null;
  let highestVotes = -1;

  for (const player of getAlivePlayers(room)) {
    const count = counts.get(player.id) || 0;

    if (count > highestVotes) {
      highestVotes = count;
      ejectedId = player.id;
    }
  }

  if (!ejectedId) {
    room.lastEjection = null;
    addSystemMessage(room, "No one was ejected.");
    return;
  }

  const ejected = findPlayer(room, ejectedId);
  ejected.status = "ejected";
  room.eliminatedPlayerIds.push(ejected.id);
  room.revealedRoles[ejected.id] = ejected.role.toUpperCase();
  room.revealedVotes = { ...room.votes };
  room.lastEjection = {
    playerId: ejected.id,
    name: ejected.name,
    role: ejected.role,
  };

  addSystemMessage(room, `${ejected.name} was ejected and revealed as ${ejected.role.toUpperCase()}.`);
}

function isGameOver(room) {
  const aliveHumans = room.players.filter((player) => player.role === "human" && player.status === "alive");

  return room.round >= room.maxRounds || aliveHumans.length === 0;
}

function resolveGame(room) {
  const aliveHumans = room.players.filter((player) => player.role === "human" && player.status === "alive");

  if (aliveHumans.length >= 2) {
    room.result = {
      winner: "humans",
      level: "full",
      summary: "Full human win: both humans survived.",
    };
    return;
  }

  if (aliveHumans.length === 1) {
    room.result = {
      winner: "humans",
      level: "partial",
      summary: "Partial human win: one human survived.",
    };
    return;
  }

  room.result = {
    winner: "ai",
    level: "full",
    summary: "AI win: both humans were ejected.",
  };
}

function joinRoom(room, action, context) {
  if (room.phase !== "lobby") {
    return { ok: false, error: "Players can only join during the lobby." };
  }

  const name = cleanText(action.name, GAME_CONFIG.textLimits.playerName);

  if (!name) {
    return { ok: false, error: "Name is required." };
  }

  const existing = action.playerId ? findPlayer(room, action.playerId) : null;

  if (existing && existing.role === "human") {
    existing.name = name;
    existing.connectionId = context.connectionId || existing.connectionId;
    return { ok: true, playerId: existing.id };
  }

  if (room.players.filter((player) => player.role === "human").length >= GAME_CONFIG.players.humansRequired) {
    return {
      ok: false,
      error: `The demo room already has ${GAME_CONFIG.players.humansRequired} human players.`,
    };
  }

  const player = createHumanPlayer(name, context.connectionId);
  room.players.push(player);
  addSystemMessage(room, `${player.name} joined the lobby.`);

  return { ok: true, playerId: player.id };
}

function resetRoom(room) {
  const freshRoom = createDemoRoom();

  for (const key of Object.keys(room)) {
    delete room[key];
  }

  Object.assign(room, freshRoom);

  return { ok: true };
}

function applyAction(room, action, context = {}) {
  switch (action.type) {
    case "JOIN_ROOM":
      return joinRoom(room, action, context);

    case "START_GAME":
      if (room.phase !== "lobby") {
        return { ok: false, error: "The game has already started." };
      }

      return startGame(room);

    case "ADVANCE_PHASE":
      return advancePhase(room);

    case "SUBMIT_SPARK":
      return submitSpark(room, action.playerId, action.text);

    case "SEND_CHAT":
      return sendChat(room, action.playerId, action.text);

    case "SUBMIT_FINAL":
      return submitFinal(room, action.playerId, action.text);

    case "CAST_VOTE":
      return castVote(room, action.voterId, action.targetId);

    case "RESET_ROOM":
      return resetRoom(room);

    default:
      return { ok: false, error: `Unknown action type: ${action.type}` };
  }
}

module.exports = {
  PHASES,
  createDemoRoom,
  applyAction,
  advancePhase,
};
