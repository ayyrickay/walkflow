import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { isGithubReadConfigured, searchGithubRepositories } from "@walkflow/core/lib/github";

const querySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  owners: z.string().optional()
});

export async function GET(request: Request) {
  await requireUser();

  if (!isGithubReadConfigured()) {
    return NextResponse.json({ repos: [], message: "GITHUB_READ_TOKEN is not configured." });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
    owners: url.searchParams.get("owners") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params" }, { status: 400 });
  }

  const owners = parsed.data.owners
    ? parsed.data.owners.split(",").map((owner) => owner.trim()).filter(Boolean)
    : undefined;
  const repos = await searchGithubRepositories({
    query: parsed.data.q,
    limit: parsed.data.limit,
    owners
  });

  return NextResponse.json({
    repos,
    repoNames: repos.map((repo) => repo.fullName)
  });
}
