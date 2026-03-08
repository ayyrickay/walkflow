import { NextResponse } from "next/server";

function resolveConversationRelayWsUrl(request: Request): string | null {
  const configured = process.env.TWILIO_CONVERSATION_RELAY_WSS_URL;
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const base = new URL(appUrl);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/api/twilio/conversation-relay/ws";
  base.search = "";
  base.hash = "";
  return base.toString();
}

export async function POST(request: Request) {
  const websocketUrl = resolveConversationRelayWsUrl(request);
  if (!websocketUrl) {
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>WalkFlow is not configured for voice relay yet. Please try again later.</Say>
  <Hangup />
</Response>`;

    return new NextResponse(errorTwiml, {
      status: 500,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${websocketUrl}" />
  </Connect>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function GET(request: Request) {
  return POST(request);
}
