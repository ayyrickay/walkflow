import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/", request.url));
}
