const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const clients = new Set();
const messages = [
  {
    id: crypto.randomUUID(),
    sender: "System",
    text: "Welcome to the prototype room.",
    createdAt: Date.now(),
  },
];

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

      if (body.length > 10_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function broadcast(event, payload) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of clients) {
    client.write(frame);
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  res.write(`event: snapshot\ndata: ${JSON.stringify({ messages })}\n\n`);
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
}

async function handlePostMessage(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");

    const sender = String(body.sender || "").trim().slice(0, 24);
    const text = String(body.text || "").trim().slice(0, 500);

    if (!sender || !text) {
      sendJson(res, 400, { error: "Sender and message text are required." });
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      sender,
      text,
      createdAt: Date.now(),
    };

    messages.push(message);

    if (messages.length > 100) {
      messages.shift();
    }

    broadcast("message", message);
    sendJson(res, 201, { message });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Invalid request." });
  }
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
    handleEvents(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages") {
    handlePostMessage(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(PORT, () => {
  console.log(`Chat prototype running at http://localhost:${PORT}`);
});
