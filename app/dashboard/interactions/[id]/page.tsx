import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { artifacts, interactions, repositories } from "@/lib/db/schema";
import { parseTranscriptTurns } from "@/lib/transcript";
import { RepoOverrideForm } from "@/components/dashboard/repo-override-form";
import { SummaryOverrideForm } from "@/components/dashboard/summary-override-form";
import { InteractionActions } from "@/components/dashboard/interaction-actions";

type InteractionStatus = "captured" | "proposed" | "approved" | "needs_review" | "archived" | "completed";

type StatusAction = {
  status: "approved" | "needs_review" | "archived";
  label: string;
  style: "approved" | "review" | "archive";
};

function statusLabel(status: InteractionStatus) {
  if (status === "approved") {
    return "confirmed";
  }
  return status.replace(/_/g, " ");
}

function statusTone(status: InteractionStatus) {
  if (status === "completed") {
    return "status-pill-completed";
  }
  if (status === "approved") {
    return "status-pill-confirmed";
  }
  if (status === "archived") {
    return "status-pill-archived";
  }
  if (status === "needs_review") {
    return "status-pill-review";
  }
  return "status-pill-default";
}

function actionsForStatus(status: InteractionStatus): StatusAction[] {
  if (status === "completed") {
    return [];
  }

  if (status === "archived") {
    return [
      { status: "needs_review", label: "Unarchive", style: "review" },
      { status: "approved", label: "Confirm", style: "approved" }
    ];
  }

  if (status === "approved") {
    return [
      { status: "approved", label: "Re-confirm", style: "approved" }
    ];
  }

  return [
    { status: "approved", label: "Confirm", style: "approved" },
    { status: "archived", label: "Archive", style: "archive" }
  ];
}

export default async function InteractionDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const [interaction] = await db
    .select()
    .from(interactions)
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  if (!interaction) {
    notFound();
  }

  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.interactionId, interaction.id));
  const repoRows = await db
    .select({ owner: repositories.owner, name: repositories.name })
    .from(repositories)
    .where(eq(repositories.userId, user.id));
  const transcriptTurns = parseTranscriptTurns(interaction.transcript);
  const actions = actionsForStatus(interaction.status as InteractionStatus);
  const localRepoNames = repoRows.map((row) => `${row.owner}/${row.name}`);
  const owners = [...new Set(repoRows.map((row) => row.owner.trim()).filter(Boolean))];
  const isNeedsReview = interaction.status === "needs_review";

  return (
    <section className="interaction-shell">
      <div className="interaction-topbar">
        <Link href="/dashboard">Back to dashboard</Link>
        <code className="interaction-id">Interaction {interaction.id.slice(0, 8)}</code>
      </div>

      <header className="interaction-header">
        <h1 className="interaction-title">{interaction.chosenIssueTitle}</h1>
      </header>

      <div className="interaction-grid interaction-grid-flat">
        <section className="interaction-panel interaction-panel-flat col-6">
          <h2>Summary</h2>
          <div className="meta-cluster">
            <div className="meta-item">
              <h3>Status</h3>
              <span className={`status-pill ${statusTone(interaction.status as InteractionStatus)}`}>
                {statusLabel(interaction.status as InteractionStatus)}
              </span>
            </div>
            <div className="meta-item">
              <h3>Repository</h3>
              <a
                href={`https://github.com/${interaction.chosenRepoName}`}
                target="_blank"
                rel="noreferrer noopener"
                className="repo-link"
              >
                {interaction.chosenRepoName}
              </a>
            </div>
          </div>
          {isNeedsReview ? (
            <div className="repo-override-slot">
              <details className="repo-override-details">
                <summary>Edit repository</summary>
                <RepoOverrideForm
                  interactionId={interaction.id}
                  currentRepoName={interaction.chosenRepoName}
                  owners={owners}
                  localRepoNames={localRepoNames}
                />
              </details>
            </div>
          ) : null}
          {isNeedsReview ? (
            <SummaryOverrideForm interactionId={interaction.id} currentSummary={interaction.summary} />
          ) : (
            <p>{interaction.summary}</p>
          )}
        </section>

        <section className="interaction-panel interaction-panel-flat col-6">
          <h2>Created Artifacts</h2>
          <div className="artifact-row">
            <h3>Created Issue</h3>
            {artifact?.githubIssueLink ? (
              <a className="artifact-link-button" href={artifact.githubIssueLink} target="_blank" rel="noreferrer noopener">
                Open Issue
              </a>
            ) : (
              <span className="artifact-empty">Not created</span>
            )}
          </div>
          <div className="artifact-row">
            <h3>Created PR</h3>
            {artifact?.githubPrLink ? (
              <a className="artifact-link-button" href={artifact.githubPrLink} target="_blank" rel="noreferrer noopener">
                Open PR
              </a>
            ) : (
              <span className="artifact-empty">Not created</span>
            )}
          </div>
          <div className="artifact-row artifact-row-notes">
            <h3>Automation Notes</h3>
            <p>{artifact?.codeChangesSummary ?? "No code changes summary yet."}</p>
          </div>
        </section>

        <section className="interaction-panel interaction-panel-flat interaction-panel-actions col-4">
          <h2>Actions</h2>
          <InteractionActions interactionId={interaction.id} actions={actions} />
        </section>

        <section className="interaction-panel interaction-panel-flat interaction-panel-transcript col-8">
          <h2>Transcript</h2>
          <details className="transcript-details">
            <summary>Show conversation transcript</summary>
            {transcriptTurns.length > 0 ? (
              <div className="transcript-thread">
                {transcriptTurns.map((turn, index) => (
                  <article
                    key={`${interaction.id}-turn-${index}`}
                    className={`transcript-turn transcript-turn-${turn.role}`}
                  >
                    <div className="transcript-bubble">
                      <span className="transcript-speaker">{turn.label}</span>
                      <p className="transcript-text">{turn.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p>No transcript captured.</p>
            )}
          </details>
        </section>
      </div>
    </section>
  );
}
