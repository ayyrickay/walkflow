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
import { generateVoiceProposal, type VoiceProposal, VoiceProposalAiRequiredError } from "@walkflow/core/lib/openai/proposal";
import {
  buildRelayEndSessionMessage,
  buildRelayTextTokenMessages,
  parseConversationRelayMessage
} from "@walkflow/core/lib/twilio/conversation-relay";
import { triggerGithubWriteSkillForInteraction } from "@walkflow/core/lib/skills/github-write";
import { serializeTranscriptTurns, transcriptToPlainText, type TranscriptTurn } from "@walkflow/core/lib/transcript";
import { buildProposalTranscript } from "./proposal-transcript";

type VoicePhase = "collecting" | "awaiting_confirmation" | "awaiting_retry_context" | "closed";

type SessionState = {
  socket: WebSocket | null;
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
  silenceTimer: NodeJS.Timeout | null;
  silencePromptCount: number;
  hasPendingRetryContext: boolean;
  awaitingMoreDetailAnswer: boolean;
};

const liveSessions = new Map<string, SessionState>();
const socketSessions = new WeakMap<WebSocket, SessionState>();
const SILENCE_TIMEOUT_MS = Number(process.env.WALKFLOW_VOICE_SILENCE_MS || 3_000);
const ALLOW_DETERMINISTIC_VOICE_FALLBACK = process.env.WALKFLOW_ALLOW_DETERMINISTIC_VOICE_FALLBACK === "true";

function createId() {
  return randomUUID();
}

