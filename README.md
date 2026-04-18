# Clipped

https://clipper.chat

Clipped is a browser-based social deduction prototype. Human players try to
find each other inside a room filled with AI contestants that are trying to
pass as human.

## What It Does

- Lists and creates game rooms
- Starts a room immediately once the required number of humans join
- Runs a server-owned game loop with timed and auto-advanced phases
- Streams live room state to browsers with Server-Sent Events
- Adds AI players that act through the same action pipeline as humans
- Generates spark questions through the OpenAI Responses API

Current default room settings:

- 2 human players
- 4 AI players
- 3 rounds
- 120 second chat phase

## Local Development

Requirements:

- Node.js 20 or newer
- `OPENAI_API_KEY`

Start the server:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Create a room or open the demo room, then join from two tabs or two devices.
As soon as the required human count is reached, the game enters round 1.

Optional environment variables:

- `OPENAI_MODEL` defaults to `gpt-4.1`
- `PORT` defaults to `3000`
- `HOST` defaults to `0.0.0.0`
- `LOG_LEVEL` supports `debug`, `info`, `warn`, `error`

Run tests:

```bash
npm test
```

## Game Flow

```text
lobby
-> spark
-> spark_reveal
-> chat
-> final_statements
-> vote
-> tiebreak_statements, if needed
-> tiebreak_vote, if needed
-> reveal
-> next round or game_over
```

The server advances phases automatically when all required submissions are in,
or when a timed phase expires.

Use dev controls during local debugging:

```text
http://localhost:3000?dev=1
```

## Architecture

```text
Browser UI
  -> /api/rooms and /api/rooms/:roomId/*
  -> server.js transport and room runtime
  -> src/game.js game rules and state transitions
  -> src/agents.js AI scheduling and actions
  -> SSE state broadcast back to clients
```

Key files:

- `server.js`: HTTP routes, SSE, room lifecycle, health/debug pages
- `src/game.js`: room state, joins, phase changes, votes, win resolution
- `src/gameConfig.js`: room defaults, limits, and phase durations
- `src/agents.js`: AI roster, timing, and action scheduling
- `src/questions.js`: OpenAI-backed spark question generation
- `src/publicState.js`: viewer-safe state serialization
- `public/app.js`: room list, join flow, and in-browser game UI

## HTTP Surface

Main browser and API routes:

- `GET /`: rooms screen
- `GET /rooms/:roomId`: room UI
- `GET /api/rooms`: list rooms
- `POST /api/rooms`: create room
- `GET /api/rooms/:roomId/state`: fetch current public state
- `GET /api/rooms/:roomId/events`: subscribe to room state updates
- `POST /api/rooms/:roomId/actions`: submit player actions
- `POST /api/rooms/:roomId/admin/reset`: reset a room
- `GET /health`: server status page or JSON with `?format=json`
- `GET /debug/events`: debug event page
- `GET /api/rooms/:roomId/debug/events`: per-room event log

Supported actions:

- `JOIN_ROOM`
- `START_GAME`
- `ADVANCE_PHASE`
- `SUBMIT_SPARK`
- `SEND_CHAT`
- `SET_TYPING`
- `SUBMIT_FINAL`
- `CAST_VOTE`
- `SUBMIT_TIEBREAK`
- `CAST_TIEBREAK_VOTE`
- `RESET_ROOM`

## Deployment

The repo includes Kubernetes manifests under [`k8s/`](./k8s) and supporting
infrastructure under [`cloud_infrastructure/`](./cloud_infrastructure).

For deployment details, use:

- [`k8s/README.md`](/Users/doom/Documents/_projects/clipped/k8s/README.md:1)

The repo also includes a GitHub Actions deploy workflow that builds and deploys
on pushes to `main`.
