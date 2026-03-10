import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { RawData, WebSocket } from "ws";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { parse as parseQueryString } from "querystring";

import { db } from "@walkflow/db/client";
import { appSettings, interactions, repositories, users } from "@walkflow/db/schema";
import {
  listGithubUserRepoNames,
  ownersFromRepoNames,
  suggestGithubRepoNamesFromText,
  suggestGithubRepoNamesFromTextForOwners
} from "@walkflow/core/lib/github";
import { normalizePhoneE164 } from "@walkflow/core/lib/phone";
import { generateVoiceProposal, type VoiceProposal } from "@walkflow/core/lib/openai/proposal";
import {
  buildRelayEndSessionMessage,
  buildRelayTextTokenMessages,
  parseConversationRelayMessage
} from "@walkflow/core/lib/twilio/conversation-relay";
import { triggerGithubWriteSkillForInteraction } from "@walkflow/core/lib/skills/github-write";
import { serializeTranscriptTurns, transcriptToPlainText, type TranscriptTurn } from "@walkflow/core/lib/transcript";

type VoicePhase = "collecting" | "awaiting_confirmation" | "awaiting_retry_context" | "closed";

type SessionState = {
  callSid: string | null;
  from: string | null;
  interactionId: string | null;
  userId: string | null;
  transcript: TranscriptTurn[];
  callerNotes: string[];
  phase: VoicePhase;
  rejectionCount: number;
  proposal: VoiceProposal | null;
  availableRepoNames: string[];
  preferredRepoName: string | null;
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
    userId: null,
    transcript: [],
    callerNotes: [],
    phase: "collecting",
    rejectionCount: 0,
    proposal: null,
    availableRepoNames: [],
    preferredRepoName: null
  };
  socketSessions.set(ws, created);
  return created;
}