function getOrCreateSession(ws: WebSocket): SessionState {
  const existing = socketSessions.get(ws);
  if (existing) {
    return existing;
  }

  const created: SessionState = {
    socket: ws,
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
    preferredRepoName: null,
    silenceTimer: null,
    silencePromptCount: 0,
    hasPendingRetryContext: false,
    awaitingMoreDetailAnswer: false
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
  return /\b(done|finished|that'?s all|that is all|that should do it|that should do|that covers it|that covers everything|that’s it|that's it|that’s all|can you summarize|could you summarize|want to summarize|ready for a summary|ready now)\b/i.test(text);
}

function confirmIntent(text: string) {
  return /\b(confirm|approved?|yes|yeah|yep|looks good|sounds good|that sounds good|that sounds right|that works|works for me|go ahead|ship it|let'?s do it|perfect)\b/i.test(text);
}

function rejectIntent(text: string) {
  return /\b(reject|no|nope|change|changes|not right|not quite|try again|different|use another|wrong repo|wrong repository|pick a different repo|needs work|recheck|recheck it)\b/i.test(text);
}

function finishIntent(text: string) {
  return /\b(done|hang up|goodbye|bye)\b/i.test(text);
}

function satisfiedGoodbyeIntent(text: string) {
  return /\b(thanks|thank you|perfect|great|sounds good|looks good|that works|works for me)\b/i.test(text)
    && /\b(goodbye|bye)\b/i.test(text);
}

function noMoreDetailIntent(text: string) {
  return /\b(no|nope|nothing else|that'?s all|that is all|done|finished|i'?m done|im done|all good|that should do it|that should do)\b/i.test(text);
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

function plainTextTranscriptForSession(session: SessionState) {
  return buildProposalTranscript(session.callerNotes);
}

async function failClosedForVoiceAi(ws: WebSocket, session: SessionState, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown voice AI error.";
  console.error(`[voice-ai-required][${session.callSid || "unknown-call"}] ${message}`);
  session.phase = "closed";
  clearSilenceTimer(session);

  if (session.interactionId) {
    await persistInteractionState(session.interactionId, { status: "needs_review" });
  }

  const text = "I'm having trouble handling this call live. I saved it for review instead of guessing.";
  await respondAndEnd(ws, session, text, { reason: "voice_ai_unavailable" });
}

function isVoiceAiFailure(error: unknown) {
  return error instanceof VoiceProposalAiRequiredError;
}

function greetingText(mapped: boolean) {
  return mapped
    ? "Hey, this is walkflow. How can I help?."
    : "I'm here. I couldn't match this number to an account, but I can still listen.";
}

function processingText() {
  return "Let me summarize that.";
}

function askForMoreDetailText() {
  return "Is there anything else to add?";
}

function proposalText(proposal: VoiceProposal) {
  const action = proposal.actionType === "pr" ? "pull request" : "issue";
  return `I'd put this in ${proposal.repoName} as a ${action}: ${proposal.issueTitle}. ${proposal.summary} Please confirm or reject this summary.`;
}

function confirmationPromptText() {
  return "Please confirm or reject this summary.";
}

function retryPromptText(preferredRepoName: string | null) {
  return preferredRepoName
    ? `Okay. I'll switch to ${preferredRepoName}. What should I change?`
    : "What should I change?";
}

function approvalText() {
  return "Approved. I'll queue the follow-up and let you go.";
}

function needsReviewText() {
  return "I'm going to move this to review so that you can make more precise changes.";
}

function endedWithoutConfirmationText() {
  return "I didn't get a clear confirmation, so I saved this for review.";
}

function clearSilenceTimer(session: SessionState) {
  if (session.silenceTimer) {
    clearTimeout(session.silenceTimer);
    session.silenceTimer = null;
  }
}

async function generateAndPresentProposal(ws: WebSocket, session: SessionState) {
  const transcript = plainTextTranscriptForSession(session);
  session.awaitingMoreDetailAnswer = false;
  await respond(ws, session, processingText(), { scheduleSilence: false });

  const localRepos = await listUserRepoNames(session.userId);
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
  session.availableRepoNames = availableRepos;

  const generatedProposal = await generateVoiceProposal(transcript, availableRepos, {
    allowDeterministicFallback: ALLOW_DETERMINISTIC_VOICE_FALLBACK
  });
  const proposal = session.preferredRepoName
    ? { ...generatedProposal, repoName: session.preferredRepoName }
    : generatedProposal;

  session.proposal = proposal;
  session.phase = "awaiting_confirmation";
  session.preferredRepoName = null;

  if (session.interactionId) {
    await persistProposal(session.interactionId, proposal);
  }

  await respond(ws, session, proposalText(proposal), { scheduleSilence: false });
}

async function sendSilencePrompt(session: SessionState) {
  if (!session.socket || session.phase === "closed") {
    return;
  }

  if (
    (
      (session.phase === "collecting" && session.callerNotes.length > 0)
      || (session.phase === "awaiting_retry_context" && session.hasPendingRetryContext)
    )
  ) {
    if (!session.awaitingMoreDetailAnswer) {
      session.awaitingMoreDetailAnswer = true;
      session.silencePromptCount += 1;
      await respond(session.socket, session, askForMoreDetailText(), { scheduleSilence: false });
      return;
    }

    await generateAndPresentProposal(session.socket, session);
    return;
  }

  const mode = session.phase === "awaiting_confirmation"
    ? "confirmation"
    : session.phase === "awaiting_retry_context"
      ? "retry"
      : "collecting";

  const text = mode === "confirmation"
    ? confirmationPromptText()
    : mode === "retry"
      ? retryPromptText(session.preferredRepoName)
      : "I'm still here. Keep going.";
  session.silencePromptCount += 1;
  await respond(session.socket, session, text, { scheduleSilence: false });
}

function scheduleSilencePrompt(session: SessionState) {
  clearSilenceTimer(session);

  if (session.phase === "closed" || !session.socket) {
    return;
  }

  session.silenceTimer = setTimeout(() => {
    void sendSilencePrompt(session);
  }, SILENCE_TIMEOUT_MS);
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

async function respond(
  ws: WebSocket,
  session: SessionState,
  text: string,
  options?: { scheduleSilence?: boolean }
) {
  clearSilenceTimer(session);
  session.transcript = appendTurn(session.transcript, "agent", text);
  logTranscriptTurn(session, "agent", text);
  if (session.interactionId) {
    await persistTranscript(session.interactionId, session.transcript);
  }
  sendTokenizedText(ws, text);

  if (
    options?.scheduleSilence !== false
    && (
      session.phase === "collecting"
      || session.phase === "awaiting_retry_context"
      || session.phase === "awaiting_confirmation"
    )
  ) {
    scheduleSilencePrompt(session);
  }
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
    session.socket = ws;
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

    await respond(ws, session, greetingText(Boolean(session.interactionId)), { scheduleSilence: false });
    return;
  }

  const session = message.callSid ? liveSessions.get(message.callSid) : null;
  const activeSession = session || getOrCreateSession(ws);
  activeSession.socket = ws;
  const repoOverride = resolveRepoOverride(message.text, activeSession.availableRepoNames);

  activeSession.transcript = appendTurn(activeSession.transcript, "caller", message.text);
  activeSession.callerNotes = [...activeSession.callerNotes, message.text.trim()];
  activeSession.silencePromptCount = 0;
  clearSilenceTimer(activeSession);
  logTranscriptTurn(activeSession, "caller", message.text);
  if (activeSession.interactionId) {
    await persistTranscript(activeSession.interactionId, activeSession.transcript);
  }

  if (activeSession.phase === "closed") {
    await endRelaySession(ws, { reason: "already_closed" });
    return;
  }

  const classifiedIntent = activeSession.phase === "awaiting_confirmation"
    ? satisfiedGoodbyeIntent(message.text) || confirmIntent(message.text)
      ? "confirm"
      : rejectIntent(message.text)
        ? "reject"
        : finishIntent(message.text)
          ? "finish"
          : "continue"
    : activeSession.awaitingMoreDetailAnswer && noMoreDetailIntent(message.text)
      ? "summarize"
    : doneIntent(message.text)
      ? "summarize"
      : finishIntent(message.text)
        ? "finish"
        : "continue";

  if (activeSession.phase === "awaiting_retry_context" && classifiedIntent === "continue") {
    activeSession.hasPendingRetryContext = true;
  }

  if (
    (activeSession.phase === "collecting" || activeSession.phase === "awaiting_retry_context")
    && activeSession.awaitingMoreDetailAnswer
    && classifiedIntent === "continue"
  ) {
    activeSession.awaitingMoreDetailAnswer = false;
  }

  if (activeSession.phase === "awaiting_confirmation") {
    if (repoOverride && repoOverride !== activeSession.proposal?.repoName) {
      activeSession.preferredRepoName = repoOverride;
    }

    if (classifiedIntent === "confirm") {
      activeSession.phase = "closed";
      clearSilenceTimer(activeSession);
      if (activeSession.interactionId) {
        await persistInteractionState(activeSession.interactionId, { status: "approved" });
      }
      await respondAndEnd(
        ws,
        activeSession,
        approvalText(),
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

    if (classifiedIntent === "finish") {
      activeSession.phase = "closed";
      clearSilenceTimer(activeSession);
      if (activeSession.interactionId) {
        await persistInteractionState(activeSession.interactionId, { status: "needs_review" });
      }
      await respondAndEnd(
        ws,
        activeSession,
        endedWithoutConfirmationText(),
        { reason: "ended_without_confirmation" }
      );
      return;
    }

    if (classifiedIntent === "reject") {
      activeSession.rejectionCount += 1;
      if (activeSession.rejectionCount >= 2) {
        activeSession.phase = "closed";
        clearSilenceTimer(activeSession);
        if (activeSession.interactionId) {
          await persistInteractionState(activeSession.interactionId, { status: "needs_review" });
        }
        await respondAndEnd(
          ws,
          activeSession,
          needsReviewText(),
          { reason: "needs_review" }
        );
        return;
      }

      activeSession.phase = "awaiting_retry_context";
      activeSession.hasPendingRetryContext = false;
      activeSession.awaitingMoreDetailAnswer = false;
      await respond(ws, activeSession, retryPromptText(activeSession.preferredRepoName), { scheduleSilence: false });
      return;
    }

    await respond(ws, activeSession, confirmationPromptText(), { scheduleSilence: false });
    return;
  }

  if (activeSession.phase === "collecting" || activeSession.phase === "awaiting_retry_context") {
    if (repoOverride) {
      activeSession.preferredRepoName = repoOverride;
    }

    if (classifiedIntent === "finish") {
      activeSession.phase = "closed";
      clearSilenceTimer(activeSession);
      await respondAndEnd(
        ws,
        activeSession,
        "All right. I'll save what I captured for review.",
        { reason: "ended_during_collection" }
      );
      return;
    }

    if (classifiedIntent !== "summarize") {
      scheduleSilencePrompt(activeSession);
      return;
    }

    activeSession.hasPendingRetryContext = false;
    activeSession.awaitingMoreDetailAnswer = false;
    await generateAndPresentProposal(ws, activeSession);
    return;
  }

  scheduleSilencePrompt(activeSession);
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

  if (!process.env.OPENAI_API_KEY && !ALLOW_DETERMINISTIC_VOICE_FALLBACK) {
    app.log.warn("OPENAI_API_KEY is not set and deterministic voice fallback is disabled. Live calls will fail closed.");
  }

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
        const session = socketSessions.get(socket);
        if (session && isVoiceAiFailure(error)) {
          try {
            await failClosedForVoiceAi(socket, session, error);
            return;
          } catch (followupError) {
            app.log.error({ err: followupError }, "Failed to close voice session after AI error");
          }
        }
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
        clearSilenceTimer(session);
        session.socket = null;
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
