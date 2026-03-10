import test from "node:test";
import assert from "node:assert/strict";

import { generateVoiceProposal } from "../src/lib/openai/proposal";

test("generateVoiceProposal fallback chooses only known repositories", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const availableRepos = ["acme/api", "acme/mobile"];
    const proposal = await generateVoiceProposal("Need to fix API auth retry behavior", availableRepos);
    assert.ok(availableRepos.includes(proposal.repoName));
    assert.equal(proposal.actionType, "pr");
  } finally {
    process.env.OPENAI_API_KEY = original;
  }
});

test("generateVoiceProposal fallback chooses issue for planning-only intent", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const availableRepos = ["acme/api", "acme/mobile"];
    const proposal = await generateVoiceProposal("Please open an issue to investigate auth failures", availableRepos);
    assert.equal(proposal.actionType, "issue");
  } finally {
    process.env.OPENAI_API_KEY = original;
  }
});
