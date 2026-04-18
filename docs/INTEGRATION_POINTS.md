# Integration Points

This document defines the current boundaries between frontend, agents, infra,
and the server-owned game manager.

The goal is simple:

> Everyone can work in parallel without accidentally changing someone else's contract.

## Core Architecture Rule

The server owns the game.

Clients and agents only submit actions.

```text
Browser UI / Agent
  -> action
  -> server.js
  -> src/game.js validates and mutates room state
  -> public state broadcast
```

Do not duplicate game rules in the frontend or inside agents.

## Runtime

### Start Locally

PowerShell may block `npm`, so prefer:

```powershell
npm.cmd start
```

Then open:

```text
http://localhost:3000
```

### Local Network Testing

The server binds to all interfaces by default.

After start, the terminal prints a LAN URL such as:

```text
http://10.2.11.40:3000
```

Share that URL with teammates on the same Wi-Fi/LAN.

### Environment Variables

| Name | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` for local-only testing. |
| `PORT` | `3000` | HTTP server port. |
| `LOG_LEVEL` | `debug` | Server log verbosity. |

Example:

```powershell
$env:PORT=3001; $env:LOG_LEVEL="info"; npm.cmd start
```

## Frontend Contract

Frontend owns:

- Rendering public game state.
- Submitting human actions.
- Showing phase-specific UI.
- Showing dev controls only in dev mode.

Frontend does not own:

- Hidden roles.
- Phase transitions.
- Vote resolution.
- Win/loss logic.
- Agent behavior.

### Main Files

```text
public/index.html
public/styles.css
public/app.js
```

### Dev Mode

Normal players should use:

```text
http://localhost:3000
```

Debug controls are available at:

```text
http://localhost:3000?dev=1
```

Dev mode currently shows:

- `Advance`
- `Reset`

### Realtime State

Frontend connects to:

```text
GET /events
```

If the browser has a local player ID:

```text
GET /events?playerId=<playerId>
```

The server sends `state` events using Server-Sent Events.

Frontend should treat each received state payload as the source of truth.

### Public State Shape

The public state is created by:

```text
src/publicState.js
```

Important fields:

```js
{
  id,
  phase,
  round,
  maxRounds,
  sparkPrompt,
  phaseStartedAt,
  phaseEndsAt,
  tiebreakPlayerIds,
  players,
  viewer,
  messages,
  sparkAnswers,
  finalStatements,
  tiebreakStatements,
  revealedVotes,
  lastEjection,
  result,
  errors
}
```

The `viewer` field is specific to the current player.

```js
viewer: {
  id,
  name,
  role,
  briefing,
  submissions: {
    spark,
    finalStatement,
    vote,
    tiebreakStatement,
    tiebreakVote
  }
}
```

Do not infer hidden information from missing fields.

If the frontend needs more public information, add it in `src/publicState.js`
instead of reading private server room state.

## Action Contract

All human and agent gameplay changes go through:

```text
POST /actions
```

Request body:

```json
{
  "playerId": "optional-player-id",
  "action": {
    "type": "SEND_CHAT",
    "text": "Theo feels too careful."
  }
}
```

Response:

```json
{
  "ok": true
}
```

or:

```json
{
  "ok": false,
  "error": "Action is only allowed during chat. Current phase is vote."
}
```

### Supported Actions

| Action | Who Uses It | Phase | Notes |
| --- | --- | --- | --- |
| `JOIN_ROOM` | Human client | `lobby` | Creates or refreshes a human player. |
| `START_GAME` | Auto/dev | `lobby` | Starts automatically after both humans join. Dev mode can still advance from lobby. |
| `ADVANCE_PHASE` | Dev/timer/auto | Any active phase | Hidden from normal UI unless `?dev=1`. |
| `SUBMIT_SPARK` | Human/agent | `spark` | Short spark answer. |
| `SEND_CHAT` | Human/agent | `chat` | Public chat message. |
| `SUBMIT_FINAL` | Human/agent | `final_statements` | One final read/defense/accusation. |
| `CAST_VOTE` | Human/agent | `vote` | Vote for least human. No self-vote. |
| `SUBMIT_TIEBREAK` | Tied human/agent | `tiebreak_statements` | Only tied players can submit. |
| `CAST_TIEBREAK_VOTE` | Non-tied human/agent | `tiebreak_vote` | Only non-tied alive players vote. Target must be tied. |
| `RESET_ROOM` | Dev UI | Any | Resets the demo room. |

If a new action is added, update:

- `src/game.js`
- `server.js` action normalization
- `public/app.js`, if humans need UI for it
- `docs/INTEGRATION_POINTS.md`
- `docs/AGENT_BLUEPRINT.md`, if agents can use it

## Phase Contract

Current phases:

```text
lobby
spark
spark_reveal
chat
final_statements
vote
tiebreak_statements
tiebreak_vote
reveal
game_over
```

The server owns phase changes.

Normal phase flow:

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

Lobby start rule:

- Once the required human players have joined, the server schedules a short
  ready countdown.
- When the countdown ends, the server starts the game automatically.
- Normal players do not see or need a `Start` button.

Tie flow:

```text
vote
-> tiebreak_statements
-> tiebreak_vote
-> reveal
```

Auto-advance rules:

- `spark` advances after all alive players submit spark answers.
- `final_statements` advances after all alive players submit final statements.
- `vote` advances after all alive players vote.
- `tiebreak_statements` advances after all tied players submit statements.
- `tiebreak_vote` advances after all eligible non-tied voters vote.
- Timed phases advance when their timer ends.

## Tie Handling Contract

Every round should eliminate at least one player once voting resolves.

Main vote:

- If one player has the most votes, that player is ejected.
- If multiple players tie for the most votes, the game enters tiebreak.

Tiebreak statements:

- Only tied players submit statements.

Tiebreak vote:

- Tied players cannot vote.
- Non-tied alive players vote only between tied players.

Tiebreak result:

- If one tied player has the most tiebreak votes, eject that player.
- If multiple tied players tie again, eject all top-tied players.

## Agent Contract

Agents own:

- Personality.
- Prompting.
- Private memory.
- Suspicion logic.
- Returning legal actions.

Agents do not own:

- Room mutation.
- Phase changes.
- Vote resolution.
- Hidden role lookup.
- Client broadcasts.

Primary doc:

```text
docs/AGENT_BLUEPRINT.md
```

Main files:

```text
src/agentContract.js
src/agentContext.js
src/agents.js
```

Agent rule:

```text
Agents return actions. The game controller applies actions.
```

Agents should only use public context from:

```js
buildAgentContext(room, agentPlayer)
```

During `tiebreak_vote`, `context.legalTargets` only contains tied players.

## Game Manager Contract

The game manager owns:

- Room state.
- Player roles.
- Phase machine.
- Action validation.
- Voting and tiebreaks.
- Ejections and reveals.
- Win/loss resolution.
- Public-state serialization boundaries.
- Event logging.

Main files:

```text
src/game.js
src/gameConfig.js
src/publicState.js
server.js
```

Config lives in:

```text
src/gameConfig.js
```

Do not spread hardcoded game settings through UI or agent files.

## Infra Contract

Infra owns:

- VM setup.
- Node runtime.
- Process manager.
- Domain/proxy.
- Firewall/TLS.
- Runtime environment variables.

Infra should not edit source just to change:

- Host
- Port
- Log level

Use env vars instead.

### Health Endpoint

Browser-friendly:

```text
GET /health
```

JSON:

```text
GET /health?format=json
```

Use this to verify deployment.

### Debug Events Endpoint

Browser-friendly:

```text
GET /debug/events
```

JSON:

```text
GET /debug/events?format=json
```

This shows the in-memory event log for playtest debugging.

Before wider public deployment, debug/admin endpoints should be protected.

## Event Log Contract

The room event log is stored at:

```js
room.events
```

It is a bounded in-memory flight recorder.

Current event types include:

- `PLAYER_JOINED`
- `PLAYER_REJOINED`
- `ACTION_ACCEPTED`
- `ACTION_REJECTED`
- `GAME_STARTED`
- `PHASE_CHANGED`
- `VOTE_TIED`
- `PLAYER_EJECTED`
- `VOTE_RESOLVED`
- `GAME_OVER`
- `ROOM_RESET`

The event log should not contain hidden role information before roles are
revealed.

## Safe Parallel Work

### Frontend Teammate

Safe to work in:

```text
public/
```

Coordinate before changing:

- Action names
- Public state shape
- Phase names

### Agent Teammate

Safe to work in:

```text
src/agent*.js
docs/AGENT_BLUEPRINT.md
```

Coordinate before changing:

- Action names
- Phase names
- `src/game.js`

### Infra Teammate

Safe to work on:

- VM
- Process manager
- Domain/proxy
- Firewall/TLS
- Env vars

Coordinate before changing:

- Source server binding behavior
- Endpoint paths

### Game Manager Teammate

Safe to work in:

```text
src/game.js
src/gameConfig.js
src/publicState.js
server.js
```

Coordinate before changing:

- Public state shape
- Action names
- Phase names
- Agent contract

## Current Non-Goals

Do not add these unless the team explicitly decides to:

- Auth/login.
- Database persistence.
- Matchmaking.
- Multiple simultaneous rooms.
- Public admin reset without protection.
- Client-side hidden role logic.

Keep the prototype boring where the game is not the experiment.
