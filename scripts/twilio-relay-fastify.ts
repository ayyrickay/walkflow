import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { RawData, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { parse as parseQueryString } from "querystring";

import { db } from "../lib/db/client";
import { appSettings, interactions, users } from "../lib/db/schema";
import { normalizePhoneE164 } from "../lib/phone";
import { buildRelayTextTokenMessages, parseConversationRelayMessage } from "../lib/twilio/conversation-relay";

type SessionState = {
  callSid: string | null;
  from: string | null;
  interactionId: string | null;
  transcript: string[];
};

const liveSessions = new Map<string, SessionState>();
const socketSessions = new WeakMap<WebSocket, SessionState>();

function createId() {
  return randomUUID();
}

function getOrCreateSession(ws: WebSocket): SessionState {
  const existing = socketSessions.get(ws);
  if (existing) {
    return existing;
  }

  const created: SessionState = {
    callSid: null,
    from: null,
    interactionId: null,
    transcript: []
  };
  socketSessions.set(ws, created);
  return created;
}

function appendTurn(existing: string[], role: "caller" | "agent", text: string) {
  const prefix = role === "caller" ? "Caller" : "Agent";
  return [...existing, `${prefix}: ${text.trim()}`];
}

async function persistTranscript(interactionId: string, transcript: string[]) {
  await db
    .update(interactions)
    .set({
      transcript: transcript.join("\n"),
      updatedAt: new Date()
    })
    .where(eq(interactions.id, interactionId));
}

async function resolveUserId(from: string | null): Promise<string | null> {
  const normalized = from ? normalizePhoneE164(from) : null;
  if (normalized) {
    const [mappedUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, normalized));
    if (mappedUser) {
      return mappedUser.id;
    }
  }

  const [settings] = await db
    .select({
      allowUnmappedCalls: appSettings.allowUnmappedCalls,
      demoAccountId: appSettings.demoAccountId
    })
    .from(appSettings)
    .where(eq(appSettings.id, "default"));

  if (settings?.allowUnmappedCalls && settings.demoAccountId) {
    return settings.demoAccountId;
  }

  return null;
}

async function createInteraction(from: string | null): Promise<string | null> {
  const userId = await resolveUserId(from);
  if (!userId) {
    return null;
  }

  const interactionId = createId();
  await db.insert(interactions).values({
    id: interactionId,
    userId,
    status: "captured",
    transcript: "",
    summary: "Live call captured via Twilio ConversationRelay.",
    chosenRepoName: "TBD",
    chosenIssueTitle: "Live interaction pending review",
    updatedAt: new Date()
  });

  return interactionId;
}

function sendTokenizedText(ws: WebSocket, text: string) {
  for (const message of buildRelayTextTokenMessages(text)) {
    ws.send(JSON.stringify(message));
  }
}

async function flushSession(session: SessionState) {
  if (!session.interactionId) {
    return;
  }

  const finalTranscript = session.transcript.join("\n");
  const summary = finalTranscript.length > 0
    ? "Live call transcript captured and ready for review."
    : "Live call ended without transcript content.";

  await db
    .update(interactions)
    .set({
      transcript: finalTranscript,
      summary,
      updatedAt: new Date()
    })
    .where(eq(interactions.id, session.interactionId));
}

async function onSocketMessage(ws: WebSocket, rawData: RawData) {
  const raw = typeof rawData === "string" ? rawData : rawData.toString();
  const message = parseConversationRelayMessage(raw);
  if (!message) {
    return;
  }

  if (message.type === "setup") {
    const session = getOrCreateSession(ws);
    const previousCallSid = session.callSid;
    session.callSid = message.callSid;
    session.from = message.from;

    if (!session.interactionId) {
      session.interactionId = await createInteraction(message.from);
    }

    if (previousCallSid) {
      liveSessions.delete(previousCallSid);
    }
    liveSessions.set(message.callSid, session);

    const ackText = session.interactionId
      ? "Connected. Share your coding thought and I will capture it."
      : "Connected. I could not map this call to an account yet, but I can still listen.";
    sendTokenizedText(ws, ackText);
    return;
  }

  const session = message.callSid ? liveSessions.get(message.callSid) : null;
  const activeSession = session || getOrCreateSession(ws);

  activeSession.transcript = appendTurn(activeSession.transcript, "caller", message.text);
  if (activeSession.interactionId) {
    await persistTranscript(activeSession.interactionId, activeSession.transcript);
  }

  const responseText = "Captured. Keep going or say done when finished.";
  activeSession.transcript = appendTurn(activeSession.transcript, "agent", responseText);
  if (activeSession.interactionId) {
    await persistTranscript(activeSession.interactionId, activeSession.transcript);
  }

  sendTokenizedText(ws, responseText);
}

async function start() {
  const host = process.env.TWILIO_RELAY_HOST || "0.0.0.0";
  const port = Number(process.env.TWILIO_RELAY_PORT || 8081);

  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(websocket);

  // Twilio voice webhooks are sent as application/x-www-form-urlencoded.
  app.addContentTypeParser(
    /^application\/x-www-form-urlencoded\b/,
    { parseAs: "string" },
    (_request, body, done) => {
      const rawBody = typeof body === "string" ? body : body.toString();
      done(null, parseQueryString(rawBody));
    }
  );

  app.get("/health", async () => ({ ok: true }));

  const voiceHandler = async (request: { headers: Record<string, string | string[] | undefined> }) => {
    const configured = process.env.TWILIO_CONVERSATION_RELAY_WSS_URL;
    const forwardedHost = request.headers["x-forwarded-host"];
    const forwardedProto = request.headers["x-forwarded-proto"];
    const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host;
    const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const secure = protoHeader?.includes("https");
    const derivedWsUrl = hostHeader
      ? `${secure ? "wss" : "ws"}://${hostHeader}/twilio/conversation-relay/ws`
      : null;
    const websocketUrl = configured || derivedWsUrl;

    if (!websocketUrl) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Cache-Control": "no-store"
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>WalkFlow voice relay is not configured.</Say>
  <Hangup />
</Response>`
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${websocketUrl}" />
  </Connect>
</Response>`
    };
  };

  app.get("/api/twilio/voice", async (request, reply) => {
    const response = await voiceHandler(request);
    return reply.code(response.statusCode).headers(response.headers).send(response.body);
  });

  app.post("/api/twilio/voice", async (request, reply) => {
    const response = await voiceHandler(request);
    return reply.code(response.statusCode).headers(response.headers).send(response.body);
  });

  app.get("/twilio/conversation-relay/ws", { websocket: true }, (socket) => {
    socket.on("message", async (rawData: RawData) => {
      try {
        await onSocketMessage(socket, rawData);
      } catch (error) {
        app.log.error({ err: error }, "ConversationRelay message handling failed");
      }
    });

    socket.on("close", async () => {
      const session = socketSessions.get(socket);
      if (!session) {
        return;
      }

      try {
        await flushSession(session);
      } catch (error) {
        app.log.error({ err: error }, "Failed to flush ConversationRelay session");
      } finally {
        socketSessions.delete(socket);
        if (session.callSid) {
          liveSessions.delete(session.callSid);
        }
      }
    });
  });

  await app.listen({ host, port });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
