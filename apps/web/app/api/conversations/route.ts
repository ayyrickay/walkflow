import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { conversations } from "@walkflow/db/schema";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  let rows;

  if (status) {
    rows = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, user.id),
          eq(
            conversations.status,
            status as "in_progress" | "confirmed" | "rejected_once" | "needs_review" | "processed"
          )
        )
      )
      .orderBy(desc(conversations.createdAt));
  } else {
    rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.createdAt));
  }

  return NextResponse.json({ conversations: rows });
}
