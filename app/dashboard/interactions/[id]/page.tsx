import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { artifacts, interactions } from "@/lib/db/schema";

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

  return (
    <section>
      <p>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>
      <h1>{interaction.chosenIssueTitle}</h1>
      <p>Status: {interaction.status}</p>
      <p>Repository: {interaction.chosenRepoName}</p>

      <h2>Transcript</h2>
      <p>{interaction.transcript}</p>

      <h2>Summary</h2>
      <p>{interaction.summary}</p>

      <h2>Artifacts</h2>
      <p>GitHub Issue: {artifact?.githubIssueLink ?? "Not created"}</p>
      <p>GitHub PR: {artifact?.githubPrLink ?? "Not created"}</p>
      <p>Code Changes: {artifact?.codeChangesSummary ?? "No code changes summary yet."}</p>

      <h2>Actions</h2>
      <form method="post" action={`/api/interactions/${interaction.id}/status`}>
        <input type="hidden" name="status" value="approved" />
        <button type="submit">Approve</button>
      </form>
      <form method="post" action={`/api/interactions/${interaction.id}/status`}>
        <input type="hidden" name="status" value="needs_review" />
        <button type="submit">Needs Review</button>
      </form>
      <form method="post" action={`/api/interactions/${interaction.id}/status`}>
        <input type="hidden" name="status" value="completed" />
        <button type="submit">Mark Completed</button>
      </form>
    </section>
  );
}
