export type VoiceProposal = {
  repoName: string;
  actionType: "issue" | "pr";
  issueTitle: string;
  summary: string;
};

type VoiceProposalOptions = {
  allowDeterministicFallback?: boolean;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function logFallback(reason: string) {
  console.warn(`[openai/proposal] Falling back to deterministic proposal: ${reason}`);
}

export class VoiceProposalAiRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceProposalAiRequiredError";
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

function normalizeProposal(value: unknown): VoiceProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const proposal = value as Record<string, unknown>;
  const repoName = typeof proposal.repoName === "string" ? proposal.repoName.trim() : "";
  const actionType = proposal.actionType === "pr" ? "pr" : proposal.actionType === "issue" ? "issue" : null;
  const issueTitle = typeof proposal.issueTitle === "string" ? proposal.issueTitle.trim() : "";
  const summary = typeof proposal.summary === "string" ? proposal.summary.trim() : "";

  if (!repoName || !actionType || !issueTitle || !summary) {
    return null;
  }

  return { repoName, actionType, issueTitle, summary };
}

function inferActionTypeFromTranscript(transcript: string): "issue" | "pr" {
  const text = transcript.toLowerCase();

  const explicitPrIntent = /\b(pr|pull request)\b/.test(text);
  const explicitIssueIntent = /\b(issue|ticket|backlog)\b/.test(text);
  const issueOnlyIntent = /\b(research|investigate|explore|spike|design doc|spec|plan)\b/.test(text);
  const implementationIntent = /\b(implement|build|add|fix|refactor|code|ship|update|change)\b/.test(text);
  const deferCodingIntent = /\b(don'?t code|not code|no code|later)\b/.test(text);

  if (explicitPrIntent) {
    return "pr";
  }

  if (deferCodingIntent || (explicitIssueIntent && !implementationIntent) || (issueOnlyIntent && !implementationIntent)) {
    return "issue";
  }

  return "pr";
}

function normalizeRepoToken(value: string) {
  return value.trim().toLowerCase();
}

function repoNamePart(repo: string) {
  const parts = repo.split("/");
  return parts[parts.length - 1] || repo;
}

function tokenizeTranscript(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/_\-\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function scoreRepoMatch(transcriptTokens: string[], repo: string) {
  const normalizedRepo = normalizeRepoToken(repo);
  const shortName = normalizeRepoToken(repoNamePart(repo));
  const repoTerms = normalizedRepo.split(/[\/\-_\.]+/g).filter((term) => term.length >= 2);

  let score = 0;
  const transcriptText = transcriptTokens.join(" ");

  if (transcriptText.includes(normalizedRepo)) {
    score += 100;
  }
  if (transcriptText.includes(shortName)) {
    score += 35;
  }

  for (const token of transcriptTokens) {
    if (token === shortName) {
      score += 15;
    }
    if (repoTerms.includes(token)) {
      score += 6;
    }
  }

  return score;
}

function rankAvailableRepos(transcript: string, availableRepos: string[]) {
  const tokens = tokenizeTranscript(transcript);
  if (tokens.length === 0) {
    return [...availableRepos];
  }

  return [...availableRepos]
    .map((repo) => ({ repo, score: scoreRepoMatch(tokens, repo) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.repo);
}

function explicitRepoMention(transcript: string, availableRepos: string[]) {
  const availableByFull = new Map(availableRepos.map((repo) => [normalizeRepoToken(repo), repo]));
  const availableByShort = new Map(availableRepos.map((repo) => [normalizeRepoToken(repoNamePart(repo)), repo]));

  const matches = transcript.toLowerCase().match(/[a-z0-9_.-]+\/[a-z0-9_.-]+/g) || [];
  for (const match of matches) {
    const hit = availableByFull.get(normalizeRepoToken(match));
    if (hit) {
      return hit;
    }
  }

  const words = tokenizeTranscript(transcript);
  for (const word of words) {
    const hit = availableByShort.get(word);
    if (hit) {
      return hit;
    }
  }

  return null;
}

function enforceKnownRepository(
  transcript: string,
  availableRepos: string[],
  proposal: VoiceProposal
): VoiceProposal {
  if (availableRepos.length === 0) {
    return proposal;
  }

  const exactAllowed = new Set(availableRepos.map((repo) => normalizeRepoToken(repo)));
  const explicit = explicitRepoMention(transcript, availableRepos);
  if (explicit) {
    return { ...proposal, repoName: explicit };
  }

  if (exactAllowed.has(normalizeRepoToken(proposal.repoName))) {
    const canonical = availableRepos.find((repo) => normalizeRepoToken(repo) === normalizeRepoToken(proposal.repoName));
    return canonical ? { ...proposal, repoName: canonical } : proposal;
  }

  const ranked = rankAvailableRepos(transcript, availableRepos);
  const fallbackRepo = ranked[0] || availableRepos[0];
  return { ...proposal, repoName: fallbackRepo };
}

function fallbackProposal(transcript: string, availableRepos: string[]): VoiceProposal {
  const trimmed = transcript.trim();
  const summary = trimmed.length > 0
    ? trimmed.slice(0, 260)
    : "Caller shared a coding idea that needs review.";
  const ranked = rankAvailableRepos(transcript, availableRepos);
  const circulatingMagazines = ranked.find((repo) => /circulating[- ]magazines/i.test(repo));

  return {
    repoName: circulatingMagazines || ranked[0] || "walkflow/voice",
    actionType: inferActionTypeFromTranscript(transcript),
    issueTitle: "Follow up on captured walk note",
    summary
  };
}

function enforceActionBias(transcript: string, proposal: VoiceProposal): VoiceProposal {
  const inferred = inferActionTypeFromTranscript(transcript);
  return {
    ...proposal,
    actionType: inferred
  };
}

function withFallbackOrThrow(
  transcript: string,
  availableRepos: string[],
  options: VoiceProposalOptions | undefined,
  reason: string
) {
  const rankedRepos = rankAvailableRepos(transcript, availableRepos);
  if (options?.allowDeterministicFallback) {
    logFallback(reason);
    return fallbackProposal(transcript, rankedRepos);
  }

  throw new VoiceProposalAiRequiredError(reason);
}

export async function generateVoiceProposal(
  transcript: string,
  availableRepos: string[],
  options?: VoiceProposalOptions
): Promise<VoiceProposal> {
  const rankedRepos = rankAvailableRepos(transcript, availableRepos);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return withFallbackOrThrow(transcript, rankedRepos, options, "OPENAI_API_KEY is required for live voice proposal generation.");
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
                text: "You convert spoken developer notes into a concise repository action proposal for WalkFlow."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Voice transcript:\n${transcript}\n\nAvailable repositories (must choose one):\n${rankedRepos.join("\n") || "None provided"}\n\nRepository selection rules:\n1) If transcript explicitly mentions a repository, choose that repository.\n2) Otherwise choose the most semantically relevant repository from the list.\n3) Never invent a repository that is not in the list.\n\nReturn only structured JSON.`
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "walkflow_voice_proposal",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                repoName: { type: "string" },
                actionType: { type: "string", enum: ["issue", "pr"] },
                issueTitle: { type: "string" },
                summary: { type: "string" }
              },
              required: ["repoName", "actionType", "issueTitle", "summary"]
            }
          }
        },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return withFallbackOrThrow(
        transcript,
        rankedRepos,
        options,
        `OpenAI response not ok (${response.status})`
      );
    }

    const body = await response.json() as unknown;
    const outputText = extractResponseText(body);
    if (!outputText) {
      const shape = body && typeof body === "object" ? Object.keys(body as Record<string, unknown>).join(",") : typeof body;
      return withFallbackOrThrow(
        transcript,
        rankedRepos,
        options,
        `OpenAI response missing text (keys: ${shape})`
      );
    }

    const parsed = JSON.parse(outputText);
    const normalized = normalizeProposal(parsed);
    if (!normalized) {
      return withFallbackOrThrow(transcript, rankedRepos, options, "OpenAI output did not match expected schema");
    }

    const withKnownRepo = enforceKnownRepository(transcript, rankedRepos, normalized);
    return enforceActionBias(transcript, withKnownRepo);
  } catch {
    return withFallbackOrThrow(transcript, rankedRepos, options, "OpenAI request failed unexpectedly");
  }
}
