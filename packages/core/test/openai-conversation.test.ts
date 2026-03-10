import test from "node:test";
import assert from "node:assert/strict";

import { generateVoiceConversationReply, VoiceAiRequiredError } from "../src/lib/openai/conversation";

test("generateVoiceConversationReply throws by default without API key", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    await assert.rejects(
      () =>
        generateVoiceConversationReply({
          mode: "silence_collecting",
          transcript: "Need to tighten the login error state."
        }),
      VoiceAiRequiredError
    );
  } finally {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});

test("generateVoiceConversationReply falls back to concise silence prompt without API key", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const reply = await generateVoiceConversationReply({
      mode: "silence_collecting",
      transcript: "Need to tighten the login error state.",
      silencePromptCount: 0
    }, {
      allowDeterministicFallback: true
    });

    assert.match(reply, /summarize|detail/i);
  } finally {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});

test("generateVoiceConversationReply falls back to proposal phrasing without API key", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const reply = await generateVoiceConversationReply({
      mode: "proposal",
      proposal: {
        repoName: "walkflow/app",
        actionType: "pr",
        issueTitle: "Shorten relay silence threshold",
        summary: "Prompt the caller after three seconds of silence."
      }
    }, {
      allowDeterministicFallback: true
    });

    assert.match(reply, /walkflow\/app/i);
    assert.match(reply, /pull request/i);
    assert.match(reply, /Go ahead, or change it\?/i);
  } finally {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});
