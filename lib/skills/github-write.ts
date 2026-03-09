import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { artifacts, interactions } from "@/lib/db/schema";
import { createId } from "@/lib/auth";
import {
  createGithubIssue,
  createGithubPullRequest,
  fetchGithubIssueRepoContext,
  type GithubIssueRepoContext,
  isGithubWriteConfigured
} from "@/lib/github";
import { runCodexPrAutomation } from "@/lib/codex";
import { draftGithubIssue, passesIssueQualityGate } from "@/lib/openai/issue-writer";

type GithubWriteSkillInput = {
  interactionId: string;
  preferPullRequest?: boolean;
};

type GithubWriteSkillResult = {
  ok: boolean;
  issueUrl: string | null;
  pullRequestUrl: string | null;
  completed: boolean;
  skippedReason?: string;
  error?: string;
};

export function parseActionFromChosenIssueTitle(value: string): "issue" | "pr" {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("[pr]")) {
    return "pr";
  }
  return "issue";
}

function stripActionPrefix(value: string): string {
  return value.replace(/^\[(issue|pr)\]\s*/i, "").trim();
}

function buildPullRequestBody(issueNumber: number): string {
  return `Closes #${issueNumber}\n\nCreated by WalkFlow after caller confirmation.`;
}

export function extractIssueNumberFromUrl(issueUrl: string): number | null {
  const normalized = issueUrl.trim().replace(/\/+$/, "");
  const match = normalized.match(/\/issues\/(\d+)$/i);
  if (!match) {
    return null;
  }
  const issueNumber = Number(match[1]);
  return Number.isInteger(issueNumber) && issueNumber > 0 ? issueNumber : null;
}

function parseEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseEnabledDefaultTrue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

export function isEligibleInteractionStatus(status: string): boolean {
  return status === "approved" || status === "completed";
}

async function upsertArtifact(interactionId: string, values: Partial<typeof artifacts.$inferInsert>) {
  const now = new Date();
  await db
    .insert(artifacts)
    .values({
      id: createId(),
      interactionId,
      githubIssueLink: values.githubIssueLink ?? null,
      githubPrLink: values.githubPrLink ?? null,
      codeChangesSummary: values.codeChangesSummary ?? null,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: artifacts.interactionId,
      set: {
        githubIssueLink: values.githubIssueLink ?? null,
        githubPrLink: values.githubPrLink ?? null,
        codeChangesSummary: values.codeChangesSummary ?? null,
        updatedAt: now
      }
    });
}

