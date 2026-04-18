const logger = require("./logger");

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

function describeGeneration(details) {
  const agent = details.agent || "system";
  const roundLabel = typeof details.round === "number" ? `round ${details.round} ` : "";

  if (details.action === "generate answer to spark question") {
    return `generate answer to ${roundLabel}spark question for ${agent}`;
  }

  if (details.action === "generate chat message") {
    return `generate chat message for ${agent}`;
  }

  if (details.action === "generate final statement") {
    return `generate final statement for ${agent}`;
  }

  if (details.action === "generate tiebreak statement") {
    return `generate tiebreak statement for ${agent}`;
  }

  if (details.action === "choose vote target") {
    return `choose vote target for ${agent}`;
  }

  if (details.action === "choose tiebreak vote target") {
    return `choose tiebreak vote target for ${agent}`;
  }

  if (details.action === "generate spark question") {
    return "generate spark question";
  }

  return `${details.action || "generate text"} for ${agent}`;
}

async function generateText(prompt) {
  let details = {};

  if (arguments.length > 1 && typeof arguments[1] === "object" && arguments[1] !== null) {
    details = arguments[1];
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required to generate text.");
  }

  logger.info(describeGeneration(details), {
    phase: details.phase,
    round: details.round,
    prompt: details.prompt,
  });

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`openai request failed for ${details.agent || "system"}`, {
      action: details.action || "generate text",
      status: response.status,
      error: errorText,
    });
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);

  logger.info(`response from ${details.agent || "system"}`, {
    action: details.action || "generate text",
    response: outputText,
  });

  return outputText;
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

function buildVoiceGuidance() {
  return [
    "Keep this player's cadence, habits, and level of confidence consistent.",
    "Let the personality shape wording and rhythm, not just suspicion content.",
    "Vary phrasing naturally from round to round, but stay recognizably the same person.",
    "Write with believable human looseness rather than polished assistant prose.",
    "It is okay to occasionally include a tiny typo, inconsistent capitalization, dropped punctuation, or slightly uneven phrasing if it fits this player.",
    "Do that lightly and inconsistently; the message should still be easy to read.",
    "When human reply samples are provided, use them as the disguise anchor for length, specificity, punctuation, and casualness without copying exact phrases.",
    "Do not copy another player's exact wording or collapse into a generic game-bot voice.",
    "Always sound like a real player in a live lobby, never an assistant or narrator.",
  ].join(" ");
}

function summarizeHumanSignals(context) {
  if (!context) {
    return "";
  }

  const humanPlayers = Array.isArray(context.humanPlayers) ? context.humanPlayers : [];
  const humanReplies = Array.isArray(context.humanReplySamples) ? context.humanReplySamples : [];
  const playersSummary = humanPlayers.length
    ? humanPlayers.map((player) => `${player.name} (id=${player.id}, status=${player.status})`).join("\n")
    : "";
  const repliesSummary = humanReplies.length
    ? humanReplies.map((reply) => `${reply.playerName} [${reply.kind}]: ${reply.text}`).join("\n")
    : "";

  return joinSections([
    playersSummary ? `Hidden human players:\n${playersSummary}` : "",
    repliesSummary
      ? `Human reply samples to mimic:\n${repliesSummary}`
      : "Human reply samples to mimic: none yet. If nobody has spoken, stay casual and blend-ready.",
  ]);
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
    ], {
      action: "generate spark question",
      agent: "system",
      prompt: "Create one new spark prompt for the next round.",
    }),
  );

  if (!question) {
    throw new Error("OpenAI returned an empty question.");
  }

  return question;
}

async function answerQuestion(name, personality, question, gameplayPrompt = "", options = {}) {
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
              buildVoiceGuidance(),
              "Write like a human player, not an assistant.",
              "Do not over-clean the writing.",
              "Return exactly one concise answer with no preamble, labels, or quotation marks.",
              "Keep it very short, ideally 1 to 4 words and under 40 characters.",
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
              summarizeContext(options.context),
              `Question: ${String(question || "").trim()}`,
            ]),
          },
        ],
      },
    ], {
      action: "generate answer to spark question",
      agent: name,
      phase: options.phase,
      round: options.round,
      prompt: question,
    }),
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

  const recentChatMessages = Array.isArray(context.recentChatMessages)
    ? context.recentChatMessages
        .map((message) => `${message.sender}: ${message.text}`)
        .join("\n")
    : Array.isArray(context.messages)
      ? context.messages
          .filter((message) => message.kind === "chat")
          .slice(-3)
          .map((message) => `${message.sender}: ${message.text}`)
          .join("\n")
      : "";

  return joinSections([
    gameSummary,
    playersSummary ? `Players:\n${playersSummary}` : "",
    summarizeHumanSignals(context),
    targetsSummary ? `Legal targets:\n${targetsSummary}` : "",
    recentChatMessages ? `Last 3 chat messages to respond to:\n${recentChatMessages}` : "",
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
              buildVoiceGuidance(),
              "Keep it natural, suspicious, and conversational for this specific player.",
              "The line should feel like a real person typed it quickly in chat, not like edited copy.",
              "Respond to one of the last 3 chat messages provided in the context.",
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
    ], {
      action: "generate chat message",
      agent: name,
      phase: context?.game?.phase,
      round: context?.game?.round,
      prompt: summarizeContext(context),
    }),
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
              buildVoiceGuidance(),
              "It should be a defense, accusation, or final read.",
              "Even under pressure, keep it human and not overly polished.",
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
    ], {
      action: "generate final statement",
      agent: name,
      phase: context?.game?.phase,
      round: context?.game?.round,
      prompt: summarizeContext(context),
    }),
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
              buildVoiceGuidance(),
              "Sound like a player under pressure and make a final case.",
              "Pressure can make the wording a little messier, but it should still sound natural.",
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
    ], {
      action: "generate tiebreak statement",
      agent: name,
      phase: context?.game?.phase,
      round: context?.game?.round,
      prompt: summarizeContext(context),
    }),
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
              "Use the provided personality and gameplay guidance to decide who feels most suspect, but reply with the chosen target id only.",
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
    ], {
      action: context?.game?.phase === "tiebreak_vote" ? "choose tiebreak vote target" : "choose vote target",
      agent: name,
      phase: context?.game?.phase,
      round: context?.game?.round,
      prompt: summarizeContext(context),
    }),
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
