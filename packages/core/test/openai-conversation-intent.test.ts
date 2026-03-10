import test from "node:test";
import assert from "node:assert/strict";

import { classifyVoiceIntent } from "../src/lib/openai/conversation-intent";

test("classifyVoiceIntent fallback returns summarize for done-like collection input", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const intent = await classifyVoiceIntent({
      phase: "collecting",
      latestCallerMessage: "That's it, can you summarize?",
      transcript: "Need to tighten the login error UX."
    }, {
      allowDeterministicFallback: true
    });

    assert.equal(intent, "summarize");
  } finally {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});

test("classifyVoiceIntent fallback returns reject for change requests during confirmation", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const intent = await classifyVoiceIntent({
      phase: "awaiting_confirmation",
      latestCallerMessage: "No, change the repo and try again.",
      proposalSummary: "Prompt the caller after three seconds of silence.",
      repoName: "walkflow/app"
    }, {
      allowDeterministicFallback: true
    });

    assert.equal(intent, "reject");
  } finally {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});

test("classifyVoiceIntent fallback returns confirm for approval during confirmation", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const intent = await classifyVoiceIntent({
      phase: "awaiting_confirmation",
      latestCallerMessage: "Yes, go ahead.",
      proposalSummary: "Prompt the caller after three seconds of silence.",
      repoName: "walkflow/app"
    }, {
      allowDeterministicFallback: true
    });

    assert.equal(intent, "confirm");
  } finally {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});
