import { and, eq, max } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createId, requireUser } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { conversations, proposalAttempts } from "@walkflow/db/schema";

const schema = z.object({
  proposalType: z.enum(["issue", "pr", "issue_and_pr"]),
  title: z.string().min(3).max(200),
  body: z.string().min(3).max(5000),
  patchPreview: z.string().max(5000).optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)));

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const payload = schema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [countRow] = await db
    .select({ current: max(proposalAttempts.attemptNumber) })
    .from(proposalAttempts)
    .where(eq(proposalAttempts.conversationId, conversation.id));

  await db.insert(proposalAttempts).values({
    id: createId(),
    conversationId: conversation.id,
    attemptNumber: (countRow?.current || 0) + 1,
    proposalType: payload.data.proposalType,
    title: payload.data.title,
    body: payload.data.body,
    patchPreview: payload.data.patchPreview
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
