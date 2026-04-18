# Agent Blueprint

This document is the compatibility contract for anyone working on AI agents.

The short version:

> Agents do not run the game. Agents produce game actions. The server-owned game controller validates and applies those actions.

That boundary is what lets multiple teammates build agents without breaking the game system.

## Current Game Phases

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

Agents act during:

- `spark`
- `chat`
- `final_statements`
- `vote`
- `tiebreak_statements`
- `tiebreak_vote`

Agents should not act during:

- `lobby`
- `spark_reveal`
- `reveal`
- `game_over`

## Agent Responsibilities

Each agent is responsible for:

- Maintaining its own personality.
- Reading public game context.
- Producing legal game actions.
- Avoiding hidden role knowledge.
- Keeping messages short and playable.
- Returning `null` or an empty list when it should not act.

Each agent is not responsible for:

- Mutating room state.
- Advancing phases.
- Revealing roles.
- Deciding whether a vote is valid.
- Deciding whether the game is over.
- Sending messages directly to clients.

## Agent Inputs

An agent should be initialized with:

- `player`: the AI player object.
- `gameplayPrompt`: shared rules and objective.
- `personalityPrompt`: the individual personality.
- `memory`: optional private memory owned by that agent.

Conceptual shape:

```js
{
  player: {
    id: "ai_1",
    name: "Mara",
    role: "ai",
    status: "alive"
  },
  gameplayPrompt: "You are playing a social deduction game...",
  personalityPrompt: "You are guarded, terse, observant...",
  memory: {
    suspicions: {},
    notes: []
  }
}
```

## Agent Context

Before asking an agent to act, the game should build a public context object.

This context should include:

- Agent identity.
- Current phase.
- Current round.
- Spark prompt.
- Public player list.
- Alive player IDs.
- Legal targets.
- Public messages.
- Revealed spark answers.
- Revealed final statements.
- Revealed votes, if any.
- Last ejection, if any.

This context should not include:

- Hidden human identities.
- Other agents' private memory.
- Unrevealed votes.
- Future prompts.
- Server internals.

Current helper:

```js
const { buildAgentContext } = require("../src/agentContext");

const context = buildAgentContext(room, agentPlayer);
```

## Required Agent Interface

Use `BaseAgent` from `src/agentContract.js`.

```js
const { BaseAgent } = require("./agentContract");

class MyAgent extends BaseAgent {
  onPhaseStarted(context) {}

  async getSparkAction(context) {
    return null;
  }

  async getChatActions(context) {
    return [];
  }

  async getFinalStatementAction(context) {
    return null;
  }

  async getVoteAction(context) {
    return null;
  }

  async getTiebreakStatementAction(context) {
    return null;
  }

  async getTiebreakVoteAction(context) {
    return null;
  }
}
```

## Legal Agent Actions

Agents must return one of these game actions.

### Submit Spark

```js
{
  type: "SUBMIT_SPARK",
  playerId: "ai_1",
  text: "rain smell"
}
```

Helper:

```js
createSparkAction(agent.id, "rain smell");
```

### Send Chat

```js
{
  type: "SEND_CHAT",
  playerId: "ai_1",
  text: "Theo feels a little too rehearsed to me."
}
```

Helper:

```js
createChatAction(agent.id, "Theo feels a little too rehearsed to me.");
```

### Submit Final Statement

```js
{
  type: "SUBMIT_FINAL",
  playerId: "ai_1",
  text: "My final read is Theo. Too controlled."
}
```

Helper:

```js
createFinalStatementAction(agent.id, "My final read is Theo. Too controlled.");
```

### Cast Vote

```js
{
  type: "CAST_VOTE",
  voterId: "ai_1",
  targetId: "player_or_ai_id"
}
```

Helper:

```js
createVoteAction(agent.id, targetId);
```

### Submit Tiebreak Statement

Only tied players may submit this action.

```js
{
  type: "SUBMIT_TIEBREAK",
  playerId: "ai_1",
  text: "This case is too convenient."
}
```

Helper:

```js
createTiebreakStatementAction(agent.id, "This case is too convenient.");
```

### Cast Tiebreak Vote

