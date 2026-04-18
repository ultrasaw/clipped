const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createDemoRoom, applyAction } = require("./src/game");
const { createMockAgentManager } = require("./src/agents");
const { getPublicState } = require("./src/publicState");
const logger = require("./src/logger");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const clients = new Map();
const room = createDemoRoom();
let phaseTimer = null;
let autoAdvanceTimer = null;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 20_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcastState() {
  for (const client of clients.values()) {
    sendEvent(client.res, "state", getPublicState(room, client.playerId));
  }

  logger.debug("state broadcast", {
    clients: clients.size,
    phase: room.phase,
    round: room.round,
  });
}

const agentManager = createMockAgentManager({
  applyAction,
  broadcastState,
  logger,
  submitAction: applyAndBroadcast,
});

function applyAndBroadcast(action, context = {}) {
  const previousPhase = room.phase;
  const before = summarizeRoom(room);

  logger.info("action received", {
    source: context.source || "client",
    type: action.type,
    actor: describeActor(room, action.playerId || action.voterId),
    target: describeActor(room, action.targetId),
    phase: room.phase,
    round: room.round,
  });

  const result = applyAction(room, action, context);

  if (!result.ok) {
    room.errors.push(result.error);
    logger.warn("action rejected", {
      type: action.type,
      actor: describeActor(room, action.playerId || action.voterId),
      error: result.error,
    });
  } else {
    logger.info("action accepted", {
      type: action.type,
      actor: describeActor(room, action.playerId || action.voterId || result.playerId),
      before: before.summary,
      after: summarizeRoom(room).summary,
    });
  }

  broadcastState();

  if (result.ok && room.phase !== previousPhase) {
    handlePhaseChanged(previousPhase);
  } else if (result.ok) {
    logger.info("waiting", { for: describeWaitingFor(room) });
    maybeScheduleAutoAdvance();
  }

  return result;
}

function handlePhaseChanged(previousPhase) {
  clearScheduledAdvance();
  logger.info("phase changed", {
    from: previousPhase,
    to: room.phase,
    round: room.round,
    waitingFor: describeWaitingFor(room),
  });
  agentManager.handlePhaseEntered(room);
  schedulePhaseTimer();
  maybeScheduleAutoAdvance();
  broadcastState();
}

function schedulePhaseTimer() {
  clearPhaseTimer();

  if (!room.phaseEndsAt) {
    return;
  }

  const delayMs = Math.max(room.phaseEndsAt - Date.now(), 0);

  logger.info("phase timer scheduled", {
    phase: room.phase,
    inMs: delayMs,
  });

  phaseTimer = setTimeout(() => {
    phaseTimer = null;
    logger.info("phase timer elapsed", { phase: room.phase, waitingFor: describeWaitingFor(room) });
    applyAndBroadcast({ type: "ADVANCE_PHASE" }, { source: "timer" });
  }, delayMs);
}

function clearPhaseTimer() {
  if (phaseTimer) {
    clearTimeout(phaseTimer);
    phaseTimer = null;
  }
}

function maybeScheduleAutoAdvance() {
  if (autoAdvanceTimer || !shouldAutoAdvance(room)) {
    return;
  }

  logger.info("auto advance scheduled", {
    phase: room.phase,
    reason: describeWaitingFor(room),
    inMs: 700,
  });

  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    logger.info("auto advance triggered", { phase: room.phase });
    applyAndBroadcast({ type: "ADVANCE_PHASE" }, { source: "auto" });
  }, 700);
}

function clearScheduledAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function handleEvents(req, res, url) {
  const clientId = crypto.randomUUID();
  const playerId = url.searchParams.get("playerId") || null;

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  clients.set(clientId, { res, playerId });
  sendEvent(res, "state", getPublicState(room, playerId));
  logger.info("sse connected", {
    client: shortId(clientId),
    player: describeActor(room, playerId),
    clients: clients.size,
  });

  req.on("close", () => {
    clients.delete(clientId);
    logger.info("sse disconnected", {
      client: shortId(clientId),
      player: describeActor(room, playerId),
      clients: clients.size,
    });
  });
}

async function handlePostAction(req, res) {
  const startedAt = Date.now();

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const playerId = typeof body.playerId === "string" ? body.playerId : null;
    const action = normalizeAction(body.action || {}, playerId);
    const result = applyAndBroadcast(action, { connectionId: playerId || null });

    logger.debug("action response sent", {
      type: action.type,
      ok: result.ok,
      status: result.ok ? 200 : 400,
      durationMs: Date.now() - startedAt,
    });
    sendJson(res, result.ok ? 200 : 400, result);
  } catch (error) {
    logger.error("action request failed", {
      error: error.message || "Invalid request.",
      durationMs: Date.now() - startedAt,
    });
    sendJson(res, 400, { ok: false, error: error.message || "Invalid request." });
  }
}

