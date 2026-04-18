const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createDemoRoom, applyAction, addRoomEvent } = require("./src/game");
const { createMockAgentManager } = require("./src/agents");
const { GAME_CONFIG } = require("./src/gameConfig");
const { getPublicState } = require("./src/publicState");
const logger = require("./src/logger");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const clients = new Map();
const room = createDemoRoom();
let phaseTimer = null;
let autoAdvanceTimer = null;
let lobbyStartTimer = null;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  res.end(html);
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

async function applyAndBroadcast(action, context = {}) {
  const previousPhase = room.phase;
  const before = summarizeRoom(room);
  const previousEventCount = room.events.length;

  logger.info("action received", {
    source: context.source || "client",
    type: action.type,
    actor: describeActor(room, action.playerId || action.voterId),
    target: describeActor(room, action.targetId),
    phase: room.phase,
    round: room.round,
  });

  const result = await applyAction(room, action, context);

  if (!result.ok) {
    room.errors.push(result.error);
    addRoomEvent(room, "ACTION_REJECTED", {
      source: context.source || "client",
      actionType: action.type,
      actorId: action.playerId || action.voterId || null,
      targetId: action.targetId || null,
      error: result.error,
    });
    logger.warn("action rejected", {
      type: action.type,
      actor: describeActor(room, action.playerId || action.voterId),
      error: result.error,
    });
  } else {
    addRoomEvent(room, "ACTION_ACCEPTED", {
      source: context.source || "client",
      actionType: action.type,
      actorId: action.playerId || action.voterId || result.playerId || null,
      targetId: action.targetId || null,
    });
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
    if (action.type === "RESET_ROOM") {
      clearPhaseTimer();
      clearScheduledAdvance();
      clearLobbyStartTimer();
    }

    maybeScheduleLobbyStart(action);
    logger.info("waiting", { for: describeWaitingFor(room) });
    maybeScheduleAutoAdvance();
  }

  logNewEvents(previousEventCount);

  return result;
}

