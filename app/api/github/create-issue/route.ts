import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { createGithubIssue } from "@/lib/github";

const createIssueSchema = z.object({
  repoFullName: z.string().min(3),
  title: z.string().min(3).max(200),
  body: z.string().min(1)
});

export async function POST(request: Request) {
  await requireUser();

  const parsed = createIssueSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const issue = await createGithubIssue(parsed.data);
    return NextResponse.json({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /restricted|not configured/i.test(message) ? 403 : 502;
    return NextResponse.json({ error: "GitHub issue creation failed", message }, { status });
  }
}
