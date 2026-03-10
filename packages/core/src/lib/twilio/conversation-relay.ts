export type RelaySetupMessage = {
  type: "setup";
  callSid: string;
  from: string | null;
};

export type RelayPromptMessage = {
  type: "prompt";
  callSid: string | null;
  text: string;
};

export type RelayMessage = RelaySetupMessage | RelayPromptMessage;

type RawRelayPayload = Record<string, unknown>;

function asRecord(value: unknown): RawRelayPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as RawRelayPayload;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readCallSid(payload: RawRelayPayload): string | null {
  const callData = asRecord(payload.call);
  const setupData = asRecord(payload.setup);
  return firstString(payload.callSid, payload.call_sid, callData?.sid, setupData?.callSid);
}

function readCaller(payload: RawRelayPayload): string | null {
  const callData = asRecord(payload.call);
  const setupData = asRecord(payload.setup);
  return firstString(payload.from, payload.fromNumber, callData?.from, setupData?.from);
}

function readPromptText(payload: RawRelayPayload): string | null {
  const promptData = asRecord(payload.prompt);
  return firstString(
    payload.transcript,
    payload.text,
    payload.voicePrompt,
    payload.promptText,
    promptData?.text,
    promptData?.transcript
  );
}

export function parseConversationRelayMessage(raw: string): RelayMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const payload = asRecord(parsed);
  if (!payload) {
    return null;
  }

  const type = firstString(payload.type);
  if (type === "setup") {
    const callSid = readCallSid(payload);
    if (!callSid) {
      return null;
    }

    return {
      type: "setup",
      callSid,
      from: readCaller(payload)
    };
  }

  if (type === "prompt") {
    const text = readPromptText(payload);
    if (!text) {
      return null;
    }

    return {
      type: "prompt",
      callSid: readCallSid(payload),
      text
    };
  }

  return null;
}

export type RelayTextTokenMessage = {
  type: "text";
  token: string;
  last: boolean;
};

export type RelayEndSessionMessage = {
  type: "end";
  handoffData?: string;
};

export function buildRelayTextTokenMessages(text: string): RelayTextTokenMessage[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  // Keep trailing whitespace with each chunk so reconstructed speech text preserves word boundaries.
  const tokens = normalized.match(/\S+\s*/g) ?? [];
  return tokens.map((token, index) => ({
    type: "text",
    token,
    last: index === tokens.length - 1
  }));
}

export function buildRelayEndSessionMessage(handoffData?: Record<string, unknown>): RelayEndSessionMessage {
  if (!handoffData) {
    return { type: "end" };
  }

  return {
    type: "end",
    handoffData: JSON.stringify(handoffData)
  };
}
