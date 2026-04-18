# Clipped

Prototype for a social deduction chat game where humans try to recognize each
other inside a room of AI participants.

## Run The Prototype

Requirements:

- Node.js 20 or newer

Start the server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Open the page in two browser tabs, join with two different names, then start the
demo game.

## Test On Your Local Network

The server listens on all local network interfaces by default. When you run:

```bash
npm start
```

the terminal prints something like:

```text
Game prototype running locally at http://localhost:3000
Local network URLs:
  http://192.168.1.42:3000
```

Share the `http://192.168.x.x:3000` URL with teammates on the same Wi-Fi or LAN.

If teammates cannot connect:

- Make sure everyone is on the same network.
- Make sure the server is still running on your machine.
- Allow Node.js through Windows Firewall if prompted.
- Try temporarily using a private/home network instead of a public network profile.
- Check that port `3000` is not blocked by your network.

You can also choose another port:

```bash
$env:PORT=3001; npm start
```

## Current Scope

This slice is intentionally simple, but the server now owns the game loop:

- Static browser client
- Node HTTP server
- Server-Sent Events for live state updates
- In-memory demo room
- Two human players
- Four mock AI players
- Server-owned phases
- Generic action endpoint
- Mock agents that act through the same controller path as humans
- No database
- No login
- No LLM calls yet

## Architecture

The chat UI is only an interface. The game system lives on the server.

```text
Browser UI
  -> POST /actions
  -> server.js transport layer
  -> src/game.js controller
  -> src/agents.js mock agents
  -> SSE public state broadcast
```

Important files:

- `server.js`: HTTP server, static files, SSE, action routing
- `src/gameConfig.js`: shared tuning values for player counts, phase durations, and text limits
- `src/game.js`: room state, phases, validation, voting, win resolution
- `src/agents.js`: mock AI players and scheduled agent actions
- `src/agentContract.js`: compatibility contract for future agents
- `src/agentContext.js`: safe public context builder for agents
- `src/publicState.js`: safe state serialization for each viewer
- `public/app.js`: browser rendering and action submission
- `docs/AGENT_BLUEPRINT.md`: teammate-facing agent implementation guide

## Supported Actions

The client and agents both submit game actions:

- `JOIN_ROOM`
- `START_GAME`
- `ADVANCE_PHASE`
- `SUBMIT_SPARK`
- `SEND_CHAT`
- `SUBMIT_FINAL`
- `CAST_VOTE`
- `SUBMIT_TIEBREAK`
- `CAST_TIEBREAK_VOTE`
- `RESET_ROOM`

The game controller validates every action before mutating room state.

## Operational Endpoints

These endpoints help with deployment and playtest debugging.

### `GET /health`

Opens a visual server status page in the browser. It can also return compact
JSON status without hidden role information.

JSON form:

```text
GET /health?format=json
```

Example:

```json
{
  "ok": true,
  "phase": "chat",
  "round": 1,
  "maxRounds": 3,
  "players": 6,
  "alivePlayers": 6,
  "clients": 2,
  "messages": 12,
  "events": 24,
  "uptimeSeconds": 123
}
```

### `GET /debug/events`

Opens a visual timeline of the current room's structured event log.

This is intended for development and playtest debugging. It records accepted and
rejected actions, phase changes, joins, ejections, game start, game over, and
room resets.

JSON form:

```text
GET /debug/events?format=json
```

Example:

```json
{
  "roomId": "demo",
  "phase": "spark",
  "round": 1,
  "events": []
}
```

## Prototype Flow

```text
lobby
-> spark
-> spark_reveal
-> chat
-> final_statements
-> vote
-> tiebreak_statements, if vote is tied
-> tiebreak_vote, if vote is tied
-> reveal
-> next round or game_over
```

Normal players do not need to advance phases manually. The server advances when
all required submissions are in, and timed phases advance when their timer ends.

To show debug controls such as `Advance` and `Reset`, open:

```text
http://localhost:3000?dev=1
```

Use this during development if a playtest gets stuck or you want to skip ahead.

## Server Logs

The server is intentionally verbose while prototyping. The terminal shows:

- HTTP requests
- SSE client connects/disconnects
- Submitted actions
- Accepted/rejected actions
- Phase changes
- Mock agent scheduling
- Mock agent actions
- State broadcasts
- What the room is currently waiting for

Example:

```text
[11:58:04] INFO  phase changed from=lobby to=spark round=1 waitingFor=spark answers from Alice, Ben, Mara, Jules, Theo, Nia
[11:58:05] INFO  action accepted type=SUBMIT_SPARK actor=Mara/ai/alive before=phase=spark round=1 players=6 alive=6 humansAlive=2 after=phase=spark round=1 players=6 alive=6 humansAlive=2
[11:58:06] INFO  waiting for=spark answers from Alice, Ben
```

To reduce noise:

```bash
$env:LOG_LEVEL="info"; npm start
```

Available levels:

- `debug`
- `info`
- `warn`
- `error`
