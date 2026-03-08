import test from "node:test";
import assert from "node:assert/strict";

import { generateVoiceProposal } from "../lib/openai/proposal";

test("generateVoiceProposal fallback chooses only known repositories", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const availableRepos = ["acme/api", "acme/mobile"];
    const proposal = await generateVoiceProposal("Need to fix API auth retry behavior", availableRepos);
    assert.ok(availableRepos.includes(proposal.repoName));
  } finally {
    process.env.OPENAI_API_KEY = original;
  }
});
