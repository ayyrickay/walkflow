import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

import { createId } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { appSettings, interactions, users } from "@walkflow/db/schema";
import { normalizePhoneE164 } from "@walkflow/core/lib/phone";
import { serializeTranscriptTurns, type TranscriptTurn } from "@walkflow/core/lib/transcript";
import { buildRelayTextTokenMessages, parseConversationRelayMessage } from "@walkflow/core/lib/twilio/conversation-relay";

type SessionState = {
  callSid: string | null;
  from: string | null;
  interactionId: string | null;
  transcript: TranscriptTurn[];
  lastUpdatedAt: number;
};

type ServerWithRelay = HttpServer & {
  conversationRelayWss?: WebSocketServer;
};

type SocketWithServer = Socket & {
  server: ServerWithRelay;
};

type ApiResponseWithSocket = NextApiResponse & {
  socket: SocketWithServer;
};

const liveSessions = new Map<string, SessionState>();
const wsSessionLookup = new WeakMap<WebSocket, SessionState>();

function appendTranscriptTurn(existing: TranscriptTurn[], role: "caller" | "agent", text: string) {
  const label = role === "caller" ? "Caller" : "Agent";
  return [
    ...existing,
    {
      role,
      label,
      text: text.trim()
    }
  ];
}

async function persistInteractionTranscript(interactionId: string, transcript: TranscriptTurn[]) {
  await db
    .update(interactions)
    .set({
      transcript: serializeTranscriptTurns(transcript),
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

async function createInteractionForSession(session: SessionState) {
  const userId = await resolveUserId(session.from);
  if (!userId) {
    return null;
  }

  const interactionId = createId();
  await db.insert(interactions).values({
    id: interactionId,
    userId,
    status: "captured",
    transcript: "[]",
    summary: "Live call captured via Twilio ConversationRelay.",
    chosenRepoName: "TBD",
    chosenIssueTitle: "Live interaction pending review",
    updatedAt: new Date()
  });

  return interactionId;
}

function getOrCreateSessionForSocket(ws: WebSocket) {
  const existing = wsSessionLookup.get(ws);
  if (existing) {
    return existing;
  }

  const created: SessionState = {
    callSid: null,
    from: null,
    interactionId: null,
    transcript: [],
    lastUpdatedAt: Date.now()
  };
  wsSessionLookup.set(ws, created);
  return created;
}

async function handleSetupMessage(ws: WebSocket, callSid: string, from: string | null) {
  const session = getOrCreateSessionForSocket(ws);
  const previousCallSid = session.callSid;
  session.callSid = callSid;
  session.from = from;
  session.lastUpdatedAt = Date.now();

  if (!session.interactionId) {
    session.interactionId = await createInteractionForSession(session);
  }

  if (previousCallSid) {
    liveSessions.delete(previousCallSid);
  }
  liveSessions.set(callSid, session);

  const ackText = session.interactionId
    ? "Connected. Share your coding thought and I will capture it."
    : "Connected. I could not map this call to an account yet, but I can still listen.";

  for (const message of buildRelayTextTokenMessages(ackText)) {
    ws.send(JSON.stringify(message));
  }
}

async function handlePromptMessage(ws: WebSocket, callSid: string | null, promptText: string) {
  const session = callSid ? liveSessions.get(callSid) : null;
  const fallbackSession = session || getOrCreateSessionForSocket(ws);
  fallbackSession.lastUpdatedAt = Date.now();

  fallbackSession.transcript = appendTranscriptTurn(fallbackSession.transcript, "caller", promptText);

  if (fallbackSession.interactionId) {
    await persistInteractionTranscript(fallbackSession.interactionId, fallbackSession.transcript);
  }

  const responseText = "Captured. Keep going or say done when finished.";
  fallbackSession.transcript = appendTranscriptTurn(fallbackSession.transcript, "agent", responseText);

  if (fallbackSession.interactionId) {
    await persistInteractionTranscript(fallbackSession.interactionId, fallbackSession.transcript);
  }

  for (const message of buildRelayTextTokenMessages(responseText)) {
    ws.send(JSON.stringify(message));
  }
}

async function flushSessionToDb(session: SessionState) {
  if (!session.interactionId) {
    return;
  }

  const finalTranscript = serializeTranscriptTurns(session.transcript);
  const summary = session.transcript.length > 0
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

function createOrGetWebSocketServer(res: ApiResponseWithSocket) {
  const server = res.socket.server;
  if (server.conversationRelayWss) {
    return server.conversationRelayWss;
  }

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws) => {
    ws.on("message", async (buffer) => {
      try {
        const message = parseConversationRelayMessage(buffer.toString());
        if (!message) {
          return;
        }

        if (message.type === "setup") {
          await handleSetupMessage(ws, message.callSid, message.from);
          return;
        }

        await handlePromptMessage(ws, message.callSid, message.text);
      } catch (error) {
        console.error("ConversationRelay message handling failed:", error);
      }
    });

    ws.on("close", async () => {
      const session = wsSessionLookup.get(ws);
      if (!session) {
        return;
      }

      try {
        await flushSessionToDb(session);
      } finally {
        wsSessionLookup.delete(ws);
        if (session.callSid) {
          liveSessions.delete(session.callSid);
        }
      }
    });
  });

  server.conversationRelayWss = wss;
  return wss;
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default function handler(req: NextApiRequest, res: ApiResponseWithSocket) {
  const wss = createOrGetWebSocketServer(res);

  if (req.headers.upgrade?.toLowerCase() === "websocket") {
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
      wss.emit("connection", ws, req);
    });
    return;
  }

  res.status(200).json({ ok: true });
}
