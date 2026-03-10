import test from "node:test";
import assert from "node:assert/strict";

import { buildProposalTranscript } from "./proposal-transcript";

test("buildProposalTranscript drops control-only retry utterances", () => {
  const transcript = buildProposalTranscript([
    "I'd like to open up pull request against workflow test.",
    "Just that it should be an example of this buzz.",
    "No. That's it.",
    "Reject.",
    "I also want to include tests.",
    "No. That's it."
  ]);

  assert.equal(
    transcript,
    [
      "I'd like to open up pull request against workflow test.",
      "Just that it should be an example of this buzz.",
      "I also want to include tests."
    ].join("\n")
  );
});

test("buildProposalTranscript keeps corrections attached to rejection phrasing", () => {
  const transcript = buildProposalTranscript([
    "Reject. Make it ways to make 100 cents."
  ]);

  assert.equal(transcript, "Reject. Make it ways to make 100 cents.");
});
