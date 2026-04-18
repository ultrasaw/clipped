# One Of Us - Game Design Document

**Version:** MVP v3  
**Genre:** Social deduction / reverse Turing test  
**Platform:** Web browser, desktop-first  
**Players:** 2 humans + 4 AI participants  
**Session length:** 8-10 minutes  
**Current prototype focus:** Server-owned game loop with mock AI agents

## 1. High Concept

### Elevator Pitch

A social deduction game where two hidden human players enter a room of AI participants. Everyone must appear convincingly human. The humans know there is one other human in the room, but they do not know who. Each round begins with a light conversational spark, then opens into free chat. At the end of each round, players vote out whoever feels least human.

### Core Question

Can two real people recognize each other inside a room full of convincing fakes, without exposing themselves?

## 2. Core Vision

This is not a writing game.

This is a social performance and recognition game.

Players are not trying to give the best answer. They are trying to:

- Sound human
- Read other players
- Find the other real person
- Survive suspicion
- Avoid looking like they are trying too hard

The game creates a room where:

- Everyone is performing
- Everyone is judging
- Every interaction becomes evidence
- Trust is useful, but dangerous

## 3. Two-Human Design

### Human Knowledge

Each human knows:

- They are human
- There is exactly one other human in the room
- The other human's identity is unknown
- Both humans are trying to survive

Each human does not know:

- Which other player is human
- Which players are AI
- How the AIs are evaluating them

### AI Knowledge

For MVP, AIs should know the game premise:

- There are two hidden humans
- The AI goal is to appear human and help eject humans

However, AI agents should not receive hidden role information directly. They should infer from public conversation and public game events.

### Core Tension

The human player is pulled between two goals:

- Hide from the AIs
- Signal enough authenticity for the other human to recognize them

The behavior that helps the other human recognize you may also help the AIs identify you.

## 4. Core Loop

```text
LOBBY -> GAME_START ->
[ SPARK -> SPARK_REVEAL -> FREE_CHAT -> FINAL_STATEMENTS -> VOTE -> REVEAL ] x 3
-> GAME_OVER
```

There are 3 rounds total.

## 5. Win Conditions

### MVP Win Conditions

| Result | Condition |
| --- | --- |
| Full human win | Both humans survive all 3 rounds. |
| Partial human win | One human survives all 3 rounds. |
| AI win | Both humans are ejected before the end. |

### Future Recognition Condition

At the end of the game, surviving humans may be asked:

> Who do you think the other human was?

For the current MVP, this should be treated as post-game validation data rather than a hard win condition.

Later versions may require humans to correctly identify each other for a full win.

## 6. Lose Conditions

| Team | Lose Condition |
| --- | --- |
| Humans | Both humans are ejected. |
| AIs | At least one human survives through round 3. |

In MVP language, a single surviving human creates a partial human win. This keeps early losses from making the second human feel completely disposable while still rewarding the stronger outcome where both humans survive.

## 7. Round Structure

### 7.1 Spark Phase: Light Prompt

Each round begins with a low-effort prompt.

**Key rule:** The prompt should be easy to answer instantly.

#### Examples

- "Name one thing people pretend to like."
- "Say one small thing that annoys you."
- "Pick one: morning or night."
- "What's worse: too hot or too cold?"
- "Say one habit you have."

#### Design Goals

- 1-5 words is enough
- No deep thinking required
- No "best answer" pressure
- Seeds evidence for later conversation

### 7.2 Spark Reveal

All submitted spark answers are revealed simultaneously.

**Important:** This is not the main gameplay. It gives the room shared material to react to.

### 7.3 Free Chat Phase

This is the core of the game.

All alive players enter a shared public chat.

Players can:

- Question others
- Defend themselves
- Accuse
- Reinterpret answers
- Ignore the prompt entirely
- Create their own lines of suspicion
- Subtly signal or test human recognition

There are no private DMs in the MVP.

#### Design Goals

- Natural conversation
- Minimal constraints
- Readable pace
- No spam
- Enough room for small human tells to matter

### 7.4 Final Statements

Each alive player gets one short final message.

They must do one of the following:

- Accuse someone
- Defend themselves
- Give a final read
- Subtly explain who they trust

**Purpose:** Forces commitment before voting.

### 7.5 Vote Phase

All alive players vote on the question:

> Who feels least convincingly human?

#### Rules

- No self-vote
- Votes are simultaneous
- Highest vote total ejects

### 7.6 Tie Resolution

