import assert from "node:assert/strict";
import test from "node:test";

import { parseTranscriptTurns, serializeTranscriptTurns, transcriptToPlainText } from "../src/lib/transcript";

test("parseTranscriptTurns parses speaker-prefixed transcript lines", () => {
  const transcript = [
    "Agent: Connected. Share your coding thought.",
    "Caller: I'd like to add a fizz buzz endpoint.",
    "Agent: Captured. Keep going, then say done when you want a proposal."
  ].join("\n");

  const turns = parseTranscriptTurns(transcript);

  assert.equal(turns.length, 3);
  assert.deepEqual(turns[0], {
    role: "agent",
    label: "Agent",
    text: "Connected. Share your coding thought."
  });
  assert.deepEqual(turns[1], {
    role: "caller",
    label: "Caller",
    text: "I'd like to add a fizz buzz endpoint."
  });
});

test("parseTranscriptTurns appends non-prefixed lines to previous turn", () => {
  const transcript = [
    "Caller: This is the first sentence.",
    "And this should remain part of the same turn."
  ].join("\n");

  const turns = parseTranscriptTurns(transcript);

  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.text, "This is the first sentence.\nAnd this should remain part of the same turn.");
});

test("parseTranscriptTurns supports JSON transcript arrays", () => {
  const transcript = JSON.stringify([
    { role: "agent", text: "Connected." },
    { speaker: "caller", text: "I want a PR." }
  ]);

  const turns = parseTranscriptTurns(transcript);

  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0], { role: "agent", label: "Agent", text: "Connected." });
  assert.deepEqual(turns[1], { role: "caller", label: "Caller", text: "I want a PR." });
});

test("serializeTranscriptTurns writes stable JSON transcript payload", () => {
  const serialized = serializeTranscriptTurns([
    { role: "agent", label: "Agent", text: "Connected." },
    { role: "caller", label: "Caller", text: "Done." }
  ]);

  assert.equal(
    serialized,
    '[{"role":"agent","speaker":"Agent","text":"Connected."},{"role":"caller","speaker":"Caller","text":"Done."}]'
  );
});

test("transcriptToPlainText normalizes JSON transcript for AI prompts", () => {
  const transcript = '[{"role":"agent","speaker":"Agent","text":"Connected."},{"role":"caller","speaker":"Caller","text":"Ship it."}]';
  const text = transcriptToPlainText(transcript);
  assert.equal(text, "Agent: Connected.\nCaller: Ship it.");
});
