import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { createGithubPullRequest } from "@/lib/github";

const createPullRequestSchema = z.object({
  repoFullName: z.string().min(3),
  title: z.string().min(3).max(200),
  body: z.string().min(1),
  head: z.string().min(1),
  base: z.string().min(1).optional()
});

export async function POST(request: Request) {
  await requireUser();

  const parsed = createPullRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const pullRequest = await createGithubPullRequest(parsed.data);
    return NextResponse.json({ ok: true, pullRequest });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /restricted|not configured/i.test(message) ? 403 : 502;
    return NextResponse.json({ error: "GitHub pull request creation failed", message }, { status });
  }
}
