import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";

const patchSchema = z.object({
  allowUnmappedCalls: z.boolean().optional(),
  demoAccountId: z.string().uuid().nullable().optional()
});

export async function GET() {
  await requireUser();

  const [settings] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, "default"));

  if (!settings) {
    await db.insert(appSettings).values({ id: "default" });
    return NextResponse.json({ settings: { id: "default", allowUnmappedCalls: false, demoAccountId: null } });
  }

  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  await requireUser();

  const payload = patchSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, "default"));

  const allowUnmappedCalls = payload.data.allowUnmappedCalls ?? existing?.allowUnmappedCalls ?? false;
  const demoAccountId = payload.data.demoAccountId ?? existing?.demoAccountId ?? null;

  await db
    .insert(appSettings)
    .values({
      id: "default",
      allowUnmappedCalls,
      demoAccountId,
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        allowUnmappedCalls,
        demoAccountId,
        updatedAt: new Date()
      }
    });

  return NextResponse.json({ ok: true });
}
