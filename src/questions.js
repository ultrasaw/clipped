const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

function normalizeQuestion(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function joinSections(parts) {
  return parts.filter(Boolean).join("\n\n");
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join(" ");
}

async function generateText(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate text.");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  return extractOutputText(payload);
}

function buildIdentityBlock(name, personality, gameplayPrompt = "") {
  return [
    `Name: ${String(name || "").trim() || "Player"}`,
    `Personality: ${String(personality || "").trim() || "neutral"}`,
    gameplayPrompt ? `Gameplay guidance: ${String(gameplayPrompt).trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function createQuestion() {
  const question = normalizeQuestion(
    await generateText([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: [
              "You write spark prompts for a social deduction party game.",
              "Return exactly one short prompt.",
              "The prompt must be easy to answer instantly, sound natural in chat, and fit in 80 characters.",
              "Avoid numbering, labels, quotes, or extra commentary.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Create one new spark prompt for the next round.",
          },
        ],
      },
    ]),
  );

  if (!question) {
    throw new Error("OpenAI returned an empty question.");
  }

  return question;
}

async function answerQuestion(name, personality, question, gameplayPrompt = "") {
  const answer = normalizeQuestion(
    await generateText([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: [
              "You are writing a short answer in a social deduction chat game.",
              "Stay in character using the provided personality.",
              "Follow the gameplay guidance if provided.",
              "Write like a human player, not an assistant.",
              "Return exactly one concise answer with no preamble, labels, or quotation marks.",
              "Keep it natural and under 80 characters when possible.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: joinSections([
              buildIdentityBlock(name, personality, gameplayPrompt),
              `Question: ${String(question || "").trim()}`,
            ]),
          },
        ],
      },
    ]),
  );

  if (!answer) {
    throw new Error("OpenAI returned an empty answer.");
  }

  return answer;
}

function summarizeContext(context) {
  if (!context) {
    return "";
  }

  const gameSummary = [
    context.game?.phase ? `Phase: ${context.game.phase}` : "",
    typeof context.game?.round === "number" && typeof context.game?.maxRounds === "number"
      ? `Round: ${context.game.round}/${context.game.maxRounds}`
      : "",
    context.game?.sparkPrompt ? `Spark prompt: ${context.game.sparkPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const playersSummary = Array.isArray(context.players)
    ? context.players
        .map((player) =>
          [
            player.name,
            `id=${player.id}`,
            player.isSelf ? "self" : "",
            player.status ? `status=${player.status}` : "",
            player.revealedRole ? `revealed=${player.revealedRole}` : "",
          ]
            .filter(Boolean)
            .join(", "),
        )
        .join("\n")
    : "";

  const targetsSummary = Array.isArray(context.legalTargets)
    ? context.legalTargets
        .map((target) =>
          [
            target.name,
            `id=${target.id}`,
            target.status ? `status=${target.status}` : "",
            target.revealedRole ? `revealed=${target.revealedRole}` : "",
          ]
            .filter(Boolean)
            .join(", "),
        )
        .join("\n")
    : "";

  const recentMessages = Array.isArray(context.messages)
    ? context.messages
        .slice(-8)
        .map((message) => `${message.sender}: ${message.text}`)
        .join("\n")
    : "";

  return joinSections([
    gameSummary,
    playersSummary ? `Players:\n${playersSummary}` : "",
    targetsSummary ? `Legal targets:\n${targetsSummary}` : "",
    recentMessages ? `Recent messages:\n${recentMessages}` : "",
  ]);
}

async function createChatMessage(name, personality, gameplayPrompt, context) {
  const message = normalizeQuestion(
    await generateText([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: [
              "You are an in-character player in a social deduction chat game.",
              "Write exactly one public chat message.",
              "Keep it natural, suspicious, and conversational.",
              "Do not add labels, quotation marks, or explanations.",
              "Keep it under 180 characters.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: joinSections([
              buildIdentityBlock(name, personality, gameplayPrompt),
              summarizeContext(context),
            ]),
          },
        ],
      },
    ]),
  );

  if (!message) {
    throw new Error("OpenAI returned an empty chat message.");
  }

  return message;
}

async function createFinalStatement(name, personality, gameplayPrompt, context) {
  const statement = normalizeQuestion(
    await generateText([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: [
              "You are making a final statement in a social deduction game.",
              "Write exactly one short final statement.",
              "It should be a defense, accusation, or final read.",
              "Do not add labels, quotation marks, or explanations.",
              "Keep it under 220 characters.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: joinSections([
              buildIdentityBlock(name, personality, gameplayPrompt),
              summarizeContext(context),
            ]),
          },
        ],
      },
    ]),
  );

  if (!statement) {
    throw new Error("OpenAI returned an empty final statement.");
  }

  return statement;
}

async function createTiebreakStatement(name, personality, gameplayPrompt, context) {
  const statement = normalizeQuestion(
    await generateText([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: [
              "You are in the tiebreak statement phase of a social deduction game.",
              "Write exactly one short tiebreak statement.",
              "Sound like a player under pressure and make a final case.",
              "Do not add labels, quotation marks, or explanations.",
              "Keep it under 200 characters.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: joinSections([
              buildIdentityBlock(name, personality, gameplayPrompt),
              summarizeContext(context),
            ]),
          },
        ],
      },
    ]),
  );

  if (!statement) {
    throw new Error("OpenAI returned an empty tiebreak statement.");
  }

  return statement;
}

async function chooseVoteTarget(name, personality, gameplayPrompt, context) {
  const legalTargets = Array.isArray(context?.legalTargets) ? context.legalTargets : [];

  if (legalTargets.length === 0) {
    throw new Error("No legal vote targets were provided.");
  }

  const rawTarget = normalizeQuestion(
    await generateText([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: [
              "You are choosing a vote target in a social deduction game.",
              "Choose exactly one player from the legal targets.",
              "Reply with the chosen target id only.",
              "Do not add any other text.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: joinSections([
              buildIdentityBlock(name, personality, gameplayPrompt),
              summarizeContext(context),
            ]),
          },
        ],
      },
    ]),
  );

  const directMatch = legalTargets.find((target) => target.id === rawTarget);

  if (directMatch) {
    return directMatch.id;
  }

  const fuzzyMatch = legalTargets.find(
    (target) => rawTarget.includes(target.id) || rawTarget.toLowerCase() === String(target.name || "").toLowerCase(),
  );

  if (!fuzzyMatch) {
    throw new Error("OpenAI did not return a valid legal target.");
  }

  return fuzzyMatch.id;
}

module.exports = {
  answerQuestion,
  chooseVoteTarget,
  createChatMessage,
  createFinalStatement,
  createQuestion,
  createTiebreakStatement,
};
