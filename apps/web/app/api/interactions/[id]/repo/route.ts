import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { interactions, repositories } from "@walkflow/db/schema";
import { isGithubReadConfigured, searchGithubRepositories } from "@walkflow/core/lib/github";

const schema = z.object({
  repoName: z.string().trim().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, "Use owner/repo format.")
});

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const formData = await request.formData();

  const parsed = schema.safeParse({
    repoName: formData.get("repoName")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid repository. Use owner/repo format." }, { status: 400 });
  }

  const [interaction] = await db
    .select({ id: interactions.id, status: interactions.status })
    .from(interactions)
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  if (!interaction) {
    return NextResponse.json({ error: "Interaction not found." }, { status: 404 });
  }

  if (interaction.status !== "needs_review") {
    return NextResponse.json({ error: "Repository can only be edited while interaction needs review." }, { status: 400 });
  }

  const repoName = parsed.data.repoName.trim();
  const normalizedRepoName = normalize(repoName);

  const ownedRepos = await db
    .select({ owner: repositories.owner, name: repositories.name })
    .from(repositories)
    .where(eq(repositories.userId, user.id));

  const knownRepoNames = ownedRepos.map((row) => `${row.owner}/${row.name}`);
  const knownSet = new Set(knownRepoNames.map((repo) => normalize(repo)));

  let isAllowed = knownSet.has(normalizedRepoName);
  if (!isAllowed && isGithubReadConfigured()) {
    const [requestedOwner, requestedRepo] = repoName.split("/");
    const owner = requestedOwner?.trim();
    const repo = requestedRepo?.trim();
    const matches = await searchGithubRepositories({
      query: repo || repoName,
      owners: owner ? [owner] : undefined,
      limit: 20
    });
    isAllowed = matches.some((repo) => normalize(repo.fullName) === normalizedRepoName);
  }

  if (!isAllowed && knownRepoNames.length > 0) {
    return NextResponse.json(
      { error: "Repository not found in your accessible GitHub repos. Check GitHub read config or try another repo." },
      { status: 400 }
    );
  }

  await db
    .update(interactions)
    .set({
      chosenRepoName: repoName,
      updatedAt: new Date()
    })
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  return NextResponse.json({ ok: true, repoName });
}
