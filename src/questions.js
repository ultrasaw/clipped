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

async function createQuestion() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate a question.");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
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
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const question = normalizeQuestion(extractOutputText(payload));

  if (!question) {
    throw new Error("OpenAI returned an empty question.");
  }

  return question;
}

module.exports = {
  createQuestion,
};
