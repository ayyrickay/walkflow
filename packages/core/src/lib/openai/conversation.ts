import type { VoiceProposal } from "./proposal";

type ConversationMode =
  | "welcome_mapped"
  | "welcome_unmapped"
  | "silence_collecting"
  | "silence_retry"
  | "silence_confirmation"
  | "processing_summary"
  | "proposal"
  | "retry_repo_switch"
  | "retry_clarify"
  | "approval"
  | "needs_review"
  | "confirmation_help"
  | "keep_listening";

export type VoiceConversationInput = {
  mode: ConversationMode;
  transcript?: string;
  latestCallerMessage?: string;
  proposal?: VoiceProposal | null;
  preferredRepoName?: string | null;
  rejectionCount?: number;
  silencePromptCount?: number;
};

type VoiceConversationOptions = {
  allowDeterministicFallback?: boolean;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export class VoiceAiRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceAiRequiredError";
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

function normalizeReply(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  return text || null;
}

function fallbackConversationReply(input: VoiceConversationInput): string {
  switch (input.mode) {
    case "welcome_mapped":
      return "I'm listening. Talk it through. If you pause, I can summarize what I have.";
    case "welcome_unmapped":
      return "I'm here. I couldn't match this number to an account, but I can still listen.";
    case "silence_collecting":
      return input.silencePromptCount && input.silencePromptCount > 0
        ? "I can summarize this now if you're ready."
        : "Want to add more detail, or should I summarize it?";
    case "silence_retry":
      return input.silencePromptCount && input.silencePromptCount > 0
        ? "I can try again with what I have."
        : "Anything else to change, or should I try again now?";
    case "silence_confirmation":
      return input.silencePromptCount && input.silencePromptCount > 0
        ? "I can mark it approved, or send it to review."
        : "Should I go ahead with that, or change it?";
    case "processing_summary":
      return "Let me summarize that.";
    case "proposal": {
      const proposal = input.proposal;
      if (!proposal) {
        return "I have a summary ready. Want me to read it back?";
      }

      const action = proposal.actionType === "pr" ? "pull request" : "issue";
      return `I'd put this in ${proposal.repoName} as a ${action}: ${proposal.issueTitle}. ${proposal.summary} Go ahead, or change it?`;
    }
    case "retry_repo_switch":
      return input.preferredRepoName
        ? `Okay. I'll switch to ${input.preferredRepoName}. Anything else before I try again?`
        : "Okay. Anything else before I try again?";
    case "retry_clarify":
      return "What should I change? You can add context or name a different repo.";
    case "approval":
      return "Approved. I'll queue the follow-up and let you go.";
    case "needs_review":
      return "Understood. I marked it for review, so nothing will run automatically.";
    case "confirmation_help":
      return "Say go ahead to approve it, or tell me what to change.";
    case "keep_listening":
      return "I'm here. Keep going when you're ready.";
    default:
      return "I'm here.";
  }
}

function buildUserPrompt(input: VoiceConversationInput) {
  const lines = [
    `Mode: ${input.mode}`,
    `Latest caller message: ${input.latestCallerMessage || "None"}`,
    `Silence prompt count: ${String(input.silencePromptCount || 0)}`,
    `Retry count: ${String(input.rejectionCount || 0)}`
  ];

  if (input.preferredRepoName) {
    lines.push(`Preferred repo: ${input.preferredRepoName}`);
  }

  if (input.proposal) {
    lines.push(
      `Proposal repo: ${input.proposal.repoName}`,
      `Proposal action: ${input.proposal.actionType}`,
      `Proposal title: ${input.proposal.issueTitle}`,
      `Proposal summary: ${input.proposal.summary}`
    );
  }

  if (input.transcript) {
    lines.push(`Transcript:\n${input.transcript}`);
  }

  return lines.join("\n");
}

function withFallbackOrThrow(
  input: VoiceConversationInput,
  options: VoiceConversationOptions | undefined,
  reason: string
) {
  if (options?.allowDeterministicFallback) {
    return fallbackConversationReply(input);
  }

  throw new VoiceAiRequiredError(reason);
}

export async function generateVoiceConversationReply(
  input: VoiceConversationInput,
  options?: VoiceConversationOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return withFallbackOrThrow(input, options, "OPENAI_API_KEY is required for live voice conversation replies.");
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
                  "You write live phone assistant replies for WalkFlow.",
                  "Keep the reply natural and concise.",
                  "Use one or two short sentences.",
                  "Prefer fewer than 24 spoken words unless reading a proposal.",
                  "Do not mention internal systems, JSON, schemas, or hidden reasoning.",
                  "For silence prompts, gently ask whether to add detail or summarize.",
                  "For proposal mode, speak the repo, action, title, summary, then ask for approval or changes."
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
            name: "walkflow_voice_conversation_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" }
              },
              required: ["text"]
            }
          }
        },
        temperature: 0.6
      })
    });

    if (!response.ok) {
      return withFallbackOrThrow(input, options, `Voice conversation reply failed with status ${response.status}.`);
    }

    const body = await response.json() as unknown;
    const outputText = extractResponseText(body);
    if (!outputText) {
      return withFallbackOrThrow(input, options, "Voice conversation reply was missing output text.");
    }

    const parsed = JSON.parse(outputText);
    return normalizeReply(parsed) || withFallbackOrThrow(input, options, "Voice conversation reply schema was invalid.");
  } catch {
    return withFallbackOrThrow(input, options, "Voice conversation reply request failed.");
  }
}
