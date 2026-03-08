import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Not implemented",
      message: "GitHub issue creation will be implemented in milestone 3."
    },
    { status: 501 }
  );
}
