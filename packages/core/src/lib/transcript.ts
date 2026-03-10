export type TranscriptTurnRole = "agent" | "caller" | "system";

export type TranscriptTurn = {
  role: TranscriptTurnRole;
  label: string;
  text: string;
};

const CALLER_TOKENS = ["caller", "user", "developer", "human"];
const AGENT_TOKENS = ["agent", "assistant", "walkflow", "bot"];

function roleFromSpeaker(speaker: string): TranscriptTurnRole {
  const normalized = speaker.trim().toLowerCase();
  if (CALLER_TOKENS.some((token) => normalized.includes(token))) {
    return "caller";
  }
  if (AGENT_TOKENS.some((token) => normalized.includes(token))) {
    return "agent";
  }
  return "system";
}

function titleCaseSpeaker(speaker: string) {
  const compact = speaker.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "System";
  }

  return compact
    .split(" ")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonTurns(transcript: string): TranscriptTurn[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(transcript);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const turns: TranscriptTurn[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const speaker = safeString(record.speaker) ?? safeString(record.role) ?? "System";
    const text = safeString(record.text) ?? safeString(record.message);
    if (!text) {
      continue;
    }

    turns.push({
      role: roleFromSpeaker(speaker),
      label: titleCaseSpeaker(speaker),
      text
    });
  }

  return turns;
}

export function parseTranscriptTurns(transcript: string): TranscriptTurn[] {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return [];
  }

  const jsonTurns = parseJsonTurns(trimmed);
  if (jsonTurns.length > 0) {
    return jsonTurns;
  }

  const turns: TranscriptTurn[] = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const lineMatch = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,30}):\s*(.+)$/);
    if (lineMatch) {
      const speaker = titleCaseSpeaker(lineMatch[1] ?? "System");
      const text = lineMatch[2]?.trim();
      if (!text) {
        continue;
      }

      turns.push({
        role: roleFromSpeaker(speaker),
        label: speaker,
        text
      });
      continue;
    }

    if (turns.length > 0) {
      const previous = turns[turns.length - 1];
      if (previous) {
        previous.text = `${previous.text}\n${line}`;
      }
      continue;
    }

    turns.push({
      role: "system",
      label: "System",
      text: line
    });
  }

  return turns;
}

export function serializeTranscriptTurns(turns: TranscriptTurn[]): string {
  const serialized = turns.map((turn) => ({
    role: turn.role,
    speaker: turn.label,
    text: turn.text
  }));
  return JSON.stringify(serialized);
}

export function transcriptToPlainText(transcript: string): string {
  const turns = parseTranscriptTurns(transcript);
  if (turns.length === 0) {
    return transcript.trim();
  }

  return turns.map((turn) => `${turn.label}: ${turn.text}`).join("\n");
}
