import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";

const patchSchema = z.object({
  status: z.enum(["in_progress", "confirmed", "rejected_once", "needs_review", "processed"]).optional(),
  finalSummary: z.string().max(4000).optional()
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)));

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation: row });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const json = await request.json();
  const payload = patchSchema.safeParse(json);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updateValues: Partial<typeof conversations.$inferInsert> = {};
  if (payload.data.status) {
    updateValues.status = payload.data.status;
  }
  if (payload.data.finalSummary) {
    updateValues.finalSummary = payload.data.finalSummary;
  }

  await db
    .update(conversations)
    .set(updateValues)
    .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)));

  return NextResponse.json({ ok: true });
}
