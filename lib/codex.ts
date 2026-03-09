import type { GithubIssueRepoContext } from "@/lib/github";
import {
  createGithubInitialCommitBranch,
  createGithubBranchFromSha,
  getGithubBranchHeadSha,
  getGithubDefaultBranch,
  getGithubFileContent,
  upsertGithubFile
} from "@/lib/github";

const DEFAULT_CODEX_MODEL = process.env.OPENAI_CODEX_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

export type CodexGeneratedFile = {
  path: string;
  content: string;
  summary: string;
};

type CodexPlan = {
  prTitle: string;
  prSummary: string;
  commitMessage: string;
  branchLabel: string;
  files: CodexGeneratedFile[];
};

type GenerateCodexPlanInput = {
  repoFullName: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  interactionSummary: string;
  transcript: string;
  repoContext: GithubIssueRepoContext;
};

export type RunCodexPrAutomationInput = GenerateCodexPlanInput & {
  interactionId: string;
};

export type RunCodexPrAutomationResult = {
  headRef: string;
  prTitle: string;
  prBodySuffix: string;
  codeChangesSummary: string;
};

function isEmptyRepositoryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("git repository is empty") || (normalized.includes("failed (409)") && normalized.includes("git/ref/heads"));
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

function isSafeRepoPath(path: string): boolean {
  const normalized = path.trim();
  if (!normalized || normalized.startsWith("/") || normalized.startsWith(".")) {
    return false;
  }
  if (normalized.includes("..") || normalized.includes("\\")) {
    return false;
  }
  return true;
}

function sanitizeBranchSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, 40) || "update";
}

function normalizePlan(value: unknown): CodexPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const prTitle = typeof record.prTitle === "string" ? record.prTitle.trim() : "";
  const prSummary = typeof record.prSummary === "string" ? record.prSummary.trim() : "";
  const commitMessage = typeof record.commitMessage === "string" ? record.commitMessage.trim() : "";
  const branchLabel = typeof record.branchLabel === "string" ? record.branchLabel.trim() : "";
  const rawFiles = Array.isArray(record.files) ? record.files : [];

  if (!prTitle || !prSummary || !commitMessage || !branchLabel || rawFiles.length === 0 || rawFiles.length > 6) {
    return null;
  }

  const files: CodexGeneratedFile[] = [];
  for (const entry of rawFiles) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const file = entry as Record<string, unknown>;
    const path = typeof file.path === "string" ? file.path.trim() : "";
    const content = typeof file.content === "string" ? file.content : "";
    const summary = typeof file.summary === "string" ? file.summary.trim() : "";
    if (!path || !summary || !content || !isSafeRepoPath(path)) {
      return null;
    }
    files.push({ path, content, summary });
  }

  return { prTitle, prSummary, commitMessage, branchLabel, files };
}

function fallbackPlan(input: GenerateCodexPlanInput): CodexPlan {
  return {
    prTitle: `Draft: ${input.issueTitle.replace(/^\[(issue|pr)\]\s*/i, "").trim() || "Follow up implementation"}`,
    prSummary: `Implements #${input.issueNumber} based on WalkFlow confirmation.`,
    commitMessage: `feat: implement issue #${input.issueNumber}`,
    branchLabel: `issue-${input.issueNumber}`,
    files: [
      {
        path: "WALKFLOW_CODEX_TODO.md",
        content: [
          `# WalkFlow Codex Follow-up for Issue #${input.issueNumber}`,
          "",
          `Issue: ${input.issueTitle}`,
          "",
          "## Confirmed Summary",
          input.interactionSummary,
          "",
          "## Suggested Next Steps",
          "- Open the likely implementation file(s) from repo context.",
          "- Apply the minimum change that satisfies the issue intent.",
          "- Add or update tests covering the behavior."
        ].join("\n"),
        summary: "Adds a concrete implementation TODO artifact when code generation is unavailable."
      }
    ]
  };
}

