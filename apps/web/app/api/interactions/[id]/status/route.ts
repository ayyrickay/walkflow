import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { interactions } from "@walkflow/db/schema";
import { runGithubWriteSkillForInteraction } from "@walkflow/core/lib/skills/github-write";

const statusSchema = z.enum(["approved", "needs_review", "archived"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const formData = await request.formData();

  const parsedStatus = statusSchema.safeParse(formData.get("status"));
  if (!parsedStatus.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [current] = await db
    .select({ status: interactions.status })
    .from(interactions)
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  if (!current) {
    return NextResponse.json({ error: "Interaction not found" }, { status: 404 });
  }

  await db
    .update(interactions)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  if (parsedStatus.data === "approved" && current.status !== "completed") {
    await runGithubWriteSkillForInteraction({ interactionId: params.id });
  }

  return NextResponse.redirect(new URL(`/dashboard/interactions/${params.id}`, request.url), { status: 303 });
}
