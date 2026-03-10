import { NextResponse } from "next/server";
import { z } from "zod";

import { findUserByEmail, setSessionCookie, signSessionToken, verifyPassword } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const payload = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const user = await findUserByEmail(payload.data.email);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(payload.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSessionToken(user.id, user.email);
  await setSessionCookie(token);

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