function normalizeAction(action, playerId) {
  if (action.type === "JOIN_ROOM") {
    return {
      type: "JOIN_ROOM",
      name: action.name,
      playerId,
    };
  }

  if (action.type === "SUBMIT_SPARK") {
    return {
      type: "SUBMIT_SPARK",
      playerId,
      text: action.text,
    };
  }

  if (action.type === "SEND_CHAT") {
    return {
      type: "SEND_CHAT",
      playerId,
      text: action.text,
    };
  }

  if (action.type === "SUBMIT_FINAL") {
    return {
      type: "SUBMIT_FINAL",
      playerId,
      text: action.text,
    };
  }

  if (action.type === "CAST_VOTE") {
    return {
      type: "CAST_VOTE",
      voterId: playerId,
      targetId: action.targetId,
    };
  }

  return {
    type: action.type,
  };
}

function handleGetState(req, res, url) {
  const playerId = url.searchParams.get("playerId") || null;
  logger.debug("state requested", { player: describeActor(room, playerId) });
  sendJson(res, 200, getPublicState(room, playerId));
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      logger.warn("static file not found", { path: requestedPath });
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };

    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
    });
    res.end(file);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  logger.debug("http request", { method: req.method, path: url.pathname });

  if (req.method === "GET" && url.pathname === "/events") {
    handleEvents(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/state") {
    handleGetState(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/actions") {
    handlePostAction(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed." });
  logger.warn("method not allowed", { method: req.method, path: url.pathname });
});

function shortId(id) {
  return id ? id.slice(0, 8) : "none";
}

function describeActor(currentRoom, playerId) {
  if (!playerId) {
    return undefined;
  }

  const player = currentRoom.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return shortId(playerId);
  }

  return `${player.name}/${player.role}/${player.status}`;
}

function summarizeRoom(currentRoom) {
  const alive = currentRoom.players.filter((player) => player.status === "alive");
  const humans = currentRoom.players.filter((player) => player.role === "human");
  const aliveHumans = humans.filter((player) => player.status === "alive");

  return {
    alive: alive.length,
    humans: humans.length,
    aliveHumans: aliveHumans.length,
    messages: currentRoom.messages.length,
    summary: `phase=${currentRoom.phase} round=${currentRoom.round} players=${currentRoom.players.length} alive=${alive.length} humansAlive=${aliveHumans.length}`,
  };
}

function describeWaitingFor(currentRoom) {
  const alivePlayers = currentRoom.players.filter((player) => player.status === "alive");
  const missingSpark = alivePlayers.filter((player) => !currentRoom.sparkAnswers[player.id]);
  const missingFinal = alivePlayers.filter((player) => !currentRoom.finalStatements[player.id]);
  const missingVotes = alivePlayers.filter((player) => !currentRoom.votes[player.id]);
  const humanCount = currentRoom.players.filter((player) => player.role === "human").length;

  if (currentRoom.phase === "lobby") {
    return humanCount < 2 ? `${2 - humanCount} more human player(s) to join` : "game start";
  }

  if (currentRoom.phase === "spark") {
    return missingSpark.length
      ? `spark answers from ${missingSpark.map((player) => player.name).join(", ")}`
      : "advance to spark reveal";
  }

  if (currentRoom.phase === "spark_reveal") {
    return "advance to chat";
  }

  if (currentRoom.phase === "chat") {
    return "conversation or manual advance to final statements";
  }

  if (currentRoom.phase === "final_statements") {
    return missingFinal.length
      ? `final statements from ${missingFinal.map((player) => player.name).join(", ")}`
      : "advance to vote";
  }

  if (currentRoom.phase === "vote") {
    return missingVotes.length
      ? `votes from ${missingVotes.map((player) => player.name).join(", ")}`
      : "advance to reveal";
  }

  if (currentRoom.phase === "reveal") {
    return "advance to next round or game over";
  }

  if (currentRoom.phase === "game_over") {
    return "reset room";
  }

  return "unknown";
}

function shouldAutoAdvance(currentRoom) {
  const alivePlayers = currentRoom.players.filter((player) => player.status === "alive");

  if (!alivePlayers.length) {
    return false;
  }

  if (currentRoom.phase === "spark") {
    return alivePlayers.every((player) => Boolean(currentRoom.sparkAnswers[player.id]));
  }

  if (currentRoom.phase === "final_statements") {
    return alivePlayers.every((player) => Boolean(currentRoom.finalStatements[player.id]));
  }

  if (currentRoom.phase === "vote") {
    return alivePlayers.every((player) => Boolean(currentRoom.votes[player.id]));
  }

  return false;
}

function getLocalNetworkUrls(port) {
  if (HOST !== "0.0.0.0" && HOST !== "::") {
    return [];
  }

  const interfaces = os.networkInterfaces();
  const urls = [];

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }

  return urls;
}

server.listen(PORT, HOST, () => {
  logger.info("server started", { host: HOST, port: PORT });
  logger.info("local url", { url: `http://localhost:${PORT}` });

  const networkUrls = getLocalNetworkUrls(PORT);

  if (networkUrls.length) {
    networkUrls.forEach((url) => logger.info("network url", { url }));
  } else if (HOST !== "0.0.0.0" && HOST !== "::") {
    logger.info("network access disabled", { host: HOST, hint: "Use HOST=0.0.0.0 for LAN testing." });
  } else {
    logger.warn("no local network ip detected", { hint: "Check Wi-Fi/Ethernet connection." });
  }

  logger.info("waiting", { for: describeWaitingFor(room) });
});