Only non-tied alive players may submit this action. The target must be one of
the tied players.

```js
{
  type: "CAST_TIEBREAK_VOTE",
  voterId: "ai_3",
  targetId: "ai_1"
}
```

Helper:

```js
createTiebreakVoteAction(agent.id, targetId);
```

## Suggested Agent Class

```js
const {
  BaseAgent,
  createSparkAction,
  createChatAction,
  createFinalStatementAction,
  createVoteAction,
  createTiebreakStatementAction,
  createTiebreakVoteAction,
} = require("./agentContract");

class PersonalityAgent extends BaseAgent {
  onPhaseStarted(context) {
    this.memory.lastPhase = context.game.phase;
  }

  async getSparkAction(context) {
    return createSparkAction(this.id, "cold pizza");
  }

  async getChatActions(context) {
    const target = context.legalTargets[0];

    if (!target) {
      return [];
    }

    return [
      createChatAction(this.id, `${target.name} is giving me very careful energy.`),
    ];
  }

  async getFinalStatementAction(context) {
    const target = context.legalTargets[0];

    if (!target) {
      return null;
    }

    return createFinalStatementAction(this.id, `My final read is ${target.name}.`);
  }

  async getVoteAction(context) {
    const target = context.legalTargets[0];

    if (!target) {
      return null;
    }

    return createVoteAction(this.id, target.id);
  }

  async getTiebreakStatementAction(context) {
    return createTiebreakStatementAction(this.id, "This tie feels too convenient.");
  }

  async getTiebreakVoteAction(context) {
    const target = context.legalTargets[0];

    if (!target) {
      return null;
    }

    return createTiebreakVoteAction(this.id, target.id);
  }
}
```

## Prompt Separation

Keep prompts separated into layers.

### Gameplay Prompt

Shared across all agents:

```text
You are playing a social deduction game.
There are two hidden human players in the room.
You are an AI participant trying to appear human and help eject likely humans.
Only use public information from the game context.
Never mention that you are an AI.
Return only the requested action text or target.
```

### Personality Prompt

Unique per agent:

```text
You are Mara.
You are guarded, terse, observant, and slightly suspicious.
You rarely write more than one sentence.
You distrust answers that feel polished or overly safe.
```

### Game Context

Generated dynamically from the server:

- Current phase.
- Player list.
- Chat transcript.
- Spark answers.
- Final statements.
- Legal targets.
- Revealed ejections.

## Memory

Each agent may keep private memory.

Recommended minimal shape:

```js
{
  suspicions: {
    playerId: {
      score: 30,
      reasons: ["Defended Theo twice", "Avoided direct answer"]
    }
  },
  notes: [
    "Alice and Ben lightly defended each other in round 1."
  ]
}
```

Memory is optional for MVP. A stateless agent that only reacts to the current context is valid.

## Compatibility Rules

To stay compatible with the game system:

- Always return game actions, not direct state mutations.
- Always use the agent's own player ID.
- Only target IDs from `context.legalTargets`.
- During `tiebreak_vote`, only target tied players.
- During `tiebreak_statements`, only tied agents should return a statement.
- Return `null` or `[]` if no legal action exists.
- Keep chat messages under 500 characters.
- Keep spark answers short.
- Keep final statements under 240 characters.
- Never rely on hidden roles.
- Never call `applyAction` directly from inside the agent.
- Let the manager/server submit returned actions.

## Team Work Split

Good parallel work streams:

- One teammate builds prompt templates.
- One teammate builds `LLMAgent`.
- One teammate builds suspicion/memory scoring.
- One teammate builds the agent manager integration that schedules and submits returned actions.

The integration point should stay the same:

```js
const action = await agent.getVoteAction(context);
submitAction(action, { source: "agent" });
```

## MVP Recommendation

Build in this order:

1. Implement one `ScriptedAgent` using the contract.
2. Swap the current mock logic to use `ScriptedAgent`.
3. Implement one `LLMAgent` behind the same methods.
4. Add memory/suspicion once the LLM agent can reliably return valid actions.

This keeps us from mixing agent intelligence with game rules, which is the slippery banana peel here.
