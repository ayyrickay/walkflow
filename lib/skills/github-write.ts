import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { artifacts, interactions } from "@/lib/db/schema";
import { createId } from "@/lib/auth";
import {
  createGithubIssue,
  createGithubPullRequest,
  fetchGithubIssueRepoContext,
  isGithubWriteConfigured
} from "@/lib/github";
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

function parseEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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
    const [existingArtifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.interactionId, interaction.id));

    if (existingArtifact?.githubIssueLink) {
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

    const repoContext = await fetchGithubIssueRepoContext(
      interaction.chosenRepoName,
      interaction.transcript,
      interaction.summary
    );

    const draft = await draftGithubIssue({
      repoName: interaction.chosenRepoName,
      suggestedTitle: interaction.chosenIssueTitle,
      summary: interaction.summary,
      transcript: interaction.transcript,
      repoContext
    });

    if (!passesIssueQualityGate(draft, repoContext)) {
      const reason = repoContext.isLikelyEmpty
        ? "Issue draft skipped due to quality gate; repo appears empty and needs manual direction."
        : "Issue draft skipped due to quality gate; insufficient concrete repo grounding.";
      await upsertArtifact(interaction.id, {
        codeChangesSummary: reason
      });
      return {
        ok: false,
        issueUrl: null,
        pullRequestUrl: null,
        completed: false,
        skippedReason: reason
      };
    }

    const issue = await createGithubIssue({
      repoFullName: interaction.chosenRepoName,
      title: draft.title,
      body: draft.body
    });

    const requestedAction = parseActionFromChosenIssueTitle(interaction.chosenIssueTitle);
    const shouldAttemptPr = requestedAction === "pr" || Boolean(input.preferPullRequest);

    let prUrl: string | null = null;
    let prStatus = "Issue created.";

    if (shouldAttemptPr) {
      const prEnabled = parseEnabled(process.env.WALKFLOW_ENABLE_AUTO_PR);
      const headRef = process.env.WALKFLOW_PR_HEAD_REF?.trim() || "";

      if (!prEnabled) {
        prStatus = "Issue created. PR skipped because WALKFLOW_ENABLE_AUTO_PR is disabled.";
      } else if (!headRef) {
        prStatus = "Issue created. PR skipped because WALKFLOW_PR_HEAD_REF is not set.";
      } else {
        const pullRequest = await createGithubPullRequest({
          repoFullName: interaction.chosenRepoName,
          title: `Draft: ${stripActionPrefix(draft.title)}`,
          body: `Closes #${issue.number}\n\nCreated by WalkFlow after caller confirmation.`,
          head: headRef
        });
        prUrl = pullRequest.htmlUrl;
        prStatus = "Issue and pull request created.";
      }
    }

    await upsertArtifact(interaction.id, {
      githubIssueLink: issue.htmlUrl,
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
      issueUrl: issue.htmlUrl,
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
