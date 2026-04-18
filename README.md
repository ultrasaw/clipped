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
- `src/publicState.js`: safe state serialization for each viewer
- `public/app.js`: browser rendering and action submission

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
