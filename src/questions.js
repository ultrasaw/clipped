const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

function normalizeQuestion(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']|["']$/g, "");
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

async function answerQuestion(name, personality, question) {
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
            text: [
              `Name: ${String(name || "").trim() || "Player"}`,
              `Personality: ${String(personality || "").trim() || "neutral"}`,
              `Question: ${String(question || "").trim()}`,
            ].join("\n"),
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

module.exports = {
  answerQuestion,
  createQuestion,
};