export async function runGithubWriteSkillForInteraction(
  input: GithubWriteSkillInput
): Promise<GithubWriteSkillResult> {
  const [interaction] = await db
    .select()
    .from(interactions)
    .where(eq(interactions.id, input.interactionId));

  if (!interaction) {
    return {
      ok: false,
      issueUrl: null,
      pullRequestUrl: null,
      completed: false,
      error: "Interaction not found."
    };
  }

  if (!isEligibleInteractionStatus(interaction.status)) {
    return {
      ok: false,
      issueUrl: null,
      pullRequestUrl: null,
      completed: false,
      skippedReason: `Interaction status ${interaction.status} is not eligible for GitHub writes.`
    };
  }

  if (!isGithubWriteConfigured()) {
    return {
      ok: false,
      issueUrl: null,
      pullRequestUrl: null,
      completed: false,
      skippedReason: "GitHub write integration is not configured."
    };
  }

  try {
    const requestedAction = parseActionFromChosenIssueTitle(interaction.chosenIssueTitle);
    const shouldAttemptPr = requestedAction === "pr" || Boolean(input.preferPullRequest);

    const [existingArtifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.interactionId, interaction.id));

    if (existingArtifact?.githubIssueLink && (!shouldAttemptPr || Boolean(existingArtifact.githubPrLink))) {
      await db
        .update(interactions)
        .set({
          status: "completed",
          updatedAt: new Date()
        })
        .where(and(eq(interactions.id, interaction.id), eq(interactions.status, "approved")));

      return {
        ok: true,
        issueUrl: existingArtifact.githubIssueLink,
        pullRequestUrl: existingArtifact.githubPrLink,
        completed: true
      };
    }

    let repoContext: GithubIssueRepoContext | null = null;
    let issueUrl: string;
    let issueNumber: number;
    let issueBodyForCodex = interaction.summary;

    if (existingArtifact?.githubIssueLink) {
      const extractedIssueNumber = extractIssueNumberFromUrl(existingArtifact.githubIssueLink);
      if (!extractedIssueNumber) {
        throw new Error("Existing issue link could not be parsed for issue number.");
      }
      issueUrl = existingArtifact.githubIssueLink;
      issueNumber = extractedIssueNumber;
    } else {
      const fetchedRepoContext = await fetchGithubIssueRepoContext(
        interaction.chosenRepoName,
        interaction.transcript,
        interaction.summary
      );
      const repoContextForPr = fetchedRepoContext;

      const draft = await draftGithubIssue({
        repoName: interaction.chosenRepoName,
        suggestedTitle: interaction.chosenIssueTitle,
        summary: interaction.summary,
        transcript: interaction.transcript,
        repoContext: fetchedRepoContext
      });

      if (!passesIssueQualityGate(draft, fetchedRepoContext)) {
        const reason = fetchedRepoContext.isLikelyEmpty
          ? "Issue draft quality-gate warning: repo appears empty and needs manual direction."
          : "Issue draft quality-gate warning: insufficient concrete repo grounding.";
        if (!shouldAttemptPr) {
          await upsertArtifact(interaction.id, {
            codeChangesSummary: `${reason} Skipping auto-action and leaving for review.`
          });
          return {
            ok: false,
            issueUrl: null,
            pullRequestUrl: null,
            completed: false,
            skippedReason: reason
          };
        }
        issueBodyForCodex = `${draft.body}\n\n## Confidence Note\n- ${reason}`;
      }

      const issue = await createGithubIssue({
        repoFullName: interaction.chosenRepoName,
        title: draft.title,
        body: draft.body
      });
      repoContext = repoContextForPr;
      issueUrl = issue.htmlUrl;
      issueNumber = issue.number;
      issueBodyForCodex = draft.body;
    }

    let prUrl: string | null = null;
    let prStatus = "Issue created.";

    if (shouldAttemptPr) {
      const prEnabled = parseEnabled(process.env.WALKFLOW_ENABLE_AUTO_PR);
      const headRef = process.env.WALKFLOW_PR_HEAD_REF?.trim() || "";

      if (!prEnabled) {
        prStatus = "Issue created. PR skipped because WALKFLOW_ENABLE_AUTO_PR is disabled.";
      } else {
        const existingPrUrl = existingArtifact?.githubPrLink ?? null;
        if (existingPrUrl) {
          prUrl = existingPrUrl;
          prStatus = "Issue and pull request already exist.";
        } else {
          const codexPrEnabled = parseEnabledDefaultTrue(process.env.WALKFLOW_ENABLE_CODEX_PR);
          let resolvedHeadRef = headRef;
          let prTitle = `Draft: ${stripActionPrefix(interaction.chosenIssueTitle)}`;
          let prBody = buildPullRequestBody(issueNumber);

          if (codexPrEnabled) {
            if (!repoContext) {
              repoContext = await fetchGithubIssueRepoContext(
                interaction.chosenRepoName,
                interaction.transcript,
                interaction.summary
              );
            }
            try {
              const codexResult = await runCodexPrAutomation({
                repoFullName: interaction.chosenRepoName,
                interactionId: interaction.id,
                issueNumber,
                issueTitle: stripActionPrefix(interaction.chosenIssueTitle),
                issueBody: issueBodyForCodex,
                interactionSummary: interaction.summary,
                transcript: interaction.transcript,
                repoContext
              });
              resolvedHeadRef = codexResult.headRef;
              prTitle = codexResult.prTitle;
              prBody = `${buildPullRequestBody(issueNumber)}\n\n${codexResult.prBodySuffix}`;
              prStatus = `Issue and pull request created. ${codexResult.codeChangesSummary}`;
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown codex error";
              if (!resolvedHeadRef) {
                throw new Error(`PR skipped: Codex automation failed and WALKFLOW_PR_HEAD_REF is unset (${message}).`);
              }
              prStatus = `Issue created. Codex branch generation failed (${message}); falling back to WALKFLOW_PR_HEAD_REF.`;
            }
          }

          if (!resolvedHeadRef) {
            prStatus = "Issue created. PR skipped because WALKFLOW_PR_HEAD_REF is not set.";
          } else {
            const pullRequest = await createGithubPullRequest({
              repoFullName: interaction.chosenRepoName,
              title: prTitle,
              body: prBody,
              head: resolvedHeadRef
            });
            prUrl = pullRequest.htmlUrl;
            if (!prStatus.startsWith("Issue and pull request created.")) {
              prStatus = "Issue and pull request created.";
            }
          }
        }
      }
    }

    await upsertArtifact(interaction.id, {
      githubIssueLink: issueUrl,
      githubPrLink: prUrl,
      codeChangesSummary: prStatus
    });

    await db
      .update(interactions)
      .set({
        status: "completed",
        updatedAt: new Date()
      })
      .where(and(eq(interactions.id, interaction.id), eq(interactions.status, "approved")));

    return {
      ok: true,
      issueUrl,
      pullRequestUrl: prUrl,
      completed: true
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await upsertArtifact(interaction.id, {
      codeChangesSummary: `GitHub write failed: ${message}`
    });

    return {
      ok: false,
      issueUrl: null,
      pullRequestUrl: null,
      completed: false,
      error: message
    };
  }
}

export function triggerGithubWriteSkillForInteraction(input: GithubWriteSkillInput) {
  // Fire-and-forget for call hangup responsiveness.
  void runGithubWriteSkillForInteraction(input).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[github-write][${input.interactionId}] ${message}`);
  });
}