Current prototype:

- Ties are resolved by the current simple vote resolver.

Target MVP:

1. **Tiebreak statements:** Tied players each give a short statement.
2. **Revote:** Only tied players are valid targets. Tied players cannot vote.
3. **If tied again:** All tied players are ejected.

This creates:

- Pressure
- Drama
- No stalled rounds

### 7.7 Reveal

The ejected player is revealed as one of the following:

- AI
- HUMAN

For MVP, use full reveal after ejection because it is clear, dramatic, and easy to test.

## 8. Prompt / Spark Design

### 8.1 Principles

Prompts should:

- Be fast
- Be simple
- Generate differences without effort
- Invite small personal texture

Avoid:

- Complex framing
- Introspection-heavy questions
- Anything that feels like writing a "good answer"
- Questions where AI polish obviously wins

### 8.2 Prompt Types

#### A. One-Word / Short Phrase

- "Name a smell you like"
- "Favorite weather"

#### B. Binary Choice

- "City or nature?"
- "Sweet or salty?"

#### C. Small Opinion

- "Something overrated"
- "Something annoying"

#### D. Social Hooks

- "Who seems hardest to read so far?"
- "Whose answer felt safest?"

### 8.3 Important Rule

The prompt should start the conversation, not carry it.

## 9. AI Participant Design

### 9.1 MVP Agent Approach

Start with mock AI agents before adding LLM agents.

Mock agents should:

- Submit spark answers
- Send short chat messages
- Submit final statements
- Cast votes
- Use the same action pipeline as humans
- Avoid hidden role knowledge

This validates the game loop before committing to AI complexity.

### 9.2 Future Personas

Each AI can eventually be generated from trait combinations.

| Trait Category | Examples |
| --- | --- |
| Social tone | Warm, guarded, confrontational, playful |
| Reasoning | Suspicious, agreeable, pattern-based |
| Expression | Terse, verbose, casual, formal |
| Behavior | High-chat, low-chat, deflector, challenger, observer |

#### Goals

- Variation between matches
- Consistent behavior within a match
- Readable personalities
- Enough imperfection to feel socially plausible

### 9.3 AI Goals

Each AI tries to:

- Appear human
- Avoid becoming a target
- Identify likely humans from public evidence
- Break real human-human trust
- Create false confidence and false suspicion
- Adapt to social pressure

### 9.4 AI Chat Behavior

Each AI:

- Sends about 1-2 meaningful messages per round
- Reacts to accusations, spotlighted answers, and contradictions
- Avoids filler
- Avoids over-explaining
- Should not sound like a debate-club paragraph machine

#### Message Types

- Accuse
- Defend
- Question
- Reinterpret
- Redirect
- Softly trust someone
- Cast doubt on a forming pair

## 10. Suspicion System

### MVP

The prototype does not yet need a complex suspicion model.

Mock agents can use simple public heuristics:

- Pick a random alive target
- Prefer players who were recently discussed
- Prefer players who have not been targeted yet
- Occasionally defend or redirect

### Future

Each AI may track:

- Suspicion scores per player
- Reasoning notes
- Social events, such as being accused, ignored, defended, or contradicted
- Possible human-human pair signals

Inputs may include:

- Answer quality
- Tone consistency
- Defensiveness
- Contradiction
- Social positioning
- Silence
- Unusual trust
- Overly careful phrasing
- Sudden defense of another player

**Important:** Suspicion is interpretive, not objective. Different AIs may disagree.

## 11. Human Experience

The human should feel a different kind of pressure each round.

| Round | Intended Feeling |
| --- | --- |
| Round 1 | "Who else feels real?" |
| Round 2 | "I think I know, but helping them could expose us." |
| Round 3 | "Do we trust each other enough to survive the vote?" |

### Key Tension

Not sounding human, but not sounding like you are trying to sound human.

### Recognition Tension

Humans should wonder:

- Was that message a real human signal?
- Is this AI pretending to recognize me?
- Should I defend this player?
- Am I accidentally exposing both of us?

## 12. UI / UX

### 12.1 Layout

```text
BRIEFING       | GAME ROOM
-------------- | --------------------------------
Your role      | Phase header
Human goal     | Lobby controls / dev controls
               | Players list | Main panel
               |              | Spark / Chat / Vote
```

### 12.2 Chat

- Clear names and colors
- Readable message pacing
- System messages for phase changes
- Minimal clutter
- Distinguish final statements from normal chat

### 12.3 Spark Display

