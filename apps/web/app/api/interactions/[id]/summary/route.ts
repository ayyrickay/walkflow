import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { interactions } from "@walkflow/db/schema";

const schema = z.object({
  summary: z.string().trim().min(3).max(4000)
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const formData = await request.formData();

  const parsed = schema.safeParse({
    summary: formData.get("summary")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Summary must be between 3 and 4000 characters." }, { status: 400 });
  }

  const [interaction] = await db
    .select({ status: interactions.status })
    .from(interactions)
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  if (!interaction) {
    return NextResponse.json({ error: "Interaction not found." }, { status: 404 });
  }

  if (interaction.status !== "needs_review") {
    return NextResponse.json({ error: "Summary can only be edited while interaction needs review." }, { status: 400 });
  }

  await db
    .update(interactions)
    .set({
      summary: parsed.data.summary,
      updatedAt: new Date()
    })
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  return NextResponse.json({ ok: true });
}
