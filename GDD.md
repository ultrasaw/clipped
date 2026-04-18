# One Of Us - Game Design Document

**Version:** MVP v2  
**Genre:** Social deduction / reverse Turing test  
**Platform:** Web browser, desktop-first  
**Players:** 1 human + 4-6 AI participants  
**Session length:** 8-10 minutes

## 1. High Concept

### Elevator Pitch

A social deduction game where one human enters a room of AI participants. Everyone must appear convincingly human. Each round begins with a light conversational spark, then opens into free chat. At the end, players vote out whoever feels least human.

## 2. Core Vision

This is not a writing game.

This is a social performance game.

Players are not trying to give the best answer. They are trying to:

- Sound human
- Interpret others
- Survive suspicion

The game creates a room where:

- Everyone is performing
- Everyone is judging
- Every interaction becomes evidence

## 3. Core Loop

```text
LOBBY -> GAME_START ->
[ SPARK -> REVEAL (optional) -> FREE CHAT -> FINAL STATEMENTS -> VOTE -> REVEAL ] x 3
-> GAME_OVER -> REPLAY
```

There are 3 rounds total.

## 4. Win Conditions

| Outcome | Condition |
| --- | --- |
| Human wins | The human survives all rounds. |
| AIs win | The human is ejected. |

## 5. Round Structure

### 5.1 Spark Phase: Light Prompt

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

### 5.2 Response Phase

All players may submit a short answer.

- Players may elaborate later in chat
- Answers are revealed simultaneously

**Important:** This is not the main gameplay. It just seeds the room with initial evidence.

### 5.3 Free Chat Phase

This is the core of the game.

All players enter a shared public chat.

Players can:

- Question others
- Defend themselves
- Accuse
- Reinterpret answers
- Ignore the prompt entirely
- Create their own lines of suspicion

There are no private DMs in the MVP.

#### Design Goals

- Natural conversation
- Minimal constraints
- Readable pace
- No spam

### 5.4 Final Statements

Each player gets one short final message.

They must do one of the following:

- Accuse someone
- Defend themselves
- Give a final read

**Purpose:** Forces commitment before voting.

### 5.5 Vote Phase

All players vote on the question:

> Who feels least convincingly human?

#### Rules

- No self-vote
- Votes are simultaneous
- Majority ejects

### 5.6 Tie Resolution

If a tie occurs:

1. **Tiebreak statements:** Tied players each give a short statement.
2. **Revote:** Only tied players are valid targets. Tied players cannot vote.
3. **If tied again:** All tied players are ejected.

This creates:

- Pressure
- Drama
- No stalled rounds

### 5.7 Reveal

The ejected player is revealed as one of the following:

- AI
- HUMAN

## 6. Prompt / Spark Design

### 6.1 Principles

Prompts should:

- Be fast
- Be simple
- Generate differences without effort

Avoid:

- Complex framing
- Introspection-heavy questions
- Anything that feels like writing a "good answer"

### 6.2 Prompt Types

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

### 6.3 Important Rule

The prompt should start the conversation, not carry it.

## 7. AI Participant Design

### 7.1 Personas

Each AI is generated from trait combinations.

Traits include:

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

### 7.2 AI Goals

Each AI tries to:

- Appear human
- Avoid becoming a target
- Identify the human
- Adapt to social pressure

### 7.3 AI Chat Behavior

Each AI:

- Sends about 1-2 meaningful messages per round
- Reacts to accusations, spotlighted answers, and contradictions
- Avoids filler

#### Message Types

- Accuse
- Defend
- Question
- Reinterpret
- Redirect

## 8. Suspicion System

Each AI tracks:

- Suspicion scores per player
- Reasoning notes
- Social events, such as being accused, ignored, or contradicted

Inputs include:

- Answer quality
- Tone consistency
- Defensiveness
- Contradiction
- Social positioning
- Silence

**Important:** Suspicion is interpretive, not objective. Different AIs may disagree.

## 9. Human Experience

The human should feel a different kind of pressure each round.

| Round | Intended Feeling |
| --- | --- |
| Round 1 | "I can blend in." |
| Round 2 | "They're starting to form opinions about me." |
| Round 3 | "I need to survive my own pattern." |

**Key tension:** Not sounding human, but not sounding like you're trying to sound human.

## 10. UI / UX

### 10.1 Layout

```text
PLAYERS        | MAIN PANEL
-------------- | -------------------------
Alive list     | Spark / Chat / Vote
```

### 10.2 Chat

- Clear names and colors
- Typing indicators
- Minimal clutter
- Readable pacing

### 10.3 Spark Display

- Small and non-dominant
- Disappears after chat starts

### 10.4 Voting UI

- Large player cards
- Simple selection
- Clear lock-in

## 11. Post-Game Replay

### 11.1 Results

- Winner
- Human reveal
- Elimination order

### 11.2 Suspicion Timeline

Show how each AI evaluated players, including key turning points.

### 11.3 Reasoning Highlights

Short, readable notes such as:

- "Too polished"
- "Defensive shift"
- "Unusual phrasing"
- "Consistent pattern"

## 12. Technical Scope: MVP

- Single-session game
- No login
- No persistence
- Server-controlled AI
- Lightweight LLM usage
- Fast responses prioritized over perfect ones

## 13. MVP Features

### Must Have

- Spark -> chat -> vote loop
- AI personas
- AI chat system
- Voting and tie system
- Result screen

### Nice to Have

- Replay
- Better UI polish
- More prompt variety

### Not MVP

- Private DMs
- Alliances
- Report system
- Voice chat
- Matchmaking

## 14. Why This Version Works Better

Compared to the previous design:

- Reduced cognitive load: no heavy writing tasks
- Increased freedom: players can speak naturally
- Maintained structure: spark still creates shared context
- Stronger social gameplay: conversation is the game, not the prompt

## 15. One-Sentence Pitch

A social deduction game where one human must survive three rounds of open conversation against AI participants, all trying to appear human while identifying who doesn't belong.
