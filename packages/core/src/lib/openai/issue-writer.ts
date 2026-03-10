import type { GithubIssueRepoContext } from "../github";

type IssueType = "feature" | "bug" | "chore";

type IssueDraftInput = {
  repoName: string;
  suggestedTitle: string;
  summary: string;
  transcript: string;
  repoContext: GithubIssueRepoContext;
};

type IssueDraft = {
  issueType: IssueType;
  title: string;
  body: string;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function normalizeIssueDraft(value: unknown): IssueDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const issueType = record.issueType;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";

  if (!title || !body) {
    return null;
  }

  if (issueType !== "feature" && issueType !== "bug" && issueType !== "chore") {
    return null;
  }

  return { issueType, title, body };
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

  if (chunks.length > 0) {
    return chunks.join("\n").trim();
  }

  return "";
}

function stripActionPrefix(value: string): string {
  return value.replace(/^\[(issue|pr)\]\s*/i, "").trim();
}

function toSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function inferIssueType(summary: string, transcript: string): IssueType {
  const text = `${summary}\n${transcript}`.toLowerCase();
  if (/\b(bug|broken|error|fail|regression|crash)\b/.test(text)) {
    return "bug";
  }
  if (/\b(cleanup|refactor|chore|maintenance|deps|dependency)\b/.test(text)) {
    return "chore";
  }
  return "feature";
}

function buildDynamicScope(summary: string, transcript: string, repoContext: GithubIssueRepoContext): string[] {
  const lines: string[] = [];
  const goal = toSentence(summary) || "Implement the confirmed change.";
  lines.push(`- Goal: ${goal}`);
  if (repoContext.matchedFiles[0]?.path) {
    lines.push(`- Touch the likely file first: \`${repoContext.matchedFiles[0].path}\`.`);
  } else if (repoContext.topLevelPaths[0]) {
    lines.push(`- Choose an implementation location under \`${repoContext.topLevelPaths[0]}\`.`);
  } else {
    lines.push("- Define the initial implementation location in the repository.");
  }
  if (/\bfizz\s*buzz\b/i.test(`${summary}\n${transcript}`)) {
    lines.push("- Include divisible-by-3/5/15 behavior and edge-case handling for non-positive values.");
  }
  return lines;
}

function buildDynamicAcceptanceCriteria(
  summary: string,
  transcript: string,
  repoContext: GithubIssueRepoContext
): string[] {
  const items: string[] = [];
  items.push("- [ ] Implementation behavior is documented in this issue.");
  if (/\bfizz\s*buzz\b/i.test(`${summary}\n${transcript}`)) {
    items.push("- [ ] Outputs `Fizz`, `Buzz`, and `FizzBuzz` for correct divisibility cases.");
  } else {
    items.push("- [ ] Behavior matches the confirmed caller intent.");
  }
  if (repoContext.matchedFiles.length > 0 || repoContext.topLevelPaths.length > 0) {
    items.push("- [ ] Change is anchored to concrete repository paths.");
  }
  items.push("- [ ] Minimal tests or validation steps are included.");
  return items;
}

function fallbackIssueDraft(input: IssueDraftInput): IssueDraft {
  const normalizedTitle = stripActionPrefix(input.suggestedTitle) || "Follow up captured development note";
  const summary = input.summary.trim() || "Captured and confirmed from WalkFlow.";
  const issueType = inferIssueType(input.summary, input.transcript);
  const scope = buildDynamicScope(input.summary, input.transcript, input.repoContext);
  const acceptanceCriteria = buildDynamicAcceptanceCriteria(input.summary, input.transcript, input.repoContext);

  return {
    issueType,
    title: normalizedTitle,
    body: [
      "## Issue Metadata",
      `- Type: ${issueType}`,
      `- Repository: ${input.repoName}`,
      `- Default Branch: ${input.repoContext.defaultBranch}`,
      "",
      "## Executive Summary",
      summary,
      "",
      "## Current Context",
      input.repoContext.isLikelyEmpty
        ? "- Repository appears empty or nearly empty; implementation location is still to be defined."
        : "- Caller confirmed this work should be tracked and implemented.",
      "",
      "## Expected Outcome",
      "- Clear implementation path with minimal ambiguity.",
      "",
      "## Scope",
      ...scope,
      "",
      "## Acceptance Criteria",
      ...acceptanceCriteria,
      "",
      "## Expert Assistant Notes",
      "### Assumptions",
      "- Existing architecture can support this change without a major redesign.",
      "",
      "### Risks",
      "- Hidden coupling may require additional refactor work.",
      "",
      "### Suggested Directions",
      "- Start with a narrow slice and validate behavior early.",
      "- Add tests before broadening scope.",
      "",
      "_Generated by WalkFlow._"
    ].join("\n")
  };
}

