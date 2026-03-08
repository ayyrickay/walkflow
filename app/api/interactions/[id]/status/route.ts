import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { interactions } from "@/lib/db/schema";

const statusSchema = z.enum(["captured", "proposed", "approved", "needs_review", "completed"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const formData = await request.formData();

  const parsedStatus = statusSchema.safeParse(formData.get("status"));
  if (!parsedStatus.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await db
    .update(interactions)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(and(eq(interactions.id, params.id), eq(interactions.userId, user.id)));

  return NextResponse.redirect(new URL(`/dashboard/interactions/${params.id}`, request.url));
}
