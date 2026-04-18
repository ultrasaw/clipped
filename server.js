const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createDemoRoom, applyAction } = require("./src/game");
const { createMockAgentManager } = require("./src/agents");
const { getPublicState } = require("./src/publicState");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const clients = new Map();
const room = createDemoRoom();

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
}

const agentManager = createMockAgentManager({
  applyAction,
  broadcastState,
});

function applyAndBroadcast(action, context = {}) {
  const previousPhase = room.phase;
  const result = applyAction(room, action, context);

  if (!result.ok) {
    room.errors.push(result.error);
  }

  broadcastState();

  if (result.ok && room.phase !== previousPhase) {
    agentManager.handlePhaseEntered(room);
    broadcastState();
  }

  return result;
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

  req.on("close", () => {
    clients.delete(clientId);
  });
}

async function handlePostAction(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const playerId = typeof body.playerId === "string" ? body.playerId : null;
    const action = normalizeAction(body.action || {}, playerId);
    const result = applyAndBroadcast(action, { connectionId: playerId || null });

    sendJson(res, result.ok ? 200 : 400, result);
  } catch (error) {
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
});

server.listen(PORT, () => {
  console.log(`Game prototype running at http://localhost:${PORT}`);
});
