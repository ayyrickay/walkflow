import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { interactions } from "@/lib/db/schema";
import { triggerGithubWriteSkillForInteraction } from "@/lib/skills/github-write";

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

  if (parsedStatus.data === "approved" && current.status !== "approved" && current.status !== "completed") {
    triggerGithubWriteSkillForInteraction({ interactionId: params.id });
  }

  return NextResponse.redirect(new URL(`/dashboard/interactions/${params.id}`, request.url));
}