function handlePhaseChanged(previousPhase) {
  clearLobbyStartTimer();
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

function logNewEvents(previousEventCount) {
  const newEvents = room.events.slice(previousEventCount);

  for (const event of newEvents) {
    logger.info("room event", {
      type: event.type,
      phase: event.phase,
      round: event.round,
      details: event,
    });
  }
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
    applyAndBroadcast({ type: "ADVANCE_PHASE" }, { source: "timer" }).catch((error) => {
      logger.error("phase timer advance failed", { error: error.message || String(error) });
    });
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
    applyAndBroadcast({ type: "ADVANCE_PHASE" }, { source: "auto" }).catch((error) => {
      logger.error("auto advance failed", { error: error.message || String(error) });
    });
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
    const result = await applyAndBroadcast(action, { connectionId: playerId || null });

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

  if (action.type === "SUBMIT_TIEBREAK") {
    return {
      type: "SUBMIT_TIEBREAK",
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

  if (action.type === "CAST_TIEBREAK_VOTE") {
    return {
      type: "CAST_TIEBREAK_VOTE",
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

function maybeScheduleLobbyStart(action) {
  if (room.phase !== "lobby" || action.type !== "JOIN_ROOM" || lobbyStartTimer) {
    return;
  }

  const humanCount = room.players.filter((player) => player.role === "human").length;

  if (humanCount < GAME_CONFIG.players.humansRequired) {
    return;
  }

  const delayMs = GAME_CONFIG.players.lobbyAutoStartDelay;
  room.phaseStartedAt = Date.now();
  room.phaseEndsAt = room.phaseStartedAt + delayMs;
  addRoomEvent(room, "LOBBY_AUTOSTART_SCHEDULED", {
    inMs: delayMs,
    humanCount,
  });
  logger.info("lobby auto-start scheduled", { inMs: delayMs, humanCount });
  broadcastState();

  lobbyStartTimer = setTimeout(() => {
    lobbyStartTimer = null;

    if (room.phase !== "lobby") {
      return;
    }

    logger.info("lobby auto-start triggered");
    applyAndBroadcast({ type: "START_GAME" }, { source: "auto" });
  }, delayMs);
}

function clearLobbyStartTimer() {
  if (lobbyStartTimer) {
    clearTimeout(lobbyStartTimer);
    lobbyStartTimer = null;
  }
}

function getHealthPayload() {
  return {
    ok: true,
    phase: room.phase,
    round: room.round,
    maxRounds: room.maxRounds,
    players: room.players.length,
    alivePlayers: room.players.filter((player) => player.status === "alive").length,
    clients: clients.size,
    messages: room.messages.length,
    events: room.events.length,
    uptimeSeconds: Math.floor(process.uptime()),
    waitingFor: describeWaitingFor(room),
  };
}

function handleHealth(req, res, url) {
  const payload = getHealthPayload();

  if (wantsJson(req, url)) {
    sendJson(res, 200, payload);
    return;
  }

  sendHtml(res, 200, renderHealthPage(payload));
}

function getDebugEventsPayload() {
  return {
    roomId: room.id,
    phase: room.phase,
    round: room.round,
    events: room.events,
  };
}

function handleDebugEvents(req, res, url) {
  const payload = getDebugEventsPayload();

  if (wantsJson(req, url)) {
    sendJson(res, 200, payload);
    return;
  }

  sendHtml(res, 200, renderDebugEventsPage(payload));
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

  if (req.method === "GET" && url.pathname === "/health") {
    handleHealth(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/debug/events") {
    handleDebugEvents(req, res, url);
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

function wantsJson(req, url) {
  if (url.searchParams.get("format") === "json") {
    return true;
  }

  if (url.searchParams.get("format") === "html") {
    return false;
  }

  const accept = String(req.headers.accept || "");

  return !accept.includes("text/html");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function renderDebugShell({ title, eyebrow, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="5" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --ink: #17130f;
        --muted: #756a5f;
        --paper: #fff8ec;
        --card: rgba(255, 252, 245, 0.88);
        --line: rgba(49, 39, 28, 0.14);
        --accent: #d95d39;
        --green: #237a57;
        --yellow: #a66b00;
        --red: #a9362b;
        --shadow: 0 24px 80px rgba(68, 42, 18, 0.18);
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        color: var(--ink);
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at 18% 16%, rgba(217, 93, 57, 0.26), transparent 28rem),
          radial-gradient(circle at 88% 8%, rgba(35, 122, 87, 0.18), transparent 24rem),
          linear-gradient(135deg, #f9e3bc 0%, #fff8ec 44%, #f3c9a2 100%);
      }
      main {
        width: min(1120px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 3rem 0;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: start;
        margin-bottom: 1.5rem;
      }
      .eyebrow {
        margin: 0 0 0.45rem;
        color: var(--accent);
        font-family: "Trebuchet MS", Verdana, sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.4rem, 6vw, 5.4rem);
        line-height: 0.92;
        letter-spacing: -0.06em;
      }
      .links {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
        justify-content: end;
      }
      a, .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0.45rem 0.75rem;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.52);
        font-family: "Trebuchet MS", Verdana, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        text-decoration: none;
      }
      a:hover { color: white; background: var(--accent); }
      .card {
        border: 1px solid var(--line);
        border-radius: 1.8rem;
        padding: 1.25rem;
        background: var(--card);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.85rem;
      }
      .metric {
        border: 1px solid var(--line);
        border-radius: 1.2rem;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.48);
      }
      .metric strong {
        display: block;
        margin-top: 0.3rem;
        font-size: 1.7rem;
        line-height: 1;
      }
      .ok { color: var(--green); }
      .warn { color: var(--yellow); }
      .bad { color: var(--red); }
      .timeline {
        display: grid;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .event {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.8rem;
        border: 1px solid var(--line);
        border-radius: 1.1rem;
        padding: 0.85rem;
        background: rgba(255, 255, 255, 0.5);
      }
      .dot {
        width: 0.8rem;
        height: 0.8rem;
        margin-top: 0.25rem;
        border-radius: 50%;
        background: var(--accent);
      }
      .event[data-kind*="REJECTED"] .dot, .event[data-kind*="EJECTED"] .dot { background: var(--red); }
      .event[data-kind*="PHASE"] .dot, .event[data-kind*="STARTED"] .dot { background: var(--green); }
      .event h2 {
        margin: 0;
        font-family: "Trebuchet MS", Verdana, sans-serif;
        font-size: 0.92rem;
        letter-spacing: 0.03em;
      }
      .event p {
        margin: 0.35rem 0 0;
        color: var(--muted);
        line-height: 1.45;
      }
      pre {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 1rem;
        padding: 0.9rem;
        background: rgba(23, 19, 15, 0.06);
        color: var(--ink);
      }
      .section-title {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        margin: 2rem 0 0.8rem;
      }
      @media (max-width: 720px) {
        .topbar { display: grid; }
        .links { justify-content: start; }
        .event { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="topbar">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <nav class="links">
          <a href="/">Game</a>
          <a href="/health">Health</a>
          <a href="/debug/events">Events</a>
          <a href="?format=json">JSON</a>
        </nav>
      </section>
      ${body}
    </main>
  </body>
</html>`;
}

function renderHealthPage(payload) {
  const statusClass = payload.ok ? "ok" : "bad";
  const body = `
    <section class="card">
      <div class="grid">
        ${renderMetric("Status", payload.ok ? "OK" : "Down", statusClass)}
        ${renderMetric("Phase", payload.phase)}
        ${renderMetric("Round", `${payload.round}/${payload.maxRounds}`)}
        ${renderMetric("Players", payload.players)}
        ${renderMetric("Alive", payload.alivePlayers)}
        ${renderMetric("Clients", payload.clients)}
        ${renderMetric("Messages", payload.messages)}
        ${renderMetric("Events", payload.events)}
        ${renderMetric("Uptime", formatDuration(payload.uptimeSeconds))}
      </div>
    </section>
    <section class="section-title">
      <div>
        <p class="eyebrow">Waiting For</p>
        <span class="pill">${escapeHtml(payload.waitingFor)}</span>
      </div>
      <span class="pill">Auto-refreshes every 5s</span>
    </section>
    <section class="card">
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </section>
  `;

  return renderDebugShell({
    title: "Server Health",
    eyebrow: "Clipped Diagnostics",
    body,
  });
}

function renderMetric(label, value, className = "") {
  return `
    <div class="metric">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <strong class="${escapeHtml(className)}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderDebugEventsPage(payload) {
  const newestFirst = [...payload.events].reverse();
  const body = `
    <section class="card">
      <div class="grid">
        ${renderMetric("Room", payload.roomId)}
        ${renderMetric("Phase", payload.phase)}
        ${renderMetric("Round", payload.round)}
        ${renderMetric("Events", payload.events.length)}
      </div>
    </section>
    <section class="section-title">
      <div>
        <p class="eyebrow">Timeline</p>
        <span class="pill">Newest first</span>
      </div>
      <span class="pill">Auto-refreshes every 5s</span>
    </section>
    <ol class="timeline">
      ${
        newestFirst.length
          ? newestFirst.map(renderEventItem).join("")
          : `<li class="event" data-kind="EMPTY"><span class="dot"></span><div><h2>No events yet</h2><p>Start a game to populate the flight recorder.</p></div></li>`
      }
    </ol>
  `;

  return renderDebugShell({
    title: "Room Events",
    eyebrow: "Clipped Flight Recorder",
    body,
  });
}

function renderEventItem(event) {
  const { at, type, ...details } = event;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(at));
  const summary = summarizeEvent(event);

  return `
    <li class="event" data-kind="${escapeHtml(type)}">
      <span class="dot"></span>
      <div>
        <h2>${escapeHtml(type)} <span class="pill">${escapeHtml(time)}</span></h2>
        <p>${escapeHtml(summary)}</p>
        <pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre>
      </div>
    </li>
  `;
}

function summarizeEvent(event) {
  if (event.type === "ACTION_ACCEPTED") {
    return `${event.source || "unknown"} action ${event.actionType} accepted.`;
  }

  if (event.type === "ACTION_REJECTED") {
    return `${event.source || "unknown"} action ${event.actionType} rejected: ${event.error}`;
  }

  if (event.type === "PHASE_CHANGED") {
    return `Phase moved from ${event.from} to ${event.to}.`;
  }

  if (event.type === "PLAYER_JOINED") {
    return `${event.playerName} joined the lobby.`;
  }

  if (event.type === "PLAYER_REJOINED") {
    return `${event.playerName} rejoined.`;
  }

  if (event.type === "PLAYER_EJECTED") {
    const names = event.playerNames?.join(", ") || event.playerName;
    const roles = event.revealedRoles?.join(", ") || event.revealedRole;

    return `${names} ejected and revealed as ${roles}.`;
  }

  if (event.type === "VOTE_TIED") {
    return `Vote tied with ${event.topVoteCount} votes each. Tiebreak required.`;
  }

  if (event.type === "GAME_STARTED") {
    return `Game started with ${event.playerCount} players.`;
  }

  if (event.type === "GAME_OVER") {
    return event.summary || "Game ended.";
  }

  if (event.type === "ROOM_RESET") {
    return "Room was reset.";
  }

  if (event.type === "VOTE_RESOLVED") {
    return `Vote resolved with outcome: ${event.outcome}.`;
  }

  return "Event recorded.";
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
  const tiedPlayers = currentRoom.tiebreakPlayerIds
    .map((playerId) => currentRoom.players.find((player) => player.id === playerId))
    .filter(Boolean)
    .filter((player) => player.status === "alive");
  const tiebreakVoters = alivePlayers.filter((player) => !currentRoom.tiebreakPlayerIds.includes(player.id));
  const missingTiebreakStatements = tiedPlayers.filter((player) => !currentRoom.tiebreakStatements[player.id]);
  const missingTiebreakVotes = tiebreakVoters.filter((player) => !currentRoom.tiebreakVotes[player.id]);
  const humanCount = currentRoom.players.filter((player) => player.role === "human").length;

  if (currentRoom.phase === "lobby") {
    if (humanCount < GAME_CONFIG.players.humansRequired) {
      return `${GAME_CONFIG.players.humansRequired - humanCount} more human player(s) to join`;
    }

    return currentRoom.phaseEndsAt ? "game starts soon" : "game start";
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

  if (currentRoom.phase === "tiebreak_statements") {
    return missingTiebreakStatements.length
      ? `tiebreak statements from ${missingTiebreakStatements.map((player) => player.name).join(", ")}`
      : "advance to tiebreak vote";
  }

  if (currentRoom.phase === "tiebreak_vote") {
    return missingTiebreakVotes.length
      ? `tiebreak votes from ${missingTiebreakVotes.map((player) => player.name).join(", ")}`
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

  if (currentRoom.phase === "tiebreak_statements") {
    const tiedPlayers = currentRoom.tiebreakPlayerIds
      .map((playerId) => currentRoom.players.find((player) => player.id === playerId))
      .filter(Boolean)
      .filter((player) => player.status === "alive");

    return tiedPlayers.every((player) => Boolean(currentRoom.tiebreakStatements[player.id]));
  }

  if (currentRoom.phase === "tiebreak_vote") {
    const eligibleVoters = alivePlayers.filter((player) => !currentRoom.tiebreakPlayerIds.includes(player.id));

    if (!eligibleVoters.length) {
      return true;
    }

    return eligibleVoters.every((player) => Boolean(currentRoom.tiebreakVotes[player.id]));
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
