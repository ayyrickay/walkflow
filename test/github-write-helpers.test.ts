import test from "node:test";
import assert from "node:assert/strict";

import { isEligibleInteractionStatus, parseActionFromChosenIssueTitle } from "../lib/skills/github-write";

test("isEligibleInteractionStatus is confirm-gated", () => {
  assert.equal(isEligibleInteractionStatus("approved"), true);
  assert.equal(isEligibleInteractionStatus("completed"), true);
  assert.equal(isEligibleInteractionStatus("proposed"), false);
  assert.equal(isEligibleInteractionStatus("needs_review"), false);
});

test("parseActionFromChosenIssueTitle detects PR prefixes", () => {
  assert.equal(parseActionFromChosenIssueTitle("[PR] Add oauth callback retries"), "pr");
  assert.equal(parseActionFromChosenIssueTitle("[Issue] Improve logs"), "issue");
  assert.equal(parseActionFromChosenIssueTitle("Improve logs"), "issue");
});
