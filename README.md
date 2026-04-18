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
- `RESET_ROOM`

The game controller validates every action before mutating room state.

## Prototype Flow

```text
lobby
-> spark
-> spark_reveal
-> chat
-> final_statements
-> vote
-> reveal
-> next round or game_over
```

Use the `Advance` button to move between phases while testing.
