export type VoiceIntentPhase = "collecting" | "awaiting_confirmation" | "awaiting_retry_context";

export type VoiceIntent =
  | "continue"
  | "summarize"
  | "confirm"
  | "reject"
  | "finish";

export type VoiceIntentInput = {
  phase: VoiceIntentPhase;
  latestCallerMessage: string;
  transcript?: string;
  proposalSummary?: string;
  repoName?: string | null;
  rejectionCount?: number;
};

type VoiceIntentOptions = {
  allowDeterministicFallback?: boolean;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export class VoiceIntentAiRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceIntentAiRequiredError";
  }
}

function extractResponseText(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        continue;
      }
      const contentPart = part as Record<string, unknown>;
      const text = contentPart.text;
      if (typeof text === "string" && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function doneIntent(text: string) {
  return /\b(done|finished|that'?s all|that is all|that should do it|that should do|that covers it|that covers everything|that’s it|that's it|that’s all|can you summarize|could you summarize|want to summarize|what do you think|your turn|go ahead and summarize|ready for a summary|ready now)\b/i.test(text);
}

function confirmIntent(text: string) {
  return /\b(confirm|approved?|yes|yeah|yep|looks good|sounds good|that sounds good|that sounds right|that works|works for me|go ahead|ship it|let'?s do it|perfect)\b/i.test(text);
}

function rejectIntent(text: string) {
  return /\b(reject|no|nope|change|changes|not right|not quite|try again|different|use another|wrong repo|wrong repository|pick a different repo|needs work)\b/i.test(text);
}

function finishIntent(text: string) {
  return /\b(done|hang up|goodbye|bye)\b/i.test(text);
}

function fallbackIntent(input: VoiceIntentInput): VoiceIntent {
  const text = input.latestCallerMessage;

  if (input.phase === "awaiting_confirmation") {
    if (confirmIntent(text)) {
      return "confirm";
    }
    if (rejectIntent(text)) {
      return "reject";
    }
    if (finishIntent(text)) {
      return "finish";
    }
    return "continue";
  }

  if (doneIntent(text)) {
    return "summarize";
  }

  if (finishIntent(text)) {
    return "finish";
  }

  return "continue";
}

function buildUserPrompt(input: VoiceIntentInput) {
  return [
    `Phase: ${input.phase}`,
    `Latest caller message: ${input.latestCallerMessage}`,
    `Retry count: ${String(input.rejectionCount || 0)}`,
    `Proposal repo: ${input.repoName || "None"}`,
    `Proposal summary: ${input.proposalSummary || "None"}`,
    `Transcript:\n${input.transcript || "None"}`
  ].join("\n");
}

function normalizeIntent(value: unknown): VoiceIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const intent = typeof record.intent === "string" ? record.intent : "";

  if (
    intent === "continue" ||
    intent === "summarize" ||
    intent === "confirm" ||
    intent === "reject" ||
    intent === "finish"
  ) {
    return intent;
  }

  return null;
}

function withFallbackOrThrow(input: VoiceIntentInput, options: VoiceIntentOptions | undefined, reason: string) {
  if (options?.allowDeterministicFallback) {
    return fallbackIntent(input);
  }

  throw new VoiceIntentAiRequiredError(reason);
}

export async function classifyVoiceIntent(
  input: VoiceIntentInput,
  options?: VoiceIntentOptions
): Promise<VoiceIntent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return withFallbackOrThrow(input, options, "OPENAI_API_KEY is required for live voice intent classification.");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "You classify the caller's latest spoken intent in a live phone workflow.",
                  "Return only one intent.",
                  "Use summarize when the caller sounds done and wants a summary or proposal.",
                  "Use confirm only for clear approval of the proposed action.",
                  "Use reject for requests to change or retry the proposal.",
                  "Use finish when the caller is explicitly ending the call.",
                  "Otherwise use continue."
                ].join(" ")
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildUserPrompt(input)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "walkflow_voice_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent: {
                  type: "string",
                  enum: ["continue", "summarize", "confirm", "reject", "finish"]
                }
              },
              required: ["intent"]
            }
          }
        },
        temperature: 0
      })
    });

    if (!response.ok) {
      return withFallbackOrThrow(input, options, `Voice intent classification failed with status ${response.status}.`);
    }

    const body = await response.json() as unknown;
    const outputText = extractResponseText(body);
    if (!outputText) {
      return withFallbackOrThrow(input, options, "Voice intent classification was missing output text.");
    }

    const parsed = JSON.parse(outputText);
    return normalizeIntent(parsed) || withFallbackOrThrow(input, options, "Voice intent classification schema was invalid.");
  } catch {
    return withFallbackOrThrow(input, options, "Voice intent classification request failed.");
  }
}
