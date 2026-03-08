import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Not implemented",
      message: "Conversation post-processing job is not implemented yet."
    },
    { status: 501 }
  );
}