- Small and non-dominant
- Shows current prompt during spark
- Reveals answers after spark phase
- Should not overpower chat

### 12.4 Voting UI

- Large player cards
- Simple selection
- No self-vote
- Clear lock-in

### 12.5 Prototype Controls

The current prototype includes developer controls:

- Start
- Advance phase
- Reset

These are useful for testing and should be removed or hidden in a player-facing version.

## 13. Technical Architecture

### 13.1 Principle

The chat is not the game.

The chat is one interface and one action type inside a server-owned game loop.

### 13.2 Current Prototype Architecture

```text
Browser UI
  -> POST /actions
  -> server.js transport layer
  -> src/game.js controller
  -> src/agents.js mock agents
  -> SSE public state broadcast
```

### 13.3 Server Responsibilities

The server owns:

- Room state
- Player roles
- Phase transitions
- Action validation
- Spark prompts
- Chat messages
- Final statements
- Votes
- Ejections
- Role reveals
- Win/loss resolution
- Agent scheduling

### 13.4 Client Responsibilities

The browser owns:

- Rendering public game state
- Submitting player actions
- Showing phase UI
- Showing chat
- Showing vote options
- Storing local player ID for prototype reconnect convenience

The browser should not own:

- Hidden roles
- Vote resolution
- Win conditions
- AI reasoning
- Phase authority

### 13.5 Actions

Humans and agents both submit actions.

Supported prototype actions:

- `JOIN_ROOM`
- `START_GAME`
- `ADVANCE_PHASE`
- `SUBMIT_SPARK`
- `SEND_CHAT`
- `SUBMIT_FINAL`
- `CAST_VOTE`
- `RESET_ROOM`

The game controller validates every action before mutating room state.

### 13.6 Public State Boundary

The server sends each viewer a public version of room state.

Clients may see:

- Phase
- Round
- Players
- Alive/ejected status
- Public messages
- Spark prompt
- Revealed spark answers
- Revealed ejections
- Their own role briefing

Clients must not see:

- Other hidden roles before reveal
- Agent internals
- Private suspicion notes
- Unrevealed votes
- Future LLM prompts

## 14. Technical Scope: MVP

- Single demo room
- No login
- No persistence
- Server-owned game controller
- Server-Sent Events for state updates
- HTTP action endpoint
- Two human players
- Four AI participants
- Mock agents first
- LLM agents later
- Fast iteration prioritized over infrastructure

## 15. MVP Features

### Must Have

- Join lobby as human
- Require two humans to start
- Spawn four AI participants
- Spark -> chat -> final -> vote -> reveal loop
- Server-owned role assignment
- Server-owned phase machine
- Public state serialization
- Mock AI actions
- Voting and ejection
- Result screen

### Nice to Have

- End-game "who was the other human?" prompt
- Better tie handling
- Better AI personas
- LLM-powered AI messages
- Replay transcript
- More prompt variety
- Timer-driven automatic phase advancement

### Not MVP

- Accounts
- Matchmaking
- Private DMs
- Alliances
- Report system
- Voice chat
- Persistent database
- Complex AI memory
- Ranking
- Mobile polish

## 16. Validation Plan

The MVP should answer:

- Do humans care who the other human is?
- Do humans try to signal or test each other?
- Does defending another player feel risky?
- Do AIs create enough social pressure?
- Are votes tense?
- Does reveal create useful drama?
- Do players want another round?

After playtests, ask:

1. Who did you think the other human was?
2. When did you start suspecting them?
3. Did you avoid defending them to protect yourself?
4. Which AI felt most human?
5. Which moment felt most tense?
6. Would you play again?

## 17. Why This Version Works Better

Compared to the single-human design:

- Stronger social goal: humans are not only hiding, they are searching.
- Better tension: trust is useful but dangerous.
- Better replay value: each game creates different possible bonds and false reads.
- More interesting AI role: AIs can mimic trust, seed false suspicion, and attack forming pairs.
- Stronger post-game story: "We found each other" or "The room swallowed us."

Compared to heavier architectures:

- Reduced commitment: no database, auth, matchmaking, or complex AI memory yet.
- Faster validation: mock agents can test the loop before LLM integration.
- Cleaner extension path: humans and agents both submit the same action types.
- Safer game integrity: the server owns hidden roles and rules.

## 18. One-Sentence Pitch

A social deduction game where two hidden humans must survive three rounds of open conversation against AI participants, finding each other without making their connection obvious.
