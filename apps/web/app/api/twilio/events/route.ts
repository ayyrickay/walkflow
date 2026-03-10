import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Not implemented",
      message: "Twilio conversation event handling will be implemented in milestone 2."
    },
    { status: 501 }
  );
}
