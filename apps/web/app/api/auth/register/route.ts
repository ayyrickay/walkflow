import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createId, hashPassword, setSessionCookie, signSessionToken } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { users } from "@walkflow/db/schema";
import { normalizePhoneE164 } from "@walkflow/core/lib/phone";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  phoneE164: z.string().min(8)
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const payload = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    phoneE164: formData.get("phoneE164")
  });

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const phoneE164 = normalizePhoneE164(payload.data.phoneE164);
  if (!phoneE164) {
    return NextResponse.json({ error: "Phone must be valid E.164" }, { status: 400 });
  }

  const existingByEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, payload.data.email));

  if (existingByEmail.length > 0) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const existingByPhone = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phoneE164, phoneE164));

  if (existingByPhone.length > 0) {
    return NextResponse.json({ error: "Phone already in use" }, { status: 409 });
  }

  const id = createId();
  const passwordHash = await hashPassword(payload.data.password);

  await db.insert(users).values({
    id,
    email: payload.data.email,
    passwordHash,
    phoneE164,
    phoneVerifiedAt: new Date()
  });

  const token = await signSessionToken(id, payload.data.email);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