async function generateCodexPlan(input: GenerateCodexPlanInput): Promise<CodexPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackPlan(input);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_CODEX_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "You are Codex acting as a surgical code change planner for a GitHub repository.",
                  "Return only JSON that matches the schema.",
                  "Generate concrete file contents, not pseudo-code.",
                  "Prefer the smallest viable change set that still addresses the issue."
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
                  `Repository: ${input.repoFullName}`,
                  `Default branch: ${input.repoContext.defaultBranch}`,
                  `Issue #${input.issueNumber}: ${input.issueTitle}`,
                  `Issue body:\n${input.issueBody.slice(0, 4000)}`,
                  `Interaction summary: ${input.interactionSummary}`,
                  `Transcript for reasoning only: ${input.transcript.slice(0, 2500)}`,
                  `Top-level paths: ${input.repoContext.topLevelPaths.join(", ") || "None detected"}`,
                  `Matched files: ${
                    input.repoContext.matchedFiles.map((f) => `${f.path}\n${f.snippet}`).join("\n\n") || "None"
                  }`,
                  "Output requirements:",
                  "- 1 to 4 files only.",
                  "- Every file path must be repository-relative, no leading slash and no '..'.",
                  "- Prefer editing existing likely paths where possible.",
                  "- Include tests when the repo context indicates a test location.",
                  "- Keep each file content concise and valid."
                ].join("\n")
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "walkflow_codex_pr_plan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                prTitle: { type: "string" },
                prSummary: { type: "string" },
                commitMessage: { type: "string" },
                branchLabel: { type: "string" },
                files: {
                  type: "array",
                  minItems: 1,
                  maxItems: 4,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      path: { type: "string" },
                      content: { type: "string" },
                      summary: { type: "string" }
                    },
                    required: ["path", "content", "summary"]
                  }
                }
              },
              required: ["prTitle", "prSummary", "commitMessage", "branchLabel", "files"]
            }
          }
        },
        temperature: 0.15
      })
    });

    if (!response.ok) {
      return fallbackPlan(input);
    }

    const payload = await response.json() as unknown;
    const outputText = extractResponseText(payload);
    if (!outputText) {
      return fallbackPlan(input);
    }

    const parsed = JSON.parse(outputText) as unknown;
    return normalizePlan(parsed) || fallbackPlan(input);
  } catch {
    return fallbackPlan(input);
  }
}

export async function runCodexPrAutomation(input: RunCodexPrAutomationInput): Promise<RunCodexPrAutomationResult> {
  const plan = await generateCodexPlan(input);
  const branchLabel = sanitizeBranchSegment(plan.branchLabel);
  const headRef = `walkflow/${branchLabel}-${input.issueNumber}-${input.interactionId.slice(0, 8)}`;

  let bootstrappedEmptyRepo = false;
  try {
    const baseBranch = (await getGithubDefaultBranch(input.repoFullName)).trim() || "main";
    const baseSha = await getGithubBranchHeadSha(input.repoFullName, baseBranch);
    await createGithubBranchFromSha(input.repoFullName, headRef, baseSha);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub branch error";
    if (!isEmptyRepositoryError(message)) {
      throw error;
    }
    await createGithubInitialCommitBranch({
      repoFullName: input.repoFullName,
      branchName: headRef,
      message: `${plan.commitMessage} (initial commit)`,
      files: plan.files.map((file) => ({
        path: file.path,
        content: file.content
      }))
    });
    bootstrappedEmptyRepo = true;
  }

  if (!bootstrappedEmptyRepo) {
    let index = 0;
    for (const file of plan.files) {
      index += 1;
      const existing = await getGithubFileContent(input.repoFullName, file.path, headRef);
      await upsertGithubFile({
        repoFullName: input.repoFullName,
        path: file.path,
        content: file.content,
        message: `${plan.commitMessage} (${index}/${plan.files.length})`,
        branch: headRef,
        sha: existing.sha
      });
    }
  }

  const filesSummary = plan.files.map((file) => `- \`${file.path}\`: ${file.summary}`).join("\n");
  return {
    headRef,
    prTitle: plan.prTitle,
    prBodySuffix: `${plan.prSummary}\n\n### Generated Changes\n${filesSummary}`,
    codeChangesSummary: bootstrappedEmptyRepo
      ? `Codex generated ${plan.files.length} file change(s) and bootstrapped an empty repository on branch ${headRef}.`
      : `Codex generated ${plan.files.length} file change(s) on branch ${headRef}.`
  };
}