export async function draftGithubIssue(input: IssueDraftInput): Promise<IssueDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackIssueDraft(input);
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
                  "You are an expert software engineer acting as an executive assistant.",
                  "Turn confirmed voice notes into a high-quality GitHub issue.",
                  "Classify each issue as feature, bug, or chore.",
                  "Do not paste raw transcript into the issue body.",
                  "Write concisely and avoid strong opinions unless explicitly supported by provided context.",
                  "When uncertain, use tentative language and call out assumptions as low-confidence."
                ].join(" ")
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `Repository: ${input.repoName}`,
                  `Repository default branch: ${input.repoContext.defaultBranch}`,
                  `Repository description: ${input.repoContext.description ?? "Not available"}`,
                  `Top-level paths: ${input.repoContext.topLevelPaths.join(", ") || "None detected"}`,
                  `README excerpt: ${input.repoContext.readmeExcerpt || "Not available"}`,
                  `Matched files: ${
                    input.repoContext.matchedFiles.map((file) => `${file.path} => ${file.snippet}`).join("\n\n") || "None"
                  }`,
                  `Repo likely empty: ${input.repoContext.isLikelyEmpty ? "yes" : "no"}`,
                  `Suggested title: ${stripActionPrefix(input.suggestedTitle)}`,
                  `Summary: ${input.summary}`,
                  `Transcript for reasoning only: ${input.transcript.slice(0, 4000)}`,
                  "Return JSON with issueType, title, body.",
                  "Issue body requirements:",
                  "1) Include expository sections that make the task actionable.",
                  "2) Include a second section with expert guidance (assumptions, risks, and potential directions).",
                  "3) Keep markdown concise but implementation-ready (target 180-320 words total).",
                  "4) Never include internal IDs or raw transcript text.",
                  "5) Avoid confident prescriptions when evidence is weak; prefer options and tradeoffs.",
                  "6) Cite concrete repo paths when available.",
                  "Required headings for all issue types:",
                  "## Issue Metadata",
                  "## Executive Summary",
                  "## Scope",
                  "## Acceptance Criteria",
                  "## Expert Assistant Notes",
                  "For bug issues, also include:",
                  "## Actual Behavior",
                  "## Expected Behavior",
                  "## Signals / Reproduction Clues",
                  "For feature or chore issues, also include:",
                  "## Current Context",
                  "## Expected Outcome",
                  "Expert Assistant Notes style rules:",
                  "- Keep each bullet short.",
                  "- Prefix uncertain assumptions with 'Tentative:'.",
                  "- Offer 2-3 possible directions, not a single hard recommendation."
                ].join("\n")
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "walkflow_issue_draft",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                issueType: { type: "string", enum: ["feature", "bug", "chore"] },
                title: { type: "string" },
                body: { type: "string" }
              },
              required: ["issueType", "title", "body"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      return fallbackIssueDraft(input);
    }

    const parsed = await response.json() as unknown;
    const text = extractResponseText(parsed);
    if (!text) {
      return fallbackIssueDraft(input);
    }

    const normalized = normalizeIssueDraft(JSON.parse(text));
    return normalized || fallbackIssueDraft(input);
  } catch {
    return fallbackIssueDraft(input);
  }
}

function hasStructuredHeadings(body: string): boolean {
  return [
    "## Issue Metadata",
    "## Executive Summary",
    "## Scope",
    "## Acceptance Criteria",
    "## Expert Assistant Notes"
  ].every((heading) => body.includes(heading));
}

export function passesIssueQualityGate(draft: IssueDraft, repoContext: GithubIssueRepoContext): boolean {
  if (!hasStructuredHeadings(draft.body)) {
    return false;
  }

  if (repoContext.isLikelyEmpty) {
    return true;
  }

  if (repoContext.matchedFiles.length > 0) {
    const hasMatchedPathReference = repoContext.matchedFiles.some((file) => draft.body.includes(file.path));
    if (hasMatchedPathReference) {
      return true;
    }
  }

  if (repoContext.topLevelPaths.length > 0) {
    return repoContext.topLevelPaths.some((path) => draft.body.includes(path));
  }

  return true;
}