function appendTurn(existing: TranscriptTurn[], role: "caller" | "agent", text: string) {
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

function logTranscriptTurn(session: SessionState, role: "caller" | "agent", text: string) {
  const callSid = session.callSid || "unknown-call";
  const label = role === "caller" ? "CALLER" : "AGENT";
  const cleaned = text.replace(/\s+/g, " ").trim();
  console.log(`[transcript][${callSid}][${label}] ${cleaned}`);
}

async function persistTranscript(interactionId: string, transcript: TranscriptTurn[]) {
  await db
    .update(interactions)
    .set({
      transcript: serializeTranscriptTurns(transcript),
      updatedAt: new Date()
    })
    .where(eq(interactions.id, interactionId));
}

async function persistInteractionState(
  interactionId: string,
  updates: Partial<{
    status: "captured" | "proposed" | "approved" | "needs_review" | "completed";
    transcript: string;
    summary: string;
    chosenRepoName: string;
    chosenIssueTitle: string;
  }>
) {
  await db
    .update(interactions)
    .set({
      ...updates,
      updatedAt: new Date()
    })
    .where(eq(interactions.id, interactionId));
}

async function resolveUserId(from: string | null): Promise<string | null> {
  const normalized = from ? normalizePhoneE164(from) : null;
  const rawTestCaller = process.env.TWILIO_TEST_CALLER_E164?.trim();
  const testCaller = rawTestCaller ? normalizePhoneE164(rawTestCaller) : null;

  if (normalized && testCaller && normalized === testCaller) {
    const testUserEmail = process.env.TWILIO_TEST_USER_EMAIL?.trim();
    if (testUserEmail) {
      const [mappedByEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, testUserEmail));
      if (mappedByEmail) {
        return mappedByEmail.id;
      }
    }

    const [firstUser] = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (firstUser) {
      return firstUser.id;
    }
  }

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

async function createInteraction(from: string | null): Promise<{ interactionId: string; userId: string } | null> {
  const userId = await resolveUserId(from);
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

  return { interactionId, userId };
}

function sendTokenizedText(ws: WebSocket, text: string) {
  for (const message of buildRelayTextTokenMessages(text)) {
    ws.send(JSON.stringify(message));
  }
}

function doneIntent(text: string) {
  return /\b(done|finished|that'?s all|that is all|that should do it|that should do|that covers it|that covers everything|that’s it|that's it|that’s all|can you summarize|could you summarize|want to summarize|what do you think|your turn|go ahead and summarize|ready for a summary|ready now)\b/i.test(text);
}

function confirmIntent(text: string) {
  return /\b(confirm|approved?|yes|yeah|yep|looks good|sounds good|that sounds good|that sounds right|that works|works for me|go ahead|ship it|let'?s do it|perfect)\b/i.test(text);
}

function rejectIntent(text: string) {
  return /\b(reject|no|nope|change|changes|not right|not quite|try again|different|use another|wrong repo|wrong repository|pick a different repo|needs work)\b/i.test(text);
}

function finishIntent(text: string) {
  return /\b(done|hang up|goodbye|bye)\b/i.test(text);
}

function repoNameParts(repoName: string) {
  const segments = repoName.split("/");
  return {
    full: normalizeRepoName(repoName),
    short: normalizeRepoName(segments[segments.length - 1] || repoName)
  };
}

function resolveRepoOverride(text: string, availableRepos: string[]) {
  const normalizedText = text.toLowerCase();

  for (const repoName of availableRepos) {
    const parts = repoNameParts(repoName);
    if (normalizedText.includes(parts.full)) {
      return repoName;
    }
  }

  const words = normalizedText
    .replace(/[^a-z0-9/_\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const repoName of availableRepos) {
    const parts = repoNameParts(repoName);
    if (words.includes(parts.short)) {
      return repoName;
    }
  }

  return null;
}

function proposalSpeech(proposal: VoiceProposal, isRetry: boolean) {
  const prefix = isRetry ? "All right, here's the updated version." : "Here's what I heard.";
  const action = proposal.actionType === "pr" ? "pull request" : "issue";
  return `${prefix} I would put this in ${proposal.repoName} as a ${action}. Title: ${proposal.issueTitle}. Summary: ${proposal.summary}. Does that sound right, or should we make changes?`;
}

async function persistProposal(interactionId: string, proposal: VoiceProposal) {
  const actionLabel = proposal.actionType === "pr" ? "[PR]" : "[Issue]";
  await persistInteractionState(interactionId, {
    status: "proposed",
    summary: proposal.summary,
    chosenRepoName: proposal.repoName,
    chosenIssueTitle: `${actionLabel} ${proposal.issueTitle}`
  });
}

async function listUserRepoNames(userId: string | null): Promise<string[]> {
  if (!userId) {
    return [];
  }

  const rows = await db
    .select({
      owner: repositories.owner,
      name: repositories.name
    })
    .from(repositories)
    .where(eq(repositories.userId, userId));

  return rows.map((row) => `${row.owner}/${row.name}`);
}

function mergeUniqueRepoNames(primary: string[], secondary: string[]) {
  const ordered = [...primary, ...secondary];
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const name of ordered) {
    const normalized = name.trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged;
}

function normalizeRepoName(value: string) {
  return value.trim().toLowerCase();
}

async function respond(ws: WebSocket, session: SessionState, text: string) {
  session.transcript = appendTurn(session.transcript, "agent", text);
  logTranscriptTurn(session, "agent", text);
  if (session.interactionId) {
    await persistTranscript(session.interactionId, session.transcript);
  }
  sendTokenizedText(ws, text);
}

async function endRelaySession(ws: WebSocket, handoffData?: Record<string, unknown>) {
  ws.send(JSON.stringify(buildRelayEndSessionMessage(handoffData)));
}

async function respondAndEnd(
  ws: WebSocket,
  session: SessionState,
  text: string,
  handoffData?: Record<string, unknown>
) {
  await respond(ws, session, text);
  await endRelaySession(ws, handoffData);
}

async function flushSession(session: SessionState) {
  if (!session.interactionId) {
    return;
  }

  const serializedTranscript = serializeTranscriptTurns(session.transcript);
  const plainTextTranscript = transcriptToPlainText(serializedTranscript);
  const updates: Partial<{
    transcript: string;
    summary: string;
  }> = {
    transcript: serializedTranscript
  };

  if (!session.proposal) {
    updates.summary = plainTextTranscript.length > 0
      ? "Live call transcript captured and ready for review."
      : "Live call ended without transcript content.";
  }

  await persistInteractionState(session.interactionId, updates);

  if (plainTextTranscript.trim()) {
    const callSid = session.callSid || "unknown-call";
    console.log(`[transcript][${callSid}][FINAL_START]`);
    console.log(plainTextTranscript);
    console.log(`[transcript][${callSid}][FINAL_END]`);
  }
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
      const created = await createInteraction(message.from);
      session.interactionId = created?.interactionId ?? null;
      session.userId = created?.userId ?? null;
    }

    if (previousCallSid) {
      liveSessions.delete(previousCallSid);
    }
    liveSessions.set(message.callSid, session);

    const ackText = session.interactionId
      ? "I'm listening. Talk it through however you want. When it feels complete, say something like that's it, or ask me for a summary."
      : "Connected. I could not map this call to an account yet, but I can still listen.";
    await respond(ws, session, ackText);
    return;
  }

  const session = message.callSid ? liveSessions.get(message.callSid) : null;
  const activeSession = session || getOrCreateSession(ws);
  const repoOverride = resolveRepoOverride(message.text, activeSession.availableRepoNames);

  activeSession.transcript = appendTurn(activeSession.transcript, "caller", message.text);
  activeSession.callerNotes = [...activeSession.callerNotes, message.text.trim()];
  logTranscriptTurn(activeSession, "caller", message.text);
  if (activeSession.interactionId) {
    await persistTranscript(activeSession.interactionId, activeSession.transcript);
  }

  if (activeSession.phase === "closed") {
    await endRelaySession(ws, { reason: "already_closed" });
    return;
  }

  if (activeSession.phase === "awaiting_confirmation") {
    if (repoOverride && repoOverride !== activeSession.proposal?.repoName) {
      activeSession.preferredRepoName = repoOverride;
    }

    if (confirmIntent(message.text) || finishIntent(message.text)) {
      activeSession.phase = "closed";
      if (activeSession.interactionId) {
        await persistInteractionState(activeSession.interactionId, { status: "approved" });
      }
      await respondAndEnd(
        ws,
        activeSession,
        "Sounds good. I marked it approved for follow-up and I'll let you go.",
        { reason: "approved" }
      );
      if (activeSession.interactionId) {
        triggerGithubWriteSkillForInteraction({
          interactionId: activeSession.interactionId,
          preferPullRequest: activeSession.proposal?.actionType === "pr"
        });
      }
      return;
    }

    if (rejectIntent(message.text)) {
      activeSession.rejectionCount += 1;
      if (activeSession.rejectionCount >= 2) {
        activeSession.phase = "closed";
        if (activeSession.interactionId) {
          await persistInteractionState(activeSession.interactionId, { status: "needs_review" });
        }
        await respondAndEnd(
          ws,
          activeSession,
          "Understood. I marked this one for review, so nothing will be automated from here.",
          { reason: "needs_review" }
        );
        return;
      }

      activeSession.phase = "awaiting_retry_context";
      if (activeSession.preferredRepoName) {
        await respond(
          ws,
          activeSession,
          `Okay, I'll switch the repo to ${activeSession.preferredRepoName}. Anything else you want to change before I try again?`
        );
        return;
      }

      await respond(
        ws,
        activeSession,
        "Okay, what should I change? You can give me more context or point me at a different repo."
      );
      return;
    }

    await respond(
      ws,
      activeSession,
      "If that sounds right, tell me to go ahead. If not, tell me what to change, including the repo if needed."
    );
    return;
  }

  if (activeSession.phase === "collecting" || activeSession.phase === "awaiting_retry_context") {
    if (repoOverride) {
      activeSession.preferredRepoName = repoOverride;
    }

    if (!doneIntent(message.text)) {
      return;
    }

    const transcript = activeSession.callerNotes.join("\n");
    const localRepos = await listUserRepoNames(activeSession.userId);
    const githubUserRepos = await listGithubUserRepoNames(120);
    const githubUserRepoSet = new Set(githubUserRepos.map((repo) => normalizeRepoName(repo)));
    const localReposFiltered = githubUserRepoSet.size > 0
      ? localRepos.filter((repo) => githubUserRepoSet.has(normalizeRepoName(repo)))
      : localRepos;

    const githubOwners = ownersFromRepoNames(githubUserRepos);
    const githubSuggestedRepos = githubOwners.length > 0
      ? await suggestGithubRepoNamesFromTextForOwners(transcript, githubOwners, 8)
      : await suggestGithubRepoNamesFromText(transcript, 8);

    const availableRepos = mergeUniqueRepoNames(
      mergeUniqueRepoNames(localReposFiltered, githubUserRepos),
      githubSuggestedRepos
    ).slice(0, 24);
    activeSession.availableRepoNames = availableRepos;
    const generatedProposal = await generateVoiceProposal(transcript, availableRepos);
    const proposal = activeSession.preferredRepoName
      ? { ...generatedProposal, repoName: activeSession.preferredRepoName }
      : generatedProposal;
    activeSession.proposal = proposal;
    activeSession.phase = "awaiting_confirmation";
    activeSession.preferredRepoName = null;

    if (activeSession.interactionId) {
      await persistProposal(activeSession.interactionId, proposal);
    }

    await respond(ws, activeSession, proposalSpeech(proposal, activeSession.rejectionCount > 0));
    return;
  }

  await respond(ws, activeSession, "I'm still here. Keep going.");
}

async function start() {
  const host = process.env.TWILIO_RELAY_HOST || "0.0.0.0";
  const port = Number(process.env.TWILIO_RELAY_PORT || process.env.PORT || 8081);

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
  <Hangup />
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
